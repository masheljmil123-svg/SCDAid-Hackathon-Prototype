/**
 * SCDAid recommendation assembler.
 * Verified rule modules: CYP2D6, phenoconversion, clinical safety.
 * Treatment-response ranking uses the verified v2.1 Linear Regression export
 * via buildV21Recommendation → predictStrategy (not FastAPI/joblib).
 * Simulation-based proof-of-concept. Not clinically validated.
 *
 * Dose proposals come from the separate rule-based dosing module (proposeDoses /
 * calculateDose) and are not produced by the v2.1 Linear Regression scorer.
 */

import { calculateCYP2D6ActivityScore } from '../logic/cyp2d6.js'
import { applyPhenoconversion } from '../logic/phenoconversion.js'
import { buildV21Recommendation } from '../logic/v21/rules.js'
import { formForRecommendation, proposeDoses, renalStatus } from '../logic/calc/apply.js'

export const LOADING_STEPS = [
  'Analyzing patient data...',
  'Evaluating organ function...',
  'Screening medications and interactions...',
  'Assessing CYP2D6 pharmacogenomics...',
  'Applying clinical safety rules...',
  'Ranking rankable opioid strategies...',
]

export const EVALUATION_DISCLAIMER =
  'Simulation-based proof-of-concept. Performance reflects recovery of an evidence-informed synthetic simulation and does not establish clinical predictive validity.'

const ML_UNAVAILABLE =
  'The verified v2.1 model could not score this assessment. No prediction was invented. Safety routing is still shown.'

function inhibitionRiskAlert(conversion) {
  if (!conversion.inhibitionRisk) return null

  const agents =
    conversion.inhibitorAgents.length > 0 ? ` (${conversion.inhibitorAgents.join(', ')})` : ''

  return {
    title: 'CYP2D6 Functional Inhibition Risk Alert',
    message: `Genotype is unavailable. Relevant ${conversion.inhibitorExposure.toLowerCase()} CYP2D6 inhibitor exposure was detected${agents}. Functional inhibition risk is flagged without assigning a phenotype.`,
  }
}

export function buildPgx(form) {
  const genotypeAvailable = form.genotypeAvailable === 'Yes'
  const medications = form.medications || []

  if (!genotypeAvailable) {
    const conversion = applyPhenoconversion({
      genotypeAvailable: false,
      activityScore: null,
      predictedPhenotype: null,
      medications,
    })

    return {
      genotypeAvailable: false,
      activityScore: null,
      predictedPhenotype: null,
      adjustedScore: null,
      functionalPhenotype: null,
      phenoconversion: false,
      inhibitorExposure: conversion.inhibitorExposure,
      inhibitorAgents: conversion.inhibitorAgents,
      inhibitionRisk: inhibitionRiskAlert(conversion),
      error: null,
      apiFunctionalPhenotype: null,
    }
  }

  const genotype = calculateCYP2D6ActivityScore({
    allele1: form.allele1,
    allele2: form.allele2,
    hasCnv: form.hasCnv,
    copyNumber: form.copyNumber,
    duplicatedAllele: form.duplicatedAllele,
  })

  if (genotype.error) {
    return {
      genotypeAvailable: true,
      activityScore: null,
      predictedPhenotype: null,
      adjustedScore: null,
      functionalPhenotype: null,
      phenoconversion: false,
      inhibitorExposure: 'None',
      inhibitorAgents: [],
      inhibitionRisk: null,
      error: genotype.error,
      apiFunctionalPhenotype: null,
    }
  }

  const conversion = applyPhenoconversion({
    genotypeAvailable: true,
    activityScore: genotype.activityScore,
    predictedPhenotype: genotype.predictedPhenotype,
    medications,
  })

  const relevantInhibitor = conversion.inhibitorExposure !== 'None'

  return {
    genotypeAvailable: true,
    activityScore: genotype.activityScore,
    predictedPhenotype: genotype.predictedPhenotype,
    adjustedScore: relevantInhibitor ? conversion.adjustedActivityScore : null,
    functionalPhenotype: relevantInhibitor ? conversion.functionalPhenotype : null,
    phenoconversion: Boolean(conversion.phenoconversion),
    inhibitorExposure: conversion.inhibitorExposure,
    inhibitorAgents: conversion.inhibitorAgents,
    inhibitionRisk: null,
    error: conversion.error,
    apiFunctionalPhenotype: conversion.error ? null : conversion.functionalPhenotype,
  }
}

