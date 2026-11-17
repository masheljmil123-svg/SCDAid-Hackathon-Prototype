import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Navbar } from '../components/Navbar.jsx'
import { Sidebar } from '../components/Sidebar.jsx'
import { PatientAssessment } from '../components/PatientAssessment.jsx'
import { RecommendationResults } from '../components/RecommendationResults.jsx'
import { WorkspacePanel } from '../components/WorkspacePanel.jsx'
import { DemoBanner } from '../components/DemoBanner.jsx'
import { Footer } from '../components/Footer.jsx'
import { countCompletedSections } from '../data/formState.js'
import { LOADING_STEPS } from '../data/recommendation.js'
import { getDemoCase } from '../data/demoCases.js'

export function AssessmentPage() {
  const { caseId } = useParams()
  const demoCase = getDemoCase(caseId)
  const [activePage, setActivePage] = useState('assessment')
  const [form, setForm] = useState(demoCase?.form || null)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [result, setResult] = useState(null)
  const timersRef = useRef([])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
  }, [])

  useEffect(() => () => clearTimers(), [clearTimers])

  useEffect(() => {
    if (!demoCase) return
    clearTimers()
    setForm(demoCase.form)
    setResult(null)
    setLoading(false)
    setLoadingStep(0)
    setActivePage('assessment')
  }, [caseId, clearTimers, demoCase])

  const onChange = useCallback(() => {
    /* Demo fields are locked; ignore edit attempts. */
  }, [])

  const onNavigate = useCallback((id) => {
    setActivePage(id)
  }, [])

  const onSubmit = useCallback(() => {
    if (!demoCase || loading) return
    clearTimers()
    setResult(null)
    setLoading(true)
    setLoadingStep(0)

    LOADING_STEPS.forEach((_, index) => {
      const id = window.setTimeout(() => {
        if (index < LOADING_STEPS.length - 1) {
          setLoadingStep(index + 1)
          return
        }
        setResult(demoCase.result)
        setLoading(false)
      }, (index + 1) * 420)
      timersRef.current.push(id)
    })
  }, [clearTimers, demoCase, loading])

  if (!demoCase) return <Navigate to="/demo" replace />
  if (!form) return null

  const progress = countCompletedSections(form)

  return (
    <div className="page assessment-page">
      <Navbar ctaLabel="All Cases" ctaTo="/demo" />
      <DemoBanner />

      <div className="demo-case-bar">
        <div>
          <p className="info-kicker">
            {demoCase.code} · {demoCase.shortTitle}
          </p>
          <strong>{demoCase.name}</strong>
        </div>
        <Link className="btn btn-outline btn-sm" to="/demo">
          <ArrowLeft size={14} />
          All Cases
        </Link>
      </div>

      <section className="assessment-shell">
        <Sidebar activeItem={activePage} onNavigate={onNavigate} />
        <div className="assess-column">
          {activePage === 'assessment' ? (
            <>
              <PatientAssessment
                form={form}
                errors={{}}
                progress={progress}
                loading={loading}
                onChange={onChange}
                onClear={() => {}}
                onSubmit={onSubmit}
                readOnly
                caseLabel={`${demoCase.name} (${demoCase.code})`}
              />
              <aside className="assess-help">
                <p className="assess-help-title">Demo tip</p>
                <p>
                  Browse the locked assessment sections, then click Get Recommendation to view
                  the predefined result for this case.
                </p>
                <Link className="assess-help-btn" to="/demo">
                  Choose Another Case
                </Link>
              </aside>
            </>
          ) : (
            <WorkspacePanel view={activePage} />
          )}
        </div>
        <RecommendationResults
          result={result}
          loading={loading}
          loadingStep={loadingStep}
          caseLabel={demoCase.name}
        />
      </section>

      <Footer />
    </div>
  )
}
