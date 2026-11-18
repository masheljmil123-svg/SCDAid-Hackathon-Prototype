/**
 * v2.1 eligibility and pathway router.
 * Ported from SCDAid_v2.1_evidence_rebuild/simulation/rules.py.
 * Rules do not read model predictions. Avoid is never ranked.
 * Caution is never placed above an Eligible option.
 */

import { CONTEXTS, EQUIVALENCE_MARGIN, displayName, strategyDrug, strategyRoute } from './constants.js'
import { deriveContextFlags, priorFor } from './features.js'
import { predictStrategy } from './predict.js'

const RANK = { Eligible: 0, Caution: 1, Avoid: 2 }

const RENAL = [
  ['Morphine', 30, 'Avoid', 'eGFR <30: morphine-6/3-glucuronide accumulation (Owsiany 2019; Aronoff).'],
  ['Morphine', 60, 'Caution', 'eGFR 30–59: the morphine label says to start lower than normal and titrate slowly; a secondary table (Aronoff) gives 50–75% of the dose for GFR 10–50. SCDAid does not calculate a renal-adjusted morphine dose: clinician review.'],
  ['Codeine', 30, 'Avoid', 'eGFR <30: avoid codeine (Owsiany 2019; Aronoff).'],
  ['Codeine', 60, 'Caution', 'eGFR 30–59: codeine is not preferred. Aronoff is stricter and says not to use codeine at any level of renal impairment.'],
  ['Tramadol', 60, 'Caution', 'eGFR <60: reduced clearance. The tablet label for creatinine clearance <30 mL/min is every 12 hours, maximum 200 mg/day; the oral dose proposal applies that label rule. IV tramadol below 30 is not calculated.'],
  ['Hydromorphone', 60, 'Caution', 'eGFR <60: the hydromorphone injection label says to start at one-quarter to one-half of the usual starting dose; the opioid-naive IV dose proposal applies that label range. Clinician verification required.'],
  ['Oxycodone', 15, 'Avoid', 'eGFR <15: do not use oxycodone (Aronoff).'],
  ['Oxycodone', 60, 'Caution', 'eGFR <60: the oxycodone label says to start lower than usual and titrate carefully; a secondary table (Aronoff) gives 50% for GFR 10–50. SCDAid does not calculate a renal-adjusted oxycodone dose: clinician review.'],
]

const HEPATIC = {
  severe: [
    ['Codeine', 'Avoid', 'Severe hepatic impairment: codeine may not be converted to morphine (Aronoff).'],
    ['Tramadol', 'Caution', 'Severe hepatic impairment: the tramadol label gives 50 mg every 12 hours; the oral dose proposal applies it. IV tramadol is not calculated.'],
    ['Morphine', 'Caution', 'Severe hepatic impairment: the morphine label says start lower than normal and titrate slowly; a secondary table (Aronoff) doubles the dosing interval. SCDAid does not calculate a hepatic-adjusted morphine dose: clinician review.'],
    ['Hydromorphone', 'Caution', 'Severe hepatic impairment: not studied in the hydromorphone label, and higher exposure is expected. SCDAid does not calculate a dose: clinician review.'],
    ['Oxycodone', 'Caution', 'Severe hepatic impairment: the immediate-release oxycodone label says start lower than usual, with no number. SCDAid does not calculate a hepatic-adjusted oxycodone dose: clinician review.'],
  ],
  mild_mod: [
    ['Codeine', 'Caution', 'Hepatic impairment: activation is unpredictable (Aronoff, extrapolated).'],
    ['Tramadol', 'Caution', 'Hepatic impairment: reduced clearance (tramadol label, extrapolated). The label gives a dose only for severe impairment, so SCDAid does not calculate a dose: clinician review.'],
    ['Oxycodone', 'Caution', 'Hepatic impairment: the immediate-release oxycodone label says start lower than usual, with no number. SCDAid does not calculate a dose: clinician review.'],
  ],
}

function apply(candidate, level, text, flag) {
  if (RANK[level] > RANK[candidate.eligibility]) candidate.eligibility = level
  candidate.reasons.push(text)
  if (flag) candidate.safetyFlags.push(flag)
}

function contextForPain(score) {
  if (score >= 7 && score <= 10) return 'P'
  if (score >= 4 && score <= 6) return 'O'
  return null
}

