/**
 * SCDAid dose proposals from DOSE_CALCULATION_SPEC.md v0.1.
 * Research proof of concept. Every dose is a proposal, not an order.
 * The v2.1 rule engine tier and pathway are read and never changed.
 * D8 (IV fentanyl) stays disabled. Other APR defaults match the test file
 * and are marked pending approval.
 * Renal safety update 2026-11-13: AKI (detected or suspected) and dialysis stop
 * every calculation for clinician review; R1 and R3 no longer apply a factor.
 * Hepatic safety update 2026-11-13: H1 and H3 stop for clinician review; H2 applies to
 * mild/moderate only (severe stops, H2S); TO4 applies to severe only (mild/moderate, TO4M).
 */

const EPS = 1e-9

export const DOSE_DISCLAIMER =
  'Research proof of concept. Proposed dose only — verify before prescribing. Not an approved prescription.'

const CONTEXT = {
  MORPHINE_IV: 'IV',
  HYDROMORPHONE_IV: 'IV',
  FENTANYL_IV: 'IV',
  TRAMADOL_IV: 'IV',
  MORPHINE_PO: 'ORAL',
  OXYCODONE_PO: 'ORAL',
  CODEINE_PO: 'ORAL',
  TRAMADOL_PO: 'ORAL',
}

const MME = { MORPHINE: 1, OXYCODONE: 1.5, HYDROMORPHONE: 5, CODEINE: 0.15, TRAMADOL: 0.2 }
const NON_RANKING = new Set([
  'obstetric_review',
  'urgent_review_resp',
  'non_opioid',
  'urgent_review_no_eligible',
  'outside_scale',
])

function roundDown(value, step) {
  const units = Math.floor((value + EPS) / step)
  return Number((units * step).toFixed(4))
}

function fitRange(low, high, step) {
  const lo = Math.ceil((low - EPS) / step) * step
  const hi = Math.floor((high + EPS) / step) * step
  if (lo - hi > EPS) return null
  return [Number(lo.toFixed(4)), Number(hi.toFixed(4))]
}

function round3(value) {
  return Math.round(value * 1000) / 1000
}

function blank(input) {
  return {
    drug_route: input.drug_route,
    status: null,
    dose: null,
    unit: input.drug_route === 'FENTANYL_IV' ? 'mcg' : 'mg',
    dose_range: null,
    interval: null,
    max_daily_mg: null,
    escalation_dose: null,
    maintenance_range: null,
    maintenance_interval: null,
    rules: [],
    flags: [],
    confirmations: [],
    references: [],
    trace: {},
    home_mme_mg_day: null,
    opioid_tolerant_fda: false,
    disclaimer: DOSE_DISCLAIMER,
    approval: 'pending_approval',
    reason: null,
  }
}

function stop(out, status, rule) {
  out.status = status
  out.rules.push(rule)
  return out
}

function quantifiable(row) {
  const drug = String(row?.drug || '').toUpperCase()
  const route = String(row?.route || 'PO').toUpperCase()
  const formulation = String(row?.formulation || '')
  if (['METHADONE', 'BUPRENORPHINE'].includes(drug)) return false
  if (route && route !== 'PO' && route !== 'ORAL') return false
  if (/transdermal|extended/i.test(formulation)) return false
  if (row?.mg_per_day_max === null || row?.mg_per_day_max === undefined || row?.mg_per_day_max === '') return false
  if (!MME[drug]) return false
  return true
}

function fdaTolerant(rows, total) {
  const specific = rows.some((row) => {
    const drug = String(row.drug || '').toUpperCase()
    const days = Number(row.days_regular)
    const amount = Number(row.mg_per_day_max)
    const threshold = drug === 'MORPHINE' ? 60 : drug === 'OXYCODONE' ? 30 : drug === 'HYDROMORPHONE' ? 8 : null
    return threshold !== null && amount + EPS >= threshold && days + EPS >= 7
  })
  const allWeek = rows.length > 0 && rows.every((row) => Number(row.days_regular) + EPS >= 7)
  return specific || (total + EPS >= 60 && allWeek)
}

