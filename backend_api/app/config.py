"""Central settings — env vars with local-dev defaults, so the same code runs on
a laptop and behind a real host unchanged.

backend_api is standalone: with SYS_MOCK_DATA=true it runs a self-contained
transit simulation and needs no station hardware, CCTV node, or MQTT broker.
"""

from __future__ import annotations

import os
from functools import lru_cache


def _bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


class Settings:
    # Station-node / edge auth — nodes send this in X-API-Key.
    API_KEY: str = os.getenv("SYS_API_KEY", "REPLACE_WITH_PROVISIONED_DEVICE_KEY")

    # Optional HMAC-SHA256 body signature (X-Signature).
    HMAC_SHARED_SECRET: str = os.getenv("SYS_HMAC_SECRET", "REPLACE_WITH_SHARED_HMAC_SECRET")
    REQUIRE_HMAC: bool = _bool("SYS_REQUIRE_HMAC")

    DATABASE_URL: str = os.getenv("SYS_DATABASE_URL", "sqlite:///./monfate.db")

    CORS_ALLOW_ORIGINS: list[str] = os.getenv("SYS_CORS_ALLOW_ORIGINS", "*").split(",")

    # --- live stream: bounded per-client buffer (drop-oldest) ---
    STREAM_CLIENT_BUFFER: int = int(os.getenv("SYS_STREAM_CLIENT_BUFFER", "500"))

    # --- standalone transit simulation ---
    MOCK_DATA: bool = _bool("SYS_MOCK_DATA", "true")
    MOCK_VEHICLES: int = int(os.getenv("SYS_MOCK_VEHICLES", "3"))
    MOCK_INTERVAL_S: float = float(os.getenv("SYS_MOCK_INTERVAL_S", "2.0"))

    # --- trust consensus ---
    # Minutes for a single corroborating signal's contribution to halve.
    TRUST_DECAY_HALF_LIFE_MIN: float = float(os.getenv("SYS_TRUST_HALF_LIFE_MIN", "180"))
    # An obstacle at or above this score is treated as actionable for routing.
    TRUST_ACTIONABLE_SCORE: float = float(os.getenv("SYS_TRUST_ACTIONABLE", "70"))

    # --- pre-emptive dispatch ---
    # A vehicle within this ETA of a stop is "approaching" and can be alerted.
    DISPATCH_ETA_WINDOW_S: int = int(os.getenv("SYS_DISPATCH_ETA_WINDOW_S", "420"))

    # Citizen chat provider. Secrets remain backend-only.
    CHAT_PROVIDER: str = os.getenv("CHAT_PROVIDER", "mock").strip().lower()
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    DEEPSEEK_MODEL: str = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")


@lru_cache
def get_settings() -> Settings:
    return Settings()
