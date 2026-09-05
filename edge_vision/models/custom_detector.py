"""A proprietary, from-scratch anchor-free single-stage object detector.

Pure ``torch.nn`` — no Ultralytics, no torchvision, no pretrained weights. The
whole point is that the checkpoint it produces is ours to own before a hackathon.

    Backbone : stem + 4 depthwise-separable downsampling stages -> P3/P4/P5
               (strides 8 / 16 / 32), < 2.5 M total parameters
    Neck     : lightweight PAN (top-down FPN + bottom-up path aggregation)
    Head     : decoupled per-cell (objectness | class logits | box offsets),
               weight-shared across the three scales

Training forward  -> raw per-level maps (see ``forward``); the loss in
``pretrain.py`` decodes + assigns.
Export  forward   -> ``decode_for_export`` gives one ``(1, N, 5 + C)`` tensor
                     [cx, cy, w, h (pixels), obj_logit, cls_logits...] that
                     ``inference/onnx_backend.py`` post-processes with NMS.
"""

from __future__ import annotations

import math

import torch
import torch.nn as nn


# --------------------------------------------------------------------------- #
# building blocks
# --------------------------------------------------------------------------- #
def conv_bn_act(cin: int, cout: int, k: int = 3, s: int = 1, g: int = 1) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(cin, cout, k, s, k // 2, groups=g, bias=False),
        nn.BatchNorm2d(cout),
        nn.SiLU(inplace=True),
    )


