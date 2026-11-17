import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, LogOut, RefreshCw } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { Navbar } from '../../components/Navbar.jsx'
import { Footer } from '../../components/Footer.jsx'
import { InsightsStats } from '../../components/feedback/InsightsStats.jsx'
import { InsightsTable } from '../../components/feedback/InsightsTable.jsx'
import { useInsightsAuth } from '../../context/InsightsAuthContext.jsx'
import {
  CATEGORY_OPTIONS,
  PROFESSIONAL_ROLE_OPTIONS,
  STATUS_OPTIONS,
  labelFor,
} from '../../data/insightsConstants.js'
import { listExpertFeedback, updateFeedbackStatus } from '../../lib/insightsApi.js'

function toCsv(rows) {
  const headers = [
    'id',
    'created_at',
    'professional_role',
    'category',
    'status',
    'name',
    'email',
    'message',
  ]
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((key) => escape(row[key])).join(','))
  }
  return `${lines.join('\n')}\n`
}

export function InsightsDashboardPage() {
  const { loading: authLoading, canReview, isAdmin, profile, signOut } = useInsightsAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listExpertFeedback()
      setRows(data)
      setSelected((current) => data.find((row) => row.id === current?.id) || null)
    } catch (err) {
      setError(err?.message || 'Unable to load feedback.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && canReview) load()
  }, [authLoading, canReview, load])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (roleFilter && row.professional_role !== roleFilter) return false
      if (categoryFilter && row.category !== categoryFilter) return false
      if (statusFilter && row.status !== statusFilter) return false
      if (!needle) return true
      return [row.name, row.email, row.message]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    })
  }, [rows, query, roleFilter, categoryFilter, statusFilter])

  const onStatusChange = async (id, status) => {
    if (!isAdmin) return
    setUpdatingId(id)
    setError('')
    try {
      const updated = await updateFeedbackStatus(id, status)
      setRows((current) => current.map((row) => (row.id === id ? updated : row)))
      setSelected((current) => (current?.id === id ? updated : current))
    } catch (err) {
      setError(err?.message || 'Status update failed.')
    } finally {
      setUpdatingId(null)
    }
  }

  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `scdaid-expert-insights-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (authLoading) {
    return (
      <div className="page">
        <Navbar ctaLabel="Home" ctaTo="/" />
        <main className="insights-dashboard">
          <p>Loading session…</p>
        </main>
      </div>
    )
  }

  if (!canReview) {
    return <Navigate to="/insights/login" replace />
  }

  return (
    <div className="page">
      <Navbar ctaLabel="Home" ctaTo="/" />
      <main className="insights-dashboard">
        <header className="insights-dash-head">
          <div>
            <p className="info-kicker">Private dashboard</p>
            <h1>Expert Insights</h1>
            <p>
              Signed in as {profile?.display_name || profile?.role}
              {isAdmin ? ' (administrator)' : ' (supervisor · read-only)'}
            </p>
          </div>
          <div className="insights-dash-actions">
            <button type="button" className="btn btn-outline" onClick={load} disabled={loading}>
              <RefreshCw size={15} />
              Refresh
            </button>
            <button type="button" className="btn btn-outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download size={15} />
              Export CSV
            </button>
            <button type="button" className="btn btn-outline" onClick={() => signOut()}>
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </header>

        <InsightsStats rows={rows} />

        <section className="insights-filters">
          <label>
            <span>Search</span>
            <input
              className="control"
              type="search"
              placeholder="Name, email, or message"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            <span>Role</span>
            <select className="control" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All</option>
              {PROFESSIONAL_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Category</span>
            <select
              className="control"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              className="control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        {error && (
          <p className="feedback-error" role="alert">
            {error}
          </p>
        )}

        <div className="insights-layout">
          <div>
            {loading ? (
              <p>Loading feedback…</p>
            ) : (
              <InsightsTable
                rows={filtered}
                selectedId={selected?.id}
                onSelect={setSelected}
                isAdmin={isAdmin}
                onStatusChange={onStatusChange}
                updatingId={updatingId}
              />
            )}
          </div>

          <aside className="insights-detail">
            {selected ? (
              <>
                <p className="info-kicker">Submission detail</p>
                <h2>{labelFor(CATEGORY_OPTIONS, selected.category)}</h2>
                <dl className="insights-detail-meta">
                  <div>
                    <dt>Submitted</dt>
                    <dd>{new Date(selected.created_at).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Role</dt>
                    <dd>{labelFor(PROFESSIONAL_ROLE_OPTIONS, selected.professional_role)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{labelFor(STATUS_OPTIONS, selected.status)}</dd>
                  </div>
                  <div>
                    <dt>Name</dt>
                    <dd>{selected.name || '—'}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{selected.email || '—'}</dd>
                  </div>
                </dl>
                <p className="insights-detail-message">{selected.message}</p>
                {!isAdmin && (
                  <p className="field-hint">Supervisor access is read-only. Status changes require an administrator.</p>
                )}
              </>
            ) : (
              <p className="muted">Select a submission to review the full message.</p>
            )}
          </aside>
        </div>

        <p className="insights-footnote">
          <Link to="/">Return to prototype</Link>
        </p>
      </main>
      <Footer />
    </div>
  )
}
