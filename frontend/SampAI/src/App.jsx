import { useState } from 'react'
import AppNavigation from './components/AppNavigation.jsx'
import HomePage from './pages/HomePage.jsx'
import NearbyPage from './pages/NearbyPage.jsx'
import PlanPage from './pages/PlanPage.jsx'
import AlertsPage from './pages/AlertsPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import ReportProblemPage from './pages/ReportProblemPage.jsx'
import { SearchIcon, AlertIcon, BusIcon } from './components/Icons.jsx'

export default function App() {
  const [page, setPage] = useState('home')
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const navigate = (nextPage) => setPage(nextPage)
  const goHome = () => setPage('home')

  let content
  if (page === 'nearby') content = <NearbyPage onBack={goHome} />
  else if (page === 'plan') content = <PlanPage onBack={goHome} />
  else if (page === 'alerts') content = <AlertsPage onBack={goHome} onRouteChange={setSelectedRoute} onGoHome={goHome} />
  else if (page === 'profile') content = <ProfilePage onBack={goHome} />
  else if (page === 'report') content = <ReportProblemPage onBack={goHome} />
  else content = <HomePage selectedRoute={selectedRoute} onRouteChange={setSelectedRoute} onNavigate={navigate} />

  const getPageTitle = () => {
    switch (page) {
      case 'nearby': return 'Nearby Bus Stops & Arrivals'
      case 'plan': return 'Crowd & Traffic Analytics Forecast'
      case 'alerts': return 'Live Transit Advisories & Disruptions'
      case 'profile': return 'Passenger Accessibility Profile'
      case 'report': return 'Community Problem Reporting'
      default: return 'Transit Operations Dashboard'
    }
  }

  return (
    <div className="app-shell">
      {/* Persistent Left Sidebar */}
      <AppNavigation activePage={page} onNavigate={navigate} />

      {/* Main Content Area */}
      <div className="app-main">
        {/* Desktop Top Header Bar */}
        <header className="desktop-topbar">
          <div className="topbar-left">
            <div className="topbar-title-group">
              <span className="topbar-badge">
                <span className="live-indicator-dot" /> LIVE CYBERJAYA NETWORK
              </span>
              <h1 className="topbar-title">{getPageTitle()}</h1>
            </div>
          </div>

          <div className="topbar-right">
            {/* Topbar Search Control */}
            <div className="topbar-search-wrapper">
              <button
                className="topbar-search-btn"
                onClick={() => {
                  if (page !== 'home') navigate('home')
                }}
                title="Search destination"
              >
                <SearchIcon size={18} />
                <span>Search bus lines, stops or destination...</span>
                <kbd className="search-kbd">⌘K</kbd>
              </button>
            </div>

            {/* Quick Alerts Shortcut */}
            <button
              className={`topbar-icon-btn ${page === 'alerts' ? 'active' : ''}`}
              onClick={() => navigate('alerts')}
              aria-label="View alerts"
              title="2 live transit alerts"
            >
              <AlertIcon size={20} />
              <span className="topbar-alert-badge">2</span>
            </button>

            {/* User Profile Shortcut */}
            <button
              className={`topbar-profile-btn ${page === 'profile' ? 'active' : ''}`}
              onClick={() => navigate('profile')}
              aria-label="View profile"
              title="SampAI Passenger Profile"
            >
              <div className="topbar-avatar">S</div>
              <div className="topbar-user-info">
                <span className="topbar-user-name">SampAI User</span>
                <span className="topbar-user-role">Passenger</span>
              </div>
            </button>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <div className="app-content-container">
          {content}
        </div>
      </div>
    </div>
  )
}
