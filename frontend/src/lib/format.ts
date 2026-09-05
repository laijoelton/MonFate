/** Formats `isoTimestamp` as "12m ago" / "1h ago" relative to `nowIso`. */
export function formatRelativeTime(isoTimestamp: string, nowIso: string): string {
  const diffMs = new Date(nowIso).getTime() - new Date(isoTimestamp).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatEta(etaSeconds: number): string {
  if (etaSeconds <= 0) return "Arriving now";
  if (etaSeconds < 60) return `${etaSeconds}s away`;
  return `${Math.round(etaSeconds / 60)} min away`;
}
