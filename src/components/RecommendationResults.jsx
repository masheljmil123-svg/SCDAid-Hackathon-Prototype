import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ClipboardList, Clock } from 'lucide-react'
import { dosesForDisplay, LOADING_STEPS } from '../data/recommendation.js'
import { ClinicalCalculations } from './ClinicalCalculations.jsx'

const BLOCKED_PATHWAYS = new Set([
  'dialysis_review',
  'obstetric_review',
  'urgent_review_resp',
  'non_opioid',
  'urgent_review_no_eligible',
  'outside_scale',
  'renal_data_missing',
  'error',
])

function findDoseProposal(result, medication) {
  if (!medication) return null
  const proposals = dosesForDisplay(result)
  const id = String(medication.id || medication.strategy || '').toUpperCase()
  const name = String(medication.name || '').toLowerCase()
  return (
    proposals.find((item) => String(item.drug_route || '').toUpperCase() === id) ||
    proposals.find((item) => String(item.name || '').toLowerCase() === name) ||
    null
  )
}

function humanizeDoseStatus(status) {
  const map = {
    NOT_CALCULATED_MISSING_WEIGHT: 'Weight is required for this calculation.',
    NOT_CALCULATED_CLINICIAN_REVIEW: 'Calculation stopped for clinician review.',
    NOT_CALCULATED_NO_APPROVED_RULE: 'No approved dose rule for this drug/route.',
    NOT_CALCULATED_BLOCKED_PATHWAY: 'Dose calculation withheld for this pathway.',
  }
  return map[status] || status || 'Calculation unavailable.'
}

function formatPreferredDose(proposal) {
  if (!proposal) return { value: 'Dose unavailable', detail: null, unavailable: true }
  if (proposal.dose === null || proposal.dose === undefined) {
    return {
      value: 'Dose unavailable',
      detail: proposal.reason || humanizeDoseStatus(proposal.status),
      unavailable: true,
    }
  }
  const range = proposal.dose_range ? ` (range ${proposal.dose_range.join('–')} ${proposal.unit})` : ''
  const parts = [`${proposal.dose} ${proposal.unit}${range}`]
  if (proposal.interval) parts.push(proposal.interval)
  if (proposal.max_daily_mg) parts.push(`max ${proposal.max_daily_mg} mg/day`)
  return { value: parts.join(' · '), detail: null, unavailable: false }
}

function predictionHorizon(result) {
  if (result?.treatmentContext === 'O') return '60 / 120 / 180 / 240 min'
  if (result?.treatmentContext === 'P') return '30 / 60 / 90 / 120 min'
  const label = result?.prediction?.label || ''
  if (/60\/120\/180\/240/i.test(label)) return '60 / 120 / 180 / 240 min'
  if (/30\/60\/90\/120/i.test(label)) return '30 / 60 / 90 / 120 min'
  return null
}

function buildWhySummary(result) {
  if (!result?.preferred) return null
  const findings = result.explanation?.findings || []
  const preferred = result.preferred
  const sentences = []

  if (result.pathway === 'single_eligible') {
    sentences.push(`${preferred.name} is the only Eligible option after safety screening.`)
  } else if (findings.some((f) => /equivalence margin/i.test(f))) {
    sentences.push(
      `${preferred.name} was selected within the 1-point prediction equivalence margin using the prespecified rules order.`,
    )
  } else {
    sentences.push(
      `${preferred.name} ranked highest among Eligible options on the simulated pain-reduction model.`,
    )
  }

  const allergy = findings.find((f) => /documented allergy|Allergy \/ Intolerance/i.test(f))
  const avoided = findings.find((f) => /^Not recommended and not ranked:/i.test(f))
  const pgx = findings.find((f) => /phenoconversion|Functional CYP2D6|inhibitor exposure/i.test(f))
  const prior = findings.find((f) => /Documented previous responses:/i.test(f))
  const renal = findings.find((f) => /eGFR\s+\d+/i.test(f) && /<(?:60|30)|dialysis|AKI/i.test(f))

  const driver =
    (allergy && allergy.replace(/\.$/, '')) ||
    (pgx && pgx.replace(/\.$/, '')) ||
    (prior && prior.replace(/\.$/, '')) ||
    (renal && renal.replace(/\.$/, '')) ||
    (avoided && avoided.replace(/\.$/, ''))

  if (driver) {
    sentences.push(driver.length > 140 ? `${driver.slice(0, 137)}…` : `${driver}.`)
  }

  return sentences.slice(0, 2)
}

function shortReason(note) {
  if (!note) return null
  const cleaned = String(note).replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  if (cleaned.length <= 72) return cleaned
  return `${cleaned.slice(0, 69)}…`
}