function addSafetyFlags(input, out) {
  if (input.cns_depressant) {
    out.flags.push('BOXED_WARNING_CNS_DEPRESSANT')
    out.confirmations.push('CONFIRM_CNS_DEPRESSANT')
  }
  if (input.osa) out.flags.push('OSA_CONTINUOUS_MONITORING')
  if (input.cyp3a4_strong_inhibitor && input.drug_route === 'OXYCODONE_PO') {
    out.flags.push('CYP3A4_INHIBITOR_OXYCODONE')
    out.confirmations.push('CONFIRM_INTERACTION')
  }
  if (input.cyp3a4_strong_inhibitor && input.drug_route === 'FENTANYL_IV') {
    out.flags.push('CYP3A4_INHIBITOR_FENTANYL')
    out.confirmations.push('CONFIRM_INTERACTION')
  }
  if (Number(input.patient?.age_years) >= 65) out.flags.push('AGE_65_START_LOW')
  if (Number(input.patient?.age_years) > 75 && String(input.drug_route).includes('TRAMADOL')) {
    out.confirmations.push('CONFIRM_AGE_75')
  }
}

function doseFactors(input) {
  const drug = input.drug_route
  const egfr = input.renal?.egfr
  const hepatic = input.hepatic
  const factors = []
  // R1 (morphine x0.50-0.75) and R3 (oxycodone x0.50) were removed on 2026-11-13.
  // Their only numeric source is a secondary table (Aronoff 1999 via UF) written for
  // GFR 10-50, and they were applied from eGFR <60. The current morphine and
  // oxycodone labels give no number ("lower than normal/usual dosage"). These drugs
  // now return NOT_CALCULATED_CLINICIAN_REVIEW below eGFR 60 (see renalReview).
  // R2 stays: the hydromorphone injection label (rev. 6/2026, sections 2.4 and 8.7)
  // states "one-fourth to one-half the usual starting dose" in renal impairment.
  if (drug === 'HYDROMORPHONE_IV' && egfr !== null && egfr !== undefined && egfr < 60) {
    factors.push({ id: 'R2', lo: 0.25, hi: 0.5 })
  }
  // Hepatic safety update 2026-11-13. H1 (morphine interval x2) and H3 (oxycodone 1/3-1/2)
  // are no longer applied: the morphine injection and immediate-release oxycodone labels say
  // only "lower than normal/usual dosage" (H3's fraction is from the extended-release label).
  // Those cases stop for clinician review (see hepaticReview). H2 stays for mild/moderate
  // impairment: hydromorphone injection label sections 2.3 and 8.6, "one-fourth to one-half".
  if (drug === 'HYDROMORPHONE_IV' && hepatic === 'mild_mod') {
    factors.push({ id: 'H2', lo: 0.25, hi: 0.5 })
  }
  return factors
}

const HEPATIC_REVIEW = {
  H1: 'Hepatic impairment: the morphine label says start lower than normal and titrate slowly, with no number. No hepatic-adjusted dose is calculated. Clinician review.',
  H2S: 'Severe hepatic impairment: not studied in the hydromorphone label, and higher exposure is expected than in moderate impairment. No dose is calculated. Clinician review.',
  H3: 'Hepatic impairment: the immediate-release oxycodone label says start lower than usual, with no number. No hepatic-adjusted dose is calculated. Clinician review.',
  TO4M: 'Mild or moderate hepatic impairment: the tramadol label gives a dose only for severe impairment. No dose is calculated. Clinician review.',
}

function hepaticReview(input) {
  const drug = input.drug_route
  const hepatic = input.hepatic
  const impaired = hepatic === 'mild_mod' || hepatic === 'severe'
  if ((drug === 'MORPHINE_IV' || drug === 'MORPHINE_PO') && impaired) return 'H1'
  if (drug === 'HYDROMORPHONE_IV' && hepatic === 'severe') return 'H2S'
  if (drug === 'OXYCODONE_PO' && impaired) return 'H3'
  if (drug === 'TRAMADOL_PO' && hepatic === 'mild_mod') return 'TO4M'
  return null
}

