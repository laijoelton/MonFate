"use client";

import { Bell, Bus, Flag, Home, MapPin, Route, ShieldCheck, User } from "lucide-react";

export type CitizenPage = "home" | "nearby" | "plan" | "alerts" | "report" | "profile";

const NAV_ITEMS: { id: CitizenPage; icon: typeof Home; label: string }[] = [
  { id: "home", icon: Home, label: "Dashboard" },
  { id: "nearby", icon: MapPin, label: "Nearby Transport" },
  { id: "plan", icon: Route, label: "Crowd & Forecast" },
  { id: "alerts", icon: Bell, label: "Live Alerts" },
  { id: "report", icon: Flag, label: "Report Problem" },
  { id: "profile", icon: User, label: "User Profile" },
];

interface CitizenNavProps {
  activePage: CitizenPage;
  onNavigate: (page: CitizenPage) => void;
  busCount: number;
}

export function CitizenNav({ activePage, onNavigate, busCount }: CitizenNavProps) {
  return (
    <>
      <aside className="desktop-sidebar" aria-label="Main desktop sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo-mark" aria-hidden style={{ display: "flex", gap: 2, padding: "0 4px" }}>
            <Bus size={18} />
          </div>
          <div className="brand-text">
            <span className="brand-title">MonFate</span>
            <span className="brand-tagline">CYBERJAYA TRANSIT</span>
          </div>
        </div>

        <div className="sidebar-section-label">OPERATIONS MENU</div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
            const isActive = activePage === id;
            return (
              <button
                key={id}
                className={`sidebar-nav-item ${isActive ? "active" : ""}`}
                onClick={() => onNavigate(id)}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="sidebar-nav-icon" aria-hidden>
                  <Icon size={20} />
                </span>
                <span className="sidebar-nav-label">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status-card">
            <div className="status-card-header">
              <ShieldCheck size={18} className="text-success" />
              <span>Cyberjaya Corridor</span>
            </div>
            <div className="status-card-meta">
              <div>
                <small>Network Telemetry</small>
                <strong>{busCount} Buses live</strong>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
          const isActive = activePage === id;
          return (
            <button
              key={id}
              className={`mobile-nav-item ${isActive ? "active" : ""}`}
              onClick={() => onNavigate(id)}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="mobile-nav-icon" aria-hidden>
                <Icon size={20} />
              </span>
              <span>{label.split(" ")[0]}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
