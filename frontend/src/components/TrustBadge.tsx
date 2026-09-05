import { ShieldCheck, ShieldQuestion } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";

interface TrustBadgeProps {
  trustScore: number;
  lastVerifiedAt: string;
  nowIso: string;
}

/** Trust threshold above which the backend treats a report as actionable. */
const ACTIONABLE = 70;

export function TrustBadge({ trustScore, lastVerifiedAt, nowIso }: TrustBadgeProps) {
  const isTrusted = trustScore >= ACTIONABLE;
  const Icon = isTrusted ? ShieldCheck : ShieldQuestion;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        isTrusted ? "bg-ok/15 text-ok ring-ok/30" : "bg-warn/15 text-warn ring-warn/30"
      }`}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" />
      Verified {formatRelativeTime(lastVerifiedAt, nowIso)} &bull; {Math.round(trustScore)}% Trust
      Score
    </span>
  );
}