function renalReview(input) {
  const drug = input.drug_route
  const egfr = input.renal?.egfr
  if (egfr === null || egfr === undefined || !(egfr < 60)) return null
  if (drug === 'MORPHINE_IV' || drug === 'MORPHINE_PO') return 'R1'
  if (drug === 'OXYCODONE_PO') return 'R3'
  return null
}

function applyOrgan(input, out, base, step) {
  const factors = doseFactors(input)
  const changing = factors.filter((item) => !item.intervalOnly && (item.lo !== 1 || item.hi !== 1))
  for (const item of factors) out.rules.push(item.id)
  if (factors.some((item) => item.id === 'H1' || item.id === 'H3' || item.id === 'H2')) {
    out.confirmations.push('CONFIRM_HEPATIC')
  }
  if (factors.some((item) => item.id === 'H1')) out.flags.push('HEPATIC_SEVERE_INTERVAL_X2')
  if (changing.length > 1) {
    out.flags.push('RENAL_AND_HEPATIC_NOT_STACKED')
    out.confirmations.push('CONFIRM_ORGAN_COMBINED')
  }
  if (changing.length === 0) {
    out.dose = roundDown(base, step)
    out.trace.pre_rounding = round3(base)
    return { lo: 1, hi: 1 }
  }
  changing.sort((a, b) => a.hi - b.hi || a.lo - b.lo)
  const chosen = changing[0]
  out.reason = `Hydromorphone injection label: start at one-quarter to one-half of the usual starting dose in ${changing.map((item) => (item.id === 'R2' ? 'renal' : 'hepatic')).join(' and ')} impairment (${chosen.id} applied; reductions are not multiplied).`
  const low = base * chosen.lo
  const high = base * chosen.hi
  out.trace.pre_rounding = round3(low)
  if (Math.abs(chosen.lo - chosen.hi) <= EPS) {
    out.dose = roundDown(low, step)
    return chosen
  }
  const range = fitRange(low, high, step)
  if (!range) {
    out.status = 'NOT_CALCULATED_CLINICIAN_REVIEW'
    out.rules.push('V3')
    return null
  }
  out.dose_range = range
  out.dose = range[0]
  out.confirmations.push('D10')
  return chosen
}

function ivMorphHydro(input, out, exposed, homeMme) {
  const weight = input.patient.weight_kg
  if (weight === null || weight === undefined || weight === '') return stop(out, 'NOT_CALCULATED_MISSING_WEIGHT', 'M1')
  const morphine = input.drug_route === 'MORPHINE_IV'
  const mgkg = morphine ? 0.1 : 0.02
  const cap = morphine ? 10 : 2
  const step = morphine ? 0.5 : 0.1
  const raw = mgkg * weight
  const capped = Math.min(raw, cap)
  out.trace.weight_based_raw = round3(raw)
  out.trace.weight_based_capped = round3(capped)
  if (input.patient.bmi >= 30) {
    out.flags.push('OBESITY_WEIGHT_SCALAR')
    out.confirmations.push('D1')
  }
  let base = capped
  if (!exposed) {
    out.rules.push(morphine ? 'IV1' : 'IV2', 'IV3')
  } else if (!morphine) {
    out.trace.reference_iv_morphine_mg = round3((0.2 * homeMme) / 3)
    return stop(out, 'NOT_CALCULATED_CLINICIAN_REVIEW', 'IT4')
  } else {
    const individualized = (0.2 * homeMme) / 3
    out.trace.individualized_raw = round3(individualized)
    out.rules.push('IT1')
    out.confirmations.push('D5')
    let chosen = individualized
    const prior = input.prior_effective_ed_dose_mg
    if (prior !== null && prior !== undefined && prior !== '') {
      out.confirmations.push('CONFIRM_PRIOR_ED_DOSE')
      if (Number(prior) + EPS < 0.5 * individualized) {
        chosen = Number(prior) * 1.25
        out.rules.push('IT2b')
      } else if (Math.abs(Number(prior) - individualized) / individualized > 0.1 + EPS) {
        chosen = Math.min(Number(prior), individualized)
        out.rules.push('IT2a')
      }
    }
    if (chosen + EPS < capped) {
      base = capped
      out.rules.push('IT3')
    } else {
      base = chosen
    }
    if (base > cap + EPS) {
      out.flags.push('ABOVE_WEIGHT_BASED_CAP')
      out.confirmations.push('CONFIRM_HIGH_TOLERANT_DOSE')
    }
    if ((input.home_opioids || []).some((row) => String(row.drug).toUpperCase() !== 'MORPHINE')) {
      out.flags.push('CROSS_TOLERANCE_REVIEW')
      out.confirmations.push('D6')
    }
  }
  const organ = applyOrgan(input, out, base, step)
  if (out.status === 'NOT_CALCULATED_CLINICIAN_REVIEW') return out
  if (!exposed && input.drug_route === 'HYDROMORPHONE_IV' && out.dose > 1 + EPS) {
    out.flags.push('ABOVE_LABEL_NAIVE_RANGE_1MG')
    out.confirmations.push('D4')
  }
  out.interval = 'repeat every 20-30 min while pain remains severe (IV3)'
  out.escalation_dose = roundDown(out.dose * 1.25, step)
  if (morphine && !exposed) {
    out.rules.push('IV4')
    // Morphine with eGFR <60 stops at renalReview (R1), so no renal factor applies here.
    const low = Math.min(0.05 * weight, cap)
    const high = Math.min(0.1 * weight, cap)
    out.maintenance_range = fitRange(low, high, step)
    out.maintenance_interval = input.hepatic === 'severe' ? 'every 4-8 h (interval x2)' : 'every 2-4 h'
    void organ
  }
  out.confirmations.push('CLINICIAN_VERIFY')
  out.status = 'CALCULATED_REQUIRES_CONFIRMATION'
  return out
}

