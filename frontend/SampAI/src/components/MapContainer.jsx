export default function MapContainer({ selectedRoute, onNearby }) {
  return (
    <section className="map-shell" aria-label="Map area placeholder">
      <div className="map-grid" />
      <div className="map-badge">Cyberjaya bus map</div>
      <div className="mock-user-pin" title="Current location">●</div>
      <div className="mock-bus-pin bus-one">🚌</div>
      <div className="mock-bus-pin bus-two">🚌</div>
      <div className="map-overlay-card">
        <strong>{selectedRoute ? `Following ${selectedRoute.busId}` : 'MapContainer'}</strong>
        <span>
          {selectedRoute
            ? `${selectedRoute.from} → ${selectedRoute.to}`
            : "Your teammate's Leaflet/OpenStreetMap map goes here."}
        </span>
      </div>
      <button className="map-nearby-btn" onClick={onNearby}>🚏 Nearby Stops</button>
    </section>
  )
}
