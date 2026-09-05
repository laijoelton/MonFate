import { MapPinIcon } from './Icons.jsx'

export default function AlertCard({ alert, onClick }) {
  return (
    <button className={`alert-card ${alert.urgent ? 'urgent' : ''}`} onClick={() => onClick?.(alert)}>
      <div className="alert-icon" aria-hidden="true">
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '38px',
          height: '38px',
          borderRadius: '12px',
          background: alert.urgent ? 'var(--danger-soft)' : 'var(--light-blue)',
          fontSize: '1.25rem'
        }}>
          {alert.icon}
        </span>
      </div>
      <div>
        <div className="alert-heading">
          <strong>{alert.type}</strong>
          <span style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--line)',
            padding: '2px 8px',
            borderRadius: '999px',
            fontSize: '0.76rem'
          }}>
            {alert.time}
          </span>
        </div>
        <div className="muted small" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
          <MapPinIcon size={14} />
          <span>{alert.location}</span>
        </div>
        <p>{alert.description}</p>
      </div>
    </button>
  )
}
