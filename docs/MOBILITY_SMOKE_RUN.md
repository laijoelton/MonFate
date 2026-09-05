# Mobility training smoke run — 2026-09-05

Completed a real five-epoch YOLOv8n transfer-learning run on synthetic images.
These artifacts prove the training/export/runtime path; they are not validated
for real station footage. The model still has the five-class contract, but
this dataset annotates only wheelchair, stroller, and mobility_aid (rollators).

## Dataset and provenance

- 120 training images: 108 positives (36 per dispatch class), 12 negatives.
- 24 validation images: 18 positives (6 per class), 6 negatives.
- Twelve distinct object designs were generated with the built-in imagegen
  tool as a product-photo contact sheet. Training uses nine source objects;
  validation uses the other three. No base crop is shared across splits.
- Deterministic scale, translation, reflection, slight rotation, color,
  brightness, and blur augmentation. Labels derive from sprite bounds and
  were visually checked in `annotation_preview.jpg`. All dataset checks pass.
- The small validation set shares the generator/style and is highly correlated
  within each class. Its metrics must not be treated as real-world accuracy.
- No real images were downloaded. The [public Crossroad dataset](https://repository.tugraz.at/records/2gat1-pev27)
  inspected during acquisition is 1.8 GB and has no stroller class.

Local assets, kept out of Git:

- [Dataset YAML](../edge_vision/datasets/mobility_synthetic_v1/data.yaml)
- [Source sheet](../edge_vision/datasets/mobility_synthetic_v1/source_sheet.png)
- [Exact imagegen prompt](../edge_vision/datasets/mobility_synthetic_v1/prompt.txt)
- [Augmentation script](../edge_vision/datasets/mobility_synthetic_v1/prepare.py)
- [Provenance](../edge_vision/datasets/mobility_synthetic_v1/provenance.json)
- [Annotation preview](../edge_vision/datasets/mobility_synthetic_v1/annotation_preview.jpg)

## Training and results

Base weights: official pretrained `yolov8n.pt` from the Ultralytics assets
v8.3.0 release, saved locally under `edge_vision/runs/mobility_smoke/`.
CPU, 320px input, batch 8, first 10 layers frozen, five epochs.

```powershell
Set-Location C:\Users\Joelton\Documents\MonFate
.\.venv\Scripts\python.exe -m edge_vision.finetune --data edge_vision/datasets/mobility_synthetic_v1/data.yaml --base edge_vision/runs/mobility_smoke/yolov8n.pt --epochs 5 --imgsz 320 --batch 8 --freeze 10 --device cpu --output edge_vision/runs/mobility_smoke
```

The completed run used `train/`; subsequent runs may create `train2/` etc.

| Synthetic validation metric | Value |
|---|---:|
| Precision | 0.9051 |
| Recall | 0.9444 |
| mAP50 | 0.9642 |
| mAP50–95 | 0.9393 |
| Wheelchair mAP50–95 | 0.9203 |
| Stroller mAP50–95 | 0.9027 |
| Mobility aid mAP50–95 | 0.9950 |

Ambulant/other have no evaluation instances. Detailed local artifacts:
[metrics](../edge_vision/runs/mobility_smoke/metrics.json),
[epoch history](../edge_vision/runs/mobility_smoke/train/results.csv),
[training log](../edge_vision/runs/mobility_smoke/training.log).

## Deployment verification

Both trained artifacts load through `MobilityDetector` with
`is_simulation=false`, including inference on all 24 validation images:

- [best.pt](../edge_vision/runs/mobility_smoke/train/weights/best.pt),
  fingerprint `mobility-f9c741da313818fa`, 6,205,674 bytes.
- [best.onnx](../edge_vision/runs/mobility_smoke/train/weights/best.onnx),
  fingerprint `mobility-8509074cb731b344`, 12,115,777 bytes.

The ONNX artifact is static, batch 1, 320x320. Median measured CPU inference
was approximately 10.8 ms for ONNX and 31.8 ms for PyTorch on these small frames.
This is a local sample timing, not a hardware benchmark.

A synthetic local video was also processed by the actual live runner,
producing gated, image-free wheelchair and mobility_aid events with
`is_simulation=false` to stdout. No event was transmitted to a server.
Maximum stroller confidence on positive validation images was only 0.4723,
below the unchanged 0.70 dispatch threshold; no stroller dispatch is claimed.
`is_simulation=false` means real model inference, not real-world training data.

[Verification details](../edge_vision/runs/mobility_smoke/verification.json)
and [runner output](../edge_vision/runs/mobility_smoke/runner-verification.log)
remain local and ignored by Git.

Run the webcam with these exact trained weights:

```powershell
Set-Location C:\Users\Joelton\Documents\MonFate
.\.venv\Scripts\python.exe -m edge_vision.run --source 0 --backend onnx --weights edge_vision/runs/mobility_smoke/train/weights/best.onnx --imgsz 320 --device cpu --no-fallback --preview
```

Milestone 7 remains in progress pending representative real images, broader
mobility-aid coverage, and held-out station-level accuracy/dispatch evaluation.
