/**
 * Connects the calculation library to an assessment without changing v2.1 thresholds.
 * A calculated eGFR is used only when the clinician left eGFR empty.
 * Child–Pugh category is displayed and is not written into the hepatic rule input.
 * Dose results are proposals and are not orders.
 */

import { calculateDose } from './dose.js'
import {
  albuminToGDl,
  bilirubinToMgDl,
  bmi as bmiCalc,
  childPugh,
  crclCockcroftGault,
  doorToDose,
  egfrCkdEpi2021,
  fdaTolerant,
  homeMme,
  kdigoAki,
  leanBodyWeight,
  maoiWashout,
  painBand,
  scrToMgDl,
} from './library.js'
import { observedPhenotype } from '../v21/features.js'
import { CNS_DEPRESSANT_MEDICATIONS } from '../clinicalSafety.js'

function blank(value) {
  return value === '' || value === null || value === undefined
}

function numberOrNull(value) {
  if (blank(value)) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function sexCode(sex) {
  if (sex === 'Female') return 'F'
  if (sex === 'Male') return 'M'
  return null
}

function medicationHit(medications, names) {
  const allowed = new Set(names.map((item) => item.toLowerCase()))
  return (medications || []).some((item) => allowed.has(String(item).trim().toLowerCase()))
}

function labToMg(value, unit, kind) {
  if (blank(value)) return null
  const raw = String(unit || '').toLowerCase().replace('µ', 'u')
  if (kind === 'bilirubin') {
    if (raw.includes('mol')) return bilirubinToMgDl(value).value
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  }
  if (raw === 'g/l') return albuminToGDl(value).value
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function assessmentCalculations(form = {}) {
  const lines = []
  const sex = sexCode(form.sex)
  const age = numberOrNull(form.age)
  const weight = numberOrNull(form.weight)
  let scr = null
  if (!blank(form.serumCreatinine)) {
    const converted = scrToMgDl(form.serumCreatinine, form.creatinineUnit || 'mg/dL')
    if (converted.error) lines.push({ id: 'RF-01', label: 'Serum creatinine', text: 'Not calculated. Enter a value and a unit.' })
    else {
      scr = converted.value
      lines.push({
        id: 'RF-01',
        label: 'Serum creatinine',
        text: `${converted.display ?? Number(converted.value.toFixed(2))} mg/dL`,
        references: converted.references,
      })
    }
  }

  let egfrFull = null
  let egfrDisplay = null
  if (scr !== null && age !== null && sex) {
    const egfr = egfrCkdEpi2021(scr, age, sex)
    if (egfr.error) {
      lines.push({ id: 'RF-02', label: 'eGFR (CKD-EPI 2021)', text: egfr.error === 'OUT_OF_SCOPE_AGE' ? 'Not calculated. The adult equation does not apply under 18.' : 'Not calculated.' })
    } else {
      egfrFull = egfr.value
      egfrDisplay = egfr.display
      lines.push({
        id: 'RF-02',
        label: 'eGFR (CKD-EPI 2021)',
        text: `${egfr.display} mL/min/1.73 m²`,
        references: egfr.references,
        note: 'Indexed estimate. Not validated for the 2021 equation in sickle cell disease, and not for acute kidney injury.',
      })
    }
  } else {
    lines.push({ id: 'RF-02', label: 'eGFR (CKD-EPI 2021)', text: 'Not calculated. Age, sex, and serum creatinine are required.' })
  }

  let crcl = null
  if (scr !== null && age !== null && weight !== null && sex) {
    const result = crclCockcroftGault(scr, age, weight, sex)
    if (!result.error) {
      crcl = result.value
      lines.push({
        id: 'RF-03',
        label: 'Creatinine clearance (Cockcroft–Gault)',
        text: `${result.display} mL/min`,
        references: result.references,
        note: weight && bmiValue(form, weight) >= 30 ? 'Actual weight was used. BMI is at least 30.' : 'Actual body weight. Used for the tramadol label rule only.',
      })
    }
  }

  const aki = kdigoAki({
    scr_now: scr,
    scr_48h_min: blank(form.scr48hMin) ? null : scrToMgDl(form.scr48hMin, form.creatinineUnit || 'mg/dL').value,
    scr_baseline: blank(form.scrBaseline) ? null : scrToMgDl(form.scrBaseline, form.creatinineUnit || 'mg/dL').value,
    uo_ml_kg_h: numberOrNull(form.urineMlKgH),
    uo_hours: numberOrNull(form.urineHours),
    rrt: form.rrtStarted === 'Yes',
  })
  if (!aki.error) {
    lines.push({
      id: 'RF-05',
      label: 'KDIGO AKI check',
      text: aki.aki
        ? `AKI stage ${aki.stage}`
        : aki.assessable
          ? 'AKI criteria not met'
          : 'Not assessable. A baseline or 48-hour creatinine, urine output, or RRT status is needed.',
      flags: aki.flags,
      references: aki.references,
      note: aki.aki
        ? 'Creatinine is not at steady state, so eGFR does not reflect current kidney function. No renal-dependent dose was calculated.'
        : '',
    })
  }
  if (form.akiSuspected === 'Yes') {
    lines.push({
      id: 'RF-06',
      label: 'Clinician-suspected AKI',
      text: 'Recorded by the clinician',
      note: 'Treated like detected AKI: eGFR is not relied on and no renal-dependent dose is calculated.',
    })
  }

  const known = form.knownLiverDisease === 'Yes'
  if (form.knownLiverDisease === 'Yes' || form.knownLiverDisease === 'No') {
    const hepatic = childPugh({
      bilirubin_mgdl: labToMg(form.bilirubin, form.bilirubinUnit, 'bilirubin'),
      albumin_gdl: labToMg(form.albumin, form.albuminUnit, 'albumin'),
      inr: numberOrNull(form.inr),
      ascites: form.ascites || null,
      encephalopathy: form.encephalopathy || null,
      known_liver_disease: known,
    })
    lines.push({
      id: 'HP-02',
      label: 'Child–Pugh',
      text: hepatic.points
        ? `${hepatic.points} points, class ${hepatic.class}. Proposed SCDAid category: ${hepatic.scdaid_hepatic_category}.`
        : `Proposed category: ${hepatic.scdaid_hepatic_category}.`,
      flags: hepatic.flags,
      references: hepatic.references,
      note: 'This mapping is pending approval (L1) and was not applied to the v2.1 hepatic rules.',
    })
  }

  const height = numberOrNull(form.heightCm)
  let bmiValueResult = numberOrNull(form.bmi)
  if (weight !== null && height !== null) {
    const index = bmiCalc(weight, height)
    if (!index.error) {
      if (bmiValueResult === null) bmiValueResult = index.value
      lines.push({
        id: 'BW-01',
        label: 'BMI',
        text: `${index.display} kg/m²${index.obesity_flag ? ' (BMI at least 30)' : ''}`,
        references: index.references,
      })
      if (index.obesity_flag && sex) {
        const lean = leanBodyWeight(weight, index.value, sex)
        lines.push({
          id: 'BW-02',
          label: 'Lean body weight',
          text: `${lean.display} kg`,
          references: lean.references,
          note: 'Display only. Doses use actual body weight.',
        })
      }
    }
  }

  const home = (form.baselineOpioids || [])
    .filter((row) => row?.drug && !blank(row.mgPerDay))
    .map((row) => ({
      drug: String(row.drug).toUpperCase(),
      route: row.route || 'PO',
      mg_per_day_max: Number(row.mgPerDay),
      days_regular: numberOrNull(row.daysRegular),
    }))
  if (!form.noBaselineOpioid && home.length) {
    const mme = homeMme(home)
    if (mme.error) {
      lines.push({ id: 'OT-01', label: 'Home MME', text: 'Not calculated. Methadone, buprenorphine, and non-oral products need clinician review.' })
    } else {
      const tolerant = fdaTolerant(home, mme.value)
      lines.push({
        id: 'OT-01',
        label: 'Home MME',
        text: `${mme.value} mg/day`,
        references: mme.references,
        note: 'Exposure only. Not a dose of another opioid.',
      })
      lines.push({
        id: 'OT-02',
        label: 'FDA opioid tolerance',
        text: tolerant.opioid_tolerant_fda ? 'Threshold met' : 'Threshold not met',
        references: tolerant.references,
      })
    }
  }

  if (!blank(form.baselinePainScore)) {
    const band = painBand(form.baselinePainScore)
    if (!band.error) {
      lines.push({ id: 'PR-01', label: 'Pain band', text: band.band, references: band.references, note: 'Same bands the v2.1 pathway already uses.' })
    }
  }

  if (form.arrivalTime && form.firstDoseTime) {
    const timing = doorToDose(form.arrivalTime, form.firstDoseTime)
    if (!timing.error) {
      lines.push({
        id: 'PR-07',
        label: 'Door to first dose',
        text: `${timing.door_to_dose_min} min${timing.within_60_min_ASH ? '' : '. Later than 60 minutes.'}`,
        references: timing.references,
      })
    }
  }

  if (form.lastMaoiDate) {
    const today = new Date().toISOString().slice(0, 10)
    const washout = maoiWashout(form.lastMaoiDate, today)
    if (!washout.error) {
      lines.push({
        id: 'DS-04',
        label: 'MAOI washout',
        text: washout.washout_complete ? `${washout.days} days. Washout complete.` : `${washout.days} days. Tramadol remains contraindicated.`,
        references: washout.references,
      })
    }
  }

  lines.push({
    id: 'PR-02',
    label: 'Follow-up pain scores',
    text: 'Not calculated. Scheduled scores after a dose are not on this assessment.',
  })

  return {
    lines,
    egfrFull,
    egfrDisplay,
    crcl,
    bmi: bmiValueResult,
    home,
    akiNonSteady: Boolean(aki?.flags?.includes('NON_STEADY_STATE')),
    akiDetected: Boolean(!aki.error && aki.aki),
    akiStage: !aki.error && aki.aki ? aki.stage : null,
    akiAssessable: Boolean(!aki.error && aki.assessable),
  }
}

// The eGFR bands the v2.1 renal rules already use (<15, 15-29, 30-59, >=60). No new threshold.
function renalBand(value) {
  if (value === null || value === undefined) return null
  if (value < 15) return '<15'
  if (value < 30) return '15–29'
  if (value < 60) return '30–59'
  return '≥60'
}

const SCD_EGFR_LIMITATION =
  'In sickle cell disease, creatinine-based eGFR can overestimate true kidney function (hyperfiltration and increased tubular creatinine secretion), and the CKD-EPI 2021 equation has not been validated in SCD. A normal eGFR does not exclude kidney disease.'

/**
 * Renal status shown with every recommendation. It reports; it does not change
 * v2.1 eligibility tiers or the model input.
 */
export function renalStatus(form = {}, calculations = {}, egfrApplied = false) {
  const entries = (form.comorbidities || []).map((entry) => String(entry))
  const egfr = numberOrNull(form.egfr)
  const akiDetected = Boolean(calculations.akiDetected)
  const akiSuspected = form.akiSuspected === 'Yes'
  const dialysis = form.dialysis === 'Yes'
  const knownCkd = entries.some((entry) => /chronic kidney/i.test(entry))
  const scn = entries.some((entry) => /sickle cell nephropathy/i.test(entry))
  const messages = []

  if (egfr === null) {
    messages.push('eGFR was not provided. Renal safety could not be assessed.')
  } else {
    messages.push(
      `eGFR ${form.egfr} mL/min/1.73 m² (${egfrApplied ? 'calculated with CKD-EPI 2021 from serum creatinine' : 'entered by the clinician'}).`,
    )
    if (!egfrApplied && calculations.egfrDisplay != null) {
      messages.push(`CKD-EPI 2021 from the entered creatinine is ${calculations.egfrDisplay} mL/min/1.73 m². The entered eGFR was used.`)
    }
  }
  if (akiDetected || akiSuspected) {
    messages.push(
      `${akiDetected ? `KDIGO criteria indicate AKI stage ${calculations.akiStage}.` : 'The clinician recorded suspected AKI.'} Creatinine is not at steady state, so this eGFR does not reliably describe current kidney function and may overestimate it. The eligibility tiers below come from the entered eGFR and were not changed automatically. No renal-dependent dose was calculated. Clinician review of kidney function is required before choosing or dosing an opioid.`,
    )
  }
  if (dialysis) {
    messages.push(
      `Dialysis: eGFR equations are not valid in patients on dialysis${egfr !== null && egfr >= 15 ? `, and an eGFR of ${form.egfr} conflicts with dialysis status` : ''}. Only fentanyl has a dialysis-specific v2.1 rule; the other tiers follow eGFR. No dose was calculated. Clinician review required.`,
    )
  }
  if (knownCkd) {
    messages.push('Chronic kidney disease is recorded. SCDAid applies renal tiers from eGFR; the diagnosis alone does not change eligibility.')
  }
  if (scn) {
    messages.push(
      'Sickle cell nephropathy is recorded. It is not treated as reduced eGFR and does not by itself change opioid eligibility or dose. Albuminuria, AKI and CKD are assessed separately.',
    )
  }
  messages.push(SCD_EGFR_LIMITATION)

  // Inputs that make the eGFR-based tiers unreliable. They qualify the recommendation
  // (clinician review required); they do not change eligibility or ranking.
  const reviewReasons = []
  if (akiDetected) reviewReasons.push(`AKI detected (KDIGO stage ${calculations.akiStage}): eGFR is not reliable.`)
  else if (akiSuspected) reviewReasons.push('AKI suspected by the clinician: eGFR is not reliable.')
  if (dialysis) {
    reviewReasons.push(
      egfr !== null && egfr >= 15
        ? `Dialysis with an entered eGFR of ${form.egfr}: the inputs conflict, and the eGFR-based tiers may be too permissive.`
        : 'Dialysis: eGFR is not valid, and only fentanyl has a dialysis-specific rule.',
    )
  }
  const calculatedBand = renalBand(calculations.egfrFull ?? null)
  if (!egfrApplied && egfr !== null && calculatedBand && calculatedBand !== renalBand(egfr)) {
    reviewReasons.push(
      `Entered eGFR ${form.egfr} (band ${renalBand(egfr)}) and creatinine-based eGFR ${calculations.egfrDisplay} (band ${calculatedBand}) fall in different renal-rule bands. The tiers used the entered value.`,
    )
  }

  return {
    reviewRequired: reviewReasons.length > 0,
    reviewReasons,
    egfr,
    egfrSource: egfr === null ? 'missing' : egfrApplied ? 'calculated' : 'entered',
    akiDetected,
    akiStage: calculations.akiStage ?? null,
    akiSuspected,
    akiAssessable: Boolean(calculations.akiAssessable),
    dialysis,
    knownCkd,
    scn,
    unstable: akiDetected || akiSuspected,
    messages,
  }
}

function bmiValue(form, weight) {
  const height = numberOrNull(form.heightCm)
  if (!height) return numberOrNull(form.bmi) ?? 0
  return bmiCalc(weight, height).value ?? 0
}

export function formForRecommendation(form = {}) {
  const calculations = assessmentCalculations(form)
  const next = { ...form }
  if (blank(next.egfr) && calculations.egfrFull !== null) {
    next.egfr = String(calculations.egfrFull)
    calculations.egfrApplied = true
  } else {
    calculations.egfrApplied = false
  }
  if (blank(next.bmi) && calculations.bmi !== null) next.bmi = String(calculations.bmi)
  return { form: next, calculations }
}

export function proposeDoses(form, pgx, decision) {
  if (!decision?.evaluated?.length) return []
  const calculations = assessmentCalculations(form)
  const phenotype = observedPhenotype(pgx) || 'unknown'
  const context = decision.contextId === 'O' ? 'ORAL' : 'IV'
  return decision.evaluated.map((item) => {
    const proposal = calculateDose({
      context,
      drug_route: String(item.id || '').toUpperCase(),
      patient: {
        age_years: numberOrNull(form.age),
        sex: sexCode(form.sex),
        weight_kg: numberOrNull(form.weight),
        height_cm: numberOrNull(form.heightCm),
        bmi: calculations.bmi,
      },
      rule_engine: { tier: item.eligibility, pathway: decision.pathway },
      renal: {
        egfr: numberOrNull(form.egfr),
        crcl: calculations.crcl,
        dialysis: form.dialysis === 'Yes',
        known_ckd: (form.comorbidities || []).some((entry) => /chronic kidney/i.test(String(entry))),
        aki: calculations.akiDetected,
        aki_suspected: form.akiSuspected === 'Yes',
      },
      hepatic: form.hepaticImpairment === 'not_assessed' || blank(form.hepaticImpairment) ? 'unknown' : form.hepaticImpairment,
      cyp2d6: phenotype || 'unknown',
      home_opioids: form.noBaselineOpioid ? [] : calculations.home,
      individualized_plan: null,
      prior_effective_ed_dose_mg: null,
      cns_depressant: medicationHit(form.medications, CNS_DEPRESSANT_MEDICATIONS),
      osa: (form.comorbidities || []).some((entry) => /obstructive sleep apn/i.test(String(entry))),
      cyp3a4_strong_inhibitor: form.strongCyp3a4Inhibitor === 'Yes',
    })
    return { name: item.name, eligibility: item.eligibility, ...proposal }
  })
}