export function previousResponseFor(form, opioidName) {
  const target = String(opioidName || '')
    .trim()
    .toLowerCase()
  const row = (form.previousResponses || []).find(
    (item) => String(item.opioid || '').trim().toLowerCase() === target && item.response,
  )
  return row?.response || 'Unknown'
}

function buildRuleBasedFindings(form, pgx, safety, decision, preferred) {
  const findings = []

  if (decision?.context) findings.push(`Clinical pathway: ${decision.context.label}.`)
  if (decision?.pathway === 'single_eligible' && preferred) {
    findings.push(`${preferred.name} is the only Eligible option. It was not chosen by comparing model scores.`)
  } else if (preferred && decision?.equivalenceApplied) {
    findings.push(
      `${preferred.name} was selected because the top simulated predictions were within the 1.0-point equivalence margin, so the prespecified rules order was used.`,
    )
  } else if (preferred?.mlRanked) {
    findings.push(
      `${preferred.name} has the highest simulated prediction among Eligible options in this pathway.`,
    )
  }

  if (pgx.error) {
    findings.push(`CYP2D6 genotype could not be interpreted: ${pgx.error}`)
  } else if (pgx.predictedPhenotype) {
    findings.push(`Genotype-predicted CYP2D6 phenotype: ${pgx.predictedPhenotype}.`)
    if (pgx.functionalPhenotype && pgx.phenoconversion) {
      findings.push(
        `Functional CYP2D6 phenotype after inhibitor adjustment: ${pgx.functionalPhenotype}.`,
      )
    }
  } else if (pgx.genotypeAvailable === false) {
    findings.push('CYP2D6 genotype was not available.')
  }

  if (pgx.inhibitorExposure && pgx.inhibitorExposure !== 'None') {
    const agents = pgx.inhibitorAgents.length > 0 ? ` (${pgx.inhibitorAgents.join(', ')})` : ''
    findings.push(`${pgx.inhibitorExposure} CYP2D6 inhibitor exposure${agents}.`)
  }

  if (pgx.inhibitionRisk) {
    findings.push(pgx.inhibitionRisk.message)
  }

  if (safety?.renal) findings.push(safety.renal.message)

  if (safety.hepatic?.message) {
    findings.push(safety.hepatic.message)
  }

  if (safety.interaction) {
    findings.push(safety.interaction.message)
  }

  if (safety.allergy) {
    findings.push(safety.allergy.message)
  }

  const avoided = (decision?.evaluated || []).filter((item) => item.eligibility === 'Avoid')
  if (avoided.length > 0) {
    findings.push(`Not recommended and not ranked: ${avoided.map((item) => item.name).join(', ')}.`)
  }
  if ((decision?.classAlerts || []).length) findings.push(...decision.classAlerts)
  if ((decision?.clinicalConflicts || []).length) {
    findings.push(...decision.clinicalConflicts.map((item) => `Clinical-rule note: ${item}`))
  }

  const previous = (form.previousResponses || []).filter((row) => row.opioid && row.response)
  if (previous.length > 0) {
    findings.push(
      `Documented previous responses: ${previous
        .map((row) => `${row.opioid} (${row.response})`)
        .join('; ')}.`,
    )
  } else {
    findings.push('No documented previous opioid response was entered.')
  }

  return findings
}

function renalCard(renalHit, renal, form) {
  if (!renal) {
    return renalHit
      ? {
          title: renalHit.egfr < 30 ? 'Severe Renal Review' : 'Renal Safety Alert',
          message: `eGFR ${form.egfr} mL/min/1.73m². Drug-specific v2.1 renal tiers were applied.`,
        }
      : null
  }
  let title = 'Renal function'
  if (renal.unstable) title = 'Acute Kidney Injury — Clinician Review'
  else if (renal.dialysis) title = 'Dialysis — Clinician Review'
  else if (renal.egfrSource === 'missing') title = 'Renal Data Missing'
  else if (renalHit) title = renalHit.egfr < 30 ? 'Severe Renal Review' : 'Renal Safety Alert'
  const tiers = renalHit ? ['Drug-specific v2.1 renal tiers were applied.'] : []
  const [first, ...rest] = renal.messages
  return { title, message: [first, ...tiers, ...rest].filter(Boolean).join(' ') }
}

