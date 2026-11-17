import { useState } from 'react'
import {
  CATEGORY_OPTIONS,
  PRIVACY_NOTICE,
  PROFESSIONAL_ROLE_OPTIONS,
} from '../../data/insightsConstants.js'
import { submitExpertFeedback } from '../../lib/insightsApi.js'
import { supabaseConfigured } from '../../lib/supabaseClient.js'

const EMPTY = {
  professionalRole: '',
  category: '',
  name: '',
  email: '',
  message: '',
  companyUrl: '',
  website: '',
}

export function FeedbackForm({ onSuccess }) {
  const [form, setForm] = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const onChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    if (!supabaseConfigured) {
      setError('Feedback storage is not configured yet. Please try again after setup.')
      return
    }
    if (!form.professionalRole || !form.category) {
      setError('Please select your role and a feedback category.')
      return
    }
    if (form.message.trim().length < 20) {
      setError('Please enter at least 20 characters so we can act on your insight.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await submitExpertFeedback(form)
      setDone(true)
      setForm(EMPTY)
      onSuccess?.()
    } catch (err) {
      setError(err?.message || 'Unable to submit feedback.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="feedback-success" role="status">
        <h3>Thank you</h3>
        <p>Your insight was stored securely for the SCDAid team and project supervisor.</p>
        <button type="button" className="btn btn-outline" onClick={() => setDone(false)}>
          Submit another
        </button>
      </div>
    )
  }

  return (
    <form className="feedback-form" onSubmit={onSubmit} noValidate>
      <label className="feedback-field">
        <span>Professional role</span>
        <select
          className="control"
          value={form.professionalRole}
          onChange={(e) => onChange('professionalRole', e.target.value)}
          required
        >
          <option value="">Select role</option>
          {PROFESSIONAL_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="feedback-field">
        <span>Feedback category</span>
        <select
          className="control"
          value={form.category}
          onChange={(e) => onChange('category', e.target.value)}
          required
        >
          <option value="">Select category</option>
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="feedback-field">
        <span>Name (optional)</span>
        <input
          className="control"
          type="text"
          autoComplete="name"
          maxLength={120}
          value={form.name}
          onChange={(e) => onChange('name', e.target.value)}
        />
      </label>

      <label className="feedback-field">
        <span>Email (optional)</span>
        <input
          className="control"
          type="email"
          autoComplete="email"
          maxLength={254}
          value={form.email}
          onChange={(e) => onChange('email', e.target.value)}
        />
      </label>

      <label className="feedback-field">
        <span>Your feedback</span>
        <textarea
          className="control control-textarea"
          rows={5}
          maxLength={2000}
          required
          value={form.message}
          onChange={(e) => onChange('message', e.target.value)}
          placeholder="Share clinical, usability, or technical observations…"
        />
      </label>

      {/* Honeypot fields — hidden from assistive tech and sighted users */}
      <div className="feedback-honeypot" aria-hidden="true">
        <label>
          Company URL
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.companyUrl}
            onChange={(e) => onChange('companyUrl', e.target.value)}
          />
        </label>
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => onChange('website', e.target.value)}
          />
        </label>
      </div>

      <p className="feedback-privacy">{PRIVACY_NOTICE}</p>

      {error && (
        <p className="feedback-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Sending…' : 'Submit feedback'}
      </button>
    </form>
  )
}
