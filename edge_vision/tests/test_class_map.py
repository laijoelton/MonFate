"""Class-map adapter: lets a third-party checkpoint drive the contract safely."""

from __future__ import annotations

import pytest

from edge_vision.inference.factory import _construct
from edge_vision.inference.validation import ClassMapError, build_class_translation

CONTRACT = ["wheelchair", "stroller", "mobility_aid", "ambulant", "other"]


def test_single_class_roboflow_export_maps_onto_the_contract():
    assert build_class_translation(["wheelchair"], CONTRACT, {"wheelchair": "wheelchair"}) == [
        "wheelchair"
    ]


def test_null_target_discards_a_class():
    translation = build_class_translation(
        ["person", "wheelchair"], CONTRACT, {"person": None, "wheelchair": "wheelchair"}
    )
    assert translation == [None, "wheelchair"]


def test_translation_is_positional_not_alphabetical():
    """Order must follow checkpoint index; decoding looks up by raw class id."""
    translation = build_class_translation(
        ["wheelchair", "person"], CONTRACT, {"person": None, "wheelchair": "wheelchair"}
    )
    assert translation == ["wheelchair", None]


def test_unmapped_checkpoint_class_fails_closed():
    """A class added upstream must not silently start firing dispatch events."""
    with pytest.raises(ClassMapError, match="absent from checkpoint_class_map"):
        build_class_translation(
            ["wheelchair", "walker"], CONTRACT, {"wheelchair": "wheelchair"}
        )


def test_target_outside_the_contract_is_rejected():
    with pytest.raises(ClassMapError, match="not in the contract"):
        build_class_translation(["wc"], CONTRACT, {"wc": "wheelchairs"})


def test_map_that_discards_everything_is_rejected():
    with pytest.raises(ClassMapError, match="discards every"):
        build_class_translation(["person"], CONTRACT, {"person": None})


def test_empty_map_is_rejected():
    with pytest.raises(ClassMapError, match="must not be empty"):
        build_class_translation(["wc"], CONTRACT, {})


def test_class_map_is_rejected_on_non_onnx_backends():
    """Silently ignoring a declared map would mislabel every detection."""
    with pytest.raises(ValueError, match="only supported by the onnx backend"):
        _construct("pytorch", "model.pt", CONTRACT, 416, "cpu", {"wheelchair": "wheelchair"})


def _roboflow_style_onnx(tmp_path, names):
    """A checkpoint carrying its own labels, as a third-party export would."""
    from edge_vision.tests.test_mobility import make_onnx

    path = tmp_path / "thirdparty.onnx"
    make_onnx(path, names=names, columns=4 + len(names))
    return path


def test_third_party_checkpoint_is_rejected_without_a_map(tmp_path):
    pytest.importorskip("onnx")
    pytest.importorskip("onnxruntime")
    from edge_vision.detector import MobilityDetector

    weights = _roboflow_style_onnx(tmp_path, ["wheelchair", "person"])
    with pytest.raises(ClassMapError):
        MobilityDetector(weights, backend="onnx", class_names=CONTRACT, fallback=False)


def test_third_party_checkpoint_loads_and_translates_with_a_map(tmp_path):
    """The end-to-end path: a wheelchair-only export driving the contract."""
    pytest.importorskip("onnx")
    pytest.importorskip("onnxruntime")
    import numpy as np

    from edge_vision.detector import MobilityDetector

    # make_onnx scores class 0, so `wheelchair` first makes it the firing class.
    weights = _roboflow_style_onnx(tmp_path, ["wheelchair", "person"])
    frame = np.zeros((32, 32, 3), dtype=np.uint8)

    detector = MobilityDetector(
        weights, backend="onnx", class_names=CONTRACT, fallback=False,
        class_map={"wheelchair": "wheelchair", "person": None},
    )
    detections = detector.infer(frame, conf=0.5)
    assert [d.class_name for d in detections] == ["wheelchair"]

    # Same checkpoint, different map: proves the label comes from the map, not
    # from the checkpoint's own naming.
    remapped = MobilityDetector(
        weights, backend="onnx", class_names=CONTRACT, fallback=False,
        class_map={"wheelchair": "mobility_aid", "person": None},
    )
    assert [d.class_name for d in remapped.infer(frame, conf=0.5)] == ["mobility_aid"]

    # And a discarded firing class yields nothing rather than leaking a raw label.
    discarded = MobilityDetector(
        weights, backend="onnx", class_names=CONTRACT, fallback=False,
        class_map={"wheelchair": None, "person": "stroller"},
    )
    assert discarded.infer(frame, conf=0.5) == []


def test_exact_match_still_required_without_a_map():
    """The default stays fail-closed; the adapter is opt-in per deployment."""
    from edge_vision.inference.validation import validate_class_names

    with pytest.raises(ClassMapError):
        validate_class_names(["wheelchair"], CONTRACT)
    assert validate_class_names(CONTRACT, CONTRACT) == CONTRACT
