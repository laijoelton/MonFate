import { useMemo, useState } from 'react'
import TimeSelector from '../components/TimeSelector.jsx'
import {
  ArrowLeftIcon,
  BusIcon,
  MrtIcon,
  PlanIcon,
  ClockIcon,
  LiftIcon,
  CheckIcon,
} from '../components/Icons.jsx'
import {
  mockTrafficForecast,
  mockMrtForecast,
  mockMrtStations,
} from '../data/mockData.js'

const levelClass = (level) => {
  const value = level.toLowerCase()
  if (value.includes('very')) return 'level-very-high'
  if (value.includes('heavy') || value.includes('crowded')) return 'level-high'
  if (value.includes('medium')) return 'level-medium'
  return 'level-low'
}

export default function PlanPage({ onBack }) {
  const [mode, setMode] = useState('bus') // 'bus' | 'mrt'
  const [busRoute, setBusRoute] = useState('T504')
  const [mrtStationId, setMrtStationId] = useState('mrt-cyberjaya-city')

  // Bus forecast selected
  const [selectedBusTime, setSelectedBusTime] = useState(mockTrafficForecast[3])
  const busChartItems = useMemo(() => mockTrafficForecast.slice(0, 20), [])

  // MRT forecast selected
  const [selectedMrtTime, setSelectedMrtTime] = useState(mockMrtForecast[2])
  const mrtChartItems = useMemo(() => mockMrtForecast.slice(0, 20), [])

  const selectedMrtStation = useMemo(
    () => mockMrtStations.find((s) => s.id === mrtStationId) || mockMrtStations[0],
    [mrtStationId],
  )

  const activeTime = mode === 'bus' ? selectedBusTime : selectedMrtTime
  const activeItems = mode === 'bus' ? busChartItems : mrtChartItems

  return (
    <div className="dashboard-view">
      <div className="view-sub-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeftIcon size={16} /> Back to Dashboard
        </button>
        <span className="muted small">15-minute predictive crowd & occupancy analytics for Bus and MRT</span>
      </div>

      {/* TOP CONTROLS & FILTER BAR WITH TRANSPORT MODE SELECTOR */}
      <section className="dashboard-card plan-filter-strip">
        <div className="filter-group-desktop" style={{ alignItems: 'flex-end' }}>
          {/* Mode Selector: [ Bus ] [ MRT ] */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>
              TRANSPORT MODE
            </span>
            <div className="transport-filter-bar" style={{ margin: 0 }}>
              <button
                className={`transport-chip ${mode === 'bus' ? 'active' : ''}`}
                onClick={() => setMode('bus')}
              >
                <BusIcon size={14} /> Feeder Bus
              </button>
              <button
                className={`transport-chip ${mode === 'mrt' ? 'active' : ''}`}
                onClick={() => setMode('mrt')}
              >
                <MrtIcon size={14} /> MRT Putrajaya Line
              </button>
            </div>
          </div>

          {/* Dynamic Selector based on mode */}
          {mode === 'bus' ? (
            <label>
              <span>SELECT BUS LINE</span>
              <select className="desktop-select" value={busRoute} onChange={(e) => setBusRoute(e.target.value)}>
                <option value="T504">T504 (Cyberjaya Loop)</option>
                <option value="T507">T507 (Terminal Shuttle)</option>
                <option value="T509">T509 (Persiaran Link)</option>
                <option value="T510">T510 (Express Feeder)</option>
              </select>
            </label>
          ) : (
            <label>
              <span>SELECT MRT STATION</span>
              <select
                className="desktop-select"
                value={mrtStationId}
                onChange={(e) => setMrtStationId(e.target.value)}
              >
                {mockMrtStations.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.line})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            <span>SCHEDULE DATE</span>
            <select className="desktop-select">
              <option>Today (Live Telemetry)</option>
              <option>Tomorrow (Historical Prediction)</option>
            </select>
          </label>
        </div>

        {/* Live Filter KPIs */}
        <div className="filter-summary-kpis">
          <div className="filter-kpi-item">
            <small>Active Slot</small>
            <strong>{activeTime.label}</strong>
          </div>
          <div className="filter-kpi-item">
            <small>Avg Wait</small>
            <strong style={{ color: 'var(--brand-blue)' }}>{activeTime.wait} min</strong>
          </div>
          <div className="filter-kpi-item">
            <small>{mode === 'bus' ? 'Corridor Crowd' : 'MRT Train Crowd'}</small>
            <strong>{mode === 'bus' ? activeTime.busCrowd : activeTime.mrtCrowd}</strong>
          </div>
        </div>
      </section>

      {/* FULL-WIDTH CROWD HISTOGRAM (SHARED TIMELINE) */}
      <section className="dashboard-card" style={{ marginTop: '16px' }}>
        <div className="section-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div className="card-eyebrow">
              {mode === 'bus' ? 'BUS OCCUPANCY TIMELINE' : 'MRT STATION & TRAIN OCCUPANCY TIMELINE'}
            </div>
            <h2>
              {mode === 'bus'
                ? `Predicted Feeder Bus Crowd · Line ${busRoute}`
                : `Predicted Crowd at ${selectedMrtStation.name}`}
            </h2>
          </div>

          <div className="legend">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
              Low (Quiet)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />
              Medium
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f97316' }} />
              Crowded
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
              Very Crowded
            </span>
          </div>
        </div>

        {/* Dynamic Histogram Bars */}
        <div className="forecast-bars desktop-chart-bars" aria-label="Crowd forecast chart">
          {mode === 'bus'
            ? busChartItems.map((item) => {
                const height =
                  item.busCrowd === 'Low' ? 32 : item.busCrowd === 'Medium' ? 56 : item.busCrowd === 'Crowded' ? 82 : 98
                const isSelected = selectedBusTime.id === item.id
                return (
                  <button
                    key={item.id}
                    className={isSelected ? 'bar-selected' : ''}
                    onClick={() => setSelectedBusTime(item)}
                    title={`${item.label}: Bus Crowd ${item.busCrowd}, Traffic ${item.traffic}`}
                    aria-pressed={isSelected}
                  >
                    <span className={`forecast-bar ${levelClass(item.busCrowd)}`} style={{ height: `${height}%` }} />
                    <small>{item.shortLabel}</small>
                  </button>
                )
              })
            : mrtChartItems.map((item) => {
                const height =
                  item.mrtCrowd === 'Low' ? 32 : item.mrtCrowd === 'Medium' ? 56 : item.mrtCrowd === 'Crowded' ? 82 : 98
                const isSelected = selectedMrtTime.id === item.id
                return (
                  <button
                    key={item.id}
                    className={isSelected ? 'bar-selected' : ''}
                    onClick={() => setSelectedMrtTime(item)}
                    title={`${item.label}: Station ${item.stationCrowd}, Train ${item.mrtCrowd}`}
                    aria-pressed={isSelected}
                  >
                    <span className={`forecast-bar ${levelClass(item.mrtCrowd)}`} style={{ height: `${height}%` }} />
                    <small>{item.shortLabel}</small>
                  </button>
                )
              })}
        </div>
      </section>

      {/* 2-COLUMN SPLIT GRID BELOW */}
      <div className="plan-details-grid" style={{ marginTop: '16px' }}>
        {/* FAST TIME CHIP PICKER */}
        <div className="dashboard-card">
          <div className="card-eyebrow">FAST TIME SELECTION</div>
          <h3>Select 15-Min Departure Interval</h3>
          <p className="small muted">
            Select a slot to update expected {mode === 'bus' ? 'bus' : 'MRT station & train'} congestion:
          </p>
          <div style={{ marginTop: '12px' }}>
            <TimeSelector
              items={mode === 'bus' ? mockTrafficForecast : mockMrtForecast}
              selectedId={activeTime.id}
              onSelect={(val) => {
                if (mode === 'bus') setSelectedBusTime(val)
                else setSelectedMrtTime(val)
              }}
            />
          </div>
        </div>

        {/* SELECTED TIME ANALYTICS CARD (BUS OR MRT) */}
        <div className="dashboard-card">
          {mode === 'bus' ? (
            /* BUS ANALYTICS */
            <>
              <div className="section-title-row">
                <div>
                  <div className="card-eyebrow">SLOT BUS TELEMETRY</div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BusIcon size={20} className="text-primary" />
                    <span>{selectedBusTime.label} Departure (Bus {busRoute})</span>
                  </h3>
                </div>
                <span className="kpi-badge kpi-info">Feeder Bus</span>
              </div>

              <div className="info-grid boxed" style={{ marginTop: '10px' }}>
                <span>Starting bus stop crowd</span>
                <strong>● {selectedBusTime.stopCrowd}</strong>
                <span>Expected bus crowd</span>
                <strong style={{ color: selectedBusTime.busCrowd === 'Crowded' ? '#b54708' : 'var(--ink)' }}>
                  ● {selectedBusTime.busCrowd}
                </strong>
                <span>Corridor road traffic</span>
                <strong>● {selectedBusTime.traffic}</strong>
                <span>Expected waiting time</span>
                <strong style={{ color: 'var(--brand-blue)', fontSize: '1.05rem' }}>
                  {selectedBusTime.wait} min
                </strong>
                <span>Expected journey time</span>
                <strong>{selectedBusTime.journey} min</strong>
                <span>Destination stop crowd</span>
                <strong>● {selectedBusTime.destinationCrowd}</strong>
              </div>
            </>
          ) : (
            /* MRT ANALYTICS */
            <>
              <div className="section-title-row">
                <div>
                  <div className="card-eyebrow">SLOT MRT TELEMETRY</div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MrtIcon size={20} style={{ color: '#15803d' }} />
                    <span>{selectedMrtTime.label} (Putrajaya Line)</span>
                  </h3>
                </div>
                <span className="kpi-badge kpi-good">MRT Station</span>
              </div>

              <div className="info-grid boxed" style={{ marginTop: '10px' }}>
                <span>MRT Station Concourse Crowd</span>
                <strong style={{ color: selectedMrtTime.stationCrowd === 'Crowded' ? '#b54708' : 'var(--ink)' }}>
                  ● {selectedMrtTime.stationCrowd}
                </strong>
                <span>Inside MRT Train Crowd</span>
                <strong style={{ color: selectedMrtTime.mrtCrowd.includes('Crowd') ? '#dc2626' : 'var(--ink)' }}>
                  ● {selectedMrtTime.mrtCrowd}
                </strong>
                <span>Next MRT Arrival</span>
                <strong style={{ color: 'var(--brand-blue)', fontSize: '1.05rem' }}>
                  {selectedMrtTime.wait} min
                </strong>
                <span>Station Lift Status</span>
                <strong style={{ color: selectedMrtStation.liftWorking ? '#059669' : '#dc2626' }}>
                  {selectedMrtStation.liftWorking ? '✓ Lift Working' : '✕ Lift Unavailable'}
                </strong>
                <span>Expected Platform Waiting Time</span>
                <strong>{selectedMrtTime.wait} min</strong>
                <span>Expected MRT Journey Duration</span>
                <strong>{selectedMrtTime.journey} min</strong>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
