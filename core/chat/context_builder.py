"""Read the same persisted feed as vision ingest, without loopback HTTP.

The two station registries have different IDs. Only Shaftsbury is shared;
never silently assign another stop's detections to a Cyberjaya MRT station.
"""
from datetime import datetime, timezone

from app import crud
from app.database import SessionLocal
from app.config import get_settings
from app.services import dispatch, forecast, trust
from app.stops import STOP_NAMES
from routing.cyberjaya_stations import STATIONS
from routing.optimizer import RouteOptimizer, StaticVisionFeed

STATIC_ESTIMATE = "Offline demo timetable estimate: buses approximately every 15–30 minutes; confirm actual times with the operator."


def offline_context():
    return {"available": False, "static_estimate": STATIC_ESTIMATE}


def age_seconds(value, now):
    return (now - value.replace(tzinfo=value.tzinfo or timezone.utc)).total_seconds()


def collect_context(db):
    now = datetime.now(timezone.utc)
    vehicles = [v for v in crud.list_vehicles(db)
                if 0 <= age_seconds(v.last_updated_at, now) <= 90
                and v.is_accessible and v.ramp_status not in ("fault", "not_equipped")
                and v.capacity_status != "full"]
    obstacles = []
    for o in crud.list_obstacles(db, active_only=True):
        relevance = trust.decay_factor(age_seconds(o.last_verified_at, now) / 60)
        if relevance < 0.15:
            continue
        obstacles.append({"type": o.obstacle_type.value, "description": o.description[:250],
                          "location": o.location.model_dump(),
                          "decayed_trust_score": round(o.trust_score * relevance, 1)})

    names = {**STOP_NAMES, **{sid: s.name for sid, s in STATIONS.items()}}
    tags, stops = {}, []
    for sid, name in names.items():
        source_id = "stop_02" if sid == "shaftsbury" else sid
        events = [e for e in crud.recent_vision_events(db, source_id, limit=20)
                  if 0 <= age_seconds(e.observed_at, now) <= dispatch.BOARDING_TTL.total_seconds()]
        # Ingest receives edge-debounced tags; collapse repeated class updates.
        labels = sorted({e.label for e in events if e.label in dispatch.LABEL_TO_FEATURE})
        tags[sid] = labels
        inbound = [v for v in vehicles if v.next_stop_id == source_id]
        vehicle = min(inbound, key=lambda v: v.eta_seconds, default=None)
        stops.append({"stop_id": sid, "name": name, "vision_labels": labels,
                      "vision_simulated": any(e.is_simulation for e in events),
                      "ramp_status": vehicle.ramp_status.value if vehicle else "unknown",
                      "boarding_request": bool(labels),
                      "bus_eta_mins": round(vehicle.eta_seconds / 60, 1) if vehicle else None,
                      "predicted_dwell_s": forecast.predict_dwell(labels)})
    optimizer = RouteOptimizer(vision=StaticVisionFeed(tags))
    for stop in stops:
        st = STATIONS.get(stop["stop_id"])
        if st:
            plan = optimizer.station_dwell(st.station_id)
            stop.update(predicted_dwell_s=plan.total_dwell_s,
                        ramp_predispatch_recommended=plan.ramp_predispatch,
                        station_stats={"source": "mock demographics, not measured readiness",
                                       "oku_pct": st.oku_pct, "elderly_pct": st.elderly_pct,
                                       "accessibility_load": st.accessibility_load,
                                       "oku_readiness_score": None, "elderly_readiness_score": None})
    return {"available": True, "demo_mode": get_settings().MOCK_DATA,
            "observed_at": now.isoformat(), "stops": stops,
            "obstacles": obstacles, "transit_delay_mins": None,
            "delay_detail": "No live traffic feed or published schedule baseline is connected",
            "static_estimate": STATIC_ESTIMATE}


def build_context():
    # Include session creation/query failure in the fallback boundary.
    try:
        with SessionLocal() as db:
            return collect_context(db)
    except Exception:
        return offline_context()
