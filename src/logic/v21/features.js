/**
 * Decision-time feature vector for the exported v2.1 linear models.
 * Column order matches models/scdaid_v21_*_LinearRegression.json.
 * nc_noise is a negative-control used only in research and is excluded from the export.
 */

import { CNS_DEPRESSANT_MEDICATIONS } from '../clinicalSafety.js'
import { CONTEXTS, DRUGS, PRIOR_CATEGORIES, SEROTONERGIC_MEDICATIONS, strategyDrug } from './constants.js'

const PHENOTYPE_CODE = {
  'poor metabolizer': 'PM',
  'intermediate metabolizer': 'IM',
  'normal metabolizer': 'NM',
  'ultrarapid metabolizer': 'UM',
  pm: 'PM',
  im: 'IM',
  nm: 'NM',
  um: 'UM',
}

function norm(value) {
  return String(value ?? '').trim().toLowerCase()
}

function yes(value) {
  return value === 'Yes' || value === true || value === 1
}

function phenotypeCode(label) {
  if (!label) return ''
  return PHENOTYPE_CODE[norm(label)] || ''
}

function medicationHit(medications, names) {
  const allowed = new Set(names.map(norm))
  return (medications || []).some((item) => allowed.has(norm(item)))
}

export function observedPhenotype(pgx) {
  if (!pgx?.genotypeAvailable) return ''
  return phenotypeCode(pgx.functionalPhenotype || pgx.predictedPhenotype)
}

export function priorFor(form, drug) {
  const row = (form.previousResponses || []).find(
    (item) => norm(item.opioid) === norm(drug) && item.response,
  )
  const response = row?.response
  return PRIOR_CATEGORIES.includes(response) ? response : ''
}

export function deriveContextFlags(form, pgx) {
  const medications = form.medications || []
  const comorbidities = form.comorbidities || []
  const homeOme = form.noBaselineOpioid ? 0 : Number(form.homeDailyOme)
  return {
    female: form.sex === 'Female' ? 1 : 0,
    homeOme: Number.isFinite(homeOme) ? homeOme : null,
    opioidTolerant: yes(form.opioidTolerance) ? 1 : 0,
    hydroxyurea: medicationHit(medications, ['hydroxyurea']) ? 1 : 0,
    cnsDepressant: medicationHit(medications, CNS_DEPRESSANT_MEDICATIONS) ? 1 : 0,
    cyp3a4Strong: yes(form.strongCyp3a4Inhibitor) ? 1 : 0,
    serotonergic: medicationHit(medications, SEROTONERGIC_MEDICATIONS) ? 1 : 0,
    maoi: yes(form.maoiWithin14Days) ? 1 : 0,
    seizureHistory: yes(form.seizureHistory) ? 1 : 0,
    breastfeeding: yes(form.breastfeeding) ? 1 : 0,
    osa: comorbidities.some((item) => /obstructive sleep apn/i.test(String(item))) ? 1 : 0,
    genotypeAvailable: pgx?.genotypeAvailable ? 1 : 0,
    inhibStrong: pgx?.inhibitorExposure === 'Strong' ? 1 : 0,
    inhibModerate: pgx?.inhibitorExposure === 'Moderate' ? 1 : 0,
    phenotype: observedPhenotype(pgx),
    inhibitorPresent: pgx?.inhibitorExposure === 'Strong' || pgx?.inhibitorExposure === 'Moderate',
    scd: form.scdGenotype || '',
    hepatic: form.hepaticImpairment || 'not_assessed',
    dialysis: yes(form.dialysis) ? 1 : 0,
    pregnant: yes(form.pregnant) ? 1 : 0,
    respCompromise: yes(form.respiratoryCompromise) ? 1 : 0,
  }
}

export function featureVector(model, form, pgx, strategy) {
  const flags = deriveContextFlags(form, pgx)
  const drug = strategyDrug(strategy)
  const phenotype = flags.phenotype
  const prodrug = drug === 'Codeine' || drug === 'Tramadol' ? 1 : 0
  const priorThis = priorFor(form, drug)
  const values = {
    age: Number(form.age),
    female: flags.female,
    weight_kg: Number(form.weight),
    baseline_nrs: Number(form.baselinePainScore),
    egfr: Number(form.egfr),
    dialysis: flags.dialysis,
    home_ome: flags.homeOme,
    opioid_tolerant: flags.opioidTolerant,
    hydroxyurea: flags.hydroxyurea,
    cns_depressant: flags.cnsDepressant,
    cyp3a4_strong: flags.cyp3a4Strong,
    serotonergic: flags.serotonergic,
    maoi: flags.maoi,
    seizure_history: flags.seizureHistory,
    breastfeeding: flags.breastfeeding,
    osa: flags.osa,
    genotype_available: flags.genotypeAvailable,
    inhib_strong: flags.inhibStrong,
    inhib_moderate: flags.inhibModerate,
    obs_PM: phenotype === 'PM' ? 1 : 0,
    obs_IM: phenotype === 'IM' ? 1 : 0,
    obs_NM: phenotype === 'NM' ? 1 : 0,
    obs_UM: phenotype === 'UM' ? 1 : 0,
    scd_HbSS: flags.scd === 'HbSS' ? 1 : 0,
    scd_HbSC: flags.scd === 'HbSC' ? 1 : 0,
    hepatic_mild_mod: flags.hepatic === 'mild_mod' ? 1 : 0,
    hepatic_severe: flags.hepatic === 'severe' ? 1 : 0,
    prodrug,
    prodrug_x_obsIM: prodrug && phenotype === 'IM' ? 1 : 0,
    prodrug_x_obsPM: prodrug && phenotype === 'PM' ? 1 : 0,
    prodrug_x_unknown_inhib: prodrug && phenotype === '' && flags.inhibitorPresent ? 1 : 0,
    codeine_x_obsIM: drug === 'Codeine' && phenotype === 'IM' ? 1 : 0,
  }

  for (const name of DRUGS) {
    const prior = priorFor(form, name)
    for (const category of PRIOR_CATEGORIES) {
      values[`prior_${name}_${category}`] = prior === category ? 1 : 0
    }
  }
  for (const item of CONTEXTS[model.context].strategies) {
    values[`strategy_${item}`] = item === strategy ? 1 : 0
    values[`tolerant_x_${item}`] = item === strategy ? flags.opioidTolerant : 0
  }
  for (const category of PRIOR_CATEGORIES) {
    values[`prior_this_${category}`] = priorThis === category ? 1 : 0
  }

  return model.features.map((name) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) {
      throw new Error(`v2.1 feature ${name} is not defined for deployment.`)
    }
    const value = values[name]
    if (!Number.isFinite(value)) {
      throw new Error(`v2.1 feature ${name} is missing or not numeric.`)
    }
    return value
  })
}
