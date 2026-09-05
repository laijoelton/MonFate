"""Route optimizer tests.

The headline guarantee: approaching a station with elevated OKU concentration
both lengthens the stop buffer and pre-dispatches the ramp; a high-trust barrier
shifts the path.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from routing.cyberjaya_stations import (
    RAMP_PREDISPATCH_OKU_PCT,
    STATIONS,
    corridor_id,
    station,
)
from routing.optimizer import (
    ObstacleReport,
    RouteOptimizer,
    StaticVisionFeed,
    dwell_plan,
    obstacle_weight,
)

NOW = datetime(2026, 9, 5, 9, 0, tzinfo=timezone.utc)


# --- station registry ------------------------------------------------------

def test_all_five_cyberjaya_hubs_present_with_demographics():
    expected = {
        "cbj_city_centre", "cbj_utara", "dpulze", "cyber9_dell", "shaftsbury",
    }
    assert set(STATIONS) == expected
    for st in STATIONS.values():
        assert 0.0 <= st.elderly_pct <= 100.0
        assert 0.0 <= st.oku_pct <= 100.0
        assert st.base_dwell_s > 0


def test_accessibility_load_orders_stations_correctly():
    dpulze = station("dpulze")
    cyber9 = station("cyber9_dell")
    assert dpulze.oku_pct > cyber9.oku_pct
    assert dpulze.accessibility_load > cyber9.accessibility_load
    # Must not saturate at the busiest station in the mock set.
    assert dpulze.accessibility_load < 1.0


# --- the required guarantee: OKU raises buffer and triggers the ramp -------

def test_high_oku_station_gets_a_larger_stop_buffer():
    low = dwell_plan(station("cyber9_dell"))   # 2.1% OKU
    high = dwell_plan(station("dpulze"))       # 14.8% OKU

    assert high.demographic_buffer_s > low.demographic_buffer_s
    assert high.total_dwell_s > low.total_dwell_s


def test_dwell_increases_monotonically_with_accessibility_load():
    ordered = sorted(STATIONS.values(), key=lambda s: s.accessibility_load)
    buffers = [dwell_plan(s).demographic_buffer_s for s in ordered]
    assert buffers == sorted(buffers), buffers


def test_ramp_predispatch_only_above_the_oku_threshold():
    for st in STATIONS.values():
        expected = st.oku_pct >= RAMP_PREDISPATCH_OKU_PCT or not st.step_free
        assert dwell_plan(st).ramp_predispatch is expected, st.station_id

    assert dwell_plan(station("dpulze")).ramp_predispatch is True
    assert dwell_plan(station("cyber9_dell")).ramp_predispatch is False


def test_route_through_high_oku_station_allocates_more_buffer_than_low():
    """The same optimizer, two destinations: the high-OKU leg budgets more."""
    opt = RouteOptimizer(now=NOW)
    via_high = opt.plan("cbj_city_centre", "shaftsbury")   # routes via dpulze
    assert "dpulze" in via_high.path

    dpulze_stop = next(s for s in via_high.stops if s.station_id == "dpulze")
    cyber9_stop = dwell_plan(station("cyber9_dell"))
    assert dpulze_stop.total_dwell_s > cyber9_stop.total_dwell_s
    assert "dpulze" in via_high.ramp_dispatch_at


def test_vision_tags_add_dwell_on_top_of_demographics():
    base = RouteOptimizer(now=NOW).station_dwell("dpulze")
    with_vision = RouteOptimizer(
        vision=StaticVisionFeed({"dpulze": ["wheelchair", "stroller"]}), now=NOW
    ).station_dwell("dpulze")

    assert with_vision.vision_buffer_s > 0
    assert with_vision.total_dwell_s > base.total_dwell_s
    assert with_vision.ramp_predispatch is True


def test_vision_wheelchair_triggers_predispatch_at_a_low_oku_station():
    """A live detection must override a low demographic prior."""
    plan = RouteOptimizer(
        vision=StaticVisionFeed({"cyber9_dell": ["wheelchair"]}), now=NOW
    ).station_dwell("cyber9_dell")
    assert plan.ramp_predispatch is True


def test_ambulant_and_unknown_tags_add_no_dwell():
    """`ambulant` is not a boarding request and must not inflate dwell."""
    plan = RouteOptimizer(
        vision=StaticVisionFeed({"dpulze": ["ambulant", "other"]}), now=NOW
    ).station_dwell("dpulze")
    assert plan.vision_buffer_s == 0


# --- the required guarantee: obstacles shift the path ----------------------

def _blocked_first_leg(origin: str, destination: str) -> tuple[list[str], str]:
    clean = RouteOptimizer(now=NOW).plan(origin, destination)
    return clean.path, corridor_id(*clean.path[:2])


def test_high_trust_obstacle_shifts_the_path():
    clean_path, edge = _blocked_first_leg("cbj_utara", "shaftsbury")
    report = ObstacleReport("obs-1", edge, "Flooded underpass", 95.0, NOW)

    shifted = RouteOptimizer(obstacles=[report], now=NOW).plan("cbj_utara", "shaftsbury")

    assert shifted.path != clean_path
    assert edge in shifted.avoided_corridors
    assert edge not in {corridor_id(a, b) for a, b in zip(shifted.path, shifted.path[1:])}


def test_low_trust_obstacle_does_not_shift_the_path():
    """One uncorroborated report must never reroute a wheelchair user."""
    clean_path, edge = _blocked_first_leg("cbj_utara", "shaftsbury")
    report = ObstacleReport("obs-2", edge, "Unconfirmed barrier", 40.0, NOW)

    result = RouteOptimizer(obstacles=[report], now=NOW).plan("cbj_utara", "shaftsbury")
    assert result.path == clean_path
    assert result.avoided_corridors == []


def test_stale_obstacle_stops_influencing_routing():
    """Past the relevance floor an unconfirmed barrier is assumed cleared."""
    clean_path, edge = _blocked_first_leg("cbj_utara", "shaftsbury")
    fresh = ObstacleReport("o", edge, "Barrier", 95.0, NOW)
    stale = ObstacleReport("o", edge, "Barrier", 95.0, NOW - timedelta(hours=14))

    assert obstacle_weight(fresh, now=NOW) > 0.0
    assert obstacle_weight(stale, now=NOW) == 0.0
    assert RouteOptimizer(obstacles=[stale], now=NOW).plan(
        "cbj_utara", "shaftsbury"
    ).path == clean_path


def test_obstacle_weight_is_gated_then_decays():
    below = ObstacleReport("a", "x", "d", 69.9, NOW)
    at = ObstacleReport("b", "x", "d", 70.0, NOW)
    assert obstacle_weight(below, now=NOW) == 0.0
    assert obstacle_weight(at, now=NOW) > 0.0

    older = ObstacleReport("c", "x", "d", 95.0, NOW - timedelta(hours=2))
    newer = ObstacleReport("d", "x", "d", 95.0, NOW)
    assert obstacle_weight(older, now=NOW) < obstacle_weight(newer, now=NOW)


# --- routing mechanics -----------------------------------------------------

def test_traffic_density_increases_travel_time():
    free = RouteOptimizer(now=NOW).plan("cbj_city_centre", "dpulze")
    jammed = RouteOptimizer(
        traffic={corridor_id("cbj_city_centre", "dpulze"): 1.0}, now=NOW
    ).plan("cbj_city_centre", "dpulze")
    assert jammed.travel_s > free.travel_s


def test_same_origin_and_destination_is_a_zero_cost_plan():
    plan = RouteOptimizer(now=NOW).plan("dpulze", "dpulze")
    assert plan.path == ["dpulze"]
    assert plan.total_cost_s == 0.0
    assert plan.ramp_dispatch_at == ["dpulze"]


def test_every_station_pair_is_routable():
    opt = RouteOptimizer(now=NOW)
    ids = list(STATIONS)
    for a in ids:
        for b in ids:
            plan = opt.plan(a, b)
            assert plan.path[0] == a and plan.path[-1] == b


def test_unknown_station_raises():
    with pytest.raises(KeyError):
        RouteOptimizer(now=NOW).plan("nowhere", "dpulze")


def test_plan_is_serialisable():
    plan = RouteOptimizer(now=NOW).plan("cyber9_dell", "dpulze")
    payload = plan.to_dict()
    assert payload["origin"] == "cyber9_dell"
    assert payload["path"][-1] == "dpulze"
    assert isinstance(payload["stops"], list)
