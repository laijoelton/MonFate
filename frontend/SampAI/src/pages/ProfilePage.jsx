import { useState } from 'react'
import { ArrowLeftIcon, CheckIcon, MapPinIcon, ChevronRightIcon, ShieldCheckIcon } from '../components/Icons.jsx'
import { mockRewards, travelNeeds, savedPlaces } from '../data/mockData.js'

export default function ProfilePage({ onBack }) {
  const [needs, setNeeds] = useState(['Wheelchair access', 'Ramp required', 'Avoid crowded buses'])
  const [notifications, setNotifications] = useState(true)

  const toggle = (need) =>
    setNeeds((current) =>
      current.includes(need) ? current.filter((item) => item !== need) : [...current, need],
    )

  return (
    <div className="dashboard-view">
      <div className="view-sub-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeftIcon size={16} /> Back to Dashboard
        </button>
        <span className="muted small">Passenger profile, mobility requirements, and community rewards</span>
      </div>

      <div className="profile-desktop-grid">
        {/* LEFT COLUMN: IDENTITY & REWARDS (35%) */}
        <div className="profile-left-col">
          {/* Identity Card */}
          <div className="dashboard-card identity-card-desktop">
            <div className="profile-avatar-large">S</div>
            <div className="profile-user-details">
              <h2>SampAI Passenger</h2>
              <span className="kpi-badge kpi-info" style={{ alignSelf: 'flex-start', marginTop: '2px' }}>
                Cyberjaya Verified User
              </span>
              <p className="small muted" style={{ marginTop: '8px' }}>
                Personalize your travel requirements. Bus line recommendations adjust dynamically based on your mobility preferences.
              </p>
            </div>
          </div>

          {/* SampAI Community Points Card */}
          <div className="dashboard-card points-card-desktop" style={{ marginTop: '16px' }}>
            <div className="points-star" aria-hidden="true">★</div>
            <div className="card-eyebrow" style={{ color: '#93c5fd' }}>COMMUNITY REWARDS</div>
            <h2 style={{ color: '#ffffff', fontSize: '1.8rem', margin: '4px 0' }}>{mockRewards.points} Points</h2>
            <p style={{ color: '#cbd5e1', fontSize: '0.86rem' }}>
              {mockRewards.submitted} accessibility reports submitted · {mockRewards.verified} verified
            </p>

            <div className="activity-list" style={{ marginTop: '14px' }}>
              {mockRewards.activities.map((activity) => (
                <div key={activity.id}>
                  <strong style={{ color: '#38bdf8' }}>+{activity.points} pts</strong>
                  <span style={{ color: '#e2e8f0' }}>{activity.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: TRAVEL NEEDS, SAVED PLACES & SETTINGS (65%) */}
        <div className="profile-right-col">
          {/* Travel Needs */}
          <div className="dashboard-card">
            <div className="section-title-row">
              <div>
                <div className="card-eyebrow">MOBILITY REQUIREMENTS</div>
                <h2>My Travel Needs</h2>
              </div>
            </div>
            <p className="small muted" style={{ marginBottom: '14px' }}>
              Select all accessibility features required during your transit journey:
            </p>
            <div className="preference-grid">
              {travelNeeds.map((need) => {
                const isSelected = needs.includes(need)
                return (
                  <label key={need} className={isSelected ? 'preference selected' : 'preference'}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggle(need)} />
                    <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center' }}>
                      {isSelected ? <CheckIcon size={14} /> : '+'}
                    </span>
                    <span>{need}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Saved Places */}
          <div className="dashboard-card" style={{ marginTop: '16px' }}>
            <div className="section-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="card-eyebrow">SHORTCUTS</div>
                <h2>Saved Destinations</h2>
              </div>
              <button className="small-button">+ Add Place</button>
            </div>
            <div className="saved-list">
              {savedPlaces.map((place) => (
                <div key={place}>
                  <span style={{ color: 'var(--brand-blue)', display: 'flex', alignItems: 'center' }}>
                    <MapPinIcon size={18} />
                  </span>
                  <strong>{place}</strong>
                  <button aria-label={`Open ${place}`} style={{ display: 'flex', alignItems: 'center' }}>
                    <ChevronRightIcon size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notification Settings */}
          <div className="dashboard-card setting-row" style={{ marginTop: '16px' }}>
            <div>
              <strong>Transit Notifications & Disruption Alerts</strong>
              <p className="small muted">Receive real-time push alerts for wheelchair ramp malfunctions & bus delays</p>
            </div>
            <button
              className={`toggle ${notifications ? 'on' : ''}`}
              onClick={() => setNotifications(!notifications)}
              aria-pressed={notifications}
              aria-label="Toggle notifications"
            >
              <span />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