export function classifyStrategies(form, pgx, contextId) {
  const flags = deriveContextFlags(form, pgx)
  const egfr = Number(form.egfr)
  const strategies = CONTEXTS[contextId].strategies
  return strategies.map((strategy) => {
    const drug = strategyDrug(strategy)
    const candidate = {
      id: strategy,
      strategy,
      drug,
      route: strategyRoute(strategy),
      name: displayName(strategy),
      eligibility: 'Eligible',
      reasons: [],
      safetyFlags: [],
    }
    const allergy = (form.allergies || []).some(
      (row) => !form.noKnownAllergy && String(row.drug || '').trim().toLowerCase() === drug.toLowerCase(),
    )
    if (allergy) apply(candidate, 'Avoid', 'Documented allergy or intolerance.', { type: 'allergy' })
    if (priorFor(form, drug) === 'Adverse') {
      apply(candidate, 'Caution', 'Previous adverse response.', { type: 'prior-adverse' })
    }

    let renalDone = false
    for (const [renalDrug, threshold, level, text] of RENAL) {
      if (renalDrug === drug && egfr < threshold && !renalDone) {
        apply(candidate, level, text, { type: 'renal', egfr })
        renalDone = true
      }
    }
    if (drug === 'Fentanyl' && (egfr < 15 || flags.dialysis === 1)) {
      apply(
        candidate,
        'Caution',
        'eGFR <15 or dialysis: cited guidance is to reduce the dose by about 50%. SCDAid does not calculate that dose.',
        { type: 'renal', egfr },
      )
    }
    if (drug === 'Fentanyl' && flags.cyp3a4Strong) {
      apply(candidate, 'Caution', 'Strong CYP3A4 inhibitor (fentanyl label boxed warning).', { type: 'cyp3a4' })
    }
    const hepaticRows = HEPATIC[flags.hepatic] || []
    for (const [hepaticDrug, level, text] of hepaticRows) {
      if (hepaticDrug === drug) apply(candidate, level, text, { type: 'hepatic', severity: flags.hepatic })
    }
    if (drug === 'Codeine' || drug === 'Tramadol') {
      if (flags.phenotype === 'PM') apply(candidate, 'Avoid', 'CYP2D6 functional poor metabolizer (CPIC).', { type: 'pgx' })
      else if (flags.phenotype === 'UM') apply(candidate, 'Avoid', 'CYP2D6 ultrarapid metabolizer (CPIC).', { type: 'pgx' })
      else if (flags.phenotype === 'IM') apply(candidate, 'Caution', 'CYP2D6 functional intermediate metabolizer (CPIC).', { type: 'pgx' })
      else if (flags.phenotype === '' && flags.inhibitorPresent) {
        apply(candidate, 'Caution', 'Genotype unavailable with CYP2D6 inhibitor exposure.', { type: 'pgx' })
      }
      if (flags.breastfeeding) apply(candidate, 'Avoid', 'Breastfeeding (product label).', { type: 'breastfeeding' })
    }
    if (drug === 'Tramadol') {
      if (flags.maoi) apply(candidate, 'Avoid', 'MAOI within 14 days (contraindicated).', { type: 'maoi' })
      if (flags.serotonergic) apply(candidate, 'Caution', 'Serotonergic co-medication (serotonin syndrome).', { type: 'serotonergic' })
      if (flags.seizureHistory) apply(candidate, 'Caution', 'Seizure history (seizure risk).', { type: 'seizure' })
    }
    return candidate
  })
}

function rulesKey(contextId, candidate, form) {
  const order = CONTEXTS[contextId].rulesOrder
  const prior = priorFor(form, candidate.drug)
  const tier = prior === 'Favorable' ? 0 : prior === 'Inadequate' ? 2 : 1
  return tier * 10 + order.indexOf(candidate.strategy)
}

function classAlerts(flags) {
  const alerts = []
  if (flags.cnsDepressant) {
    alerts.push('CNS depressant co-medication: opioid boxed warning. This is a class-wide monitoring alert and does not change eligibility.')
  }
  if (flags.osa) {
    alerts.push('Obstructive sleep apnoea: continuous respiratory monitoring. This is a class-wide alert and does not change eligibility.')
  }
  return alerts
}

