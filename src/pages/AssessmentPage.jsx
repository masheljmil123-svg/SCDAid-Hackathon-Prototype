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
import { countCompletedSections, validateForm } from '../data/formState.js'
import { LOADING_STEPS, buildRecommendation } from '../data/recommendation.js'
import { formForRecommendation } from '../logic/calc/apply.js'
import { getDemoCase } from '../data/demoCases.js'

export function AssessmentPage() {
  const { caseId } = useParams()
  const demoCase = getDemoCase(caseId)
  const [activePage, setActivePage] = useState('assessment')
  const [form, setForm] = useState(demoCase?.form || null)
  const [errors, setErrors] = useState({})
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
    setForm(structuredClone(demoCase.form))
    setErrors({})
    setResult(null)
    setLoading(false)
    setLoadingStep(0)
    setActivePage('assessment')
  }, [caseId, clearTimers, demoCase])

  const onChange = useCallback((key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }, [])

  const onClear = useCallback(() => {
    if (!demoCase) return
    clearTimers()
    setForm(structuredClone(demoCase.form))
    setErrors({})
    setResult(null)
    setLoading(false)
    setLoadingStep(0)
  }, [clearTimers, demoCase])

  const onNavigate = useCallback((id) => {
    setActivePage(id)
  }, [])

  const onSubmit = useCallback(() => {
    if (!demoCase || !form || loading) return

    const nextErrors = validateForm(formForRecommendation(form).form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    clearTimers()
    setResult(null)
    setLoading(true)
    setLoadingStep(0)

    const recommendationPromise = buildRecommendation(form)

    LOADING_STEPS.forEach((_, index) => {
      const id = window.setTimeout(async () => {
        if (index < LOADING_STEPS.length - 1) {
          setLoadingStep(index + 1)
          return
        }
        try {
          const nextResult = await recommendationPromise
          setResult(nextResult)
        } catch (error) {
          setResult({
            disclaimer:
              'Simulation-based proof-of-concept. Not clinically validated.',
            preferred: null,
            alternatives: [],
            error: error?.message || 'Unable to generate a recommendation.',
            explanation: { disclaimer: '', findings: [] },
            followUp: {
              timing: 'Reassess after clinician review',
              message: 'No opioid ranking was produced for this pathway.',
            },
            pgx: null,
            safety: null,
            doseProposals: [],
          })
        } finally {
          setLoading(false)
        }
      }, (index + 1) * 420)
      timersRef.current.push(id)
    })
  }, [clearTimers, demoCase, form, loading])

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
                errors={errors}
                progress={progress}
                loading={loading}
                onChange={onChange}
                onClear={onClear}
                onSubmit={onSubmit}
                readOnly={false}
                caseLabel={`${demoCase.name} (${demoCase.code})`}
              />
              <aside className="assess-help">
                <p className="assess-help-title">Prototype tip</p>
                <p>
                  Fields start from this fictional case. Edit supported inputs, then click Get
                  Recommendation to run the verified SCDAid v2.1 simulation pipeline. Outputs are
                  research-only and not clinically validated.
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
