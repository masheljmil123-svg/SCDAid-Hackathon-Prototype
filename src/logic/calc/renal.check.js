/* global process */
/**
 * Renal safety regression checks (2026-11-13).
 * Run: node src/logic/calc/renal.check.js [path-to-pre-change-src]
 * With the optional path, every non-renal decision is compared with the pre-change code.
 */

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildRecommendation } from '../../data/recommendation.js'
import { calculateDose } from './dose.js'
import { kdigoAki } from './library.js'

let passed = 0
let failed = 0
function check(condition, label) {
  if (condition) {
    passed += 1
    console.log('PASS ', label)
  } else {
    failed += 1
    console.log('FAIL ', label)
  }
}

function baseForm(overrides = {}) {
  return {
    age: '32',
    sex: 'Female',
    weight: '68',
    baselinePainScore: '8',
    egfr: '95',
    dialysis: 'No',
    hepaticImpairment: 'none',
    pregnant: 'No',
    respiratoryCompromise: 'No',
    breastfeeding: 'No',
    seizureHistory: 'No',
    maoiWithin14Days: 'No',
    strongCyp3a4Inhibitor: 'No',
    noBaselineOpioid: true,
    baselineOpioids: [],
    homeDailyOme: '',
    opioidTolerance: 'No',
    scdGenotype: 'HbSS',
    medications: ['Folic acid'],
    comorbidities: [],
    noKnownAllergy: true,
    allergies: [],
    previousResponses: [],
    genotypeAvailable: 'Yes',
    allele1: '*1',
    allele2: '*1',
    creatinineUnit: 'mg/dL',
    ...overrides,
  }
}

const RENAL_STOPS = ['AKI1', 'RD1', 'R1', 'R3', 'H1', 'H2S', 'H3', 'TO4M']
const tier = (result, drug, route) =>
  result.evaluated.find((item) => item.drug === drug && (!route || item.route === route))?.eligibility
const dose = (result, id) => result.doseProposals.find((item) => item.drug_route === id)

function invariants(result, label) {
  check(result.preferred == null || result.preferred.eligibility === 'Eligible', `${label}: preferred is Eligible or absent`)
  check(
    result.doseProposals.every((item) => item.eligibility !== 'Avoid' || (['NOT_ELIGIBLE', 'NOT_CALCULATED_PATHWAY'].includes(item.status) && item.dose == null)),
    `${label}: no dose for an Avoid option`,
  )
  const egfr = Number(result.renalStatus?.egfr)
  check(
    result.doseProposals
      .filter((item) => ['MORPHINE_IV', 'MORPHINE_PO', 'OXYCODONE_PO'].includes(item.drug_route) && egfr < 60)
      .every((item) => item.dose == null),
    `${label}: no unsupported renal factor (morphine/oxycodone eGFR <60 not dosed)`,
  )
  check(
    result.doseProposals.every((item) => !(item.rules || []).some((rule) => rule === 'R1' || rule === 'R3') || item.dose == null),
    `${label}: R1/R3 never produce a number`,
  )
  if (result.renalStatus?.unstable || result.renalStatus?.dialysis) {
    check(result.doseProposals.every((item) => item.dose == null), `${label}: AKI/dialysis → no dose calculated`)
    check(Boolean(result.renalAlert), `${label}: renal alert shown`)
  }
  check(
    String(result.safety?.renal?.message || '').includes('overestimate true kidney function'),
    `${label}: SCD eGFR limitation shown`,
  )
  const explained = Object.fromEntries(result.evaluated.map((item) => [String(item.id).toUpperCase(), (item.reasons || []).join(' ')]))
  check(
    result.doseProposals.every((item) => item.dose == null || !/does not calculate/i.test(explained[item.drug_route] || '')),
    `${label}: no calculated dose where the explanation says SCDAid does not calculate it`,
  )
  check(
    result.alternatives.every((item) => item.eligibility !== 'Avoid' || item.predictedDeltaPain60 == null),
    `${label}: Avoid options are never scored or ranked`,
  )
  for (const item of result.doseProposals) {
    if (item.status === 'NOT_CALCULATED_CLINICIAN_REVIEW' && RENAL_STOPS.includes(item.rules.at(-1))) {
      check(Boolean(item.reason), `${label}: ${item.drug_route} renal stop has a reason`)
    }
  }
}