function safetyFromDecision(form, decision, renal = null) {
  const renalHit = (decision.evaluated || [])
    .flatMap((item) => item.safetyFlags || [])
    .find((flag) => flag.type === 'renal')
  const allergyHits = (decision.evaluated || []).filter((item) =>
    (item.safetyFlags || []).some((flag) => flag.type === 'allergy'),
  )
  return {
    renal: renalCard(renalHit, renal, form),
    hepatic: {
      title: 'Hepatic Assessment',
      message:
        form.hepaticImpairment === 'severe'
          ? 'Clinician classified hepatic impairment as severe. Drug-specific v2.1 rules were applied.'
          : form.hepaticImpairment === 'mild_mod'
            ? 'Clinician classified hepatic impairment as mild or moderate. Drug-specific v2.1 rules were applied.'
            : form.hepaticImpairment === 'none'
              ? 'Clinician classified hepatic impairment as none.'
              : 'Hepatic impairment was not classified. Liver-test values were not converted into a severity.',
    },
    interaction: (decision.classAlerts || []).length
      ? { title: 'Class-wide monitoring alert', message: decision.classAlerts.join(' ') }
      : null,
    allergy: allergyHits.length
      ? {
          title: 'Allergy / Intolerance Alert',
          message: allergyHits.map((item) => `${item.name}: documented allergy or intolerance.`).join(' '),
        }
      : null,
  }
}

const DIALYSIS_HOLD =
  'Dialysis: clinician review required. SCDAid does not make an automatic opioid recommendation for patients on dialysis (temporary safety hold until dialysis-specific rules are approved). The eligibility levels below come from the unchanged v2.1 eGFR rules and are shown for information only, without a ranking.'

// Temporary hold (approved 2026-11-13): no final recommendation on dialysis.
// Eligibility levels and model scores are computed as before and are not changed;
// only the ranked recommendation is withheld from display.
function holdForDialysis(decision) {
  const order = { Eligible: 0, Caution: 1, Avoid: 2 }
  const listed = [...(decision.evaluated || [])]
    .sort((a, b) => order[a.eligibility] - order[b.eligibility])
    .map((item) => ({
      ...item,
      predictedDeltaPain60: null,
      mlRanked: false,
      note: item.note || item.reasons.join(' ') || 'Eligible under the v2.1 eGFR rules. Not ranked: dialysis hold.',
    }))
  return {
    ...decision,
    pathway: 'dialysis_review',
    preferred: null,
    alternatives: listed,
    evaluated: listed,
    blockedMessage: DIALYSIS_HOLD,
    equivalenceApplied: false,
    doseGuidance: decision.doseGuidance,
  }
}

