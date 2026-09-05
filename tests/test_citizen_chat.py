"""HTTP regression coverage using an isolated database, never the demo DB."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend_api"))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base
from app.models import VehicleRecord, VisionEventRecord
from api import citizen_chat
from core.chat import context_builder


@pytest.fixture
def chat(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    monkeypatch.setattr(context_builder, "SessionLocal", lambda: Session(engine))
    now = datetime.now(timezone.utc)
    with Session(engine) as db:
        db.add(VehicleRecord(vehicle_id="test-bus", route_id="demo", lat=2.945, lng=101.662,
                             heading_degrees=0, speed_kmh=20, is_accessible=True,
                             ramp_status="deployed", capacity_status="seats_available",
                             next_stop_id="cbj_utara", eta_seconds=180, last_updated_at=now))
        db.add(VisionEventRecord(event_id="confirmed", stop_id="cbj_utara", label="wheelchair",
                                 confidence=.95, object_count=1, inference_ms=10, model_version="test",
                                 is_simulation=False, observed_at=now, ingested_at=now))
        db.commit()
    # Skip lifespan: no background mock writer and no real database creation.
    client = TestClient(app)
    yield client, engine
    client.close()
    engine.dispose()


def post(client, message="Is the ramp ready at Cyberjaya Utara?"):
    return client.post("/api/v1/citizen/chat", json={"message": message, "session_id": "test-session"})


def test_grounded_reply(chat):
    client, _ = chat
    response = post(client)
    assert response.status_code == 200
    assert "deployed" in response.json()["reply"]
    # At-stop coordinates predict zero, overriding the raw 180-second ETA.
    assert "0 minutes" in response.json()["reply"]
    context = context_builder.build_context()
    stop = next(s for s in context["stops"] if s["stop_id"] == "cbj_utara")
    assert stop["predicted_dwell_s"] > 65
    assert stop["station_stats"]["oku_readiness_score"] is None


def test_telemetry_unreachable(chat, monkeypatch):
    def unavailable():
        raise ConnectionError("offline")
    monkeypatch.setattr(context_builder, "SessionLocal", unavailable)
    response = post(chat[0])
    assert response.status_code == 200
    assert "Live telemetry is unavailable" in response.json()["reply"]
    assert "demo timetable estimate" in response.json()["reply"]


def test_stale_telemetry_never_confirms_ramp(chat):
    client, engine = chat
    with Session(engine) as db:
        db.query(VehicleRecord).update({"last_updated_at": datetime.now(timezone.utc) - timedelta(minutes=10)})
        db.query(VisionEventRecord).update({"observed_at": datetime.now(timezone.utc) - timedelta(minutes=10)})
        db.commit()
    reply = post(client).json()["reply"]
    assert "not confirmed" in reply
    assert "3 minutes" not in reply


def test_llm_error_falls_back(chat, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-placeholder")
    def fail(*args):
        raise TimeoutError()
    monkeypatch.setattr(citizen_chat, "llm_reply", fail)
    assert "0 minutes" in post(chat[0]).json()["reply"]


def test_openai_receives_grounding(chat, monkeypatch):
    import openai
    captured = {}
    class Client:
        def __init__(self, **kwargs):
            self.responses = self
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(output_text="The accessible bus is estimated in 3 minutes.", status="completed")
    monkeypatch.setattr(openai, "OpenAI", Client)
    monkeypatch.setenv("OPENAI_API_KEY", "test-placeholder")
    assert post(chat[0]).status_code == 200
    assert '"bus_eta_mins": 0.0' in captured["input"]
    assert "MonFate Transit Concierge" in captured["instructions"]
    assert captured["store"] is False


def test_missing_stop_and_validation(chat):
    assert "Which stop" in post(chat[0], "Next accessible bus arrival?").json()["reply"]
    assert post(chat[0], " ").status_code == 422


def test_real_vision_drives_prediction_and_reply(chat, monkeypatch):
    monkeypatch.setattr(context_builder.get_settings(), "MOCK_VISION", False)
    reply = post(chat[0], "What did the vision model detect at Cyberjaya Utara?").json()["reply"]
    assert "vision model recently detected wheelchair" in reply
    assert "predicted boarding dwell" in reply
    stop = next(s for s in context_builder.build_context()["stops"] if s["stop_id"] == "cbj_utara")
    assert stop["vision_models"] == ["test"]
    assert stop["arrival_prediction"]["predicted_dwell_s"] == 65
    assert stop["arrival_prediction"]["status"] == "ok"


def test_real_vision_mode_excludes_mock_events(chat, monkeypatch):
    monkeypatch.setattr(context_builder.get_settings(), "MOCK_VISION", False)
    with Session(chat[1]) as db:
        db.query(VisionEventRecord).update({"is_simulation": True})
        db.commit()
    stop = next(s for s in context_builder.build_context()["stops"] if s["stop_id"] == "cbj_utara")
    assert stop["vision_labels"] == []
    assert stop["arrival_prediction"]["predicted_dwell_s"] == 20
