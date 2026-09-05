import { ShieldCheck, ShieldQuestion } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";

interface TrustBadgeProps {
  trustScore: number;
  lastVerifiedAt: string;
  nowIso: string;
}

export function TrustBadge({ trustScore, lastVerifiedAt, nowIso }: TrustBadgeProps) {
  const isTrusted = trustScore >= 70;
  const Icon = isTrusted ? ShieldCheck : ShieldQuestion;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        isTrusted
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      }`}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" />
      Verified {formatRelativeTime(lastVerifiedAt, nowIso)} &bull; {Math.round(trustScore)}%
      Trust Score
    </span>
  );
}
