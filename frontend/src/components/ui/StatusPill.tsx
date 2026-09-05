import type { ReactNode } from "react";

export type Tone = "ok" | "warn" | "down" | "idle" | "accent";

// color names come from @theme in globals.css -> bg-ok / text-ok / ring-ok utils
const TONE: Record<Tone, string> = {
  ok: "bg-ok/15 text-ok ring-ok/30",
  warn: "bg-warn/15 text-warn ring-warn/30",
  down: "bg-down/15 text-down ring-down/30",
  idle: "bg-idle/15 text-slate-300 ring-idle/25",
  accent: "bg-accent/15 text-accent ring-accent/30",
};

export function StatusPill({
  tone,
  children,
  pulse = false,
  className = "",
}: {
  tone: Tone;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONE[tone]} ${className}`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full bg-current ${pulse ? "animate-livepulse" : ""}`}
      />
      {children}
    </span>
  );
}
