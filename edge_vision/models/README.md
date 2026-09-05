# Mobility vision checkpoints

The legacy `detector.onnx` and `my_base_detector.pt` are not mobility models.
They must not be relabelled as wheelchairs, strollers, or mobility aids.
Deployment now validates checkpoint class metadata and head dimensions.

## Environment and training

Use Python 3.10+ in a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r edge_vision/requirements.txt
.\.venv\Scripts\python.exe -m pytest edge_vision/tests/ -q
```

Provide a local labelled dataset with `images/train`, `images/val`,
`labels/train`, and `labels/val`. Each image needs a matching `.txt` file;
empty annotations explicitly represent negative examples. Each box uses
`class_id center_x center_y width height`, normalized to image dimensions.
Both splits must contain the three dispatch classes. Split recordings by
camera/session and rider before annotation to avoid evaluation leakage;
the validator also rejects byte-identical images across splits.

Example `data.yaml` in the dataset root:

```yaml
path: .
train: images/train
val: images/val
names: [wheelchair, stroller, mobility_aid, ambulant, other]
```

```powershell
.\.venv\Scripts\python.exe -m edge_vision.finetune --data edge_vision/datasets/mobility/data.yaml --base yolov8n.pt --epochs 50 --freeze 10 --device cpu
```

The default base downloads pretrained YOLOv8n weights if absent. Use `--base`
with a local detection checkpoint for offline transfer learning. `--freeze 10`
freezes the first ten layers; `--freeze 0` permits full-network fine-tuning.
The best checkpoint is evaluated on the validation split and exported to
raw, static ONNX without embedded NMS. `metrics.json` records precision,
recall, mAP50, mAP50–95, per-class mAP, and artifact paths. A CPU ONNX warmup
checks the exported artifact. `--no-export` supports training-only runs.
Training data and run artifacts are ignored by Git.

The training API follows the official [YOLOv8 documentation](https://docs.ultralytics.com/models/yolov8/)
and [export API](https://docs.ultralytics.com/modes/export/).

## Deployment

```powershell
.\.venv\Scripts\python.exe -m edge_vision.run --source 0 --backend onnx --weights edge_vision/runs/mobility/train/weights/best.onnx --emit http://localhost:8000
```

Use the actual artifact path from `metrics.json` (repeated runs get new
directories). `detector.py` accepts validated PyTorch/ONNX artifacts, rejects
missing/mismatched class metadata, and fingerprints real model versions.
Other legacy backends remain available through the generic inference factory,
but cannot dispatch via the mobility runner until their metadata is validated.
Device fallback retries the same artifact on CPU; it never selects sibling
weights or silently replaces a broken checkpoint with a mock.

Missing weights, `--backend mock`, `--mock`, or `--simulation` use MockDetector.
Every such event is marked `is_simulation=true`; missing weights also issue a
warning. The default weights path is `edge_vision/models/mobility.onnx`.
Simulation alone keeps the selected camera source; `--mock` supplies synthetic
frames too. Existing incompatible or corrupt weights fail closed.

All runtime detections pass through exactly five consecutive single-object,
accepted-class observations, with a 0.70 acceptance threshold by default.
Empty, ambiguous, or low-confidence frames reset confirmation. Emission is
latched until the scene clears. Only JSON metadata is sent, to
`/api/v1/vision/events`; prediction saving/crops are disabled and preview is
local and opt-in. Training/evaluation use local labelled imagery, separately
from the station event transport.

No trained mobility checkpoint or accuracy claim is included in this change.
Evaluate on held-out real station recordings before deploying a trained model.

## Stable preview and optional age overlay

The runner now filters detections at **0.60** by default (`--confidence` or
`classes.yaml`). Dispatch still requires five fresh frames at the configured
0.70 acceptance threshold. Preview-only IoU matching and EMA smoothing
(`--smoothing-alpha 0.35`) reduce jitter. Two observations establish a box;
an established box can remain gray and marked `(held)` for two missed frames.
Held boxes never count toward the gate or enter emitted events. This simple
tracker is not a persistent identity tracker and may lose association during
occlusion or rapid movement.

`--demographics` enables **approximate age brackets only** and requires
`--preview`. Gender inference is not implemented. The face detector runs on
each preview frame; age inference is capped at four faces and refreshed every
five frames, with smoothed age probabilities. Low-certainty results display
`Age uncertain`. Estimates and face boxes stay in the local display and are
never added to JSON, HTTP, or MQTT events. No image saving or runtime download
is performed. Without the flag, no facial model is loaded or executed.

Install optional model files once:

```powershell
.\.venv\Scripts\python.exe -m pip install -r edge_vision/requirements.txt
.\.venv\Scripts\python.exe -m edge_vision.download_age_models
.\.venv\Scripts\python.exe -m edge_vision.run --source 0 --preview --demographics
```

OpenCV is constrained to 4.x because 5.x removed the Caffe loader. No DeepFace
or InsightFace dependency is needed. Models default to `models/age_preview/`
(ignored by Git); use `--age-model-dir` for another local directory. Downloads
are SHA-256 checked and their sources are recorded in `manifest.json`.

Model provenance: the [LearnOpenCV example](https://github.com/spmallick/learnopencv/tree/master/AgeGender)
supplies the face detector and age architecture; the age-only Caffe weights
come from a [pinned public model mirror](https://github.com/eveningglow/age-and-gender-classification/tree/5b60d9f8a8608cdbbcdaaa39bf28f351e8d8553b/model).
The pretrained age bins are approximate and are not verified ages. Lighting,
pose, image quality, and training-set limitations affect their accuracy.

The current local `models/mobility.onnx` is a copy of the five-epoch synthetic
smoke-run artifact; see `docs/MOBILITY_SMOKE_RUN.md` for its limitations.
`--max-frames 30` supports a bounded camera check; omit it for continuous use.
