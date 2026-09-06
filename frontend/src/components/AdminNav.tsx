"use client";

import { AlertTriangle, Gauge as GaugeIcon, MapPinned, ShieldCheck, TrendingUp } from "lucide-react";

export type AdminPage = "overview" | "map" | "reports" | "accessibility" | "demand";

const NAV_ITEMS: { id: AdminPage; icon: typeof GaugeIcon; label: string }[] = [
  { id: "overview", icon: GaugeIcon, label: "Overview" },
  { id: "map", icon: MapPinned, label: "Live Map & Ops" },
  { id: "reports", icon: AlertTriangle, label: "Bus Reports" },
  { id: "accessibility", icon: ShieldCheck, label: "Accessibility" },
  { id: "demand", icon: TrendingUp, label: "Demand Intel" },
];

interface AdminNavProps {
  activePage: AdminPage;
  onNavigate: (page: AdminPage) => void;
  pendingReportsCount: number;
  activeIssuesCount: number;
}

/** Cockpit navigation — same desktop-sidebar + mobile-bottom-nav pattern as
 * the citizen app's CitizenNav, so the two dashboards feel like one product
 * even though the cockpit keeps its own dark theme. */
export function AdminNav({ activePage, onNavigate, pendingReportsCount, activeIssuesCount }: AdminNavProps) {
  const badgeFor = (id: AdminPage) => {
    if (id === "reports") return pendingReportsCount;
    if (id === "accessibility") return activeIssuesCount;
    return 0;
  };

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 flex-shrink-0 flex-col border-r border-white/10 bg-black/20 py-6 md:flex">
        <div className="mb-6 flex items-center gap-2 px-5">
          <ShieldCheck className="h-6 w-6 text-accent" aria-hidden />
          <div>
            <p className="text-sm font-bold leading-tight">MonFate Cockpit</p>
            <p className="text-[11px] text-slate-500">Operations control</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 px-3">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
            const isActive = activePage === id;
            const badge = badgeFor(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? "bg-accent/15 text-accent" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </span>
                {badge > 0 && (
                  <span className="rounded-full bg-warn/20 px-1.5 py-0.5 text-[10px] font-bold text-warn">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-white/10 bg-black/70 py-2 backdrop-blur md:hidden"
        aria-label="Admin sections"
      >
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
          const isActive = activePage === id;
          const badge = badgeFor(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 px-2 text-[10px] font-medium ${
                isActive ? "text-accent" : "text-slate-400"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label.split(" ")[0]}
              {badge > 0 && (
                <span className="absolute -right-1 -top-0.5 h-4 w-4 rounded-full bg-warn/90 text-center text-[9px] font-bold leading-4 text-black">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}
