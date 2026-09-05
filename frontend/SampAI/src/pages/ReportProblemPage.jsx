import { useState } from 'react'
import { ArrowLeftIcon, CameraIcon, CheckIcon, ShieldCheckIcon, AlertIcon } from '../components/Icons.jsx'

const categories = [
  'Broken bus ramp',
  'Bus stop inaccessible',
  'Blocked pathway',
  'Overcrowded bus',
  'Overcrowded bus stop',
  'Unsafe bus stop',
  'Bus accessibility problem',
  'Other',
]

export default function ReportProblemPage({ onBack }) {
  const [location, setLocation] = useState('Current Location')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return (
      <div className="dashboard-view centered-page">
        <div className="success-state card-success">
          <div className="success-icon">
            <CheckIcon size={40} />
          </div>
          <h2>Report Submitted for Community Verification</h2>
          <p style={{ fontSize: '1rem', lineHeight: '1.6', margin: '14px 0 24px', color: 'var(--muted)' }}>
            Thank you for contributing to accessible public transit. Once verified by transit operators or peer passengers, this report updates the live Cyberjaya accessibility feed.
          </p>
          <div className="kpi-badge kpi-good" style={{ padding: '6px 14px', fontSize: '0.9rem', marginBottom: '20px', display: 'inline-block' }}>
            +50 SampAI Points Pending Verification
          </div>
          <div>
            <button className="primary-button large" onClick={onBack}>
              Back to Operations Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-view">
      <div className="view-sub-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeftIcon size={16} /> Back to Dashboard
        </button>
        <span className="muted small">Crowdsourced transit accessibility and obstacle monitoring</span>
      </div>

      <div className="report-desktop-grid">
        {/* LEFT COLUMN: REPORT SUBMISSION FORM (60%) */}
        <section className="report-form-col">
          <div className="dashboard-card">
            <div className="side-card-header">
              <div className="card-eyebrow">COMMUNITY INCIDENT REPORT</div>
              <h2>Report an Accessibility Issue</h2>
              <p className="small muted">Submit details about obstacles, broken ramps, or inaccessible bus shelters:</p>
            </div>

            <div style={{ marginTop: '16px' }}>
              <label className="field-label">Location / Bus Shelter</label>
              <input
                className="text-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. MMU Cyberjaya Bus Stop"
              />

              <label className="field-label">Problem Category</label>
              <select className="text-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Select Category</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <label className="field-label">Detailed Description</label>
              <textarea
                className="text-area tall"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Please describe the obstacle, ramp malfunction, or accessibility issue in detail..."
              />

              <label className="photo-upload">
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '14px',
                    background: 'var(--light-blue)',
                    color: 'var(--brand-blue)',
                    display: 'grid',
                    placeItems: 'center',
                    flex: '0 0 auto',
                  }}
                >
                  <CameraIcon size={22} />
                </div>
                <span style={{ flex: 1 }}>
                  <strong>Attach Photo Evidence</strong>
                  <small>Upload photo to accelerate community and operator verification</small>
                </span>
                <input type="file" accept="image/*" />
              </label>

              <button
                className="primary-button large"
                disabled={!category || !description.trim()}
                onClick={() => setSubmitted(true)}
              >
                Submit Incident Report
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: GUIDANCE & REWARDS (40%) */}
        <aside className="report-side-col">
          <div className="dashboard-card">
            <div className="side-card-header">
              <div className="card-eyebrow">COMMUNITY VERIFICATION</div>
              <h3>How it works</h3>
            </div>
            <div className="guidance-step-list">
              <div className="guidance-step">
                <span className="step-num">1</span>
                <div>
                  <strong>Submit Report</strong>
                  <p className="small muted">Log the issue with location and problem category.</p>
                </div>
              </div>
              <div className="guidance-step">
                <span className="step-num">2</span>
                <div>
                  <strong>Peer & Driver Verification</strong>
                  <p className="small muted">Nearby passengers and feeder bus drivers confirm the condition.</p>
                </div>
              </div>
              <div className="guidance-step">
                <span className="step-num">3</span>
                <div>
                  <strong>Live Status Updated & Points Awarded</strong>
                  <p className="small muted">Corridor map immediately alerts travelers and you earn 50 points.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-card" style={{ marginTop: '16px' }}>
            <div className="side-card-header">
              <div className="card-eyebrow">RECENT VERIFIED REPORTS</div>
              <h3>Cyberjaya Feed</h3>
            </div>
            <div className="side-stops-list" style={{ marginTop: '10px' }}>
              <div className="side-stop-item" style={{ cursor: 'default' }}>
                <div className="side-stop-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
                  <AlertIcon size={18} />
                </div>
                <div className="side-stop-info">
                  <strong>Broken ramp on Bus T509</strong>
                  <div className="side-stop-meta">
                    <span>Verified by 3 passengers</span>
                    <span className="kpi-badge kpi-danger" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>Resolved</span>
                  </div>
                </div>
              </div>
              <div className="side-stop-item" style={{ cursor: 'default' }}>
                <div className="side-stop-icon" style={{ background: '#ecfdf5', color: '#059669' }}>
                  <ShieldCheckIcon size={18} />
                </div>
                <div className="side-stop-info">
                  <strong>MMU Shelter Ramp Operational</strong>
                  <div className="side-stop-meta">
                    <span>Verified by Driver #412</span>
                    <span className="kpi-badge kpi-good" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>Active</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
