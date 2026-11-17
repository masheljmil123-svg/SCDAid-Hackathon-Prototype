import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Navbar } from '../../components/Navbar.jsx'
import { Footer } from '../../components/Footer.jsx'
import { useInsightsAuth } from '../../context/InsightsAuthContext.jsx'

export function InsightsLoginPage() {
  const { configured, loading, canReview, signIn } = useInsightsAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && canReview) {
    return <Navigate to="/insights" replace />
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signIn(email.trim(), password)
      navigate('/insights', { replace: true })
    } catch (err) {
      setError(err?.message || 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <Navbar ctaLabel="Back Home" ctaTo="/" />
      <main className="insights-login">
        <section className="insights-login-card">
          <p className="info-kicker">Private access</p>
          <h1>Expert Insights Dashboard</h1>
          <p>
            Sign in with an authorized SCDAid administrator or supervisor account.
            Public visitors cannot view submissions.
          </p>

          {!configured && (
            <p className="feedback-error" role="alert">
              Supabase is not configured in this environment yet.
            </p>
          )}

          <form onSubmit={onSubmit} className="insights-login-form">
            <label className="feedback-field">
              <span>Email</span>
              <input
                className="control"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!configured || busy}
              />
            </label>
            <label className="feedback-field">
              <span>Password</span>
              <input
                className="control"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!configured || busy}
              />
            </label>
            {error && (
              <p className="feedback-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary" disabled={!configured || busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <Link className="insights-login-home" to="/">
            Return to SCDAid homepage
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  )
}