class DWSep(nn.Module):
    """Depthwise 3x3 -> pointwise 1x1, each Conv-BN-SiLU. Optional stride on the DW."""

    def __init__(self, cin: int, cout: int, s: int = 1) -> None:
        super().__init__()
        self.dw = conv_bn_act(cin, cin, k=3, s=s, g=cin)
        self.pw = conv_bn_act(cin, cout, k=1, s=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.pw(self.dw(x))


class Stage(nn.Module):
    """One downsampling stage: a strided DWSep then ``n`` residual DWSep blocks."""

    def __init__(self, cin: int, cout: int, n: int) -> None:
        super().__init__()
        self.down = DWSep(cin, cout, s=2)
        self.blocks = nn.ModuleList(DWSep(cout, cout) for _ in range(n))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.down(x)
        for b in self.blocks:
            x = x + b(x)
        return x


# --------------------------------------------------------------------------- #
# backbone / neck / head
# --------------------------------------------------------------------------- #
class Backbone(nn.Module):
    """stem(s2) -> s1(s4) -> s2(s8,P3) -> s3(s16,P4) -> s4(s32,P5)."""

    def __init__(self, w: tuple[int, ...] = (32, 64, 128, 256, 384), depths=(2, 4, 6, 3)) -> None:
        super().__init__()
        self.stem = conv_bn_act(3, w[0], k=3, s=2)
        self.s1 = Stage(w[0], w[1], depths[0])
        self.s2 = Stage(w[1], w[2], depths[1])   # P3, stride 8
        self.s3 = Stage(w[2], w[3], depths[2])   # P4, stride 16
        self.s4 = Stage(w[3], w[4], depths[3])   # P5, stride 32
        self.out_channels = (w[2], w[3], w[4])

    def forward(self, x: torch.Tensor):
        x = self.s1(self.stem(x))
        p3 = self.s2(x)
        p4 = self.s3(p3)
        p5 = self.s4(p4)
        return p3, p4, p5


class PAN(nn.Module):
    """Top-down FPN then bottom-up path aggregation, all at ``ch`` channels."""

    def __init__(self, in_ch: tuple[int, int, int], ch: int = 64) -> None:
        super().__init__()
        c3, c4, c5 = in_ch
        self.l3 = conv_bn_act(c3, ch, k=1)
        self.l4 = conv_bn_act(c4, ch, k=1)
        self.l5 = conv_bn_act(c5, ch, k=1)
        self.up = nn.Upsample(scale_factor=2, mode="nearest")
        # top-down
        self.td4 = DWSep(ch * 2, ch)
        self.td3 = DWSep(ch * 2, ch)
        # bottom-up
        self.dn3 = DWSep(ch, ch, s=2)
        self.bu4 = DWSep(ch * 2, ch)
        self.dn4 = DWSep(ch, ch, s=2)
        self.bu5 = DWSep(ch * 2, ch)

    def forward(self, feats):
        p3, p4, p5 = feats
        p3, p4, p5 = self.l3(p3), self.l4(p4), self.l5(p5)
        p4 = self.td4(torch.cat([p4, self.up(p5)], 1))
        p3 = self.td3(torch.cat([p3, self.up(p4)], 1))
        p4 = self.bu4(torch.cat([p4, self.dn3(p3)], 1))
        p5 = self.bu5(torch.cat([p5, self.dn4(p4)], 1))
        return p3, p4, p5


class DecoupledHead(nn.Module):
    """Weight-shared across scales. Small cls tower + small reg tower, decoupled."""

    def __init__(self, ch: int, num_classes: int) -> None:
        super().__init__()
        self.stem = conv_bn_act(ch, ch, k=1)
        self.cls_tower = DWSep(ch, ch)
        self.reg_tower = DWSep(ch, ch)
        self.obj = nn.Conv2d(ch, 1, 1)
        self.cls = nn.Conv2d(ch, num_classes, 1)
        self.reg = nn.Conv2d(ch, 4, 1)
        # bias init: rare objects (focal-style prior)
        nn.init.constant_(self.obj.bias, -math.log((1 - 0.01) / 0.01))
        nn.init.constant_(self.cls.bias, -math.log((1 - 0.01) / 0.01))

    def forward(self, x: torch.Tensor):
        x = self.stem(x)
        c = self.cls_tower(x)
        r = self.reg_tower(x)
        return self.obj(r), self.cls(c), self.reg(r)


# --------------------------------------------------------------------------- #
# detector
# --------------------------------------------------------------------------- #
class CustomDetector(nn.Module):
    strides: tuple[int, int, int] = (8, 16, 32)

    def __init__(self, num_classes: int = 20, neck_ch: int = 128,
                 width=(32, 64, 128, 256, 384), depths=(2, 4, 6, 3)):
        super().__init__()
        self.num_classes = num_classes
        self.backbone = Backbone(w=width, depths=depths)
        self.neck = PAN(self.backbone.out_channels, ch=neck_ch)
        self.head = DecoupledHead(neck_ch, num_classes)

    def forward(self, x: torch.Tensor):
        """Training/raw forward. Returns a list of 3 dicts (one per FPN level):
        ``{"obj": (B,1,H,W), "cls": (B,C,H,W), "reg": (B,4,H,W), "stride": s}``.
        """
        outs = []
        for feat, stride in zip(self.neck(self.backbone(x)), self.strides):
            obj, cls, reg = self.head(feat)
            outs.append({"obj": obj, "cls": cls, "reg": reg, "stride": stride})
        return outs

    # ---- decoding -------------------------------------------------------- #
    @staticmethod
    def _grid(h: int, w: int, device, dtype):
        ys, xs = torch.meshgrid(
            torch.arange(h, device=device, dtype=dtype),
            torch.arange(w, device=device, dtype=dtype),
            indexing="ij",
        )
        return xs.reshape(-1), ys.reshape(-1)

    def decode_level(self, out: dict) -> torch.Tensor:
        """One level -> ``(B, H*W, 5 + C)`` = [cx, cy, w, h (px), obj_logit, cls_logits]."""
        obj, cls, reg = out["obj"], out["cls"], out["reg"]
        s = out["stride"]
        b, _, h, w = obj.shape
        gx, gy = self._grid(h, w, obj.device, obj.dtype)

        reg = reg.permute(0, 2, 3, 1).reshape(b, h * w, 4)
        cx = (gx + reg[..., 0].sigmoid()) * s
        cy = (gy + reg[..., 1].sigmoid()) * s
        bw = torch.exp(reg[..., 2].clamp(max=8.0)) * s
        bh = torch.exp(reg[..., 3].clamp(max=8.0)) * s

        obj = obj.permute(0, 2, 3, 1).reshape(b, h * w, 1)
        cls = cls.permute(0, 2, 3, 1).reshape(b, h * w, self.num_classes)
        return torch.cat([cx[..., None], cy[..., None], bw[..., None], bh[..., None], obj, cls], -1)

    def decode_for_export(self, x: torch.Tensor) -> torch.Tensor:
        """ONNX forward: one ``(B, N, 5 + C)`` tensor across all levels."""
        return torch.cat([self.decode_level(o) for o in self.forward(x)], dim=1)

    # ---- transfer learning hooks -------------------------------------- #
    def load_backbone_weights(self, checkpoint_path: str, freeze: bool = False) -> list[str]:
        """Load just the feature extractor (backbone + neck) from a checkpoint.

        Returns the list of loaded parameter prefixes. Set ``freeze`` to lock
        those layers for head-only fine-tuning.
        """
        ckpt = torch.load(checkpoint_path, map_location="cpu")
        state = ckpt.get("model", ckpt)
        wanted = {
            k: v for k, v in state.items() if k.startswith(("backbone.", "neck."))
        }
        missing, unexpected = self.load_state_dict(wanted, strict=False)
        if unexpected:
            raise RuntimeError(f"unexpected keys loading backbone: {unexpected[:4]}")
        if freeze:
            self.freeze_backbone()
        return sorted({k.split(".")[0] for k in wanted})

    def freeze_backbone(self, up_to_stage: int = 99) -> None:
        """Freeze the stem + backbone stages 1..``up_to_stage`` (and, by default,
        the whole backbone + neck). Head stays trainable."""
        for name, p in self.backbone.named_parameters():
            stage = {"stem": 0, "s1": 1, "s2": 2, "s3": 3, "s4": 4}.get(name.split(".")[0], 99)
            p.requires_grad = not (stage <= up_to_stage)
        if up_to_stage >= 4:
            for p in self.neck.parameters():
                p.requires_grad = False

    def replace_class_head(self, num_classes: int) -> None:
        """Swap the classification 1x1 for a new ``num_classes`` (hackathon target)."""
        ch = self.head.cls.in_channels
        self.head.cls = nn.Conv2d(ch, num_classes, 1)
        nn.init.constant_(self.head.cls.bias, -math.log((1 - 0.01) / 0.01))
        self.num_classes = num_classes


def build_detector(num_classes: int = 20, size: str = "s") -> CustomDetector:
    cfg = {
        # tiny — highest FPS, lowest capacity
        "n": dict(neck_ch=64, width=(24, 48, 96, 160, 224), depths=(1, 2, 3, 1)),
        # small — the default proprietary base model (~2M params, < 2.5M budget)
        "s": dict(neck_ch=128, width=(32, 64, 128, 256, 384), depths=(2, 4, 6, 3)),
    }[size]
    return CustomDetector(num_classes=num_classes, **cfg)


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())


if __name__ == "__main__":
    for size in ("n", "s"):
        m = build_detector(20, size)
        n = count_parameters(m)
        out = m.decode_for_export(torch.zeros(1, 3, 416, 416))
        print(f"size={size}  params={n / 1e6:.2f}M  export_out={tuple(out.shape)}  "
              f"under_2.5M={'YES' if n < 2_500_000 else 'NO'}")
