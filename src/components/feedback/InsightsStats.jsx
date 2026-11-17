import {
  CATEGORY_OPTIONS,
  PROFESSIONAL_ROLE_OPTIONS,
  STATUS_OPTIONS,
  labelFor,
} from '../../data/insightsConstants.js'

function countBy(rows, key, options) {
  return options.map((option) => ({
    ...option,
    count: rows.filter((row) => row[key] === option.value).length,
  }))
}

export function InsightsStats({ rows }) {
  const byRole = countBy(rows, 'professional_role', PROFESSIONAL_ROLE_OPTIONS)
  const byCategory = countBy(rows, 'category', CATEGORY_OPTIONS)
  const byStatus = countBy(rows, 'status', STATUS_OPTIONS)

  return (
    <div className="insights-stats">
      <article className="insights-stat-card insights-stat-card--total">
        <span>Total submissions</span>
        <strong>{rows.length}</strong>
      </article>

      <article className="insights-stat-card">
        <span>By role</span>
        <ul>
          {byRole.map((item) => (
            <li key={item.value}>
              <em>{item.label}</em>
              <strong>{item.count}</strong>
            </li>
          ))}
        </ul>
      </article>

      <article className="insights-stat-card">
        <span>By category</span>
        <ul>
          {byCategory.map((item) => (
            <li key={item.value}>
              <em>{labelFor(CATEGORY_OPTIONS, item.value)}</em>
              <strong>{item.count}</strong>
            </li>
          ))}
        </ul>
      </article>

      <article className="insights-stat-card">
        <span>By status</span>
        <ul>
          {byStatus.map((item) => (
            <li key={item.value}>
              <em>{item.label}</em>
              <strong>{item.count}</strong>
            </li>
          ))}
        </ul>
      </article>
    </div>
  )
}