function collectSafetyAlerts(result) {
  const alerts = []
  const push = (tone, text) => {
    if (!text) return
    const line = String(text).replace(/\s+/g, ' ').trim()
    if (!line) return
    if (alerts.some((a) => a.text === line)) return
    alerts.push({ tone, text: line.length > 160 ? `${line.slice(0, 157)}…` : line })
  }

  if (result.error) push('critical', result.error)
  if (result.mlError) push('warning', result.mlError)
  if (result.blockedMessage) {
    push(
      'critical',
      result.pathway === 'dialysis_review'
        ? 'Dialysis: clinical review required — no automatic opioid recommendation.'
        : result.blockedMessage.split('.')[0] + '.',
    )
  }
  if (result.renalAlert) {
    const short = result.renalAlert.split('.')[0] + '.'
    push(/dialysis|AKI|missing/i.test(short) ? 'critical' : 'warning', short)
  }

  const safety = result.safety || {}
  if (safety.allergy?.message) push('critical', safety.allergy.message)
  if (safety.interaction?.message) push('warning', safety.interaction.message)
  if (safety.renal?.message) {
    const renal = safety.renal
    const critical = /AKI|Dialysis|Severe|Missing/i.test(renal.title || '')
    const notable = /Safety Alert|Severe|AKI|Dialysis|Missing|Review/i.test(renal.title || '')
    if (critical || notable) {
      push(critical ? 'critical' : 'warning', `${renal.title}: ${renal.message.split('.')[0]}.`)
    }
  }
  if (
    safety.hepatic?.message &&
    /severe|mild or moderate|not classified|Not assessed|not assessed/i.test(safety.hepatic.message) &&
    !/hepatic impairment as none/i.test(safety.hepatic.message)
  ) {
    push('warning', safety.hepatic.message.split('.')[0] + '.')
  }
  if (safety.monitoring?.message) push('warning', safety.monitoring.message)

  const pgx = result.pgx
  if (pgx?.error) push('warning', `CYP2D6: ${pgx.error}`)
  if (pgx?.phenoconversion) {
    push(
      'warning',
      `CYP2D6 phenoconversion: functional phenotype ${pgx.functionalPhenotype || 'adjusted'} after inhibitor exposure.`,
    )
  }
  if (pgx?.inhibitionRisk?.message) push('warning', pgx.inhibitionRisk.message)

  for (const conflict of result.clinicalConflicts || []) {
    // Keep unresolved clinical-rule conflicts; skip long historical-comparison notes in the compact view.
    if (/previous website|historical/i.test(conflict) && !/Unresolved/i.test(conflict)) continue
    push('warning', conflict)
  }

  const preferredDose = findDoseProposal(result, result.preferred)
  if (result.preferred && preferredDose && preferredDose.dose == null) {
    push(
      'info',
      `Preferred option dose unavailable${preferredDose.status ? ` (${preferredDose.status})` : ''}.`,
    )
  }

  const order = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 5)
}

function monitoringCopy(result) {
  const route = result.preferred?.route || (result.treatmentContext === 'O' ? 'oral' : 'parenteral')
  const when = result.followUp?.timing || 'Reassess after clinician review'
  const monitor =
    result.treatmentContext === 'O'
      ? 'Pain, sedation, and respiratory status after the oral dose.'
      : 'Pain, sedation, and respiratory status after the parenteral dose.'
  return {
    monitor: result.preferred ? monitor : 'Defer opioid dosing until clinical review is complete.',
    when: result.preferred ? when : result.followUp?.timing || 'Clinician review first',
    route,
  }
}

function EligibilityBadge({ status }) {
  const key =
    status === 'Avoid / Not recommended' || status === 'Avoid'
      ? 'avoid'
      : status === 'Caution'
        ? 'caution'
        : 'eligible'
  return <span className={`cds-badge cds-badge--${key}`}>{status}</span>
}

function blockedTitle(result) {
  if (result.pathway === 'dialysis_review') return 'Clinical review required'
  if (result.pathway === 'obstetric_review') return 'Clinical review required'
  if (result.pathway === 'non_opioid') return 'Clinical review required'
  if (result.pathway === 'urgent_review_no_eligible') return 'Clinical review required'
  if (result.pathway === 'urgent_review_resp') return 'Clinical review required'
  if (result.pathway === 'renal_data_missing') return 'Clinical review required'
  if (result.blockedMessage) return 'Clinical review required'
  return 'Clinical review required'
}

