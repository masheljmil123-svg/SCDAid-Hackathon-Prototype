/**
 * Repeatable fictional scenario checks for recommendation + dose proposals.
 * Run: node src/logic/calc/scenario.check.js
 * Does not modify clinical rules; reports discrepancies for review.
 */

import { DEMO_CASES } from '../../data/demoCases.js'
import { buildRecommendation, dosesForDisplay } from '../../data/recommendation.js'
import { EMPTY_FORM } from '../../data/formState.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function summarizeDose(proposal) {
  if (!proposal) return null
  if (proposal.dose == null) {
    return {
      name: proposal.name,
      eligibility: proposal.eligibility,
      status: proposal.status,
      reason: proposal.reason,
      dose: null,
    }
  }
  return {
    name: proposal.name,
    eligibility: proposal.eligibility,
    dose: proposal.dose,
    unit: proposal.unit,
    interval: proposal.interval,
    rules: proposal.rules,
    status: proposal.status,
  }
}

function baseOverrides(overrides = {}) {
  return {
    ...EMPTY_FORM,
    age: '32',
    sex: 'Female',
    weight: '68',
    heightCm: '165',
    baselinePainScore: 8,
    egfr: '95',
    dialysis: 'No',
    hepaticImpairment: 'none',
    pregnant: 'No',
    respiratoryCompromise: 'No',
    breastfeeding: 'No',
    seizureHistory: 'No',
    maoiWithin14Days: 'No',
    strongCyp3a4Inhibitor: 'No',
    knownLiverDisease: 'No',
    akiSuspected: 'No',
    rrtStarted: 'No',
    noBaselineOpioid: true,
    opioidTolerance: 'No',
    scdGenotype: 'HbSS',
    medications: ['Folic acid'],
    comorbidities: [],
    noKnownAllergy: true,
    allergies: [],
    previousResponses: [],
    baselineOpioids: [],
    genotypeAvailable: 'No',
    ...overrides,
  }
}

const report = []

function logScenario(id, payload) {
  report.push({ id, ...payload })
  console.log(`\n=== ${id} ===`)
  console.log(
    JSON.stringify(
      {
        preferred: payload.preferred,
        pathway: payload.pathway,
        displayDoses: payload.displayDoses,
        notes: payload.notes,
      },
      null,
      2,
    ),
  )
}

// 1) Four demo cases
for (const demo of DEMO_CASES) {
  const result = await buildRecommendation(demo.form)
  const display = dosesForDisplay(result)
  assert(!display.some((item) => item.eligibility === 'Avoid'), `${demo.id}: Avoid doses must not display`)
  if (['dialysis_review', 'obstetric_review', 'non_opioid', 'urgent_review_resp'].includes(result.pathway) || result.blockedMessage) {
    assert(display.length === 0, `${demo.id}: blocked pathway must hide doses`)
  }
  if (result.preferred) {
    assert(result.preferred.eligibility !== 'Avoid', `${demo.id}: preferred cannot be Avoid`)
    const preferredDose = display.find(
      (item) =>
        String(item.drug_route || '').toUpperCase() === String(result.preferred.id || '').toUpperCase() ||
        String(item.name || '').toLowerCase() === String(result.preferred.name || '').toLowerCase(),
    )
    assert(preferredDose, `${demo.id}: preferred Eligible/Caution should have a displayable dose row`)
  }
  logScenario(`demo_${demo.id}`, {
    preferred: result.preferred?.name || null,
    eligibility: result.preferred?.eligibility || null,
    aiDelta: result.preferred?.predictedDeltaPain60 ?? null,
    pathway: result.pathway,
    displayDoses: display.map(summarizeDose),
    rawProposalCount: (result.doseProposals || []).length,
    notes: [
      `Avoid proposals hidden: ${(result.doseProposals || []).filter((d) => d.eligibility === 'Avoid').length}`,
      result.pgx?.functionalPhenotype || result.pgx?.inhibitionRisk?.title || 'no genotype phenotype',
    ],
  })
}

// 2) Age / weight variation on Amina-like base
const youngLight = await buildRecommendation(baseOverrides({ age: '18', weight: '48', heightCm: '155', baselinePainScore: 9 }))
const olderHeavy = await buildRecommendation(baseOverrides({ age: '55', weight: '95', heightCm: '178', baselinePainScore: 9 }))
const yl = dosesForDisplay(youngLight).find((d) => d.name === youngLight.preferred?.name)
const oh = dosesForDisplay(olderHeavy).find((d) => d.name === olderHeavy.preferred?.name)
assert(yl && oh, 'age/weight scenarios need preferred doses')
assert(yl.dose !== oh.dose || yl.unit !== oh.unit || yl.dose_range?.join() !== oh.dose_range?.join(), 'changing weight/age should change dose proposal numbers when calculable')
logScenario('age_weight_variation', {
  preferred: `${youngLight.preferred?.name} vs ${olderHeavy.preferred?.name}`,
  pathway: youngLight.pathway,
  displayDoses: [summarizeDose(yl), summarizeDose(oh)],
  notes: [`youngLight ${yl.dose}${yl.unit}`, `olderHeavy ${oh.dose}${oh.unit}`],
})