function labelRange(input, out, low, high, step, rule) {
  out.rules.push(rule)
  const factors = doseFactors(input).filter((item) => !item.intervalOnly)
  const changing = factors.filter((item) => item.lo !== 1 || item.hi !== 1)
  for (const item of doseFactors(input)) out.rules.push(item.id)
  if (doseFactors(input).some((item) => item.id.startsWith('H'))) out.confirmations.push('CONFIRM_HEPATIC')
  if (changing.length > 1) {
    out.flags.push('RENAL_AND_HEPATIC_NOT_STACKED')
    out.confirmations.push('CONFIRM_ORGAN_COMBINED')
  }
  const factor = changing.sort((a, b) => a.hi - b.hi || a.lo - b.lo)[0]
  const rawLow = low * (factor ? factor.lo : 1)
  const rawHigh = high * (factor ? factor.hi : 1)
  const range = fitRange(rawLow, rawHigh, step)
  if (!range) return stop(out, 'NOT_CALCULATED_CLINICIAN_REVIEW', 'V3')
  out.dose_range = range
  out.dose = range[0]
  out.confirmations.push('D9', 'CLINICIAN_VERIFY')
  out.status = 'CALCULATED_REQUIRES_CONFIRMATION'
  return out
}

function oral(input, out, exposed) {
  if (exposed) return stop(out, 'NOT_CALCULATED_CLINICIAN_REVIEW', 'O9')
  const drug = input.drug_route
  const egfr = input.renal?.egfr
  const crcl = input.renal?.crcl
  const hepatic = input.hepatic
  if (drug === 'CODEINE_PO' && egfr !== null && egfr !== undefined && egfr < 60) {
    return stop(out, 'NOT_CALCULATED_CLINICIAN_REVIEW', 'C2')
  }
  if (drug === 'CODEINE_PO' && (hepatic === 'mild_mod' || hepatic === 'severe')) {
    return stop(out, 'NOT_CALCULATED_CLINICIAN_REVIEW', 'C3')
  }
  if ((drug === 'CODEINE_PO' || drug === 'TRAMADOL_PO') && input.cyp2d6 === 'IM') {
    out.flags.push('CPIC_IM_NO_RESPONSE_SWITCH')
  }
  if ((drug === 'CODEINE_PO' || drug === 'TRAMADOL_PO') && (input.cyp2d6 === 'unknown' || !input.cyp2d6)) {
    out.flags.push('CYP2D6_UNKNOWN')
  }
  if (drug === 'MORPHINE_PO') {
    labelRange(input, out, 15, 30, 2.5, 'O1')
    out.interval = input.hepatic === 'severe' ? 'every 8 h' : 'every 4 h as needed'
    return out
  }
  if (drug === 'OXYCODONE_PO') {
    labelRange(input, out, 5, 15, 2.5, 'O2')
    out.interval = 'every 4-6 h as needed'
    return out
  }
  if (drug === 'CODEINE_PO') {
    labelRange(input, out, 15, 60, 15, 'C1')
    out.interval = 'every 4 h as needed'
    out.max_daily_mg = 360
    return out
  }
  out.rules.push('TO1')
  let max = 400
  let interval = 'every 4-6 h as needed'
  let fixed = null
  const renalForTramadol = crcl !== null && crcl !== undefined ? crcl : egfr
  if ((crcl === null || crcl === undefined) && egfr !== null && egfr !== undefined && egfr < 30) {
    out.flags.push('CRCL_NOT_AVAILABLE_EGFR_USED')
  }
  if (renalForTramadol !== null && renalForTramadol !== undefined && renalForTramadol < 30) {
    out.rules.push('TO3')
    interval = 'every 12 h'
    max = 200
    out.reason = 'Tramadol tablet label, creatinine clearance <30 mL/min: every 12 hours, maximum 200 mg/day (TO3 applied).'
  }
  if (Number(input.patient.age_years) > 75) {
    out.rules.push('TO2')
    max = Math.min(max, 300)
  }
  if (hepatic === 'severe') {
    out.rules.push('TO4')
    out.reason = 'Tramadol label, severe hepatic impairment: 50 mg every 12 hours (TO4 applied).'
    out.confirmations.push('CONFIRM_HEPATIC', 'D17')
    interval = 'every 12 h'
    max = 100
    fixed = 50
  }
  out.interval = interval
  out.max_daily_mg = max
  if (fixed !== null) {
    out.dose_range = [50, 50]
    out.dose = 50
  } else {
    out.dose_range = [50, 100]
    out.dose = 50
  }
  out.confirmations.push('D9', 'CLINICIAN_VERIFY')
  out.status = 'CALCULATED_REQUIRES_CONFIRMATION'
  return out
}

