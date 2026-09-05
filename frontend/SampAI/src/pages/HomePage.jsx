import { useMemo, useState } from 'react'
import MapContainer from '../components/MapContainer.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
import TimeSelector from '../components/TimeSelector.jsx'
import AccessibilityList from '../components/AccessibilityList.jsx'
import AlternativeBusCard from '../components/AlternativeBusCard.jsx'
import {
  SearchIcon,
  BusIcon,
  MrtIcon,
  LiftIcon,
  StopIcon,
  PlanIcon,
  ReportIcon,
  WheelchairIcon,
  ChevronRightIcon,
  CheckIcon,
  XIcon,
  MapPinIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
  ClockIcon,
} from '../components/Icons.jsx'
import {
  mockBusStops,
  mockBuses,
  mockMrtStations,
  mockMrtArrivals,
  mockRoutes,
  mockTrafficForecast,
  mockAlternatives,
} from '../data/mockData.js'

const crowdBadge = (level) => {
  if (level === 'Low') {
    return <span className="kpi-badge kpi-good">● Low</span>
  }
  if (level === 'Medium') {
    return <span className="kpi-badge kpi-warning">● Medium</span>
  }
  if (level === 'Crowded') {
    return <span className="kpi-badge kpi-warning">● Crowded</span>
  }
  return <span className="kpi-badge kpi-danger">● Very Heavy</span>
}