function clinicalConflicts(form, flags, evaluated) {
  const conflicts = []
  conflicts.push(
    'The previous website marked every opioid Caution for a CNS depressant and for eGFR <60 except fentanyl. v2.1 uses drug-specific renal and hepatic tiers, and keeps CNS depressants and OSA as class-wide alerts.',
  )
  const tramadol = evaluated.find((item) => item.drug === 'Tramadol')
  if (tramadol && Number(form.egfr) < 30 && tramadol.eligibility === 'Caution') {
    conflicts.push(
      'Unresolved: tramadol at eGFR <30 is Caution in v2.1 because the product label describes dose adjustment. A prior SCDAid clinical reference said Avoid. This integration follows the verified v2.1 rule and does not hide the conflict.',
    )
  }
  if (flags.homeOme != null && ((flags.homeOme >= 60 && flags.opioidTolerant === 0) || (flags.homeOme < 60 && flags.opioidTolerant === 1 && !form.noBaselineOpioid))) {
    conflicts.push(
      'The entered opioid-tolerance answer does not match the FDA 60 mg oral-morphine-equivalent threshold used in the v2.1 simulation. The clinician-entered tolerance flag was sent to the model and was not overwritten.',
    )
  }
  if (flags.hepatic === 'not_assessed') {
    conflicts.push(
      'Hepatic impairment was not classified. v2.1 hepatic Avoid/Caution rules were not applied. Liver-test values alone are not used to invent a severity.',
    )
  }
  const oralRenal = evaluated.filter((item) => item.route === 'Oral' && item.eligibility !== 'Eligible')
  if (oralRenal.length === evaluated.length && evaluated.some((item) => item.route === 'Oral') && Number(form.egfr) < 60) {
    conflicts.push(
      'The oral module has no Eligible option once eGFR is below 60 under v2.1 rules. This is a known evidence gap, not a hidden dose recommendation.',
    )
  }
  return conflicts
}

function doseExcerpts(items) {
  const lines = []
  for (const item of items) {
    for (const reason of item.reasons) {
      if (/dose|interval|maximum|every 12|50%|50–75|one-third/i.test(reason)) {
        lines.push(`${item.name}: ${reason}`)
      }
    }
  }
  if (lines.length === 0) {
    return 'No cited renal or hepatic dose-adjustment excerpt applies to the current options. Any proposed dose is shown under Clinical calculations and must be verified by a clinician.'
  }
  return `${lines.join(' ')} These are cited label or reference excerpts from the v2.1 rule engine. Proposed doses and their status are shown under Clinical calculations; none is a prescription.`
}

