import {
  CATEGORY_OPTIONS,
  PROFESSIONAL_ROLE_OPTIONS,
  STATUS_OPTIONS,
  labelFor,
} from '../../data/insightsConstants.js'

function formatWhen(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export function InsightsTable({
  rows,
  selectedId,
  onSelect,
  isAdmin,
  onStatusChange,
  updatingId,
}) {
  if (!rows.length) {
    return <p className="insights-empty">No feedback matches the current filters.</p>
  }

  return (
    <div className="insights-table-wrap">
      <table className="insights-table">
        <thead>
          <tr>
            <th>Submitted</th>
            <th>Role</th>
            <th>Category</th>
            <th>Status</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const active = row.id === selectedId
            return (
              <tr
                key={row.id}
                className={active ? 'is-active' : ''}
                onClick={() => onSelect(row)}
              >
                <td>{formatWhen(row.created_at)}</td>
                <td>{labelFor(PROFESSIONAL_ROLE_OPTIONS, row.professional_role)}</td>
                <td>{labelFor(CATEGORY_OPTIONS, row.category)}</td>
                <td onClick={(event) => event.stopPropagation()}>
                  {isAdmin ? (
                    <select
                      className="control insights-status-select"
                      value={row.status}
                      disabled={updatingId === row.id}
                      onChange={(event) => onStatusChange(row.id, event.target.value)}
                      aria-label={`Status for submission ${row.id}`}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`insights-status insights-status--${row.status}`}>
                      {labelFor(STATUS_OPTIONS, row.status)}
                    </span>
                  )}
                </td>
                <td>
                  <button type="button" className="insights-snippet" onClick={() => onSelect(row)}>
                    {row.message.slice(0, 90)}
                    {row.message.length > 90 ? '…' : ''}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
