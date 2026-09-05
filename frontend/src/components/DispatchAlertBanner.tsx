"use client";

import { AlertTriangle, Bus, MapPin, X } from "lucide-react";
import type { DispatchAlert } from "@/types/monfate";
import { ACCESSIBILITY_FEATURE_LABELS } from "@/types/monfate";
import { formatEta } from "@/lib/format";

const SEVERITY_STYLE = {
  critical: "border-down/40 bg-down/10",
  warning: "border-warn/40 bg-warn/10",
  info: "border-accent/40 bg-accent/10",
} as const;

const SEVERITY_TEXT = {
  critical: "text-down",
  warning: "text-warn",
  info: "text-accent",
} as const;

/** Word prefix so severity never depends on color alone (WCAG 1.4.1). */
const SEVERITY_WORD = {
  critical: "Critical",
  warning: "Action needed",
  info: "Notice",
} as const;

export function DispatchAlertBanner({
  alerts,
  onDismiss,
}: {
  alerts: DispatchAlert[];
  onDismiss: (id: string) => void;
}) {
  if (alerts.length === 0) return null;

  return (
    <div
      // Alerts appear without the user acting, so they must be announced.
      // "assertive" is warranted: an approaching bus is time-bounded.
      role="alert"
      aria-live="assertive"
      className="flex flex-col gap-2"
    >
      {alerts.slice(0, 3).map((a) => (
        <article
          key={a.alert_id}
          className={`relative overflow-hidden rounded-xl border px-4 py-3 ${SEVERITY_STYLE[a.severity]}`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              aria-hidden
              className={`mt-0.5 h-5 w-5 shrink-0 ${SEVERITY_TEXT[a.severity]}`}
            />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-slate-100">
                <span className={`text-xs uppercase tracking-wide ${SEVERITY_TEXT[a.severity]}`}>
                  {SEVERITY_WORD[a.severity]}
                </span>
                {a.headline}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{a.detail}</p>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <MapPin aria-hidden className="h-3.5 w-3.5" />
                  {a.stop_id}
                </span>
                {a.route_id && (
                  <span className="inline-flex items-center gap-1">
                    <Bus aria-hidden className="h-3.5 w-3.5" />
                    {a.route_id}
                  </span>
                )}
                {a.eta_seconds !== null && (
                  <span className="tabular">{formatEta(a.eta_seconds)}</span>
                )}
                {a.confidence !== null && (
                  <span className="tabular">{Math.round(a.confidence * 100)}% confidence</span>
                )}
                {a.affects.map((f) => (
                  <span key={f} className="rounded-full bg-slate-700/50 px-2 py-0.5">
                    {ACCESSIBILITY_FEATURE_LABELS[f]}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(a.alert_id)}
              aria-label={`Dismiss alert: ${a.headline}`}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
