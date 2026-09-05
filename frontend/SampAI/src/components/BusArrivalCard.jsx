import { BusIcon, ChevronRightIcon } from './Icons.jsx'

export default function BusArrivalCard({ bus, onClick }) {
  return (
    <button className="bus-card" onClick={() => onClick(bus)}>
      <div className="bus-card-icon" aria-hidden="true">
        <BusIcon size={26} />
      </div>
      <div className="bus-card-main">
        <div className="bus-card-row">
          <strong>Bus {bus.id}</strong>
          <span className="card-arrow" aria-hidden="true">
            <ChevronRightIcon size={18} />
          </span>
        </div>
        <div>
          Arriving in <strong style={{ color: 'var(--primary)' }}>{bus.eta} min</strong>
          <span className="muted small" style={{ marginLeft: '8px' }}>({bus.stopsAway} stops away)</span>
        </div>
        <span className={`status-pill ${bus.statusTone}`}>{bus.status}</span>
      </div>
    </button>
  )
}