// 3) Renal categories
for (const [label, egfr] of [
  ['normal', '95'],
  ['moderate', '38'],
  ['severe', '20'],
]) {
  const result = await buildRecommendation(baseOverrides({ egfr, baselinePainScore: 8, comorbidities: egfr === '38' ? ['Chronic kidney disease'] : [] }))
  const display = dosesForDisplay(result)
  const morphine = (result.evaluated || []).find((item) => /morphine/i.test(item.name))
  logScenario(`renal_${label}_egfr_${egfr}`, {
    preferred: result.preferred?.name || null,
    eligibility: result.preferred?.eligibility || null,
    aiDelta: result.preferred?.predictedDeltaPain60 ?? null,
    pathway: result.pathway,
    displayDoses: display.map(summarizeDose),
    notes: [`morphine eligibility=${morphine?.eligibility || 'n/a'}`, `displayCount=${display.length}`],
  })
  if (Number(egfr) < 30) {
    assert(morphine?.eligibility === 'Avoid', 'morphine eGFR <30 must be Avoid')
    assert(!display.some((d) => /morphine/i.test(d.name)), 'Avoid morphine must not appear in display doses')
  }
}

// 4) CYP2D6 phenotypes + phenoconversion
const pmOral = await buildRecommendation(
  baseOverrides({
    baselinePainScore: 5,
    genotypeAvailable: 'Yes',
    allele1: '*4',
    allele2: '*4',
  }),
)
assert(pmOral.evaluated.some((item) => item.drug === 'Codeine' && item.eligibility === 'Avoid'), 'PM codeine Avoid')
assert(pmOral.evaluated.some((item) => item.drug === 'Tramadol' && item.eligibility === 'Avoid'), 'PM tramadol Avoid')
assert(!dosesForDisplay(pmOral).some((d) => /codeine|tramadol/i.test(d.name)), 'PM Avoid opioids hidden from dose display')
logScenario('cyp2d6_pm_oral', {
  preferred: pmOral.preferred?.name || null,
  eligibility: pmOral.preferred?.eligibility || null,
  aiDelta: pmOral.preferred?.predictedDeltaPain60 ?? null,
  pathway: pmOral.pathway,
  displayDoses: dosesForDisplay(pmOral).map(summarizeDose),
  notes: [`phenotype=${pmOral.pgx.functionalPhenotype}`, `codeine/tramadol Avoid`],
})

const phenoconverted = await buildRecommendation(
  baseOverrides({
    baselinePainScore: 5,
    genotypeAvailable: 'Yes',
    allele1: '*1',
    allele2: '*1',
    medications: ['Paroxetine', 'Folic acid'],
  }),
)
assert(phenoconverted.pgx.phenoconversion === true, 'strong inhibitor should phenoconvert *1/*1')
logScenario('cyp2d6_phenoconversion', {
  preferred: phenoconverted.preferred?.name || null,
  eligibility: phenoconverted.preferred?.eligibility || null,
  aiDelta: phenoconverted.preferred?.predictedDeltaPain60 ?? null,
  pathway: phenoconverted.pathway,
  displayDoses: dosesForDisplay(phenoconverted).map(summarizeDose),
  notes: [
    `predicted=${phenoconverted.pgx.predictedPhenotype}`,
    `functional=${phenoconverted.pgx.functionalPhenotype}`,
    `phenoconversion=${phenoconverted.pgx.phenoconversion}`,
  ],
})

// 5) Opioid tolerance
const tolerant = await buildRecommendation(
  baseOverrides({
    baselinePainScore: 9,
    noBaselineOpioid: false,
    opioidTolerance: 'Yes',
    homeDailyOme: '60',
    baselineOpioids: [
      {
        id: 'tol-1',
        drug: 'Oxycodone',
        dose: '10 mg every 6 h',
        route: 'Oral',
        mgPerDay: '40',
        daysRegular: '21',
      },
    ],
    medications: ['Oxycodone', 'Folic acid'],
  }),
)
logScenario('opioid_tolerance', {
  preferred: tolerant.preferred?.name || null,
  eligibility: tolerant.preferred?.eligibility || null,
  aiDelta: tolerant.preferred?.predictedDeltaPain60 ?? null,
  pathway: tolerant.pathway,
  displayDoses: dosesForDisplay(tolerant).map(summarizeDose),
  notes: dosesForDisplay(tolerant).map((d) => `${d.name}:${d.status || d.dose}${d.unit || ''}:${(d.flags || []).join('|')}`),
})

