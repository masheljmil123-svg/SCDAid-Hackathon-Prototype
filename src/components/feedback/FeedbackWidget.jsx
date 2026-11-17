import { useEffect, useId, useRef, useState } from 'react'
import { MessageSquarePlus, X } from 'lucide-react'
import { FeedbackForm } from './FeedbackForm.jsx'

export function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    dialogRef.current?.querySelector('select, button, textarea, input')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="feedback-widget">
      {open && (
        <div
          className="feedback-backdrop"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {open && (
        <section
          className="feedback-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          ref={dialogRef}
        >
          <header className="feedback-panel-head">
            <div>
              <p className="info-kicker">Expert Insights</p>
              <h2 id={titleId}>Share your feedback</h2>
            </div>
            <button
              type="button"
              className="feedback-close"
              aria-label="Close feedback form"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <FeedbackForm />
        </section>
      )}

      <button
        type="button"
        className="feedback-fab"
        aria-expanded={open}
        aria-controls={open ? undefined : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <MessageSquarePlus size={18} />
        <span>Expert Insights</span>
      </button>
    </div>
  )
}
