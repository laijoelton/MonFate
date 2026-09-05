import { useState, useMemo } from 'react'
import AlertCard from '../components/AlertCard.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
import AlternativeBusCard from '../components/AlternativeBusCard.jsx'
import {
  ArrowLeftIcon,
  AlertIcon,
  BusIcon,
  MrtIcon,
  MapPinIcon,
  LiftIcon,
} from '../components/Icons.jsx'
import { mockAlerts, mockAlternatives } from '../data/mockData.js'

export default function AlertsPage({ onBack, onRouteChange, onGoHome }) {
  const [filter, setFilter] = useState('all') // 'all' | 'bus' | 'mrt'
  const [selected, setSelected] = useState(null)
  const [alternatives, setAlternatives] = useState(false)

  const filteredAlerts = useMemo(() => {
    if (filter === 'bus') return mockAlerts.filter((a) => a.mode === 'bus')
    if (filter === 'mrt') return mockAlerts.filter((a) => a.mode === 'mrt')
    return mockAlerts
  }, [filter])

  const choose = (option) => {
    onRouteChange({
      id: `route-${option.busId ? option.busId.toLowerCase() : 'custom'}`,
      busId: option.busId || 'T504',
      title: option.title,
      mode: option.mode || 'bus',
      from: option.stop,
      to: 'DPULZE',
      duration: option.total,
      walkingDistance: Number.parseInt(option.walking, 10) || 0,
      numberOfStops: 6,
      trafficLevel: 'Medium',
      crowdLevel: option.crowd,
      busAccessibility: { wheelchair: true, rampWorking: true },
      mrtAccessibility: { liftWorking: option.liftWorking ?? true },
      accessible: true,
    })
    setAlternatives(false)
    setSelected(null)
    onGoHome()
  }

  return (
    <div className="dashboard-view">
      <div className="view-sub-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeftIcon size={16} /> Back to Dashboard
        </button>
        <span className="muted small">Live transit advisories, ramp outages, lift statuses & delays</span>
      </div>

      {/* ALERT SUMMARY BANNER */}
      <div className="alert-summary-desktop dashboard-card">
        <div className="alert-summary-icon">
          <AlertIcon size={28} />
        </div>
        <div className="alert-summary-body">
          <strong>3 Active Operational Alerts (Bus Feeder & Putrajaya MRT)</strong>
          <p>
            Lift maintenance at Putrajaya Sentral MRT and bus feeder congestion reported. Check step-free accessibility details before departing:
          </p>
        </div>
        <div className="alert-summary-badge">
          <span>HIGH PRIORITY</span>
        </div>
      </div>

      {/* Transport Filter Bar: [ All Alerts ] [ Bus Alerts ] [ MRT Alerts ] */}
      <div className="transport-filter-bar" style={{ marginTop: '16px' }}>
        <button
          className={`transport-chip ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Alerts ({mockAlerts.length})
        </button>
        <button
          className={`transport-chip ${filter === 'bus' ? 'active' : ''}`}
          onClick={() => setFilter('bus')}
        >
          <BusIcon size={14} /> Bus Alerts ({mockAlerts.filter((a) => a.mode === 'bus').length})
        </button>
        <button
          className={`transport-chip ${filter === 'mrt' ? 'active' : ''}`}
          onClick={() => setFilter('mrt')}
        >
          <MrtIcon size={14} /> MRT Alerts ({mockAlerts.filter((a) => a.mode === 'mrt').length})
        </button>
      </div>

      {/* MULTI-COLUMN ALERT GRID */}
      <div className="alerts-desktop-grid" style={{ marginTop: '16px' }}>
        {filteredAlerts.map((alert) => (
          <div
            key={alert.id}
            className="dashboard-card alert-card-desktop"
            onClick={() => setSelected(alert)}
            style={{
              borderLeft: alert.urgent ? '6px solid var(--status-red)' : '6px solid var(--brand-blue)',
            }}
          >
            <div className="alert-card-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="alert-emoji-badge">{alert.icon}</span>
                <span className={`kpi-badge ${alert.mode === 'mrt' ? 'kpi-good' : 'kpi-info'}`}>
                  {alert.mode === 'mrt' ? 'MRT Putrajaya Line' : 'Feeder Bus'}
                </span>
              </div>
              <span className={`kpi-badge ${alert.urgent ? 'kpi-danger' : 'kpi-info'}`}>
                {alert.urgent ? 'Urgent Alert' : 'Advisory'}
              </span>
            </div>

            <h3 className="alert-card-type">{alert.type}</h3>
            <div className="alert-card-meta">
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MapPinIcon size={14} /> {alert.location}
              </span>
              <span>·</span>
              <span>{alert.time}</span>
            </div>

            <p className="alert-card-desc">{alert.description}</p>

            <div className="alert-card-footer">
              <button className="text-button small" style={{ padding: 0 }}>
                Inspect Details & Step-Free Advice →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Alert Details Modal */}
      {selected && (
        <BottomSheet title={selected.type} onClose={() => setSelected(null)}>
          <div
            className="disruption-banner"
            style={{
              borderColor: selected.urgent ? 'var(--status-red-border)' : 'var(--line)',
            }}
          >
            <span style={{ fontSize: '1.8rem' }}>{selected.icon}</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--muted)', fontSize: '0.84rem' }}>
                <MapPinIcon size={14} />
                <span>{selected.location}</span>
                <span>·</span>
                <span>{selected.time}</span>
                <span className={`kpi-badge ${selected.mode === 'mrt' ? 'kpi-good' : 'kpi-info'}`} style={{ marginLeft: '6px' }}>
                  {selected.mode === 'mrt' ? 'MRT' : 'Bus'}
                </span>
              </div>
              <strong style={{ display: 'block', margin: '4px 0 2px', fontSize: '1.05rem', color: 'var(--ink-heading)' }}>
                {selected.type}
              </strong>
              <p>{selected.description}</p>
            </div>
          </div>

          {selected.type.includes('Disruption') || selected.type.includes('Lift') ? (
            <button className="primary-button large" onClick={() => setAlternatives(true)}>
              <BusIcon size={18} /> View Step-Free Alternative Routes
            </button>
          ) : null}

          <button className="text-button" onClick={() => setSelected(null)} style={{ marginTop: '10px' }}>
            <ArrowLeftIcon size={16} /> Back
          </button>
        </BottomSheet>
      )}

      {/* Alternative Routes Modal */}
      {alternatives && (
        <BottomSheet title="Accessible Transit Alternatives" onClose={() => setAlternatives(false)} wide>
          <p className="sheet-intro">Available step-free alternatives (Feeder Bus and MRT combinations):</p>
          <div className="alternative-list">
            {mockAlternatives.map((option) => (
              <AlternativeBusCard key={option.id} option={option} onChoose={choose} />
            ))}
          </div>
          <button className="text-button" onClick={() => setAlternatives(false)} style={{ marginTop: '14px' }}>
            <ArrowLeftIcon size={16} /> Back to Alert Details
          </button>
        </BottomSheet>
      )}
    </div>
  )
}