function ivTramadol(input, out, exposed) {
  if (exposed) return stop(out, 'NOT_CALCULATED_CLINICIAN_REVIEW', 'TR4')
  const weight = input.patient.weight_kg
  if (weight === null || weight === undefined || weight === '') return stop(out, 'NOT_CALCULATED_MISSING_WEIGHT', 'M1')
  const crcl = input.renal?.crcl
  const egfr = input.renal?.egfr
  const renal = crcl !== null && crcl !== undefined ? crcl : egfr
  if (renal !== null && renal !== undefined && renal < 30) return stop(out, 'NOT_CALCULATED_CLINICIAN_REVIEW', 'TR2')
  if (input.hepatic === 'mild_mod' || input.hepatic === 'severe') {
    return stop(out, 'NOT_CALCULATED_CLINICIAN_REVIEW', 'TR3')
  }
  const raw = 1.5 * weight
  out.trace['raw_1.5mgkg'] = round3(raw)
  const clamped = Math.min(100, Math.max(50, raw))
  out.rules.push('TR1')
  out.dose = Math.max(50, roundDown(clamped, 10))
  out.interval = 'every 4-6 h'
  out.max_daily_mg = 400
  if (input.cyp2d6 === 'IM') out.flags.push('CPIC_IM_NO_RESPONSE_SWITCH')
  out.confirmations.push('D11', 'CLINICIAN_VERIFY')
  out.status = 'CALCULATED_REQUIRES_CONFIRMATION'
  return out
}