function finalizeRecommendation(form, pgx, decision, extra = {}) {
  const preferred = extra.preferred === undefined ? decision.preferred : extra.preferred
  const alternatives = extra.alternatives || decision.alternatives || []
  const evaluated = extra.evaluated || decision.evaluated || []
  const renal = extra.renal || null
  const safety = safetyFromDecision(form, { ...decision, evaluated }, renal)
  const context = decision.context
  const held = decision.pathway === 'dialysis_review'
  const renalAlert = renal?.reviewRequired
    ? `Clinician review of kidney function is required${held ? '' : ' before using this recommendation'}. ${renal.reviewReasons.join(' ')}${renal.unstable || renal.dialysis ? ' No renal-dependent dose was calculated.' : ''}${held ? ' No automatic opioid recommendation is made for patients on dialysis.' : ' The ranking below is provisional and was not changed automatically.'}`
    : null
  const doseGuidance =
    renal?.unstable || renal?.dialysis
      ? `${renal.unstable ? 'AKI detected or suspected' : 'Dialysis'}: no renal-dependent dose was calculated; clinician review required. ${decision.doseGuidance}`
      : decision.doseGuidance

  return {
    generatedAt: new Date().toISOString(),
    modelVersion: 'SCDAid v2.1 Linear Regression',
    pathway: decision.pathway,
    treatmentContext: decision.contextId,
    error: null,
    mlError: extra.mlError || null,
    blockedMessage: extra.blockedMessage || decision.blockedMessage || null,
    renalAlert,
    renalReviewRequired: Boolean(renal?.reviewRequired),
    renalStatus: renal,
    disclaimer: EVALUATION_DISCLAIMER,
    hepaticAssessment: { status: form.hepaticImpairment || 'not_assessed', message: safety.hepatic.message },
    preferred: preferred
      ? {
          ...preferred,
          subtitle: `${preferred.mlRanked ? 'Highest simulated prediction among Eligible options' : 'Only Eligible option in this pathway'}${renal?.reviewRequired ? ' · provisional: kidney-function review required' : ''}`,
        }
      : null,
    alternatives,
    evaluated,
    pgx,
    safety,
    doseGuidance,
    clinicalConflicts: decision.clinicalConflicts || [],
    prediction: {
      label: decision.predictionLabel || 'Simulated pain reduction',
      value: preferred?.predictedDeltaPain60 != null ? `${preferred.predictedDeltaPain60} points` : 'Not applicable',
      note: decision.predictionNote,
    },
    explanation: {
      title: 'Why SCDAid Recommended This',
      disclaimer:
        'The items below combine the v2.1 pathway, eligibility rules, and simulated prediction. They are not SHAP values and are not clinical validation.',
      findings: buildRuleBasedFindings(form, pgx, safety, decision, preferred),
    },
    followUp: {
      title: 'Recommended Pain Reassessment',
      timing: context?.followUpTiming || 'Reassess after clinician review',
      message: context?.followUpMessage || 'No opioid ranking was produced for this pathway.',
    },
    context: {
      age: form.age || null,
      sex: form.sex || null,
      weight: form.weight || null,
      bmi: form.bmi || null,
      scdGenotype: form.scdGenotype || null,
      vocHistory: form.vocHistory || null,
      comorbidities: form.comorbidities || [],
      baselinePainScore: form.baselinePainScore,
      opioidTolerance: form.opioidTolerance,
      previousResponses: form.previousResponses || [],
      medicationCount: (form.medications || []).length,
      pathway: decision.pathway,
      treatmentContext: decision.contextId,
    },
  }
}

const BLOCKED_DOSE_PATHWAYS = new Set([
  'dialysis_review',
  'obstetric_review',
  'urgent_review_resp',
  'non_opioid',
  'urgent_review_no_eligible',
  'outside_scale',
  'renal_data_missing',
  'error',
])

/** Drop Avoid rows and blank out proposals on blocked pathways for public display. */
export function dosesForDisplay(result) {
  if (!result) return []
  if (BLOCKED_DOSE_PATHWAYS.has(result.pathway) || result.blockedMessage) return []
  return (result.doseProposals || []).filter((item) => item.eligibility !== 'Avoid')
}

export async function buildRecommendation(form = {}) {
  const prepared = formForRecommendation(form)
  const working = prepared.form
  const pgx = buildPgx(working)
  const renal = renalStatus(working, prepared.calculations, prepared.calculations.egfrApplied)
  try {
    const decision = buildV21Recommendation(working, pgx)
    if (decision.preferred?.eligibility === 'Avoid' || (decision.evaluated || []).some((item, index, all) => {
      const firstCaution = all.findIndex((row) => row.eligibility === 'Caution')
      return item.eligibility === 'Eligible' && firstCaution !== -1 && index > firstCaution
    })) {
      throw new Error('Eligibility ordering failed.')
    }
    const shown = renal.dialysis && (decision.evaluated || []).length ? holdForDialysis(decision) : decision
    // Dose module reads eligibility/pathway only; it does not alter v2.1 rankings.
    const doseProposals = proposeDoses(working, pgx, decision)
    return {
      ...finalizeRecommendation(working, pgx, shown, { renal }),
      calculations: prepared.calculations,
      doseProposals,
    }
  } catch (error) {
    return {
      ...finalizeRecommendation(
        working,
        pgx,
        {
          pathway: 'error',
          contextId: null,
          context: null,
          evaluated: [],
          preferred: null,
          alternatives: [],
          classAlerts: [],
          clinicalConflicts: [],
          doseGuidance: 'No dose was calculated.',
          blockedMessage: null,
          predictionLabel: 'Simulated pain reduction',
          predictionNote: 'Simulation-based proof-of-concept. Not clinically validated.',
        },
        {
          preferred: null,
          alternatives: [],
          evaluated: [],
          mlError: error?.message ? `${ML_UNAVAILABLE} ${error.message}` : ML_UNAVAILABLE,
          renal,
        },
      ),
      calculations: prepared.calculations,
      doseProposals: [],
    }
  }
}