// 1. Normal renal function
const normal = await buildRecommendation(baseForm())
invariants(normal, 'normal eGFR 95')
check(normal.evaluated.every((item) => item.eligibility === 'Eligible'), 'normal: all parenteral options Eligible')
check(dose(normal, 'MORPHINE_IV').status === 'CALCULATED_REQUIRES_CONFIRMATION', 'normal: morphine IV dose calculated')
check(normal.renalAlert == null && normal.safety.renal.title === 'Renal function', 'normal: no AKI/dialysis alert')

// 2. Moderate impairment
const moderate = await buildRecommendation(baseForm({ egfr: '45' }))
invariants(moderate, 'moderate eGFR 45 IV')
check(tier(moderate, 'Morphine') === 'Caution' && tier(moderate, 'Hydromorphone') === 'Caution', 'moderate: morphine and hydromorphone Caution (tiers unchanged)')
check(dose(moderate, 'MORPHINE_IV').rules.at(-1) === 'R1' && dose(moderate, 'MORPHINE_IV').dose == null, 'moderate: morphine IV → R1 clinician review')
check(JSON.stringify(dose(moderate, 'HYDROMORPHONE_IV').dose_range) === '[0.4,0.6]', 'moderate: hydromorphone IV label ¼–½ range 0.4–0.6 mg (R2)')
check(moderate.safety.renal.title === 'Renal Safety Alert', 'moderate: renal safety alert')
const moderateOral = await buildRecommendation(baseForm({ egfr: '45', baselinePainScore: '5' }))
invariants(moderateOral, 'moderate eGFR 45 oral')
check(moderateOral.pathway === 'urgent_review_no_eligible' && moderateOral.preferred == null, 'moderate oral: no Eligible oral option → clinician review (existing v2.1 gap, unchanged)')
check(moderateOral.doseProposals.every((item) => item.rules.at(-1) === 'G3' && item.dose == null), 'moderate oral: no oral dose proposed in that pathway')
check(
  moderateOral.evaluated.find((item) => item.drug === 'Oxycodone').reasons.join(' ').includes('does not calculate a renal-adjusted oxycodone dose'),
  'moderate oral: oxycodone explanation agrees with dose module',
)

// 3. Severe impairment
const severe = await buildRecommendation(baseForm({ egfr: '20' }))
invariants(severe, 'severe eGFR 20 IV')
check(tier(severe, 'Morphine') === 'Avoid' && dose(severe, 'MORPHINE_IV').status === 'NOT_ELIGIBLE', 'severe: morphine Avoid, not dosed')
check(severe.preferred.drug !== 'Morphine' && tier(severe, 'Fentanyl') === 'Eligible', 'severe: morphine not preferred; fentanyl Eligible')
check(dose(severe, 'TRAMADOL_IV').rules.at(-1) === 'TR2', 'severe: tramadol IV → TR2 (unchanged)')
check(severe.safety.renal.title === 'Severe Renal Review', 'severe: severe renal review title')
const veryLow = await buildRecommendation(baseForm({ egfr: '10', baselinePainScore: '5' }))
invariants(veryLow, 'eGFR 10 oral')
check(tier(veryLow, 'Oxycodone') === 'Avoid', 'eGFR 10: oxycodone Avoid')

// 4. Dialysis
const dialysis = await buildRecommendation(baseForm({ egfr: '8', dialysis: 'Yes' }))
invariants(dialysis, 'dialysis eGFR 8')
check(dialysis.safety.renal.title === 'Dialysis — Clinician Review', 'dialysis: title')
check(dialysis.pathway === 'dialysis_review' && dialysis.preferred == null && dialysis.doseProposals.every((item) => item.dose == null), 'dialysis eGFR 8: no automatic recommendation, no dose')

