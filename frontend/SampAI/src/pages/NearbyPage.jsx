import { useState } from 'react'
import BottomSheet from '../components/BottomSheet.jsx'
import BusArrivalCard from '../components/BusArrivalCard.jsx'
import AccessibilityList from '../components/AccessibilityList.jsx'
import {
  ArrowLeftIcon,
  StopIcon,
  BusIcon,
  MrtIcon,
  LiftIcon,
  ChevronRightIcon,
  CheckIcon,
  WheelchairIcon,
  MapPinIcon,
} from '../components/Icons.jsx'
import { mockBusStops, mockBuses, mockMrtStations } from '../data/mockData.js'

export default function NearbyPage({ onBack }) {
  const [filter, setFilter] = useState('all') // 'all' | 'bus' | 'mrt'
  const [selectedItem, setSelectedItem] = useState({
    type: 'bus',
    data: mockBusStops[0],
  })
  const [selectedBus, setSelectedBus] = useState(null)
  const [assistanceOpen, setAssistanceOpen] = useState(false)
  const [assistanceSent, setAssistanceSent] = useState(false)
  const [assistanceOptions, setAssistanceOptions] = useState([])
  const [message, setMessage] = useState('')

  const buses = selectedItem.type === 'bus'
    ? mockBuses.filter((bus) => bus.stopId === selectedItem.data.id || selectedItem.data.id === 'mmu')
    : []

  const toggleAssistance = (val) => {
    setAssistanceOptions((curr) =>
      curr.includes(val) ? curr.filter((i) => i !== val) : [...curr, val],
    )
  }

  const closeAssistance = () => {
    setAssistanceOpen(false)
    setAssistanceSent(false)
  }

  return (
    <div className="dashboard-view">
      <div className="view-sub-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeftIcon size={16} /> Back to Dashboard
        </button>
        <span className="muted small">Real-time Bus stops and MRT stations around Cyberjaya</span>
      </div>

      <div className="nearby-desktop-grid">
        {/* LEFT COLUMN: TRANSPORT STOPS & STATIONS LIST */}
        <section className="nearby-left-panel">
          <div className="dashboard-card" style={{ height: '100%' }}>
            <div className="side-card-header">
              <div className="card-eyebrow">NEARBY TRANSIT NODES</div>
              <h2>Bus Stops & MRT Stations</h2>
              <p className="small muted">Filter and select a transit stop to inspect live departures and lift/ramp status:</p>
            </div>

            {/* Transport Filter: [ All ] [ Bus ] [ MRT ] */}
            <div className="transport-filter-bar" style={{ marginTop: '8px', marginBottom: '14px' }}>
              <button
                className={`transport-chip ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All Transport
              </button>
              <button
                className={`transport-chip ${filter === 'bus' ? 'active' : ''}`}
                onClick={() => setFilter('bus')}
              >
                <BusIcon size={14} /> Bus Stops ({mockBusStops.length})
              </button>
              <button
                className={`transport-chip ${filter === 'mrt' ? 'active' : ''}`}
                onClick={() => setFilter('mrt')}
              >
                <MrtIcon size={14} /> MRT Stations ({mockMrtStations.length})
              </button>
            </div>

            <div className="stack-list spacious">
              {/* Bus Stops */}
              {(filter === 'all' || filter === 'bus') &&
                mockBusStops.map((stop) => {
                  const isSelected = selectedItem.type === 'bus' && selectedItem.data.id === stop.id
                  return (
                    <button
                      key={stop.id}
                      className={`nearby-stop-card ${isSelected ? 'selected-stop-card' : ''}`}
                      onClick={() => setSelectedItem({ type: 'bus', data: stop })}
                    >
                      <div className="stop-icon" aria-hidden="true">
                        <StopIcon size={22} />
                      </div>
                      <div className="grow">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong>{stop.name}</strong>
                          <span className="kpi-badge kpi-info" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                            Bus
                          </span>
                        </div>
                        <span>{stop.distance} · {stop.walking}</span>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                          <span className="kpi-badge kpi-good">✓ Accessible Stop</span>
                          <span className="kpi-badge kpi-info">Crowd: {stop.crowd}</span>
                        </div>
                      </div>
                      <span className="card-arrow" aria-hidden="true">
                        <ChevronRightIcon size={18} />
                      </span>
                    </button>
                  )
                })}

              {/* MRT Stations */}
              {(filter === 'all' || filter === 'mrt') &&
                mockMrtStations.map((station) => {
                  const isSelected = selectedItem.type === 'mrt' && selectedItem.data.id === station.id
                  return (
                    <button
                      key={station.id}
                      className={`nearby-stop-card ${isSelected ? 'selected-stop-card' : ''}`}
                      onClick={() => setSelectedItem({ type: 'mrt', data: station })}
                      style={{ borderLeft: '4px solid #16a34a' }}
                    >
                      <div className="stop-icon" style={{ background: '#dcfce7', color: '#15803d' }} aria-hidden="true">
                        <MrtIcon size={22} />
                      </div>
                      <div className="grow">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong>{station.name}</strong>
                          <span className="kpi-badge kpi-good" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                            MRT
                          </span>
                        </div>
                        <span>{station.distance} · {station.walking}</span>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                          <span
                            className={station.liftWorking ? 'kpi-badge kpi-good' : 'kpi-badge kpi-danger'}
                          >
                            {station.liftWorking ? '✓ Lift Working' : '✕ Lift Unavailable'}
                          </span>
                          <span className="kpi-badge kpi-info">
                            Next: {station.nextArrival}m
                          </span>
                        </div>
                      </div>
                      <span className="card-arrow" aria-hidden="true">
                        <ChevronRightIcon size={18} />
                      </span>
                    </button>
                  )
                })}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: DYNAMIC DEPARTURES & ACCESSIBILITY INSPECTOR */}
        <section className="nearby-right-panel">
          <div className="dashboard-card" style={{ height: '100%' }}>
            {selectedItem.type === 'bus' ? (
              /* BUS STOP INSPECTOR */
              <>
                <div className="side-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-eyebrow">BUS SHELTER DEPARTURES</div>
                    <h2>{selectedItem.data.name}</h2>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                      <MapPinIcon size={14} className="text-primary" />
                      <span className="small muted">{selectedItem.data.distance} ({selectedItem.data.walking})</span>
                    </div>
                  </div>
                  <span className="kpi-badge kpi-good" style={{ fontSize: '0.8rem' }}>
                    Shelter Verified
                  </span>
                </div>

                <div style={{ marginTop: '16px' }}>
                  <h3 style={{ fontSize: '1rem', color: 'var(--muted)', marginBottom: '12px' }}>
                    Scheduled Feeder Buses:
                  </h3>
                  <div className="stack-list">
                    {(buses.length ? buses : mockBuses.slice(0, 3)).map((bus) => (
                      <BusArrivalCard key={bus.id} bus={bus} onClick={setSelectedBus} />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              /* MRT STATION INSPECTOR */
              <>
                <div className="side-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-eyebrow">MRT STATION TELEMETRY</div>
                    <h2>{selectedItem.data.name}</h2>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                      <MapPinIcon size={14} className="text-primary" />
                      <span className="small muted">{selectedItem.data.line} · {selectedItem.data.distance}</span>
                    </div>
                  </div>
                  <span
                    className={selectedItem.data.liftWorking ? 'kpi-badge kpi-good' : 'kpi-badge kpi-danger'}
                    style={{ fontSize: '0.8rem' }}
                  >
                    {selectedItem.data.liftWorking ? '✓ Step-Free Lift OK' : '✕ Not Step-Free'}
                  </span>
                </div>

                {/* Warning if lift unavailable */}
                {!selectedItem.data.liftWorking && (
                  <div className="disruption-banner" style={{ background: '#fef2f2', borderColor: '#fca5a5', marginTop: '14px' }}>
                    <span>⚠️</span>
                    <div>
                      <strong style={{ color: '#dc2626' }}>Station Lift Temporarily Out of Service</strong>
                      <p style={{ margin: '4px 0', fontSize: '0.88rem' }}>
                        Wheelchair users and passengers requiring elevator access cannot reach the platform at this station.
                      </p>
                      <small style={{ color: '#9a3412', fontWeight: 700 }}>
                        Alternative: Cyberjaya Utara MRT (1.2 km away · Lift fully operational)
                      </small>
                    </div>
                  </div>
                )}

                {/* Train Arrival Timetable Card */}
                <div style={{ marginTop: '16px', background: 'var(--surface-alt)', padding: '16px', borderRadius: '14px', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--muted)' }}>UPCOMING TRAINS</span>
                    <span className="kpi-badge kpi-info">{selectedItem.data.status}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ background: '#ffffff', padding: '12px', borderRadius: '12px', border: '1px solid var(--line)' }}>
                      <small style={{ color: 'var(--muted)', display: 'block' }}>Next Train</small>
                      <strong style={{ fontSize: '1.4rem', color: 'var(--brand-blue)' }}>{selectedItem.data.nextArrival} min</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '2px' }}>Southbound to Putrajaya</div>
                    </div>
                    <div style={{ background: '#ffffff', padding: '12px', borderRadius: '12px', border: '1px solid var(--line)' }}>
                      <small style={{ color: 'var(--muted)', display: 'block' }}>Following Train</small>
                      <strong style={{ fontSize: '1.4rem', color: 'var(--ink)' }}>{selectedItem.data.followingArrival} min</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '2px' }}>Southbound to Putrajaya</div>
                    </div>
                  </div>
                </div>

                {/* Dual Crowd Metrics: Station vs Train */}
                <div className="info-grid boxed" style={{ marginTop: '16px' }}>
                  <span>Station Concourse Crowd</span>
                  <strong>{selectedItem.data.stationCrowd}</strong>
                  <span>Inside MRT Train Crowd</span>
                  <strong style={{ color: selectedItem.data.mrtCrowd.includes('Crowd') ? '#b54708' : 'var(--ink)' }}>
                    {selectedItem.data.mrtCrowd}
                  </strong>
                  <span>Lift Operational Status</span>
                  <strong style={{ color: selectedItem.data.liftWorking ? '#059669' : '#dc2626' }}>
                    {selectedItem.data.liftWorking ? '✓ Lift Working' : '✕ Lift Unavailable'}
                  </strong>
                  <span>Platform Screen Doors</span>
                  <strong>✓ Operational</strong>
                  <span>Staff Boarding Assistance</span>
                  <strong style={{ color: '#059669' }}>Available on Request</strong>
                </div>

                <button
                  className="primary-button large"
                  style={{ marginTop: '18px' }}
                  onClick={() => setAssistanceOpen(true)}
                >
                  <WheelchairIcon size={18} /> Request MRT Boarding Assistance
                </button>
              </>
            )}
          </div>
        </section>
      </div>

      {/* Bus Accessibility Modal */}
      {selectedBus && (
        <BottomSheet title={`Bus ${selectedBus.id} Fleet Details`} onClose={() => setSelectedBus(null)}>
          <div className="bus-hero">
            <div className="big-bus">
              <BusIcon size={32} />
            </div>
            <div>
              <strong>Arriving in {selectedBus.eta} min</strong>
              <span>{selectedBus.stopsAway} stops away · {selectedBus.status}</span>
            </div>
          </div>
          <h3>Accessibility Checklist</h3>
          <AccessibilityList bus={selectedBus} />
          <div className="crowd-row">
            <span>Current Occupancy</span>
            <strong style={{ color: 'var(--primary)' }}>{selectedBus.crowdLevel}</strong>
          </div>
          <button
            className="primary-button large"
            onClick={() => {
              setSelectedBus(null)
              setAssistanceOpen(true)
            }}
          >
            <WheelchairIcon size={18} /> Request Boarding Assistance
          </button>
          <button className="text-button" onClick={() => setSelectedBus(null)} style={{ marginTop: '10px' }}>
            <ArrowLeftIcon size={16} /> Close
          </button>
        </BottomSheet>
      )}

      {/* MRT / Bus Boarding Assistance Modal */}
      {assistanceOpen && (
        <BottomSheet
          title={selectedItem.type === 'mrt' ? 'Request MRT Boarding Assistance' : 'Request Bus Boarding Assistance'}
          onClose={closeAssistance}
        >
          {!assistanceSent ? (
            <>
              <div className="info-grid compact boxed">
                <span>Node</span>
                <strong>{selectedItem.type === 'mrt' ? `🚇 ${selectedItem.data.name}` : `🚌 ${selectedItem.data.name}`}</strong>
                <span>Assistance Channel</span>
                <strong style={{ color: 'var(--brand-blue)' }}>
                  {selectedItem.type === 'mrt' ? 'Station Controller & Platform Marshal' : 'Feeder Bus Driver'}
                </strong>
              </div>

              <h3 style={{ marginTop: '10px' }}>
                {selectedItem.type === 'mrt' ? 'What MRT assistance do you need?' : 'What bus assistance do you need?'}
              </h3>
              <div className="checkbox-list">
                {(selectedItem.type === 'mrt'
                  ? [
                      'Wheelchair boarding assistance',
                      'Help reaching the platform',
                      'Extra boarding time',
                      'Mobility assistance',
                      'Lift escort / fare gate escort',
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
                ).map((opt) => (
                  <label key={opt}>
                    <input
                      type="checkbox"
                      checked={assistanceOptions.includes(opt)}
                      onChange={() => toggleAssistance(opt)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>

              <label className="field-label">Additional notes</label>
              <textarea
                className="text-area"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Optional details regarding your mobility device or arrival gate..."
              />

              <button className="primary-button large" onClick={() => setAssistanceSent(true)}>
                Dispatch Assistance Request
              </button>
              <button className="text-button" onClick={closeAssistance} style={{ marginTop: '10px' }}>
                Cancel
              </button>
            </>
          ) : (
            <div className="success-state">
              <div className="success-icon">
                <CheckIcon size={36} />
              </div>
              <h2>Assistance Request Dispatched</h2>
              <p>
                {selectedItem.type === 'mrt'
                  ? `Station staff at ${selectedItem.data.name} have been notified. An escort will meet you at the platform entrance.`
                  : `Driver on feeder bus route has been notified that ramp deployment is requested at ${selectedItem.data.name}.`}
              </p>
              <button className="primary-button large" onClick={closeAssistance}>
                Done
              </button>
            </div>
          )}
        </BottomSheet>
      )}
    </div>
  )
}
