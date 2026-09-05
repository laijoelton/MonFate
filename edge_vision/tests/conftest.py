"""Keep optional ML runtime settings inside pytest's temporary workspace."""
import pytest


@pytest.fixture(scope="session", autouse=True)
def local_yolo_settings(tmp_path_factory):
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("YOLO_CONFIG_DIR", str(tmp_path_factory.mktemp("yolo_settings")))
        patch.setenv("YOLO_OFFLINE", "true")
        yield