// 5. AKI detected (KDIGO stage 2), entered eGFR normal
const akiForm = baseForm({ serumCreatinine: '1.5', scrBaseline: '0.6' })
const aki = await buildRecommendation(akiForm)
invariants(aki, 'AKI detected')
check(aki.renalStatus.akiDetected && aki.renalStatus.akiStage === 2, 'AKI: KDIGO stage 2 detected')
check(aki.safety.renal.title === 'Acute Kidney Injury — Clinician Review', 'AKI: title')
check(aki.doseProposals.every((item) => item.rules.at(-1) === 'AKI1' || item.status === 'NOT_ELIGIBLE'), 'AKI: proposals → AKI1')
check(aki.doseGuidance.startsWith('AKI detected or suspected'), 'AKI: dose guidance states no renal dose')
const noAki = await buildRecommendation(baseForm({ serumCreatinine: '1.5' }))
check(
  JSON.stringify(aki.evaluated.map((item) => [item.id, item.eligibility])) === JSON.stringify(noAki.evaluated.map((item) => [item.id, item.eligibility])) &&
    aki.preferred?.id === noAki.preferred?.id,
  'AKI: eligibility and ranking not changed automatically',
)
check(noAki.calculations.lines.find((line) => line.id === 'RF-05').text.startsWith('Not assessable'), 'single creatinine: AKI reported as not assessable (not "criteria not met")')

// 6. AKI suspected by clinician
const suspected = await buildRecommendation(baseForm({ akiSuspected: 'Yes' }))
invariants(suspected, 'AKI suspected')
check(suspected.renalStatus.unstable && suspected.doseProposals.every((item) => item.dose == null), 'AKI suspected: no dose calculated')

// 7. AKI by urine output only
const urine = await buildRecommendation(baseForm({ urineMlKgH: '0.4', urineHours: '13' }))
invariants(urine, 'AKI urine only')
check(urine.renalStatus.akiDetected && urine.renalStatus.akiStage === 2, 'urine output only: KDIGO stage 2 detected without creatinine')

// 8. Missing renal data
const missing = await buildRecommendation(baseForm({ egfr: '' }))
check(missing.pathway === 'renal_data_missing' && missing.preferred == null && missing.doseProposals.length === 0, 'missing eGFR: no ranking, no dose (not treated as eGFR 0)')
check(missing.safety.renal.title === 'Renal Data Missing', 'missing eGFR: renal data missing title')
const calculated = await buildRecommendation(baseForm({ egfr: '', serumCreatinine: '0.7' }))
invariants(calculated, 'calculated eGFR')
check(calculated.renalStatus.egfrSource === 'calculated' && calculated.calculations.egfrApplied, 'blank eGFR + creatinine: CKD-EPI value used and labelled')

// 9. Conflicting inputs
const conflict = await buildRecommendation(baseForm({ egfr: '90', dialysis: 'Yes' }))
invariants(conflict, 'dialysis with eGFR 90')
check(conflict.safety.renal.message.includes('conflicts with dialysis status'), 'conflict: dialysis vs eGFR 90 reported')
check(conflict.doseProposals.filter((item) => item.eligibility !== 'Avoid').every((item) => item.rules.at(-1) === 'RD1'), 'conflict: dialysis overrides eGFR 90 for dosing → RD1 review')
const both = await buildRecommendation(baseForm({ egfr: '95', serumCreatinine: '1.4' }))
check(both.safety.renal.message.includes('The entered eGFR was used'), 'conflict: entered eGFR and creatinine-derived eGFR both shown')

// 10. SCN and CKD are not reduced eGFR
const scn = await buildRecommendation(baseForm({ comorbidities: ['Sickle cell nephropathy'] }))
invariants(scn, 'SCN recorded')
check(
  JSON.stringify(scn.evaluated.map((item) => [item.id, item.eligibility])) === JSON.stringify(normal.evaluated.map((item) => [item.id, item.eligibility])),
  'SCN: eligibility identical to no SCN',
)
check(scn.safety.renal.message.includes('not treated as reduced eGFR'), 'SCN: distinction stated')
check(dose(scn, 'MORPHINE_IV').status === 'CALCULATED_REQUIRES_CONFIRMATION', 'SCN: dose not blocked by diagnosis alone')
const ckd = await buildRecommendation(baseForm({ comorbidities: ['Chronic kidney disease'] }))
check(ckd.safety.renal.message.includes('Chronic kidney disease is recorded'), 'CKD: recorded separately from AKI and SCN')

