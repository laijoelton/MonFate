"""MonFate backend — accessibility obstacle ingest, transit telemetry, live stream.

    pip install -r backend_api/requirements.txt
    uvicorn backend_api.app.main:app --reload --port 8000
    # docs: http://localhost:8000/docs
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from contextlib import asynccontextmanager

# Shared API/core/routing packages live at the repository root, including when
# launched with `cd backend_api; uvicorn app.main:app`.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import crud, mockgen, schemas
from app.config import get_settings
from app.database import Base, engine, get_db
from app.pipeline import handle_vision_event
from app.schemas.trust import ReportSignal
from app.security import verify_api_key, verify_signature
from app.services import dispatch, forecast
from app.stops import STOP_NAMES, STOP_ORDER, location_of
from app.stream import hub
from api.citizen_chat import router as citizen_chat_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)  # demo only — use Alembic past a hackathon
    if settings.MOCK_DATA:
        mockgen.start(app)
    yield
    if settings.MOCK_DATA:
        await mockgen.stop(app)


app = FastAPI(
    title="MonFate backend",
    description="Accessible transit routing: obstacle reports, vehicle telemetry, "
    "station CCTV events, and pre-emptive dispatch alerts.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_AUTH = [Depends(verify_api_key), Depends(verify_signature)]
app.include_router(citizen_chat_router)


@app.get("/health", response_model=schemas.HealthOut, tags=["ops"])
def health():
    return schemas.HealthOut(status="ok", mock_data=settings.MOCK_DATA)


# --- ingestion -------------------------------------------------------------

@app.post("/api/v1/vision/events", response_model=schemas.VisionEventAck,
          status_code=status.HTTP_201_CREATED, dependencies=_AUTH, tags=["ingestion"])
async def ingest_vision_event(
    payload: schemas.VisionEventPayload, db: Session = Depends(get_db)
):
    """Accept one image-free detection from a station CCTV edge node."""
    created, _alert = await handle_vision_event(db, payload)
    return schemas.VisionEventAck(
        status="stored" if created else "duplicate_ignored", event_id=payload.event_id
    )


@app.post("/api/v1/telemetry", response_model=schemas.TelemetryAck,
          status_code=status.HTTP_201_CREATED, dependencies=_AUTH, tags=["ingestion"])
async def ingest_telemetry(
    payload: schemas.VehicleTelemetryPayload, db: Session = Depends(get_db)
):
    vehicle = crud.upsert_vehicle(db, payload)
    await hub.broadcast("vehicle", vehicle.model_dump(mode="json"))
    return schemas.TelemetryAck(status="stored", vehicle=vehicle)


@app.post("/api/v1/obstacles", response_model=schemas.ObstacleAck,
          status_code=status.HTTP_201_CREATED, tags=["obstacles"])
async def report_obstacle(
    payload: schemas.ObstacleReportCreate, db: Session = Depends(get_db)
):
    """Rider-submitted obstacle report. Trust score is assigned server-side."""
    obstacle = crud.create_obstacle(db, payload)
    await hub.broadcast("obstacle", obstacle.model_dump(mode="json"))
    return schemas.ObstacleAck(status="stored", obstacle=obstacle)


@app.post("/api/v1/obstacles/{obstacle_id}/confirm", response_model=schemas.ObstacleAck,
          tags=["obstacles"])
async def confirm_obstacle(obstacle_id: str, db: Session = Depends(get_db)):
    """Corroborate an existing report — raises its trust score."""
    obstacle = crud.corroborate_obstacle(db, obstacle_id, ReportSignal.RIDER_REPORT)
    if obstacle is None:
        raise HTTPException(404, detail=f"no obstacle {obstacle_id}")
    await hub.broadcast("obstacle", obstacle.model_dump(mode="json"))
    return schemas.ObstacleAck(status="corroborated", obstacle=obstacle)


# --- query -----------------------------------------------------------------

@app.get("/api/v1/obstacles", response_model=list[schemas.ObstacleReport], tags=["obstacles"])
def list_obstacles(active_only: bool = True, db: Session = Depends(get_db)):
    return crud.list_obstacles(db, active_only=active_only)


@app.get("/api/v1/vehicles", response_model=list[schemas.TransitVehicle], tags=["transit"])
def list_vehicles(db: Session = Depends(get_db)):
    return crud.list_vehicles(db)


@app.get("/api/v1/stops", tags=["transit"])
def list_stops():
    return [
        {"stop_id": s, "name": STOP_NAMES[s], "location": location_of(s).model_dump()}
        for s in STOP_ORDER
    ]


@app.get("/api/v1/stops/{stop_id}/forecast", tags=["transit"])
def stop_forecast(stop_id: str, db: Session = Depends(get_db)):
    """Arrival + dwell forecast for the next accessible vehicle to this stop."""
    stop_location = location_of(stop_id)
    if stop_location is None:
        raise HTTPException(404, detail=f"unknown stop {stop_id}")

    vehicle = dispatch.approaching_vehicle(crud.list_vehicles(db), stop_id, stop_location)
    waiting = [e.label for e in crud.recent_vision_events(db, stop_id, limit=5)]
    result = forecast.predict_arrival(
        vehicle, stop_location, stop_id, assistive_labels=waiting
    )
    return result.to_dict()


@app.get("/api/v1/stops/{stop_id}/events", tags=["transit"])
def stop_events(stop_id: str, limit: int = 20, db: Session = Depends(get_db)):
    if not 1 <= limit <= 200:
        raise HTTPException(422, detail="limit must be between 1 and 200")
    return [
        {
            "event_id": e.event_id,
            "stop_id": e.stop_id,
            "label": e.label,
            "confidence": e.confidence,
            "model_version": e.model_version,
            "is_simulation": e.is_simulation,
            "observed_at": e.observed_at,
        }
        for e in crud.recent_vision_events(db, stop_id, limit=limit)
    ]


# --- live stream -----------------------------------------------------------

@app.websocket("/api/v1/stream")
async def stream(ws: WebSocket):
    client = await hub.connect(ws)
    try:
        while True:
            raw = await ws.receive_text()  # keep-alive + latency ping
            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                continue
            if isinstance(msg, dict) and msg.get("type") == "ping":
                await ws.send_text(json.dumps({"kind": "pong", "t": msg.get("t")}))
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(client)
