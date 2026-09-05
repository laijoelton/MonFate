export default function TimeSelector({ items, selectedId, onSelect }) {
  return (
    <div className="time-selector" role="list" aria-label="Travel time selector">
      {items.map((item) => {
        const isSelected = selectedId === item.id
        return (
          <button
            key={item.id}
            role="listitem"
            aria-pressed={isSelected}
            className={`time-chip ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelect(item)}
          >
            {item.shortLabel}
          </button>
        )
      })}
    </div>
  )
}
