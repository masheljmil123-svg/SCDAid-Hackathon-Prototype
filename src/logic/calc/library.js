/**
 * SCDAid Clinical Calculation Library v0.1.
 * Research proof of concept. Outputs are inputs and flags, not prescriptions.
 * Formulas are copied from CALCULATION_LIBRARY.md. Missing inputs return null
 * and a reason. These functions do not change v2.1 rule thresholds.
 */

const EPS = 1e-9

export const LIBRARY_STATUS =
  'Research proof of concept. Not approved for clinical use. Every output must be verified by a clinician.'

function finite(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function reject(id, reason) {
  return { id, value: null, error: reason, references: [] }
}

function sexCode(sex) {
  const raw = String(sex || '').trim().toLowerCase()
  if (raw === 'f' || raw === 'female') return 'F'
  if (raw === 'm' || raw === 'male') return 'M'
  return null
}

function unitKey(unit) {
  const raw = String(unit || '').trim().toLowerCase().replace('µ', 'u')
  if (raw === 'mg/dl') return 'mg/dL'
  if (raw === 'umol/l') return 'umol/L'
  if (raw === 'g/dl') return 'g/dL'
  if (raw === 'g/l') return 'g/L'
  return null
}

export function scrToMgDl(value, unit) {
  const scr = finite(value)
  const parsed = unitKey(unit)
  if (scr === null || scr < 0) return reject('RF-01', 'MISSING_OR_INVALID_CREATININE')
  if (!parsed || (parsed !== 'mg/dL' && parsed !== 'umol/L')) return reject('RF-01', 'UNITLESS_OR_UNKNOWN_UNIT')
  const scrMgDl = parsed === 'mg/dL' ? scr : scr / 88.4
  return { id: 'RF-01', scr_mgdl: scrMgDl, value: scrMgDl, error: null, references: ['KDIGO2012_AKI'] }
}

export function egfrCkdEpi2021(scrMgDl, ageYears, sex) {
  const scr = finite(scrMgDl)
  const age = finite(ageYears)
  const code = sexCode(sex)
  if (scr === null || scr < 0 || age === null || age < 0 || !code) {
    return reject('RF-02', 'MISSING_INPUT')
  }
  if (age < 18) return { id: 'RF-02', value: null, error: 'OUT_OF_SCOPE_AGE', references: ['INKER2021', 'NKF2021'] }
  const female = code === 'F'
  const kappa = female ? 0.7 : 0.9
  const alpha = female ? -0.241 : -0.302
  const ratio = scr / kappa
  const egfr =
    142 *
    Math.min(ratio, 1) ** alpha *
    Math.max(ratio, 1) ** -1.2 *
    0.9938 ** age *
    (female ? 1.012 : 1)
  return {
    id: 'RF-02',
    egfr_ml_min_1_73m2: egfr,
    value: egfr,
    display: Math.round(egfr * 10) / 10,
    error: null,
    references: ['INKER2021', 'NKF2021', 'ARLET2012', 'ALKHUNAIZI2018'],
    limitations: ['SCD creatinine equations can overestimate GFR', 'Not valid in AKI or pregnancy', '2021 equation is not validated in SCD'],
  }
}

export function crclCockcroftGault(scrMgDl, ageYears, weightKg, sex) {
  const scr = finite(scrMgDl)
  const age = finite(ageYears)
  const weight = finite(weightKg)
  const code = sexCode(sex)
  if (scr === null || scr <= 0 || age === null || weight === null || weight <= 0 || !code) {
    return reject('RF-03', 'MISSING_INPUT')
  }
  const sexFactor = code === 'F' ? 0.85 : 1
  const crcl = ((140 - age) * weight) / (72 * scr) * sexFactor
  return {
    id: 'RF-03',
    crcl_ml_min: crcl,
    value: crcl,
    display: Math.round(crcl * 10) / 10,
    error: null,
    references: ['COCKCROFT1976', 'LBL_TRAMADOL_TAB'],
  }
}

function creatinineStage(ratio, rise, scr, criterionMet) {
  let stage = 0
  if (ratio !== null) {
    if (ratio >= 3) stage = 3
    else if (ratio >= 2) stage = 2
    else if (ratio >= 1.5) stage = 1
  }
  if (rise !== null && rise + EPS >= 0.3) stage = Math.max(stage, 1)
  if (criterionMet && scr + EPS >= 4) stage = 3
  return stage
}

function urineStage(uo, hours) {
  if (uo === null || hours === null) return 0
  if (uo <= EPS && hours + EPS >= 12) return 3
  if (uo < 0.3 && hours + EPS >= 24) return 3
  if (uo < 0.5 && hours + EPS >= 12) return 2
  if (uo < 0.5 && hours + EPS >= 6) return 1
  return 0
}

export function kdigoAki({
  scr_now: scrNow,
  scr_48h_min: scr48,
  scr_baseline: scrBase,
  uo_ml_kg_h: uo,
  uo_hours: hours,
  rrt = false,
} = {}) {
  const nowRaw = scrNow === undefined || scrNow === null || scrNow === '' ? null : finite(scrNow)
  const urine = uo === undefined || uo === null || uo === '' ? null : finite(uo)
  const duration = hours === undefined || hours === null || hours === '' ? null : finite(hours)
  const urineGiven = urine !== null && duration !== null
  // KDIGO 2012: the urine-output and RRT criteria stand on their own, so a missing
  // creatinine only blocks the creatinine criteria.
  if ((nowRaw === null || nowRaw < 0) && !urineGiven && !rrt) return reject('RF-05', 'MISSING_INPUT')
  const now = nowRaw !== null && nowRaw >= 0 ? nowRaw : null
  const min48 = now === null || scr48 === undefined || scr48 === null || scr48 === '' ? null : finite(scr48)
  const baseline = now === null || scrBase === undefined || scrBase === null || scrBase === '' ? null : finite(scrBase)
  const rise = min48 === null ? null : now - min48
  const ratio = baseline !== null && baseline > 0 ? now / baseline : null
  const urineHit = urineStage(urine, duration) > 0
  const riseHit = rise !== null && rise + EPS >= 0.3
  const ratioHit = ratio !== null && ratio + EPS >= 1.5
  const aki = Boolean(rrt || riseHit || ratioHit || urineHit)
  const criterionMet = riseHit || ratioHit || urineHit || Boolean(rrt)
  let stage = Math.max(
    creatinineStage(ratio, rise, now, criterionMet),
    urineStage(urine, duration),
  )
  if (rrt) stage = 3
  if (!aki) stage = 0
  const flags = []
  if (baseline === null) flags.push('BASELINE_UNKNOWN')
  if (aki) flags.push('NON_STEADY_STATE')
  // With a single creatinine and no baseline, 48-h value, urine output or RRT,
  // KDIGO cannot be applied: "criteria not met" would be a false reassurance.
  const assessable = Boolean(min48 !== null || baseline !== null || urineGiven || rrt)
  return {
    id: 'RF-05',
    aki,
    stage,
    flags,
    assessable,
    error: null,
    references: ['KDIGO2012_AKI', 'NABALAWI2026'],
  }
}

export function bilirubinToMgDl(value) {
  const number = finite(value)
  if (number === null || number < 0) return reject('HP-01', 'MISSING_INPUT')
  return { id: 'HP-01', bilirubin_mgdl: number / 17.1, value: number / 17.1, error: null, references: ['VA_CTP'] }
}

export function albuminToGDl(value) {
  const number = finite(value)
  if (number === null || number < 0) return reject('HP-01', 'MISSING_INPUT')
  return { id: 'HP-01', albumin_gdl: number / 10, value: number / 10, error: null, references: ['VA_CTP'] }
}

function biliPoints(value) {
  if (value < 2) return 1
  if (value <= 3) return 2
  return 3
}

function albuminPoints(value) {
  if (value > 3.5) return 1
  if (value >= 2.8) return 2
  return 3
}

function inrPoints(value) {
  if (value < 1.7) return 1
  if (value <= 2.3) return 2
  return 3
}

const ASCITES_POINTS = { none: 1, mild_moderate: 2, severe: 3 }
const ENCEPH_POINTS = { none: 1, grade_1_2: 2, grade_3_4: 3 }

export function childPugh({
  bilirubin_mgdl: bilirubin,
  albumin_gdl: albumin,
  inr,
  ascites,
  encephalopathy,
  known_liver_disease: known,
} = {}) {
  const knownDisease = known === true
  if (!knownDisease) {
    const scored = scoreChildPugh(bilirubin, albumin, inr, ascites, encephalopathy)
    return {
      id: 'HP-02',
      points: scored?.points ?? null,
      class: scored?.class ?? null,
      scdaid_hepatic_category: 'none',
      flags: [],
      appliedToRules: false,
      approval: 'L1_pending',
      error: null,
      references: ['VA_CTP', 'PUGH1973'],
    }
  }
  const scored = scoreChildPugh(bilirubin, albumin, inr, ascites, encephalopathy)
  if (!scored) {
    return {
      id: 'HP-02',
      points: null,
      class: null,
      scdaid_hepatic_category: 'unknown',
      flags: ['INCOMPLETE_CHILD_PUGH'],
      appliedToRules: false,
      approval: 'L1_pending',
      error: null,
      references: ['VA_CTP'],
    }
  }
  const flags = []
  const onlyBilirubin =
    scored.parts.bilirubin > 1 &&
    scored.parts.albumin === 1 &&
    scored.parts.inr === 1 &&
    scored.parts.ascites === 1 &&
    scored.parts.encephalopathy === 1
  if (onlyBilirubin) flags.push('HAEMOLYSIS_CONFOUNDING')
  const category = scored.class === 'C' ? 'severe' : 'mild_mod'
  return {
    id: 'HP-02',
    points: scored.points,
    class: scored.class,
    scdaid_hepatic_category: category,
    flags,
    appliedToRules: false,
    approval: 'L1_pending',
    error: null,
    references: ['VA_CTP', 'PUGH1973', 'TAIF_LFT2025'],
  }
}

function scoreChildPugh(bilirubin, albumin, inr, ascites, encephalopathy) {
  const bili = finite(bilirubin)
  const alb = finite(albumin)
  const inrValue = finite(inr)
  if (bili === null || alb === null || inrValue === null) return null
  if (!ASCITES_POINTS[ascites] || !ENCEPH_POINTS[encephalopathy]) return null
  const parts = {
    bilirubin: biliPoints(bili),
    albumin: albuminPoints(alb),
    inr: inrPoints(inrValue),
    ascites: ASCITES_POINTS[ascites],
    encephalopathy: ENCEPH_POINTS[encephalopathy],
  }
  const points = Object.values(parts).reduce((sum, item) => sum + item, 0)
  const cls = points <= 6 ? 'A' : points <= 9 ? 'B' : 'C'
  return { points, class: cls, parts }
}

export function bmi(weightKg, heightCm) {
  const weight = finite(weightKg)
  const height = finite(heightCm)
  if (weight === null || weight <= 0 || height === null || height <= 0) return reject('BW-01', 'MISSING_INPUT')
  const value = weight / (height / 100) ** 2
  return {
    id: 'BW-01',
    bmi: value,
    value,
    display: Math.round(value * 10) / 10,
    obesity_flag: value + EPS >= 30,
    error: null,
    references: ['JANMAHASATIAN2005'],
  }
}

export function leanBodyWeight(weightKg, bmiValue, sex) {
  const weight = finite(weightKg)
  const index = finite(bmiValue)
  const code = sexCode(sex)
  if (weight === null || index === null || !code) return reject('BW-02', 'MISSING_INPUT')
  const value =
    code === 'F'
      ? (9270 * weight) / (8780 + 244 * index)
      : (9270 * weight) / (6680 + 216 * index)
  return {
    id: 'BW-02',
    lbw_kg: value,
    value,
    display: Math.round(value * 10) / 10,
    displayOnly: true,
    usedForDose: false,
    error: null,
    references: ['JANMAHASATIAN2005', 'INGRANDE2010'],
  }
}

const MME_FACTORS = { MORPHINE: 1, OXYCODONE: 1.5, HYDROMORPHONE: 5, CODEINE: 0.15, TRAMADOL: 0.2 }
const FDA_DAILY = { MORPHINE: 60, OXYCODONE: 30, HYDROMORPHONE: 8 }

export function homeMme(homeOpioids = []) {
  if (!Array.isArray(homeOpioids)) return reject('OT-01', 'MISSING_INPUT')
  let total = 0
  for (const row of homeOpioids) {
    const drug = String(row?.drug || '').trim().toUpperCase()
    const amount = finite(row?.mg_per_day_max)
    if (!MME_FACTORS[drug] || amount === null || amount < 0) {
      return { id: 'OT-01', value: null, error: 'NOT_QUANTIFIABLE', references: ['CDC2022_MME'] }
    }
    total += amount * MME_FACTORS[drug]
  }
  return { id: 'OT-01', home_mme_mg_day: total, value: total, error: null, references: ['CDC2022_MME'] }
}

export function fdaTolerant(homeOpioids = [], homeMmeValue = null) {
  const rows = Array.isArray(homeOpioids) ? homeOpioids : []
  const specific = rows.some((row) => {
    const drug = String(row?.drug || '').trim().toUpperCase()
    const amount = finite(row?.mg_per_day_max)
    const days = finite(row?.days_regular)
    return FDA_DAILY[drug] && amount !== null && amount + EPS >= FDA_DAILY[drug] && days !== null && days + EPS >= 7
  })
  const exposure = homeMmeValue === null ? homeMme(rows) : { value: homeMmeValue, error: null }
  const allWeek =
    rows.length > 0 &&
    rows.every((row) => {
      const days = finite(row?.days_regular)
      return days !== null && days + EPS >= 7
    })
  const byMme = exposure.error == null && exposure.value + EPS >= 60 && allWeek
  return { id: 'OT-02', opioid_tolerant_fda: Boolean(specific || byMme), error: null, references: ['FDA_TOLERANT'] }
}

const ALLELE_ACTIVITY = {
  '*1': 1,
  '*2': 1,
  '*35': 1,
  '*9': 0.5,
  '*41': 0.5,
  '*17': 0.5,
  '*29': 0.5,
  '*10': 0.25,
  '*3': 0,
  '*4': 0,
  '*5': 0,
  '*6': 0,
}

export function cyp2d6Activity(allele1, allele2, copies1 = 1, copies2 = 1) {
  const a1 = ALLELE_ACTIVITY[String(allele1 || '').trim()]
  const a2 = ALLELE_ACTIVITY[String(allele2 || '').trim()]
  if (a1 === undefined || a2 === undefined) {
    return { id: 'PG-01', value: null, error: 'UNKNOWN', references: ['CPIC2021'] }
  }
  const flags = []
  let c1 = copies1
  let c2 = copies2
  if (c1 === 'xN' || c1 === null) {
    c1 = 2
    flags.push('DUPLICATION_ASSUMED_X2')
  }
  if (c2 === 'xN' || c2 === null) {
    c2 = 2
    flags.push('DUPLICATION_ASSUMED_X2')
  }
  const n1 = finite(c1)
  const n2 = finite(c2)
  if (n1 === null || n2 === null || n1 < 0 || n2 < 0) return reject('PG-01', 'MISSING_COPY_NUMBER')
  const score = a1 * n1 + a2 * n2
  return { id: 'PG-01', activity_score: score, value: score, flags, error: null, references: ['CPIC2021'] }
}

export function phenoconvert(score, inhibitor) {
  const value = finite(score)
  if (value === null) return reject('PG-02', 'MISSING_SCORE')
  const level = String(inhibitor || 'none').toLowerCase()
  if (level === 'unknown') {
    return { id: 'PG-02', value: null, error: 'UNKNOWN_INHIBITOR_STATUS', references: ['FDA_DDI_TABLE', 'CPIC2021'] }
  }
  const factor = level === 'strong' ? 0 : level === 'moderate' ? 0.5 : 1
  return { id: 'PG-02', functional_score: value * factor, value: value * factor, error: null, references: ['CPIC2021', 'CICALI2021'] }
}

export function phenotypeFromScore(score) {
  const value = finite(score)
  if (value === null || value < 0) return { id: 'PG-03', value: null, error: 'MISSING_SCORE', references: ['CPIC2021'] }
  let name = 'UM'
  if (value === 0) name = 'PM'
  else if (value < 1.25) name = 'IM'
  else if (value <= 2.25) name = 'NM'
  return { id: 'PG-03', phenotype: name, value: name, error: null, references: ['CPIC2021'] }
}

export function rolling24h(doses, now, proposedMg, dailyMax) {
  const current = new Date(now)
  const proposed = finite(proposedMg)
  const max = finite(dailyMax)
  if (Number.isNaN(current.getTime()) || proposed === null || max === null) return reject('DS-01', 'MISSING_INPUT')
  const windowStart = current.getTime() - 24 * 60 * 60 * 1000
  let total = proposed
  for (const row of doses || []) {
    const when = new Date(row[0]).getTime()
    const amount = finite(row[1])
    if (!Number.isFinite(when) || amount === null) return reject('DS-01', 'MISSING_INPUT')
    if (when > windowStart && when <= current.getTime() + EPS) total += amount
  }
  return {
    id: 'DS-01',
    total_mg: total,
    allowed: total <= max + EPS,
    error: null,
    references: ['LBL_TRAMADOL_TAB', 'LBL_CODEINE_TAB'],
  }
}

export function intervalOk(last, now, minimum) {
  const start = new Date(last).getTime()
  const end = new Date(now).getTime()
  const min = finite(minimum)
  if (!Number.isFinite(start) || !Number.isFinite(end) || min === null) return reject('DS-02', 'MISSING_INPUT')
  const minutes = (end - start) / 60000
  return { id: 'DS-02', minutes, ok: minutes + EPS >= min, error: null, references: ['COMPARE_PROTOCOL', 'NHLBI2014'] }
}

export function maoiWashout(lastDate, today) {
  const start = new Date(`${lastDate}T00:00:00Z`)
  const end = new Date(`${today}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return reject('DS-04', 'MISSING_INPUT')
  const days = Math.round((end.getTime() - start.getTime()) / 86400000)
  return {
    id: 'DS-04',
    days,
    washout_complete: days >= 14,
    error: null,
    references: ['LBL_TRAMADOL_INJ_UK'],
  }
}

export function painBand(nrs) {
  const score = finite(nrs)
  if (score === null || score < 0 || score > 10) return reject('PR-01', 'OUT_OF_RANGE')
  let band = 'severe'
  if (score === 0) band = 'none'
  else if (score <= 3) band = 'mild'
  else if (score <= 6) band = 'moderate'
  return { id: 'PR-01', band, error: null, references: ['v2.1'] }
}

export function painImprovement(baseline, scheduled) {
  const base = finite(baseline)
  if (base === null || !Array.isArray(scheduled) || scheduled.length === 0) {
    return { id: 'PR-02', error: 'INCOMPLETE', references: ['ALSHAHRANI2022'] }
  }
  if (scheduled.some((item) => finite(item) === null)) {
    return { id: 'PR-02', error: 'INCOMPLETE', references: ['ALSHAHRANI2022'] }
  }
  const mean = scheduled.reduce((sum, item) => sum + Number(item), 0) / scheduled.length
  const improvement = base - mean
  return {
    id: 'PR-02',
    improvement,
    percent: base === 0 ? null : (100 * improvement) / base,
    meaningful_1pt: improvement + EPS >= 1,
    error: null,
    references: ['KNISELY2024', 'LOPEZ2007'],
  }
}

export function deltaPain60(baseline, nrs60) {
  const base = finite(baseline)
  const later = finite(nrs60)
  if (base === null || later === null) return reject('PR-03', 'MISSING_INPUT')
  return { id: 'PR-03', delta_pain60: base - later, error: null, references: [] }
}

export function responder50(baseline, later) {
  const base = finite(baseline)
  const next = finite(later)
  if (base === null || next === null || base === 0) return reject('PR-06', 'MISSING_INPUT')
  return {
    id: 'PR-06',
    responder_50pct: (base - next) / base + EPS >= 0.5,
    error: null,
    references: ['OXFORD2007', 'GASKELL2009'],
  }
}

export function doorToDose(arrival, firstDose) {
  const start = new Date(arrival).getTime()
  const end = new Date(firstDose).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return reject('PR-07', 'MISSING_INPUT')
  const minutes = (end - start) / 60000
  return {
    id: 'PR-07',
    door_to_dose_min: minutes,
    within_60_min_ASH: minutes <= 60 + EPS,
    error: null,
    references: ['ASH2020', 'NHLBI2014'],
  }
}

export function runLibraryCase(calculation, input) {
  switch (calculation) {
    case 'RF-01':
      return scrToMgDl(input.value, input.unit)
    case 'RF-02':
      return egfrCkdEpi2021(input.scr_mgdl, input.age_years, input.sex)
    case 'RF-03':
      return crclCockcroftGault(input.scr_mgdl, input.age_years, input.weight_kg, input.sex)
    case 'RF-05':
      return kdigoAki(input)
    case 'HP-01':
      return {
        id: 'HP-01',
        bilirubin_mgdl: bilirubinToMgDl(input.bilirubin_umol_l).value,
        albumin_gdl: albuminToGDl(input.albumin_g_l).value,
        error: null,
      }
    case 'HP-02':
      return childPugh(input)
    case 'BW-01':
      return bmi(input.weight_kg, input.height_cm)
    case 'BW-02': {
      const index = bmi(input.weight_kg, input.height_cm)
      const lean = leanBodyWeight(input.weight_kg, index.value, input.sex)
      return { ...lean, bmi: index.value, obesity_flag: index.obesity_flag }
    }
    case 'OT-01':
      return homeMme(input.home_opioids)
    case 'PG-01..03': {
      const activity = cyp2d6Activity(input.allele1, input.allele2, input.copies1, input.copies2)
      const converted = phenoconvert(activity.value, input.inhibitor)
      return {
        activity_score: activity.activity_score,
        genotype_phenotype: phenotypeFromScore(activity.value).phenotype,
        functional_score: converted.functional_score,
        functional_phenotype: phenotypeFromScore(converted.value).phenotype,
        error: activity.error || converted.error,
      }
    }
    case 'DS-01':
      return rolling24h(input.doses, input.now, input.new_dose_mg, input.max_daily_mg)
    case 'DS-02':
      return intervalOk(input.last, input.now, input.min_minutes)
    case 'DS-04':
      return maoiWashout(input.last_maoi_date, input.today)
    case 'PR-01':
      return painBand(input.nrs)
    case 'PR-02/04/05':
      return painImprovement(input.baseline, input.scheduled)
    case 'PR-03':
      return deltaPain60(input.baseline, input.nrs60)
    case 'PR-06':
      return responder50(input.baseline, input.later)
    case 'PR-07':
      return doorToDose(input.arrival, input.first_dose)
    default:
      return { error: 'UNSUPPORTED', id: calculation }
  }
}