export default function HomePage({ selectedRoute, onRouteChange, onNavigate }) {
  const [transportFilter, setTransportFilter] = useState('all') // 'all' | 'bus' | 'mrt'
  const [sheet, setSheet] = useState(null)
  const [from, setFrom] = useState('Current Location')
  const [to, setTo] = useState('DPULZE')
  const [selectedStop, setSelectedStop] = useState(null)
  const [selectedMrtStation, setSelectedMrtStation] = useState(null)
  const [selectedTime, setSelectedTime] = useState(mockTrafficForecast[2])
  const [selectedBus, setSelectedBus] = useState(null)
  const [assistanceTarget, setAssistanceTarget] = useState(null) // { type: 'bus' | 'mrt', item: ... }
  const [assistanceSent, setAssistanceSent] = useState(false)
  const [assistance, setAssistance] = useState([])
  const [message, setMessage] = useState('')
  const [showDisruption, setShowDisruption] = useState(false)

  const nextBus = useMemo(() => mockBuses[0], [])
  const nextMrt = useMemo(() => mockMrtStations[0], [])

  const closeSheet = () => {
    setSheet(null)
    setSelectedBus(null)
    setSelectedMrtStation(null)
    setAssistanceTarget(null)
    setAssistanceSent(false)
  }

  const runSearch = () => setSheet('stops')

  const selectStop = (stop) => {
    setSelectedStop(stop)
    setSheet('forecast')
  }

  const selectMrtStation = (station) => {
    setSelectedMrtStation(station)
    setSheet('mrt-details')
  }

  const useTime = () => setSheet('route')

  const chooseRoute = (routeToSet) => {
    const route = routeToSet || {
      ...mockRoutes[0],
      from: selectedStop?.name || mockRoutes[0].from,
      to,
    }
    onRouteChange(route)
    closeSheet()
  }

  const openBus = (busToOpen = nextBus) => {
    setSelectedBus(busToOpen)
    setAssistanceTarget({ type: 'bus', item: busToOpen })
    setSheet('bus-details')
  }

  const openMrtAssistance = (station = selectedMrtStation || nextMrt) => {
    setAssistanceTarget({ type: 'mrt', item: station })
    setSheet('assistance')
  }

  const toggleAssistance = (value) => {
    setAssistance((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    )
  }

  const switchAlternative = (option) => {
    const route = mockRoutes.find((item) => item.busId === option.busId) || {
      ...mockRoutes[0],
      busId: option.busId,
      from: option.stop,
      duration: option.total,
      walkingDistance: Number.parseInt(option.walking, 10) || 0,
    }
    onRouteChange(route)
    setShowDisruption(false)
    setSheet(null)
  }

  // Filtered transport list for the right panel
  const nearbyTransportItems = useMemo(() => {
    const stops = mockBusStops.map((s) => ({ ...s, transportType: 'bus' }))
    const mrt = mockMrtStations.map((m) => ({ ...m, transportType: 'mrt' }))
    if (transportFilter === 'bus') return stops
    if (transportFilter === 'mrt') return mrt
    // Interleave or combine:
    return [...stops.slice(0, 2), ...mrt.slice(0, 2)]
  }, [transportFilter])

  return (
    <div className="dashboard-view">
      {/* 1. TOP SUMMARY / KPI METRIC CARDS (BUS + MRT OPERATIONS) */}
      <section className="kpi-grid" aria-label="Operational Key Metrics">
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">NEXT BUS DEPARTURE</span>
            <div className="kpi-icon-wrap">
              <BusIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">Bus {nextBus.id}</span>
            <span className="kpi-badge kpi-good">On Time</span>
          </div>
          <div className="kpi-footer">
            <span>Arrives in <strong>{nextBus.eta} min</strong> ({nextBus.stopsAway} stops away)</span>
          </div>
        </div>

        <div className="kpi-card" onClick={() => selectMrtStation(nextMrt)} style={{ cursor: 'pointer' }}>
          <div className="kpi-header">
            <span className="kpi-title">NEXT MRT (PUTRAJAYA LINE)</span>
            <div className="kpi-icon-wrap" style={{ background: '#dcfce7', color: '#15803d' }}>
              <MrtIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">Next in {nextMrt.nextArrival}m</span>
            <span className="kpi-badge kpi-good">Lift Working ✓</span>
          </div>
          <div className="kpi-footer">
            <span>{nextMrt.name} (Following: <strong>{nextMrt.followingArrival}m</strong>)</span>
          </div>
        </div>

        <div className="kpi-card" onClick={() => onNavigate('plan')} style={{ cursor: 'pointer' }}>
          <div className="kpi-header">
            <span className="kpi-title">CORRIDOR CROWD LEVEL</span>
            <div className="kpi-icon-wrap">
              <PlanIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">Station: Med</span>
            <span className="kpi-badge kpi-warning">MRT: Crowded</span>
          </div>
          <div className="kpi-footer">
            <span>Road traffic: <strong>{selectedTime.traffic}</strong> (wait: ~{selectedTime.wait}m)</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">ACCESSIBILITY READINESS</span>
            <div className="kpi-icon-wrap">
              <WheelchairIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">Step-Free Ready</span>
            <span className="kpi-badge kpi-good">✓ 100% Ramp & Lift</span>
          </div>
          <div className="kpi-footer">
            <span>Bus hydraulic ramp & station lifts monitored</span>
          </div>
        </div>
      </section>

      {/* 2. MAIN 2-COLUMN DASHBOARD STAGE */}
      <div className="dashboard-stage-grid">
        {/* LEFT / CENTER COLUMN: PROMINENT MAP AREA (65%) */}
        <section className="stage-main-column">
          <div className="dashboard-card map-stage-card">
            <div className="map-card-header">
              <div className="map-card-title-group">
                <span className="card-eyebrow">LIVE SATELLITE & NETWORK TELEMETRY</span>
                <h2 className="map-card-title">Cyberjaya Bus & MRT Transit Corridor</h2>
              </div>
              <div className="map-card-actions">
                <button className="small-button secondary-btn" onClick={() => onNavigate('nearby')}>
                  <StopIcon size={15} /> All Transport
                </button>
                <button className="small-button primary-btn" onClick={() => setSheet('search')}>
                  <SearchIcon size={15} /> Plan Journey
                </button>
              </div>
            </div>

            {/* Preserving MapContainer exactly with its props and callbacks */}
            <div className="map-wrapper-desktop">
              <MapContainer selectedRoute={selectedRoute} onNearby={() => onNavigate('nearby')} />
            </div>
          </div>

          {/* Active Journey Status Panel (Appears when route is active) */}
          {selectedRoute && (
            <div className="dashboard-card active-journey-panel">
              <div className="active-journey-content">
                <div className="active-journey-badge">
                  {selectedRoute.mode === 'bus-mrt' ? (
                    <>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <BusIcon size={16} />
                        <MrtIcon size={16} />
                      </div>
                      <span style={{ fontSize: '0.65rem' }}>Bus + MRT</span>
                    </>
                  ) : selectedRoute.mode === 'mrt' ? (
                    <>
                      <MrtIcon size={20} />
                      <span style={{ fontSize: '0.65rem' }}>MRT</span>
                    </>
                  ) : (
                    <>
                      <BusIcon size={20} />
                      <span style={{ fontSize: '0.65rem' }}>Bus {selectedRoute.busId}</span>
                    </>
                  )}
                </div>
                <div className="active-journey-info">
                  <div className="card-eyebrow">ACTIVE PLANNED ROUTE</div>
                  <h3>
                    {selectedRoute.title || `Bus ${selectedRoute.busId} to ${selectedRoute.to}`}
                  </h3>
                  <div className="active-journey-meta">
                    <span>⏱ <strong>{selectedRoute.duration} min</strong> journey</span>
                    <span>🚶 <strong>{selectedRoute.walkingDistance} m</strong> walking</span>
                    {selectedRoute.busAccessibility?.rampWorking && (
                      <span className="kpi-badge kpi-good" style={{ padding: '2px 8px' }}>
                        ✓ Bus Ramp OK
                      </span>
                    )}
                    {selectedRoute.mrtAccessibility?.liftWorking && (
                      <span className="kpi-badge kpi-good" style={{ padding: '2px 8px' }}>
                        ✓ MRT Lift OK
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="active-journey-actions">
                <button
                  className="secondary-button"
                  onClick={() => {
                    if (selectedRoute.mode === 'mrt') {
                      openMrtAssistance(nextMrt)
                    } else {
                      openBus(nextBus)
                    }
                  }}
                >
                  <WheelchairIcon size={16} /> Assistance Details
                </button>
                <button className="danger-button" onClick={() => setShowDisruption(true)}>
                  Demo Disruption
                </button>
              </div>
            </div>
          )}

          {/* Quick Operations Strip under Map: Live Buses + MRT */}
          <div className="dashboard-card live-corridor-strip">
            <div className="strip-title-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheckIcon size={18} className="text-primary" />
                <strong>Live Fleet Telemetry (Cyberjaya Feeder & MRT Putrajaya Line)</strong>
              </div>
              <span className="muted small">Real-time GPS status</span>
            </div>
            <div className="bus-fleet-grid">
              {/* Feeder Buses */}
              {mockBuses.slice(0, 2).map((bus) => (
                <div
                  key={bus.id}
                  className="fleet-bus-chip"
                  onClick={() => openBus(bus)}
                  title={`Inspect Bus ${bus.id}`}
                >
                  <div className="fleet-chip-badge">
                    <BusIcon size={16} />
                    <strong>{bus.id}</strong>
                  </div>
                  <div className="fleet-chip-details">
                    <span>ETA: <strong>{bus.eta}m</strong></span>
                    <span className={`status-pill ${bus.statusTone}`} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                      {bus.status}
                    </span>
                  </div>
                </div>
              ))}

              {/* MRT Trains */}
              {mockMrtArrivals.slice(0, 2).map((mrt) => (
                <div
                  key={mrt.trainNumber}
                  className="fleet-bus-chip"
                  onClick={() => selectMrtStation(mockMrtStations[0])}
                  title={`Inspect ${mrt.trainNumber} on ${mrt.line}`}
                  style={{ borderLeft: '3px solid #16a34a' }}
                >
                  <div className="fleet-chip-badge">
                    <MrtIcon size={16} />
                    <strong>{mrt.trainNumber}</strong>
                  </div>
                  <div className="fleet-chip-details">
                    <span>ETA: <strong>{mrt.nextEta}m</strong></span>
                    <span className="kpi-badge kpi-good" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                      Lift ✓
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: TRANSIT CONTROLS, NEARBY BUS & MRT (35%) */}
        <aside className="stage-side-column">
          {/* Quick Journey Planner Card */}
          <div className="dashboard-card side-panel-card">
            <div className="side-card-header">
              <div className="card-eyebrow">ACCESSIBLE TRIP PLANNER</div>
              <h3>Where to go?</h3>
            </div>
            <div className="side-planner-form">
              <div className="planner-field">
                <label>DEPARTURE POINT</label>
                <div className="planner-input-box">
                  <MapPinIcon size={16} className="text-muted" />
                  <input
                    className="planner-input"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    placeholder="Current Location"
                  />
                </div>
              </div>
              <div className="planner-field">
                <label>DESTINATION</label>
                <div className="planner-input-box">
                  <SearchIcon size={16} className="text-primary" />
                  <input
                    className="planner-input"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="Enter destination e.g. DPULZE"
                  />
                </div>
              </div>
              <button
                className="primary-button large"
                style={{ marginTop: '6px' }}
                onClick={runSearch}
                disabled={!to.trim()}
              >
                Find Bus & MRT Route
              </button>
            </div>
          </div>

          {/* Live Nearby Bus Stops & MRT Stations Feed with Transport Selector */}
          <div className="dashboard-card side-panel-card">
            <div className="side-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="card-eyebrow">AROUND YOU</div>
                <h3>Nearby Transport</h3>
              </div>
              <button className="text-button small" onClick={() => onNavigate('nearby')}>
                View All →
              </button>
            </div>

            {/* Transport Selector: [ All ] [ Bus ] [ MRT ] */}
            <div className="transport-filter-bar">
              <button
                className={`transport-chip ${transportFilter === 'all' ? 'active' : ''}`}
                onClick={() => setTransportFilter('all')}
              >
                All Transport
              </button>
              <button
                className={`transport-chip ${transportFilter === 'bus' ? 'active' : ''}`}
                onClick={() => setTransportFilter('bus')}
              >
                <BusIcon size={14} /> Bus
              </button>
              <button
                className={`transport-chip ${transportFilter === 'mrt' ? 'active' : ''}`}
                onClick={() => setTransportFilter('mrt')}
              >
                <MrtIcon size={14} /> MRT
              </button>
            </div>

            <div className="side-stops-list" style={{ marginTop: '12px' }}>
              {nearbyTransportItems.map((item) => {
                if (item.transportType === 'mrt') {
                  return (
                    <div
                      key={item.id}
                      className="side-stop-item"
                      onClick={() => selectMrtStation(item)}
                      title="Click to view MRT station & lift telemetry"
                      style={{ borderLeft: '4px solid #16a34a' }}
                    >
                      <div className="side-stop-icon" style={{ background: '#dcfce7', color: '#15803d' }}>
                        <MrtIcon size={20} />
                      </div>
                      <div className="side-stop-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong>{item.name}</strong>
                        </div>
                        <div className="side-stop-meta">
                          <span>{item.distance} · Next MRT: <strong>{item.nextArrival}m</strong></span>
                          <span
                            className={item.liftWorking ? 'lift-tag-ok' : 'lift-tag-no'}
                            style={{ fontSize: '0.72rem', fontWeight: 800 }}
                          >
                            {item.liftWorking ? '✓ Lift OK' : '✕ Lift Down'}
                          </span>
                        </div>
                      </div>
                      <div className="side-stop-action">
                        <ChevronRightIcon size={16} />
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={item.id}
                    className="side-stop-item"
                    onClick={() => selectStop(item)}
                    title="Click to view bus departure times"
                  >
                    <div className="side-stop-icon">
                      <StopIcon size={20} />
                    </div>
                    <div className="side-stop-info">
                      <strong>{item.name}</strong>
                      <div className="side-stop-meta">
                        <span>{item.distance} · {item.walking}</span>
                        <span className="stop-crowd-tag">Crowd: {item.crowd}</span>
                      </div>
                    </div>
                    <div className="side-stop-action">
                      <ChevronRightIcon size={16} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Accessibility Standards Card */}
          <div className="dashboard-card side-panel-card access-highlight-card">
            <div className="access-highlight-header">
              <div className="access-icon-circle">
                <WheelchairIcon size={22} />
              </div>
              <div>
                <strong>Accessible Transit Commitment</strong>
                <p className="small muted">
                  SampAI monitors physical bus ramps, low-floor fleets, and MRT station lifts for 100% step-free travel.
                </p>
              </div>
            </div>
            <div className="access-mini-pills">
              <span>✓ Bus Motorized Ramp Verification</span>
              <span>✓ MRT Concourse & Platform Lift Status</span>
              <span>✓ Driver & Station Staff Boarding Escort</span>
            </div>
          </div>
        </aside>
      </div>

      {/* 3. MODAL DIALOGS (Bus, MRT, Multi-Modal Routes, Assistance) */}

      {/* MRT Station Details Modal */}
      {sheet === 'mrt-details' && selectedMrtStation && (
        <BottomSheet title={`${selectedMrtStation.name} Details`} onClose={closeSheet}>
          <div className="bus-hero" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <div className="big-bus" style={{ color: '#15803d' }}>
              <MrtIcon size={32} />
            </div>
            <div>
              <strong>Next MRT Arriving in {selectedMrtStation.nextArrival} min</strong>
              <span>
                Following train in {selectedMrtStation.followingArrival} min · {selectedMrtStation.status}
              </span>
            </div>
          </div>

          {/* Lift Status Alert if unavailable */}
          {!selectedMrtStation.liftWorking ? (
            <div className="disruption-banner" style={{ background: '#fef2f2', borderColor: '#fca5a5' }}>
              <span style={{ fontSize: '1.6rem' }}>⚠️</span>
              <div>
                <strong style={{ color: '#dc2626' }}>Accessibility Alert: Station Lift Unavailable</strong>
                <p style={{ margin: '4px 0 6px', color: '#1f2937' }}>
                  The concourse-to-platform lift at {selectedMrtStation.name} is currently out of service. This station may not provide a suitable step-free journey.
                </p>
                <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '10px', marginTop: '6px', border: '1px solid #fed7aa' }}>
                  <small style={{ fontWeight: 800, color: '#9a3412', display: 'block' }}>RECOMMENDED STEP-FREE ALTERNATIVE:</small>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>Cyberjaya Utara MRT (1.2 km away · ✓ Lift working)</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="arrival-highlight" style={{ background: '#ecfdf5', borderColor: '#a7f3d0' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#065f46', fontWeight: 800 }}>
                <LiftIcon size={20} /> Station Accessibility:
              </span>
              <strong style={{ color: '#047857' }}>✓ Station Lift Fully Operational</strong>
            </div>
          )}

          <div className="info-grid boxed" style={{ marginTop: '14px' }}>
            <span>MRT Line</span>
            <strong>{selectedMrtStation.line}</strong>
            <span>Walking from origin</span>
            <strong>{selectedMrtStation.distance} ({selectedMrtStation.walking})</strong>
            <span>Station Concourse Crowd</span>
            <strong>{crowdBadge(selectedMrtStation.stationCrowd)}</strong>
            <span>Inside MRT Train Crowd</span>
            <strong>{crowdBadge(selectedMrtStation.mrtCrowd)}</strong>
            <span>Lift Status</span>
            <strong style={{ color: selectedMrtStation.liftWorking ? '#059669' : '#dc2626' }}>
              {selectedMrtStation.liftWorking ? '✓ Lift Working' : '✕ Lift Unavailable'}
            </strong>
            <span>Step-Free Access</span>
            <strong style={{ color: selectedMrtStation.liftWorking ? '#059669' : '#dc2626' }}>
              {selectedMrtStation.liftWorking ? '✓ Suitable for Wheelchairs' : '✕ Not Step-Free'}
            </strong>
          </div>

          <button
            className="primary-button large"
            onClick={() => openMrtAssistance(selectedMrtStation)}
          >
            <WheelchairIcon size={18} /> Request MRT Boarding Assistance
          </button>
          <button className="text-button" onClick={closeSheet} style={{ marginTop: '10px' }}>
            Close
          </button>
        </BottomSheet>
      )}

      {/* Journey Search Modal */}
      {sheet === 'search' && (
        <BottomSheet title="Plan Accessible Journey (Bus & MRT)" onClose={closeSheet}>
          <label className="field-label">Departure Point</label>
          <input className="text-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label className="field-label">Destination</label>
          <input
            className="text-input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Enter destination e.g. DPULZE"
          />
          <button className="primary-button large" onClick={runSearch} disabled={!to.trim()}>
            Find Accessible Routes
          </button>
          <button className="text-button" onClick={closeSheet} style={{ marginTop: '10px' }}>
            <ArrowLeftIcon size={16} /> Cancel
          </button>
        </BottomSheet>
      )}

      {/* Boarding Stop / Station Selector Modal */}
      {sheet === 'stops' && (
        <BottomSheet title="Choose Boarding Stop or MRT Station" onClose={closeSheet}>
          <p className="sheet-intro">
            Departing from <strong>{from}</strong>. Select your preferred boarding location:
          </p>

          <div className="transport-filter-bar" style={{ marginBottom: '14px' }}>
            <button
              className={`transport-chip ${transportFilter === 'all' ? 'active' : ''}`}
              onClick={() => setTransportFilter('all')}
            >
              All Transport
            </button>
            <button
              className={`transport-chip ${transportFilter === 'bus' ? 'active' : ''}`}
              onClick={() => setTransportFilter('bus')}
            >
              <BusIcon size={14} /> Bus Stops
            </button>
            <button
              className={`transport-chip ${transportFilter === 'mrt' ? 'active' : ''}`}
              onClick={() => setTransportFilter('mrt')}
            >
              <MrtIcon size={14} /> MRT Stations
            </button>
          </div>

          <div className="stack-list">
            {(transportFilter === 'all' || transportFilter === 'bus') &&
              mockBusStops.map((stop) => (
                <button key={stop.id} className="stop-option" onClick={() => selectStop(stop)}>
                  <span className="stop-icon">
                    <StopIcon size={22} />
                  </span>
                  <span>
                    <strong>{stop.name} (Bus)</strong>
                    <small>{stop.distance} · {stop.walking} · ✓ Accessible Shelter</small>
                  </span>
                  <span className="card-arrow" aria-hidden="true">
                    <ChevronRightIcon size={18} />
                  </span>
                </button>
              ))}

            {(transportFilter === 'all' || transportFilter === 'mrt') &&
              mockMrtStations.map((station) => (
                <button
                  key={station.id}
                  className="stop-option"
                  onClick={() => {
                    setSelectedStop({ name: station.name, id: station.id, isMrt: true })
                    setSheet('forecast')
                  }}
                  style={{ borderLeft: '4px solid #16a34a' }}
                >
                  <span className="stop-icon" style={{ background: '#dcfce7', color: '#15803d' }}>
                    <MrtIcon size={22} />
                  </span>
                  <span>
                    <strong>{station.name} (MRT)</strong>
                    <small>
                      {station.distance} · {station.walking} · {station.liftWorking ? '✓ Lift OK' : '✕ Lift Down'}
                    </small>
                  </span>
                  <span className="card-arrow" aria-hidden="true">
                    <ChevronRightIcon size={18} />
                  </span>
                </button>
              ))}
          </div>
          <button className="text-button" onClick={() => setSheet('search')} style={{ marginTop: '14px' }}>
            <ArrowLeftIcon size={16} /> Back to Search
          </button>
        </BottomSheet>
      )}

      {/* Forecast Modal */}
      {sheet === 'forecast' && selectedStop && (
        <BottomSheet title="Check Crowd & Traffic Forecast" onClose={closeSheet} wide>
          <div className="arrival-highlight">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {selectedStop.isMrt ? <MrtIcon size={18} /> : <StopIcon size={18} />} Boarding at: <strong>{selectedStop.name}</strong>
            </span>
            <span
              style={{
                background: 'var(--primary)',
                color: '#ffffff',
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '0.86rem',
                fontWeight: 800,
              }}
            >
              {selectedStop.isMrt ? 'Next MRT · 3 min' : `Bus T504 · ${selectedTime.wait} min`}
            </span>
          </div>
          <p className="sheet-intro">Select your target travel time slot to review predicted crowd and delay levels:</p>
          <TimeSelector items={mockTrafficForecast} selectedId={selectedTime.id} onSelect={setSelectedTime} />
          <section className="forecast-detail">
            <div className="section-title-row">
              <div>
                <div className="eyebrow">Forecast Summary</div>
                <h3>{selectedTime.label} Departure</h3>
              </div>
              <span
                style={{
                  background: 'var(--light-blue)',
                  color: 'var(--primary)',
                  padding: '4px 10px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '0.84rem',
                }}
              >
                Estimated Journey: {selectedTime.journey} min
              </span>
            </div>
            <div className="info-grid">
              <span>{selectedStop.isMrt ? 'Station crowd' : 'Bus stop crowd'}</span>
              <strong>{crowdBadge(selectedTime.stopCrowd)}</strong>
              <span>Expected transit crowd</span>
              <strong>{crowdBadge(selectedTime.busCrowd)}</strong>
              <span>Next arrival</span>
              <strong style={{ color: 'var(--primary)' }}>{selectedTime.wait} min</strong>
              <span>Corridor traffic level</span>
              <strong>{crowdBadge(selectedTime.traffic.includes('Heavy') ? 'Crowded' : selectedTime.traffic)}</strong>
              <span>Destination crowd</span>
              <strong>{crowdBadge(selectedTime.destinationCrowd)}</strong>
            </div>
          </section>
          <button className="primary-button large" onClick={useTime}>
            Confirm This Travel Slot
          </button>
          <button className="text-button" onClick={() => setSheet('stops')} style={{ marginTop: '10px' }}>
            <ArrowLeftIcon size={16} /> Back to Stops
          </button>
        </BottomSheet>
      )}

      {/* Multi-Modal & Bus Route Options Modal */}
      {sheet === 'route' && (
        <BottomSheet title="Recommended Accessible Routes" onClose={closeSheet} wide>
          <div className="stack-list spacious">
            {/* Option 1: Multi-Modal (Bus + MRT) */}
            <article className="route-result-card" style={{ border: '2px solid var(--brand-blue)', position: 'relative' }}>
              <div className="recommended-badge" style={{ marginBottom: '12px' }}>
                ⭐ Recommended Step-Free Route (Bus + MRT)
              </div>
              <div className="route-line">
                <span>
                  <StopIcon size={20} />
                </span>
                <div>
                  <strong>{from}</strong>
                  <small>Board Feeder Bus T504 (4 min wait)</small>
                </div>
              </div>
              <div className="route-connector" />
              <div className="route-line">
                <span style={{ background: '#dcfce7', color: '#15803d' }}>
                  <MrtIcon size={20} />
                </span>
                <div>
                  <strong>Transfer at Cyberjaya City Centre MRT</strong>
                  <small>Seamless step-free transfer · ✓ Lift Working (14 min on Putrajaya Line)</small>
                </div>
              </div>
              <div className="route-connector" />
              <div className="route-line">
                <span>
                  <MapPinIcon size={20} />
                </span>
                <div>
                  <strong>{to}</strong>
                  <small>Total journey: 26 min · 160 m walking</small>
                </div>
              </div>

              <div className="mini-checks route-checks">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckIcon size={14} /> Bus: Wheelchair accessible & ramp working
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckIcon size={14} /> MRT: Station concourse & platform lift working
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckIcon size={14} /> Guaranteed priority seating on both lines
                </span>
              </div>

              <button
                className="primary-button large"
                onClick={() => chooseRoute(mockRoutes[0])}
              >
                Use Bus + MRT Route (26 min)
              </button>
            </article>

            {/* Option 2: Direct Bus Only */}
            <article className="route-result-card">
              <h3>Direct Bus Only (T504)</h3>
              <p className="small muted">Single vehicle trip without transfer. Longer road duration due to traffic.</p>
              <div className="info-grid compact boxed">
                <span>Total journey</span>
                <strong>32 min</strong>
                <span>Walking</span>
                <strong>120 m</strong>
                <span>Bus Ramp</span>
                <strong style={{ color: '#059669' }}>✓ Working</strong>
                <span>Road Traffic</span>
                <strong>● Heavy</strong>
              </div>
              <button
                className="secondary-button"
                style={{ width: '100%', marginTop: '10px' }}
                onClick={() => chooseRoute(mockRoutes[1])}
              >
                Use Direct Bus (32 min)
              </button>
            </article>
          </div>

          <button className="text-button" onClick={() => setSheet('forecast')} style={{ marginTop: '14px' }}>
            <ArrowLeftIcon size={16} /> Back to Forecast
          </button>
        </BottomSheet>
      )}

      {/* Bus Accessibility Details Modal */}
      {sheet === 'bus-details' && selectedBus && (
        <BottomSheet title={`Bus ${selectedBus.id} Fleet Details`} onClose={closeSheet}>
          <div className="bus-hero">
            <div className="big-bus">
              <BusIcon size={32} />
            </div>
            <div>
              <strong>Arriving in {selectedBus.eta} min</strong>
              <span>{selectedBus.stopsAway} stops away · {selectedBus.status}</span>
            </div>
          </div>
          <h3>Bus Accessibility Checklist</h3>
          <AccessibilityList bus={selectedBus} />
          <div className="crowd-row">
            <span style={{ fontWeight: 650, color: 'var(--ink-secondary)' }}>Current crowd occupancy</span>
            <strong>{crowdBadge(selectedBus.crowdLevel)}</strong>
          </div>
          <button
            className="primary-button large"
            onClick={() => {
              setAssistanceTarget({ type: 'bus', item: selectedBus })
              setSheet('assistance')
            }}
          >
            <WheelchairIcon size={18} /> Request Boarding Assistance
          </button>
          <button className="text-button" onClick={closeSheet} style={{ marginTop: '10px' }}>
            Close
          </button>
        </BottomSheet>
      )}

      {/* Boarding Assistance Modal (Unified Bus & MRT) */}
      {sheet === 'assistance' && (
        <BottomSheet
          title={
            assistanceTarget?.type === 'mrt'
              ? 'Request MRT Boarding Assistance'
              : 'Request Bus Boarding Assistance'
          }
          onClose={closeSheet}
        >
          {!assistanceSent ? (
            <>
              <div className="info-grid compact boxed">
                <span>Transport Mode</span>
                <strong style={{ color: 'var(--primary)' }}>
                  {assistanceTarget?.type === 'mrt' ? '🚇 MRT (Putrajaya Line)' : `🚌 Bus ${assistanceTarget?.item?.id || 'T504'}`}
                </strong>
                <span>Boarding Location</span>
                <strong>
                  {assistanceTarget?.type === 'mrt'
                    ? assistanceTarget?.item?.name || 'Cyberjaya City Centre MRT'
                    : selectedStop?.name || 'MMU Cyberjaya Bus Stop'}
                </strong>
              </div>

              <h3 style={{ marginTop: '8px' }}>
                {assistanceTarget?.type === 'mrt'
                  ? 'What MRT assistance do you require?'
                  : 'What bus assistance do you require?'}
              </h3>

              <div className="checkbox-list">
                {(assistanceTarget?.type === 'mrt'
                  ? [
                      'Wheelchair boarding assistance',
                      'Help reaching the platform',
                      'Extra boarding time',
                      'Mobility assistance',
                      'Station lift escort',
                      'Other',
                    ]
                  : [
                      'Wheelchair ramp',
                      'Help boarding the bus',
                      'Extra boarding time',
                      'Priority seat',
                      'Mobility assistance',
                      'Other',
                    ]
                ).map((item) => (
                  <label key={item}>
                    <input type="checkbox" checked={assistance.includes(item)} onChange={() => toggleAssistance(item)} />
                    <span>{item}</span>
                  </label>
                ))}
              </div>

              <label className="field-label">Additional notes for driver / station staff</label>
              <textarea
                className="text-area"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="E.g. Waiting near concourse fare gates in motorized wheelchair..."
              />

              <button className="primary-button large" onClick={() => setAssistanceSent(true)}>
                {assistanceTarget?.type === 'mrt'
                  ? 'Dispatch Assistance to Station Staff'
                  : 'Dispatch Assistance Request to Driver'}
              </button>

              <button className="text-button" onClick={closeSheet} style={{ marginTop: '10px' }}>
                <ArrowLeftIcon size={16} /> Cancel
              </button>
            </>
          ) : (
            <div className="success-state">
              <div className="success-icon">
                <CheckIcon size={36} />
              </div>
              <h2>Assistance Request Dispatched</h2>
              <p>
                {assistanceTarget?.type === 'mrt'
                  ? `Station staff and operations at ${assistanceTarget?.item?.name || 'Cyberjaya City Centre MRT'} have been alerted to provide platform and boarding escort.`
                  : `The bus driver and transit operations have been notified. Ramp deployment is queued for your arrival.`}
              </p>
              <button className="primary-button large" onClick={closeSheet}>
                Done
              </button>
            </div>
          )}
        </BottomSheet>
      )}

      {/* Disruption Alternatives Modal */}
      {showDisruption && (
        <BottomSheet title="Transit Service Disruption Alert" onClose={() => setShowDisruption(false)} wide>
          <div className="disruption-banner">
            <span style={{ fontSize: '1.8rem' }}>⚠️</span>
            <div>
              <strong>Bus {selectedRoute?.busId || 'T504'} Service Disruption</strong>
              <p>Service interruption reported on feeder line. Select an accessible alternative bus or MRT route below:</p>
            </div>
          </div>
          <div className="alternative-list">
            {mockAlternatives.map((option) => (
              <AlternativeBusCard key={option.id} option={option} onChoose={switchAlternative} />
            ))}
          </div>
          <button
            className="secondary-button large"
            onClick={() => {
              setSelectedBus(nextBus)
              setShowDisruption(false)
              setAssistanceTarget({ type: 'bus', item: nextBus })
              setSheet('assistance')
            }}
          >
            <WheelchairIcon size={18} /> Request Dedicated Assistance
          </button>
          <button className="text-button" onClick={() => setShowDisruption(false)} style={{ marginTop: '10px' }}>
            Dismiss
          </button>
        </BottomSheet>
      )}
    </div>
  )
}
