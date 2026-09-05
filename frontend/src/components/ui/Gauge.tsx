/** 240-degree arc gauge, SVG only. `tone` inverts the scale for metrics where low is good. */
export function Gauge({
  value,
  size = 92,
  unit = "%",
  lowIsGood = false,
  label,
}: {
  value: number;
  size?: number;
  unit?: string;
  lowIsGood?: boolean;
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const r = size / 2 - 8;
  const c = size / 2;
  const start = 150;
  const sweep = 240;
  const toXY = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [c + r * Math.cos(rad), c + r * Math.sin(rad)];
  };
  const arc = (fromDeg: number, toDeg: number) => {
    const [x1, y1] = toXY(fromDeg);
    const [x2, y2] = toXY(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const end = start + (v / 100) * sweep;
  const severity = lowIsGood ? v : 100 - v;
  const tone =
    severity >= 90
      ? "var(--color-down)"
      : severity >= 70
        ? "var(--color-warn)"
        : "var(--color-accent)";

  return (
    <svg
      width={size}
      height={size}
      className="shrink-0"
      role="img"
      aria-label={`${label ?? "value"}: ${v.toFixed(0)}${unit}`}
    >
      <path
        d={arc(start, start + sweep)}
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        className="text-slate-700/60"
        strokeLinecap="round"
      />
      <path d={arc(start, end)} fill="none" stroke={tone} strokeWidth="7" strokeLinecap="round" />
      <text
        x={c}
        y={c + 4}
        textAnchor="middle"
        className="fill-slate-100 tabular"
        style={{ fontSize: size * 0.26, fontWeight: 600 }}
      >
        {v.toFixed(0)}
      </text>
      <text
        x={c}
        y={c + size * 0.22}
        textAnchor="middle"
        className="fill-slate-500"
        style={{ fontSize: size * 0.12 }}
      >
        {unit}
      </text>
    </svg>
  );
}