// 10b. Contradictory renal inputs qualify the recommendation
check(conflict.renalReviewRequired && conflict.pathway === 'dialysis_review' && conflict.preferred == null, 'conflict: dialysis + eGFR 90 → recommendation withheld, clinician review required')
check(conflict.alternatives.every((item) => item.predictedDeltaPain60 == null) && conflict.blockedMessage.includes('temporary safety hold'), 'dialysis hold: no ranked scores shown; hold explained')
const noDialysis = await buildRecommendation(baseForm({ egfr: '90' }))
check(
  ['Morphine', 'Hydromorphone', 'Tramadol'].every((drug) => tier(conflict, drug) === tier(noDialysis, drug)) && tier(conflict, 'Fentanyl') === 'Caution',
  'dialysis hold: eligibility levels unchanged (only the existing fentanyl dialysis rule applies)',
)
const provisional = await buildRecommendation(baseForm({ egfr: '95', serumCreatinine: '1.4' }))
check(provisional.preferred && provisional.preferred.subtitle.includes('provisional'), 'non-dialysis conflict: recommendation shown as provisional, not withheld')
check(both.renalReviewRequired && both.renalAlert.includes('different renal-rule bands'), 'conflict: entered eGFR 95 vs creatinine-based band 30–59 → review required')
const sameBand = await buildRecommendation(baseForm({ egfr: '95', serumCreatinine: '0.7' }))
check(!sameBand.renalReviewRequired && sameBand.renalAlert == null, 'no conflict: entered and creatinine-based eGFR in the same band → no review flag')
check(aki.renalReviewRequired && suspected.renalReviewRequired, 'AKI detected or suspected → review required')
check(!normal.renalReviewRequired && !scn.renalReviewRequired && !ckd.renalReviewRequired, 'normal, SCN and CKD alone → no review flag')

// 10c. Hepatic impairment
const hepSevere = await buildRecommendation(baseForm({ hepaticImpairment: 'severe' }))
invariants(hepSevere, 'hepatic severe IV')
check(dose(hepSevere, 'MORPHINE_IV').rules.at(-1) === 'H1' && dose(hepSevere, 'MORPHINE_IV').dose == null, 'hepatic severe: morphine IV → H1 clinician review (no interval x2)')
check(dose(hepSevere, 'HYDROMORPHONE_IV').rules.at(-1) === 'H2S', 'hepatic severe: hydromorphone IV → H2S clinician review')
check(dose(hepSevere, 'TRAMADOL_IV').rules.at(-1) === 'TR3', 'hepatic severe: tramadol IV → TR3 (unchanged)')
const hepMild = await buildRecommendation(baseForm({ hepaticImpairment: 'mild_mod' }))
invariants(hepMild, 'hepatic mild/moderate IV')
check(dose(hepMild, 'MORPHINE_IV').rules.at(-1) === 'H1', 'hepatic mild/moderate: morphine IV → H1 clinician review')
check(
  JSON.stringify(dose(hepMild, 'HYDROMORPHONE_IV').dose_range) === '[0.4,0.6]' && dose(hepMild, 'HYDROMORPHONE_IV').reason.includes('label'),
  'hepatic mild/moderate: hydromorphone label ¼–½ applied and explained (H2)',
)
const hepMildOral = await buildRecommendation(baseForm({ hepaticImpairment: 'mild_mod', baselinePainScore: '5' }))
invariants(hepMildOral, 'hepatic mild/moderate oral')
const hepSevereOral = await buildRecommendation(baseForm({ hepaticImpairment: 'severe', baselinePainScore: '5' }))
invariants(hepSevereOral, 'hepatic severe oral')
const hepRenal = await buildRecommendation(baseForm({ hepaticImpairment: 'mild_mod', egfr: '40' }))
invariants(hepRenal, 'hepatic mild/moderate + eGFR 40')
check(JSON.stringify(dose(hepRenal, 'HYDROMORPHONE_IV').dose_range) === '[0.4,0.6]', 'hepatic + renal: hydromorphone ¼–½ not multiplied (unchanged)')