function blockedDetail(result) {
  if (result.pathway === 'dialysis_review') {
    return 'Dialysis pathway: no automatic opioid or dose is issued.'
  }
  if (result.pathway === 'obstetric_review') {
    return 'Obstetric pathway: ranking and dosing are withheld for clinician review.'
  }
  if (result.pathway === 'non_opioid') {
    return 'Pain score is below the opioid-ranking threshold for this pathway.'
  }
  if (result.pathway === 'urgent_review_no_eligible') {
    return 'No Eligible opioid remains after safety rules; clinician review is required.'
  }
  if (result.pathway === 'urgent_review_resp') {
    return 'Respiratory compromise: automatic ranking is withheld.'
  }
  if (result.blockedMessage) return result.blockedMessage.split('.').slice(0, 2).join('.') + '.'
  return 'No preferred opioid or dose is shown for this pathway.'
}

export function RecommendationResults({ result, loading, loadingStep = 0, caseLabel }) {
  const [techOpen, setTechOpen] = useState(false)

  const pathwayBlocked =
    Boolean(result) && (Boolean(result.blockedMessage) || BLOCKED_PATHWAYS.has(result.pathway))
  const preferredDose = findDoseProposal(result, result?.preferred)
  const doseView = formatPreferredDose(preferredDose)
  const why = result ? buildWhySummary(result) : null
  const alerts = result ? collectSafetyAlerts(result) : []
  const monitoring = result ? monitoringCopy(result) : null
  const horizon = result ? predictionHorizon(result) : null

  const alternatives = (result?.alternatives || []).filter((alt) => alt.eligibility !== 'Avoid')
  const avoided = (result?.alternatives || []).filter((alt) => alt.eligibility === 'Avoid')
  // Also surface Avoid rows from evaluated if not already in alternatives
  const avoidedExtra = (result?.evaluated || []).filter(
    (item) =>
      item.eligibility === 'Avoid' &&
      !avoided.some((a) => a.id === item.id || a.name === item.name) &&
      (!result.preferred || (item.id !== result.preferred.id && item.name !== result.preferred.name)),
  )
  const notRecommended = [...avoided, ...avoidedExtra]

  return (
    <section className="results results--cds">
      <header className="results-head cds-head">
        <div>
          <h1>Recommendation Results</h1>
          <p className="cds-disclaimer">
            Research-only · not clinically validated
            {caseLabel ? ` · ${caseLabel}` : ''}
          </p>
        </div>
      </header>

      <div className="results-content">
        {loading && (
          <div className="results-loading-panel" aria-live="polite">
            <p className="results-loading">{LOADING_STEPS[loadingStep]}</p>
            <ol className="loading-steps">
              {LOADING_STEPS.map((step, index) => (
                <li
                  key={step}
                  className={
                    index === loadingStep ? 'is-current' : index < loadingStep ? 'is-done' : ''
                  }
                >
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        {!result && !loading && (
          <div className="awaiting">
            <span className="awaiting-icon">
              <ClipboardList size={22} />
            </span>
            <h2>Awaiting Assessment</h2>
            <p>
              Review or edit the pre-filled patient information and click
              <br />
              “Get Recommendation” to run the SCDAid v2.1 simulation pipeline.
            </p>
          </div>
        )}

        {result && (
          <div className={`cds-body${loading ? ' is-dim' : ''}`}>
            {pathwayBlocked || !result.preferred ? (
              <article className="cds-review">
                <div className="cds-review-top">
                  <AlertTriangle size={18} strokeWidth={2.2} />
                  <h2>{blockedTitle(result)}</h2>
                </div>
                <p>{blockedDetail(result)}</p>
                <p className="cds-muted">No preferred opioid or dose is displayed for this pathway.</p>
              </article>
            ) : (
              <article className="cds-top">
                <div className="cds-top-bar">
                  <span className="cds-kicker">Top recommendation</span>
                  <EligibilityBadge status={result.preferred.eligibility} />
                </div>
                <div className="cds-drug">
                  <span className="cds-check" aria-hidden="true">
                    <Check size={14} strokeWidth={3} />
                  </span>
                  <div>
                    <h2>{result.preferred.name}</h2>
                    <p>{result.preferred.route ? `Route ${result.preferred.route}` : 'Route per strategy'}</p>
                  </div>
                </div>

                <div className={`cds-dose${doseView.unavailable ? ' is-unavailable' : ''}`}>
                  <span className="cds-label">Calculated dose</span>
                  <strong>{doseView.value}</strong>
                  {doseView.detail && <em>{doseView.detail}</em>}
                </div>

                {result.preferred.predictedDeltaPain60 != null && (
                  <div className="cds-metrics">
                    <div>
                      <span className="cds-label">AI-predicted ΔNPRS</span>
                      <strong>
                        {result.preferred.predictedDeltaPain60}
                        <span className="cds-unit"> /10</span>
                      </strong>
                    </div>
                    <div>
                      <span className="cds-label">Prediction horizon</span>
                      <strong className="cds-horizon">{horizon || 'Per pathway schedule'}</strong>
                    </div>
                  </div>
                )}
              </article>
            )}

            {why && result.preferred && (
              <section className="cds-section">
                <h3>Why this option?</h3>
                {why.map((sentence) => (
                  <p key={sentence}>{sentence}</p>
                ))}
              </section>
            )}

            {(alternatives.length > 0 || notRecommended.length > 0) && (
              <section className="cds-section">
                <h3>Alternatives</h3>
                {pathwayBlocked && (
                  <p className="cds-muted">Eligibility shown for reference only — not a ranked recommendation.</p>
                )}
                {alternatives.length > 0 && (
                  <ul className="cds-alt-list">
                    {alternatives.map((alt) => {
                      const altDose =
                        !pathwayBlocked && alt.eligibility !== 'Avoid'
                          ? findDoseProposal(result, alt)
                          : null
                      const altDoseView = altDose ? formatPreferredDose(altDose) : null
                      return (
                        <li key={alt.id || alt.name} className="cds-alt-row">
                          <div className="cds-alt-main">
                            <strong>{alt.name}</strong>
                            <EligibilityBadge status={alt.eligibility} />
                          </div>
                          <div className="cds-alt-meta">
                            {alt.predictedDeltaPain60 != null && (
                              <span>ΔNPRS {alt.predictedDeltaPain60}/10</span>
                            )}
                            {altDoseView && !altDoseView.unavailable && (
                              <span>Dose {altDoseView.value}</span>
                            )}
                            {altDoseView?.unavailable && <span>Dose unavailable</span>}
                            {shortReason(alt.note) && <span>{shortReason(alt.note)}</span>}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {notRecommended.length > 0 && (
                  <div className="cds-avoid-block">
                    <span className="cds-label">Not recommended</span>
                    <ul className="cds-alt-list cds-alt-list--avoid">
                      {notRecommended.map((alt) => (
                        <li key={alt.id || alt.name} className="cds-alt-row cds-alt-row--avoid">
                          <div className="cds-alt-main">
                            <strong>{alt.name}</strong>
                            <EligibilityBadge status="Avoid" />
                          </div>
                          {shortReason(alt.note) && (
                            <div className="cds-alt-meta">
                              <span>{shortReason(alt.note)}</span>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {alerts.length > 0 && (
              <section className="cds-section">
                <h3>Key safety alerts</h3>
                <ul className="cds-alerts">
                  {alerts.map((alert) => (
                    <li key={alert.text} className={`cds-alert cds-alert--${alert.tone}`}>
                      <span className="cds-alert-dot" aria-hidden="true" />
                      <span>{alert.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {monitoring && (
              <section className="cds-section cds-monitor">
                <h3>Monitoring &amp; reassessment</h3>
                <p>
                  <Clock size={13} strokeWidth={2.2} />
                  <span>
                    <strong>Monitor:</strong> {monitoring.monitor}
                  </span>
                </p>
                <p>
                  <strong>Reassess:</strong> {monitoring.when}
                </p>
              </section>
            )}

            <details
              className="cds-tech"
              open={techOpen}
              onToggle={(event) => setTechOpen(event.currentTarget.open)}
            >
              <summary>
                Technical details
                <ChevronDown size={14} />
              </summary>
              {techOpen && (
                <div className="cds-tech-body">
                  {result.modelVersion && (
                    <p className="cds-muted">
                      Model: {result.modelVersion}
                      {result.pathway ? ` · pathway ${result.pathway}` : ''}
                      {result.treatmentContext ? ` · context ${result.treatmentContext}` : ''}
                    </p>
                  )}
                  {result.pgx?.genotypeAvailable && (
                    <p className="cds-muted">
                      CYP2D6 predicted: {result.pgx.predictedPhenotype || '—'}
                      {result.pgx.functionalPhenotype
                        ? ` · functional ${result.pgx.functionalPhenotype}`
                        : ''}
                      {result.pgx.activityScore != null ? ` · AS ${result.pgx.activityScore}` : ''}
                    </p>
                  )}
                  {result.doseGuidance && <p className="cds-muted">{result.doseGuidance}</p>}
                  {(result.explanation?.findings || []).length > 0 && (
                    <ul className="cds-tech-findings">
                      {result.explanation.findings.map((finding) => (
                        <li key={finding}>{finding}</li>
                      ))}
                    </ul>
                  )}
                  <ClinicalCalculations result={result} />
                </div>
              )}
            </details>
          </div>
        )}
      </div>
    </section>
  )
}