export function calculateDose(input) {
  const out = blank(input)
  const age = Number(input.patient?.age_years)
  if (!(age >= 18)) return stop(out, 'OUT_OF_SCOPE', 'G1')
  if (CONTEXT[input.drug_route] !== input.context) return stop(out, 'INPUT_ERROR', 'G2')
  if (NON_RANKING.has(input.rule_engine?.pathway)) return stop(out, 'NOT_CALCULATED_PATHWAY', 'G3')
  if (input.rule_engine?.tier === 'Avoid') return stop(out, 'NOT_ELIGIBLE', 'G4')
  const weight = input.patient?.weight_kg
  if (weight !== null && weight !== undefined && weight !== '' && (weight < 30 || weight > 250)) {
    return stop(out, 'INPUT_ERROR', 'V1')
  }
  const renalKnown = input.renal?.egfr !== null && input.renal?.egfr !== undefined || input.renal?.crcl !== null && input.renal?.crcl !== undefined
  if (input.renal?.aki || input.renal?.aki_suspected) {
    // KDIGO 2012: creatinine is not at steady state during AKI, so eGFR and CrCl
    // do not describe current kidney function. No renal-dependent dose is calculated.
    out.flags.push('AKI_NON_STEADY_STATE')
    out.reason = 'AKI detected or suspected: eGFR is not reliable, so no renal-dependent dose is calculated. Clinician review.'
    return stop(out, 'NOT_CALCULATED_CLINICIAN_REVIEW', 'AKI1')
  }
  if (!renalKnown && (input.renal?.dialysis || input.renal?.known_ckd)) {
    return stop(out, 'NOT_CALCULATED_CLINICIAN_REVIEW', 'M2')
  }
  if (input.renal?.dialysis) {
    // eGFR equations are not valid in patients on dialysis; no approved dialysis dose rule exists.
    out.flags.push('DIALYSIS_EGFR_NOT_VALID')
    out.reason = 'Dialysis: eGFR is not valid and no approved dialysis dose rule exists. Clinician review.'
    return stop(out, 'NOT_CALCULATED_CLINICIAN_REVIEW', 'RD1')
  }
  if (!renalKnown) {
    out.flags.push('RENAL_UNKNOWN_PROVISIONAL')
    out.confirmations.push('D7')
    out.rules.push('M3')
  }
  if (input.hepatic === 'unknown') out.flags.push('HEPATIC_UNKNOWN')
  addSafetyFlags(input, out)
  if (input.individualized_plan && input.individualized_plan.drug_route === input.drug_route) {
    out.dose = input.individualized_plan.dose
    out.unit = input.individualized_plan.unit || out.unit
    out.confirmations = ['CONFIRM_PLAN_CURRENT']
    out.rules.push('P1')
    out.status = 'DISPLAY_INDIVIDUALIZED_PLAN'
    return out
  }
  const home = input.home_opioids || []
  if (home.some((row) => !quantifiable(row))) return stop(out, 'NOT_CALCULATED_CLINICIAN_REVIEW', 'T2')
  const homeMme = home.reduce((sum, row) => sum + Number(row.mg_per_day_max) * MME[String(row.drug).toUpperCase()], 0)
  out.home_mme_mg_day = homeMme
  out.opioid_tolerant_fda = fdaTolerant(home, homeMme)
  const exposed = home.length > 0
  if (exposed) out.rules.push('T1')
  const review = renalReview(input)
  if (review) {
    out.flags.push('RENAL_DOSE_NOT_CALCULATED')
    out.reason = 'eGFR <60: the label gives no numeric renal dose, so no renal-adjusted dose is calculated. Clinician review.'
    return stop(out, 'NOT_CALCULATED_CLINICIAN_REVIEW', review)
  }
  const liver = hepaticReview(input)
  if (liver) {
    out.flags.push('HEPATIC_DOSE_NOT_CALCULATED')
    out.confirmations.push('CONFIRM_HEPATIC')
    out.reason = HEPATIC_REVIEW[liver]
    return stop(out, 'NOT_CALCULATED_CLINICIAN_REVIEW', liver)
  }
  if (input.drug_route === 'FENTANYL_IV') return stop(out, 'NOT_CALCULATED_NO_APPROVED_RULE', 'F1')
  if (input.drug_route === 'TRAMADOL_IV') return ivTramadol(input, out, exposed)
  if (input.drug_route === 'MORPHINE_IV' || input.drug_route === 'HYDROMORPHONE_IV') {
    return ivMorphHydro(input, out, exposed, homeMme)
  }
  return oral(input, out, exposed)
}
