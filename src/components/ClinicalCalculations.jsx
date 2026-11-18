import { DOSE_DISCLAIMER } from '../logic/calc/dose.js'
import { dosesForDisplay } from '../data/recommendation.js'

function formatDose(proposal) {
  if (proposal.dose === null || proposal.dose === undefined) {
    return proposal.reason || proposal.status || 'Not calculated'
  }
  const range = proposal.dose_range ? ` (range ${proposal.dose_range.join('–')} ${proposal.unit})` : ''
  return `${proposal.dose} ${proposal.unit}${range}`
}

function formatProposalLine(proposal) {
  const parts = [formatDose(proposal)]
  if (proposal.interval) parts.push(proposal.interval)
  if (proposal.max_daily_mg) parts.push(`max ${proposal.max_daily_mg} mg/day`)
  return parts.join(' · ')
}

export function ClinicalCalculations({ result }) {
  const calculations = result?.calculations
  const proposals = dosesForDisplay(result)
  if (!calculations?.lines?.length && !calculations?.egfrApplied && proposals.length === 0) {
    return null
  }

  return (
    <section className="results-block calc-panel calc-panel--nested">
      <h2 className="results-block-title">Clinical calculations</h2>
      <p className="field-hint">
        Rule-based calculations for this fictional scenario. {DOSE_DISCLAIMER}
      </p>
      {calculations?.egfrApplied && (
        <p className="field-hint">
          The eGFR field was empty, so CKD-EPI 2021 ({calculations.egfrDisplay} mL/min/1.73 m²) was
          used for this recommendation. You can replace it.
        </p>
      )}
      {(calculations?.lines || []).length > 0 && (
        <ul className="calc-list">
          {(calculations.lines || []).map((line) => (
            <li key={line.id + line.label}>
              <strong>
                {line.id} · {line.label}
              </strong>
              <span>{line.text}</span>
              {line.note && <em>{line.note}</em>}
              {line.flags?.length > 0 && <em>{line.flags.join(', ')}</em>}
              {line.references?.length > 0 && <small>{line.references.join(', ')}</small>}
            </li>
          ))}
        </ul>
      )}
      {proposals.length > 0 && (
        <>
          <h3>Rule-based dose proposals</h3>
          <p className="field-hint">
            Separate from the v2.1 AI ranking. Avoid-classified options and blocked pathways are
            omitted.
          </p>
          <ul className="calc-list">
            {proposals.map((proposal) => (
              <li key={proposal.drug_route || proposal.name}>
                <strong>
                  {proposal.name} · {proposal.eligibility}
                  {proposal.drug_route ? ` · ${String(proposal.drug_route).replace('_', ' ')}` : ''}
                </strong>
                <span>{formatProposalLine(proposal)}</span>
                {proposal.status && <em>{proposal.status}</em>}
                {proposal.reason && <em>{proposal.reason}</em>}
                {proposal.flags?.length > 0 && <em>{proposal.flags.join(', ')}</em>}
                {proposal.rules?.length > 0 && <small>Rules: {proposal.rules.join(', ')}</small>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