// 11. Dose module unit cases
const unit = (input) => calculateDose({
  context: 'IV',
  drug_route: 'MORPHINE_IV',
  patient: { age_years: 30, weight_kg: 60, bmi: 22 },
  rule_engine: { tier: 'Caution', pathway: 'ranked' },
  renal: { egfr: 45, crcl: null, dialysis: false, known_ckd: false },
  hepatic: 'none',
  home_opioids: [],
  ...input,
})
check(unit({}).rules.at(-1) === 'R1' && unit({}).dose == null, 'unit: morphine IV eGFR 45 → R1 review')
check(unit({ renal: { egfr: 45, aki: true } }).rules.at(-1) === 'AKI1', 'unit: AKI flag → AKI1')
check(unit({ renal: { egfr: null, dialysis: true } }).rules.at(-1) === 'M2', 'unit: dialysis with unknown renal → M2 (unchanged)')
check(unit({ renal: { egfr: 95 }, rule_engine: { tier: 'Eligible', pathway: 'ranked' } }).dose === 6, 'unit: morphine IV eGFR 95 → 6 mg (0.1 mg/kg, unchanged)')
const oral = (drug, renal, tier = 'Caution') => calculateDose({
  context: 'ORAL',
  drug_route: drug,
  patient: { age_years: 60, weight_kg: 68, bmi: 24 },
  rule_engine: { tier, pathway: 'ranked' },
  renal,
  hepatic: 'none',
  cyp2d6: 'NM',
  home_opioids: [],
})
check(oral('OXYCODONE_PO', { egfr: 45 }).rules.at(-1) === 'R3' && oral('OXYCODONE_PO', { egfr: 45 }).dose == null, 'unit: oxycodone PO eGFR 45 → R3 review')
check(oral('MORPHINE_PO', { egfr: 45 }).rules.at(-1) === 'R1', 'unit: morphine PO eGFR 45 → R1 review')
check(JSON.stringify(oral('OXYCODONE_PO', { egfr: 95 }, 'Eligible').dose_range) === '[5,15]', 'unit: oxycodone PO eGFR 95 → label 5–15 mg (unchanged)')
check(oral('CODEINE_PO', { egfr: 45 }).rules.at(-1) === 'C2', 'unit: codeine PO eGFR 45 → C2 (unchanged)')
const to3 = oral('TRAMADOL_PO', { egfr: 20, crcl: 21 })
check(to3.rules.includes('TO3') && to3.max_daily_mg === 200 && to3.interval === 'every 12 h', 'unit: tramadol PO CrCl <30 → label every 12 h, max 200 mg/day (TO3)')
check(oral('TRAMADOL_PO', { egfr: 20, crcl: 21, dialysis: true }).rules.at(-1) === 'RD1', 'unit: tramadol PO on dialysis → RD1 review')
const oralHep = (drug, hepatic) => calculateDose({
  context: 'ORAL', drug_route: drug, patient: { age_years: 40, weight_kg: 68, bmi: 24 },
  rule_engine: { tier: 'Caution', pathway: 'ranked' }, renal: { egfr: 95 }, hepatic, cyp2d6: 'NM', home_opioids: [],
})
check(oralHep('OXYCODONE_PO', 'severe').rules.at(-1) === 'H3' && oralHep('OXYCODONE_PO', 'severe').dose == null, 'unit: oxycodone PO severe hepatic → H3 review (no ⅓–½ from the ER label)')
check(oralHep('OXYCODONE_PO', 'mild_mod').rules.at(-1) === 'H3', 'unit: oxycodone PO mild/moderate hepatic → H3 review (previously full dose)')
check(oralHep('MORPHINE_PO', 'severe').rules.at(-1) === 'H1', 'unit: morphine PO severe hepatic → H1 review (no every-8-h interval)')
check(oralHep('TRAMADOL_PO', 'mild_mod').rules.at(-1) === 'TO4M', 'unit: tramadol PO mild/moderate hepatic → TO4M review')
const to4 = oralHep('TRAMADOL_PO', 'severe')
check(to4.dose === 50 && to4.interval === 'every 12 h' && to4.max_daily_mg === 100 && to4.reason.includes('label'), 'unit: tramadol PO severe hepatic → label 50 mg every 12 h (TO4, unchanged)')
check(oralHep('CODEINE_PO', 'mild_mod').rules.at(-1) === 'C3', 'unit: codeine PO hepatic → C3 (unchanged)')
check(kdigoAki({ scr_now: 1.0 }).assessable === false, 'unit: KDIGO single value not assessable')
check(kdigoAki({ uo_ml_kg_h: 0, uo_hours: 12 }).stage === 3, 'unit: KDIGO anuria 12 h → stage 3')
check(kdigoAki({ rrt: true }).aki === true, 'unit: KDIGO RRT without creatinine → AKI')

