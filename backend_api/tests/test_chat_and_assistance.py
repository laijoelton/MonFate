"""Contract tests for anonymous assistance and deterministic mock chat."""

import os
import tempfile
import unittest

_tmp = tempfile.TemporaryDirectory()
os.environ["SYS_DATABASE_URL"] = f"sqlite:///{_tmp.name}/test.db"
os.environ["SYS_MOCK_DATA"] = "false"
os.environ["CHAT_PROVIDER"] = "mock"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.database import engine  # noqa: E402
from app.services.chat import GeminiChatProvider, MockChatProvider, get_chat_provider, settings  # noqa: E402


class CitizenChatTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)
        engine.dispose()
        _tmp.cleanup()

    def test_five_stops_are_configured(self):
        response = self.client.get("/api/v1/stops")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 5)

    def test_assistance_confirmation_is_idempotent(self):
        body = {
            "passenger_need": "Wheelchair boarding assistance",
            "stop_id": "stop_01",
            "client_request_id": "browser-confirm-123",
        }
        first = self.client.post("/api/v1/assistance-requests", json=body)
        replay = self.client.post("/api/v1/assistance-requests", json=body)
        self.assertEqual(first.status_code, 201)
        self.assertTrue(first.json()["created"])
        self.assertFalse(replay.json()["created"])
        self.assertEqual(
            first.json()["assistance_request"]["id"],
            replay.json()["assistance_request"]["id"],
        )

    def test_unknown_stop_is_rejected(self):
        response = self.client.post(
            "/api/v1/assistance-requests",
            json={"passenger_need": "Boarding assistance", "stop_id": "unknown"},
        )
        self.assertEqual(response.status_code, 422)

    def test_mock_chat_streams_and_finishes(self):
        response = self.client.post(
            "/api/v1/chat/stream",
            headers={"X-Chat-Session-ID": "browser-session-123"},
            json={"messages": [{"role": "user", "content": "What is the crowd level?"}]},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("event: text_delta", response.text)
        self.assertIn("event: done", response.text)

    def test_chat_limits_are_enforced(self):
        response = self.client.post(
            "/api/v1/chat/stream",
            headers={"X-Chat-Session-ID": "browser-session-456"},
            json={"messages": [{"role": "user", "content": "x" * 801}]},
        )
        self.assertEqual(response.status_code, 422)

    def test_mock_follow_up_retains_bounded_context(self):
        response = self.client.post(
            "/api/v1/chat/stream",
            headers={"X-Chat-Session-ID": "browser-session-789"},
            json={"messages": [
                {"role": "user", "content": "I need wheelchair boarding assistance."},
                {"role": "assistant", "content": "Which stop?"},
                {"role": "user", "content": "Tamarind Square."},
            ]},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("event: action_proposal", response.text)
        self.assertIn('"stop_id": "stop_01"', response.text)

    def test_provider_selection_does_not_contact_gemini(self):
        original = settings.CHAT_PROVIDER
        try:
            settings.CHAT_PROVIDER = "gemini"
            self.assertIsInstance(get_chat_provider(), GeminiChatProvider)
            settings.CHAT_PROVIDER = "mock"
            self.assertIsInstance(get_chat_provider(), MockChatProvider)
        finally:
            settings.CHAT_PROVIDER = original

    def test_gemini_defaults_are_safe(self):
        self.assertEqual(settings.GEMINI_MODEL, "gemini-2.5-flash")
        self.assertEqual(settings.GEMINI_API_KEY, "")


if __name__ == "__main__":
    unittest.main()
