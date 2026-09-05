import { BusIcon, MrtIcon, CheckIcon } from './Icons.jsx'

export default function AlternativeBusCard({ option, onChoose }) {
  const isMultiModal = option.mode === 'bus-mrt'
  const isMrt = option.mode === 'mrt'

  return (
    <article className={`alternative-card ${option.recommended ? 'recommended' : ''}`}>
      {option.recommended && (
        <div className="recommended-badge">
          ★ Recommended Step-Free Choice
        </div>
      )}
      <h3>{option.title}</h3>
      <div className="alternative-bus" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isMultiModal ? (
          <>
            <BusIcon size={20} className="text-primary" />
            <span>+</span>
            <MrtIcon size={20} style={{ color: '#15803d' }} />
            <span>Bus {option.busId} + MRT Putrajaya</span>
          </>
        ) : isMrt ? (
          <>
            <MrtIcon size={22} style={{ color: '#15803d' }} />
            <span>MRT Putrajaya Line</span>
          </>
        ) : (
          <>
            <BusIcon size={22} className="text-primary" />
            <span>Bus {option.busId}</span>
          </>
        )}
      </div>

      <div className="info-grid compact">
        <span>From</span><strong>{option.stop}</strong>
        <span>Wait time</span><strong>{option.wait} min</strong>
        <span>Walking</span><strong>{option.walking}</strong>
        <span>Total journey</span><strong>{option.total} min</strong>
        <span>Crowd</span><strong>{option.crowd}</strong>
      </div>

      <div className="mini-checks">
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CheckIcon size={14} /> Step-free wheelchair accessible
        </span>
        {isMultiModal ? (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckIcon size={14} /> Bus ramp verified operational
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckIcon size={14} /> MRT station concourse & platform lift OK
            </span>
          </>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckIcon size={14} /> Bus ramp working & ready
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CheckIcon size={14} /> Priority seating guaranteed
        </span>
      </div>

      <button className="primary-button" style={{ width: '100%', marginTop: '8px' }} onClick={() => onChoose(option)}>
        {option.recommended
          ? isMultiModal
            ? 'Switch to Bus + MRT Route'
            : 'Switch to This Route'
          : `Choose ${option.busId ? `Bus ${option.busId}` : 'Alternative Route'}`}
      </button>
    </article>
  )
}