// 6) Allergy
const allergy = await buildRecommendation(
  baseOverrides({
    baselinePainScore: 9,
    noKnownAllergy: false,
    allergies: [{ id: 'a1', drug: 'Morphine', reaction: 'Urticaria' }],
  }),
)
assert(allergy.evaluated.find((item) => /morphine/i.test(item.name))?.eligibility === 'Avoid', 'morphine allergy Avoid')
assert(allergy.preferred?.name && !/morphine/i.test(allergy.preferred.name), 'allergic morphine not preferred')
assert(!dosesForDisplay(allergy).some((d) => /morphine/i.test(d.name)), 'allergy Avoid dose hidden')
logScenario('allergy_morphine', {
  preferred: allergy.preferred?.name || null,
  eligibility: allergy.preferred?.eligibility || null,
  aiDelta: allergy.preferred?.predictedDeltaPain60 ?? null,
  pathway: allergy.pathway,
  displayDoses: dosesForDisplay(allergy).map(summarizeDose),
  notes: ['Morphine Avoid + dose hidden'],
})

// 7) Eligible / Caution / Avoid mix (severe renal oral)
const cautionMix = await buildRecommendation(baseOverrides({ baselinePainScore: 5, egfr: '20' }))
const tiers = Object.fromEntries(
  ['Eligible', 'Caution', 'Avoid'].map((tier) => [tier, (cautionMix.evaluated || []).filter((item) => item.eligibility === tier).map((item) => item.name)]),
)
assert(tiers.Avoid.length > 0 && (tiers.Eligible.length > 0 || tiers.Caution.length > 0), 'expected mixed eligibility tiers')
assert(dosesForDisplay(cautionMix).every((d) => d.eligibility !== 'Avoid'), 'display excludes Avoid')
logScenario('eligibility_mix_oral_egfr20', {
  preferred: cautionMix.preferred?.name || null,
  eligibility: cautionMix.preferred?.eligibility || null,
  aiDelta: cautionMix.preferred?.predictedDeltaPain60 ?? null,
  pathway: cautionMix.pathway,
  displayDoses: dosesForDisplay(cautionMix).map(summarizeDose),
  notes: [JSON.stringify(tiers)],
})

// 8) Blocked pathways
const dialysis = await buildRecommendation(baseOverrides({ dialysis: 'Yes', egfr: '8', baselinePainScore: 9 }))
assert(dialysis.pathway === 'dialysis_review' || dialysis.blockedMessage, 'dialysis blocked')
assert(dosesForDisplay(dialysis).length === 0, 'dialysis hides doses')
logScenario('blocked_dialysis', {
  preferred: dialysis.preferred?.name || null,
  pathway: dialysis.pathway,
  displayDoses: [],
  notes: [dialysis.blockedMessage?.slice(0, 120) || 'blocked'],
})

const pregnant = await buildRecommendation(baseOverrides({ pregnant: 'Yes', baselinePainScore: 9 }))
assert(pregnant.pathway === 'obstetric_review', 'pregnancy blocked')
assert(dosesForDisplay(pregnant).length === 0, 'pregnancy hides doses')
logScenario('blocked_pregnancy', {
  preferred: pregnant.preferred?.name || null,
  pathway: pregnant.pathway,
  displayDoses: [],
  notes: ['obstetric review'],
})

const mild = await buildRecommendation(baseOverrides({ baselinePainScore: 2 }))
assert(mild.pathway === 'non_opioid', 'mild pain non-opioid')
assert(dosesForDisplay(mild).length === 0, 'non-opioid hides doses')
logScenario('blocked_non_opioid', {
  preferred: mild.preferred?.name || null,
  pathway: mild.pathway,
  displayDoses: [],
  notes: ['mild pain'],
})

// 9) Missing inputs (blank weight) — expect unavailable rather than invented number
const missingWeight = await buildRecommendation(baseOverrides({ weight: '', baselinePainScore: 9 }))
const missingDisplay = dosesForDisplay(missingWeight)
const unavailable = missingDisplay.filter((d) => d.dose == null)
logScenario('missing_weight_inputs', {
  preferred: missingWeight.preferred?.name || null,
  eligibility: missingWeight.preferred?.eligibility || null,
  aiDelta: missingWeight.preferred?.predictedDeltaPain60 ?? null,
  pathway: missingWeight.pathway,
  displayDoses: missingDisplay.map(summarizeDose),
  notes: [
    `unavailableRows=${unavailable.length}`,
    unavailable[0]?.reason || unavailable[0]?.status || 'no unavailable row (review if weight optional)',
  ],
})
if (missingDisplay.length && unavailable.length === 0) {
  console.warn('REVIEW: missing weight still produced numeric doses — confirm intentional fallback in dose module')
}

console.log('\n---SCENARIO_SUMMARY---')
console.log(
  JSON.stringify(
    {
      scenarios: report.length,
      ids: report.map((row) => row.id),
    },
    null,
    2,
  ),
)
console.log('scenario checks passed')
