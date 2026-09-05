import {
  HomeIcon,
  NearbyIcon,
  PlanIcon,
  AlertIcon,
  ReportIcon,
  ProfileIcon,
  BusIcon,
  MrtIcon,
  ShieldCheckIcon,
} from './Icons.jsx'

const navItems = [
  { id: 'home', icon: HomeIcon, label: 'Dashboard' },
  { id: 'nearby', icon: NearbyIcon, label: 'Nearby Transport' },
  { id: 'plan', icon: PlanIcon, label: 'Crowd & Forecast' },
  { id: 'alerts', icon: AlertIcon, label: 'Live Alerts', badge: '3' },
  { id: 'report', icon: ReportIcon, label: 'Report Problem' },
  { id: 'profile', icon: ProfileIcon, label: 'User Profile' },
]

export default function AppNavigation({ activePage, onNavigate }) {
  return (
    <>
      {/* Desktop Persistent Left Sidebar */}
      <aside className="desktop-sidebar" aria-label="Main desktop sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo-mark" aria-hidden="true" style={{ display: 'flex', gap: '2px', padding: '0 4px' }}>
            <BusIcon size={18} />
            <span style={{ fontSize: '12px', opacity: 0.7 }}>+</span>
            <MrtIcon size={18} />
          </div>
          <div className="brand-text">
            <span className="brand-title">SampAI</span>
            <span className="brand-tagline">BUS + MRT TRANSIT</span>
          </div>
        </div>

        <div className="sidebar-section-label">OPERATIONS MENU</div>

        <nav className="sidebar-nav">
          {navItems.map(({ id, icon: Icon, label, badge }) => {
            const isActive = activePage === id
            return (
              <button
                key={id}
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => onNavigate(id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="sidebar-nav-icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className="sidebar-nav-label">{label}</span>
                {badge && <span className="sidebar-nav-badge">{badge}</span>}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status-card">
            <div className="status-card-header">
              <ShieldCheckIcon size={18} className="text-success" />
              <span>Cyberjaya Corridor</span>
            </div>
            <div className="status-card-meta">
              <div>
                <small>Network Telemetry</small>
                <strong>4 Buses · 3 MRT</strong>
              </div>
              <div>
                <small>Accessibility</small>
                <strong style={{ color: '#10b981' }}>Ramp & Lift ✓</strong>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation fallback for small viewports */}
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {navItems.map(({ id, icon: Icon, label }) => {
          const isActive = activePage === id
          return (
            <button
              key={id}
              className={`mobile-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="mobile-nav-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <span>{label.split(' ')[0]}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