// 12. Non-renal logic unchanged versus the pre-change code
const backup = process.argv[2]
if (backup) {
  const old = await import(pathToFileURL(path.resolve(backup, 'data/recommendation.js')).href)
  const variants = []
  for (const egfr of ['95', '60', '59', '45', '30', '29', '20', '15', '14', '8']) {
    for (const pain of ['8', '5', '2']) {
      variants.push({ egfr, baselinePainScore: pain })
      variants.push({ egfr, baselinePainScore: pain, dialysis: 'Yes' })
    }
  }
  const extra = [
    { allele1: '*4', allele2: '*4' },
    { allele1: '*1', allele2: '*4' },
    { allele1: '*1', allele2: '*1', hasCnv: true, copyNumber: '3', duplicatedAllele: '*1' },
    { genotypeAvailable: 'No', medications: ['Fluoxetine'] },
    { genotypeAvailable: 'Yes', medications: ['Paroxetine'] },
    { noKnownAllergy: false, allergies: [{ drug: 'Morphine', reaction: 'rash' }] },
    { noKnownAllergy: false, allergies: [{ drug: 'Hydromorphone', reaction: 'rash' }] },
    { respiratoryCompromise: 'Yes' },
    { pregnant: 'Yes' },
    { hepaticImpairment: 'severe' },
    { hepaticImpairment: 'mild_mod', egfr: '40' },
    { medications: ['Lorazepam'] },
    { strongCyp3a4Inhibitor: 'Yes' },
    { maoiWithin14Days: 'Yes' },
    { breastfeeding: 'Yes' },
    { previousResponses: [{ opioid: 'Morphine', response: 'Favorable' }] },
    { noBaselineOpioid: false, baselineOpioids: [{ drug: 'Morphine', route: 'PO', mgPerDay: '60', daysRegular: '14' }], homeDailyOme: '60', opioidTolerance: 'Yes' },
  ]
  for (const item of extra) {
    variants.push(item)
    variants.push({ ...item, baselinePainScore: '5' })
  }
  let same = 0
  let doseChanged = 0
  let doseBad = 0
  for (const overrides of variants) {
    const form = baseForm(overrides)
    const before = await old.buildRecommendation(form)
    const after = await buildRecommendation(form)
    const key = (result) =>
      JSON.stringify([
        result.pathway,
        result.treatmentContext,
        result.preferred?.id ?? null,
        result.alternatives.map((item) => item.id),
        result.evaluated.map((item) => [item.id, item.eligibility, item.predictedDeltaPain60Raw]),
        result.pgx,
      ])
    if (overrides.dialysis === 'Yes') {
      // Dialysis hold withholds the ranking by design; levels and model scores must be unchanged.
      const levels = (result) => JSON.stringify(result.evaluated.map((item) => [item.id, item.eligibility, item.predictedDeltaPain60Raw ?? null]).sort())
      const ok = levels(before) === levels(after) && (after.pathway === 'dialysis_review' || after.evaluated.length === 0) && after.preferred == null
      if (ok) same += 1
      else console.log('  DIALYSIS DIFF', JSON.stringify(overrides))
    } else if (key(before) === key(after)) same += 1
    else console.log('  DIFF', JSON.stringify(overrides))
    for (const proposal of after.doseProposals) {
      const prior = before.doseProposals.find((item) => item.drug_route === proposal.drug_route)
      const fields = (item) => JSON.stringify([item?.status, item?.dose, item?.dose_range, item?.interval, item?.max_daily_mg, item?.rules])
      if (fields(prior) !== fields(proposal)) {
        doseChanged += 1
        const expected = proposal.status === 'NOT_CALCULATED_CLINICIAN_REVIEW' && RENAL_STOPS.includes(proposal.rules.at(-1))
        if (!expected) {
          doseBad += 1
          console.log('  UNEXPECTED DOSE CHANGE', JSON.stringify(overrides), proposal.drug_route, fields(prior), '->', fields(proposal))
        }
      }
    }
  }
  check(same === variants.length, `pre-change comparison: pathway, eligibility, ranking, model predictions and CYP2D6 identical in ${same}/${variants.length} assessments`)
  check(doseBad === 0, `pre-change comparison: ${doseChanged} dose proposals changed, all to a renal or hepatic clinician-review stop (unexpected: ${doseBad})`)
}

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`)
if (failed) process.exit(1)