export function buildV21Recommendation(form, pgx) {
  const pain = Number(form.baselinePainScore)
  const flags = deriveContextFlags(form, pgx)
  const conflicts = []
  let pathway = 'ranked'
  let contextId = contextForPain(pain)
  if (pain >= 1 && pain <= 3) pathway = 'non_opioid'
  if (flags.respCompromise) pathway = 'urgent_review_resp'
  if (flags.pregnant) pathway = 'obstetric_review'
  if (pain === 0 || pain > 10 || Number.isNaN(pain)) pathway = 'outside_scale'

  const empty = (message) => ({
    pathway,
    contextId,
    context: contextId ? CONTEXTS[contextId] : null,
    evaluated: [],
    preferred: null,
    alternatives: [],
    classAlerts: classAlerts(flags),
    clinicalConflicts: conflicts,
    doseGuidance: 'No opioid ranking was produced, so no dose was proposed.',
    blockedMessage: message,
    predictionLabel: null,
    predictionNote: 'Simulation-based proof-of-concept. Not clinically validated.',
  })

  if (pathway === 'obstetric_review') {
    return empty('Pregnancy: obstetric or specialist review. Opioid ranking is not used.')
  }
  if (pathway === 'urgent_review_resp') {
    return empty('Respiratory compromise: urgent clinician review. Opioid ranking is not used.')
  }
  if (pathway === 'non_opioid') {
    return empty('Mild pain (NRS 1–3): non-opioid analgesia pathway. Opioid ranking is not used.')
  }
  if (pathway === 'outside_scale') {
    return empty('Baseline pain is outside the v2.1 mild, moderate, and severe pathways. No ranking was produced.')
  }
  const egfrEntered = form.egfr === '' || form.egfr === null || form.egfr === undefined ? NaN : Number(form.egfr)
  if (!Number.isFinite(egfrEntered) || egfrEntered < 0) {
    // Number('') is 0, which would silently apply the eGFR <15 rules. Missing renal data stops ranking instead.
    pathway = 'renal_data_missing'
    return empty('eGFR is missing or invalid, so renal safety cannot be assessed. No opioid ranking was produced. Enter eGFR, or serum creatinine with age and sex.')
  }

  const evaluated = classifyStrategies(form, pgx, contextId)
  conflicts.push(...clinicalConflicts(form, flags, evaluated))
  const eligible = evaluated.filter((item) => item.eligibility === 'Eligible')
  const caution = evaluated.filter((item) => item.eligibility === 'Caution')
  const avoid = evaluated.filter((item) => item.eligibility === 'Avoid')

  if (eligible.length === 0) {
    return {
      pathway: 'urgent_review_no_eligible',
      contextId,
      context: CONTEXTS[contextId],
      evaluated: [...caution, ...avoid],
      preferred: null,
      alternatives: [...caution, ...avoid],
      classAlerts: classAlerts(flags),
      clinicalConflicts: conflicts,
      doseGuidance: doseExcerpts([...caution, ...avoid]),
      blockedMessage: 'No suitable opioid — clinical review required. No Eligible option remains after the v2.1 rules.',
      predictionLabel: CONTEXTS[contextId].outcomeLabel,
      predictionNote: CONTEXTS[contextId].outcomeNote,
    }
  }

  const scored = eligible.map((item) => {
    const raw = predictStrategy(contextId, form, pgx, item.strategy)
    return {
      ...item,
      predictedDeltaPain60Raw: raw,
      predictedDeltaPain60: Math.round(raw * 100) / 100,
      mlRanked: eligible.length >= 2,
    }
  })

  let orderedEligible = [...scored].sort((a, b) => b.predictedDeltaPain60Raw - a.predictedDeltaPain60Raw)
  let equivalenceApplied = false
  if (scored.length >= 2) {
    const best = orderedEligible[0].predictedDeltaPain60Raw
    const second = orderedEligible[1].predictedDeltaPain60Raw
    if (best - second < EQUIVALENCE_MARGIN) {
      equivalenceApplied = true
      const within = scored.filter((item) => best - item.predictedDeltaPain60Raw < EQUIVALENCE_MARGIN)
      within.sort((a, b) => rulesKey(contextId, a, form) - rulesKey(contextId, b, form))
      const rest = scored
        .filter((item) => best - item.predictedDeltaPain60Raw >= EQUIVALENCE_MARGIN)
        .sort((a, b) => b.predictedDeltaPain60Raw - a.predictedDeltaPain60Raw)
      orderedEligible = [...within, ...rest]
    }
  } else {
    orderedEligible = scored
  }

  const unranked = [...caution, ...avoid].map((item) => ({
    ...item,
    predictedDeltaPain60: null,
    predictedDeltaPain60Raw: null,
    mlRanked: false,
    note: item.reasons.join(' '),
  }))
  const ranked = orderedEligible.map((item) => ({
    ...item,
    note: item.reasons.length ? item.reasons.join(' ') : 'Eligible. No v2.1 exclusion rule fired.',
  }))
  const preferred = ranked[0]
  preferred.equivalenceApplied = equivalenceApplied
  const alternatives = [...ranked.slice(1), ...unranked]

  if (avoid.some((item) => ranked.some((row) => row.strategy === item.strategy))) {
    throw new Error('Avoid option entered the ranked list.')
  }
  if (ranked.some((item, index) => item.eligibility !== 'Eligible' || (index > 0 && ranked[index - 1].eligibility === 'Caution'))) {
    throw new Error('Caution was ranked above Eligible.')
  }

  return {
    pathway: eligible.length === 1 ? 'single_eligible' : 'ranked',
    contextId,
    context: CONTEXTS[contextId],
    evaluated: [...ranked, ...unranked],
    preferred,
    alternatives,
    classAlerts: classAlerts(flags),
    clinicalConflicts: conflicts,
    doseGuidance: doseExcerpts([...ranked, ...caution]),
    blockedMessage: null,
    equivalenceApplied,
    predictionLabel: CONTEXTS[contextId].outcomeLabel,
    predictionNote: CONTEXTS[contextId].outcomeNote,
  }
}
