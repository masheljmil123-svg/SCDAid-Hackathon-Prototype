/**
 * Local checks for the v2.1 website integration.
 * Run: node src/logic/v21/v21.check.js
 */

import { buildRecommendation } from '../../data/recommendation.js'
import { buildV21Recommendation } from './rules.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function baseForm(overrides = {}) {
  return {
    age: 32,
    sex: 'Female',
    weight: 68,
    baselinePainScore: 8,
    egfr: 95,
    dialysis: 'No',
    hepaticImpairment: 'none',
    pregnant: 'No',
    respiratoryCompromise: 'No',
    breastfeeding: 'No',
    seizureHistory: 'No',
    maoiWithin14Days: 'No',
    strongCyp3a4Inhibitor: 'No',
    noBaselineOpioid: true,
    homeDailyOme: '',
    opioidTolerance: 'No',
    scdGenotype: 'HbSS',
    medications: ['Folic acid'],
    comorbidities: [],
    noKnownAllergy: true,
    allergies: [],
    previousResponses: [],
    genotypeAvailable: 'Yes',
    ...overrides,
  }
}

const nm = {
  genotypeAvailable: true,
  predictedPhenotype: 'Normal metabolizer',
  functionalPhenotype: 'Normal metabolizer',
  inhibitorExposure: 'None',
  inhibitorAgents: [],
  phenoconversion: false,
  error: null,
}

const severe = buildV21Recommendation(baseForm(), nm)
assert(severe.contextId === 'P', 'severe pain should use the parenteral model')
assert(severe.evaluated.map((item) => item.drug).sort().join() === 'Fentanyl,Hydromorphone,Morphine,Tramadol', 'parenteral set')
assert(severe.preferred.eligibility === 'Eligible', 'preferred must be eligible')
assert(severe.evaluated.every((item) => item.eligibility !== 'Avoid' || item.predictedDeltaPain60 == null), 'avoid is not scored')
assert(severe.evaluated[0].eligibility === 'Eligible', 'eligible stays first')
assert(Number.isFinite(severe.preferred.predictedDeltaPain60Raw), 'parenteral prediction is finite')

const oral = buildV21Recommendation(baseForm({ baselinePainScore: 5 }), {
  ...nm,
  predictedPhenotype: 'Poor metabolizer',
  functionalPhenotype: 'Poor metabolizer',
})
assert(oral.contextId === 'O', 'moderate pain should use the oral model')
assert(oral.evaluated.some((item) => item.drug === 'Codeine' && item.eligibility === 'Avoid'), 'codeine PM avoid')
assert(oral.evaluated.some((item) => item.drug === 'Tramadol' && item.eligibility === 'Avoid'), 'tramadol PM avoid')
assert(oral.evaluated.some((item) => item.drug === 'Oxycodone'), 'oxycodone is in the oral context')
assert(!oral.evaluated.some((item) => item.eligibility === 'Avoid' && item === oral.preferred), 'avoid is not preferred')

const renal = buildV21Recommendation(baseForm({ egfr: 20 }), nm)
assert(renal.evaluated.find((item) => item.drug === 'Morphine').eligibility === 'Avoid', 'morphine eGFR <30 avoid')
assert(renal.preferred.drug !== 'Morphine', 'avoided morphine is not selected')
assert(renal.evaluated.find((item) => item.drug === 'Fentanyl').eligibility === 'Eligible', 'fentanyl remains eligible at eGFR 20')

const pregnant = buildV21Recommendation(baseForm({ pregnant: 'Yes' }), nm)
assert(pregnant.preferred == null && pregnant.pathway === 'obstetric_review', 'pregnancy is not ranked')

const mild = buildV21Recommendation(baseForm({ baselinePainScore: 2 }), nm)
assert(mild.pathway === 'non_opioid' && mild.preferred == null, 'mild pain is not ranked')

const tramadolConflict = buildV21Recommendation(baseForm({ baselinePainScore: 5, egfr: 20 }), nm)
assert(
  tramadolConflict.clinicalConflicts.some((item) => item.includes('Unresolved')),
  'tramadol eGFR <30 conflict is reported',
)
assert(tramadolConflict.evaluated.find((item) => item.drug === 'Tramadol').eligibility === 'Caution', 'v2.1 tramadol renal tier is caution')

const allergy = buildV21Recommendation(
  baseForm({ noKnownAllergy: false, allergies: [{ drug: 'Morphine', reaction: 'rash' }] }),
  nm,
)
assert(allergy.evaluated.find((item) => item.drug === 'Morphine').eligibility === 'Avoid', 'allergy is avoid')
assert(allergy.preferred.drug !== 'Morphine', 'allergic morphine is not ranked first')

const website = await buildRecommendation(baseForm({ genotypeAvailable: 'Yes', allele1: '*1', allele2: '*1' }))
assert(website.modelVersion.includes('v2.1'), 'website recommendation uses v2.1')
assert(website.preferred && website.preferred.eligibility === 'Eligible', 'website preferred is eligible')
assert(website.prediction.note.toLowerCase().includes('not clinically validated'), 'prediction stays labelled')
assert(!website.evaluated.some((item) => item.eligibility === 'Avoid' && item.predictedDeltaPain60 != null), 'website does not score avoid')

const drugs = new Set([
  ...buildV21Recommendation(baseForm(), nm).evaluated.map((item) => item.drug),
  ...buildV21Recommendation(baseForm({ baselinePainScore: 5 }), nm).evaluated.map((item) => item.drug),
])
assert(
  ['Morphine', 'Hydromorphone', 'Fentanyl', 'Oxycodone', 'Codeine', 'Tramadol'].every((drug) => drugs.has(drug)),
  'all six opioids are supported in a context',
)

console.log('v2.1 integration checks passed')
console.log({
  parenteral: website.preferred.name,
  prediction: website.preferred.predictedDeltaPain60,
  pathway: website.pathway,
})
