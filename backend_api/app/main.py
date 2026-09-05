"""MonFate backend — accessibility obstacle ingest, transit telemetry, live stream.

    pip install -r backend_api/requirements.txt
    uvicorn backend_api.app.main:app --reload --port 8000
    # docs: http://localhost:8000/docs
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager

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
from app.services.rtos_simulator import rtos_simulator
from app.stops import STOP_NAMES, STOP_ORDER, location_of
from app.stream import hub

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


@app.get("/health", response_model=schemas.HealthOut, tags=["ops"])
def health():
    return schemas.HealthOut(
        status="ok",
        mock_data=settings.MOCK_DATA,
    )


# ---------------------------------------------------------------------------
# RTOS SIMULATOR
# ---------------------------------------------------------------------------

@app.post("/api/v1/rtos/start", tags=["rtos"])
def start_rtos():
    rtos_simulator.start()

    return {
        "message": "RTOS simulator started"
    }


@app.post("/api/v1/rtos/stop", tags=["rtos"])
def stop_rtos():
    rtos_simulator.stop()

    return {
        "message": "RTOS simulator stopped"
    }


@app.post("/api/v1/rtos/reset", tags=["rtos"])
def reset_rtos():
    rtos_simulator.reset()

    return {
        "message": "RTOS simulator reset"
    }


@app.get("/api/v1/rtos/status", tags=["rtos"])
def rtos_status():
    return rtos_simulator.get_status()


@app.post("/api/v1/rtos/gps", tags=["rtos"])
def trigger_gps():
    rtos_simulator.add_gps_task()

    return {
        "message": "GPS tracking task queued",
        "priority": 4,
    }


@app.post("/api/v1/rtos/passenger-count", tags=["rtos"])
def trigger_passenger_count():
    rtos_simulator.add_passenger_count_task()

    return {
        "message": "Passenger counting task queued",
        "priority": 5,
    }


@app.post("/api/v1/rtos/upload", tags=["rtos"])
def trigger_upload():
    rtos_simulator.add_data_upload_task()

    return {
        "message": "Data upload task queued",
        "priority": 6,
    }


@app.post("/api/v1/rtos/assistance", tags=["rtos"])
def trigger_assistance():
    rtos_simulator.add_assistance_task()

    return {
        "message": "Accessibility assistance task queued",
        "priority": 3,
    }


@app.post("/api/v1/rtos/breakdown", tags=["rtos"])
def trigger_breakdown():
    rtos_simulator.add_breakdown_task()

    return {
        "message": "Breakdown task queued",
        "priority": 2,
    }


@app.post("/api/v1/rtos/emergency", tags=["rtos"])
def trigger_emergency():
    rtos_simulator.add_emergency_task()

    return {
        "message": "Emergency task queued",
        "priority": 1,
    }


# --- ingestion -------------------------------------------------------------


@app.post(
    "/api/v1/vision/events",
    response_model=schemas.VisionEventAck,
    status_code=status.HTTP_201_CREATED,
    dependencies=_AUTH,
    tags=["ingestion"],
)
async def ingest_vision_event(
    payload: schemas.VisionEventPayload,
    db: Session = Depends(get_db),
):
    """Accept one image-free detection from a station CCTV edge node."""

    created, _alert = await handle_vision_event(
        db,
        payload,
    )

    return schemas.VisionEventAck(
        status="stored" if created else "duplicate_ignored",
        event_id=payload.event_id,
    )


@app.post(
    "/api/v1/telemetry",
    response_model=schemas.TelemetryAck,
    status_code=status.HTTP_201_CREATED,
    dependencies=_AUTH,
    tags=["ingestion"],
)
async def ingest_telemetry(
    payload: schemas.VehicleTelemetryPayload,
    db: Session = Depends(get_db),
):
    vehicle = crud.upsert_vehicle(
        db,
        payload,
    )

    await hub.broadcast(
        "vehicle",
        vehicle.model_dump(mode="json"),
    )

    return schemas.TelemetryAck(
        status="stored",
        vehicle=vehicle,
    )


@app.post(
    "/api/v1/obstacles",
    response_model=schemas.ObstacleAck,
    status_code=status.HTTP_201_CREATED,
    tags=["obstacles"],
)
async def report_obstacle(
    payload: schemas.ObstacleReportCreate,
    db: Session = Depends(get_db),
):
    """Rider-submitted obstacle report. Trust score is assigned server-side."""

    obstacle = crud.create_obstacle(
        db,
        payload,
    )

    await hub.broadcast(
        "obstacle",
        obstacle.model_dump(mode="json"),
    )

    return schemas.ObstacleAck(
        status="stored",
        obstacle=obstacle,
    )


@app.post(
    "/api/v1/obstacles/{obstacle_id}/confirm",
    response_model=schemas.ObstacleAck,
    tags=["obstacles"],
)
async def confirm_obstacle(
    obstacle_id: str,
    db: Session = Depends(get_db),
):
    """Corroborate an existing report — raises its trust score."""

    obstacle = crud.corroborate_obstacle(
        db,
        obstacle_id,
        ReportSignal.RIDER_REPORT,
    )

    if obstacle is None:
        raise HTTPException(
            404,
            detail=f"no obstacle {obstacle_id}",
        )

    await hub.broadcast(
        "obstacle",
        obstacle.model_dump(mode="json"),
    )

    return schemas.ObstacleAck(
        status="corroborated",
        obstacle=obstacle,
    )


# --- query -----------------------------------------------------------------


@app.get(
    "/api/v1/obstacles",
    response_model=list[schemas.ObstacleReport],
    tags=["obstacles"],
)
def list_obstacles(
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    return crud.list_obstacles(
        db,
        active_only=active_only,
    )


@app.get(
    "/api/v1/vehicles",
    response_model=list[schemas.TransitVehicle],
    tags=["transit"],
)
def list_vehicles(
    db: Session = Depends(get_db),
):
    return crud.list_vehicles(db)


@app.get(
    "/api/v1/stops",
    tags=["transit"],
)
def list_stops():
    return [
        {
            "stop_id": s,
            "name": STOP_NAMES[s],
            "location": location_of(s).model_dump(),
        }
        for s in STOP_ORDER
    ]


@app.get(
    "/api/v1/stops/{stop_id}/forecast",
    tags=["transit"],
)
def stop_forecast(
    stop_id: str,
    db: Session = Depends(get_db),
):
    """Arrival + dwell forecast for the next accessible vehicle to this stop."""

    stop_location = location_of(stop_id)

    if stop_location is None:
        raise HTTPException(
            404,
            detail=f"unknown stop {stop_id}",
        )

    vehicle = dispatch.approaching_vehicle(
        crud.list_vehicles(db),
        stop_id,
        stop_location,
    )

    waiting = [
        e.label
        for e in crud.recent_vision_events(
            db,
            stop_id,
            limit=5,
        )
    ]

    result = forecast.predict_arrival(
        vehicle,
        stop_location,
        stop_id,
        assistive_labels=waiting,
    )

    return result.to_dict()


@app.get(
    "/api/v1/stops/{stop_id}/events",
    tags=["transit"],
)
def stop_events(
    stop_id: str,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    if not 1 <= limit <= 200:
        raise HTTPException(
            422,
            detail="limit must be between 1 and 200",
        )

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
        for e in crud.recent_vision_events(
            db,
            stop_id,
            limit=limit,
        )
    ]


# --- live stream -----------------------------------------------------------


@app.websocket("/api/v1/stream")
async def stream(ws: WebSocket):
    client = await hub.connect(ws)

    try:
        while True:
            raw = await ws.receive_text()

            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                continue

            if isinstance(msg, dict) and msg.get("type") == "ping":
                await ws.send_text(
                    json.dumps(
                        {
                            "kind": "pong",
                            "t": msg.get("t"),
                        }
                    )
                )

    except WebSocketDisconnect:
        pass

    finally:
        await hub.disconnect(client)