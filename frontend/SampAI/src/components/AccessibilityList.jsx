import { CheckIcon, XIcon } from './Icons.jsx'

const labels = {
  wheelchairAccessible: 'Wheelchair accessible',
  lowFloorBus: 'Low-floor bus',
  rampAvailable: 'Ramp available',
  rampWorking: 'Ramp working',
  prioritySeats: 'Priority seating available',
  wheelchairSpace: 'Wheelchair space available',
}

export default function AccessibilityList({ bus }) {
  return (
    <div className="accessibility-list">
      {Object.entries(labels).map(([key, label]) => {
        const available = Boolean(bus[key])
        return (
          <div key={key} className={available ? 'access-ok' : 'access-no'}>
            <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center' }}>
              {available ? <CheckIcon size={16} /> : <XIcon size={16} />}
            </span>
            <span>
              {available
                ? label
                : label
                    .replace('available', 'unavailable')
                    .replace('working', 'not working')
                    .replace('accessible', 'not accessible')}
            </span>
          </div>
        )
      })}
    </div>
  )
}
