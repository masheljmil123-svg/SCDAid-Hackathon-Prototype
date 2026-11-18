/**
 * Fictional demonstration cases for the SCDAid prototype.
 * Forms pre-fill the assessment UI. Recommendations are produced at runtime by the
 * verified SCDAid v2.1 Linear Regression pipeline (see data/recommendation.js).
 * Any legacy `result` blobs below are unused display fixtures and are not the live path.
 */

import { EMPTY_FORM } from './formState.js'

export const DEMO_BANNER = 'Prototype demo · fictional cases · SCDAid v2.1 simulation'

const DEMO_DISCLAIMER =
  'Simulated SCDAid v2.1 demonstration result. Research-only — not a live clinical order and not clinically validated.'

function baseForm(overrides) {
  return {
    ...EMPTY_FORM,
    vitalSigns: [],
    liverTests: [],
    comorbidities: [],
    medications: [],
    baselineOpioids: [],
    previousResponses: [],
    allergies: [],
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
    ...overrides,
  }
}

function explanation(findings) {
  return {
    title: 'Why SCDAid Recommended This',
    disclaimer:
      'The items below summarize the demo pathway and eligibility rules for this predefined case. They are not SHAP values and are not clinical validation.',
    findings,
  }
}

export const DEMO_CASES = [
  {
    id: 'amina',
    code: 'DEMO-01',
    name: 'Amina Al-Rashid',
    shortTitle: 'Straightforward adult VOC',
    scenario:
      'Young adult with HbSS presenting with severe VOC pain and a documented favorable morphine response.',
    highlight: 'Eligible pathway · prior favorable morphine',
    tone: 'success',
    form: baseForm({
      age: '28',
      sex: 'Female',
      weight: '62',
      heightCm: '163',
      bmi: '23.4',
      baselinePainScore: 9,
      scdGenotype: 'HbSS',
      vocHistory: '4',
      egfr: '110',
      comorbidities: ['Avascular necrosis'],
      medications: ['Hydroxyurea', 'Folic acid'],
      noBaselineOpioid: true,
      opioidTolerance: 'No',
      previousResponses: [{ id: 'amina-prev-1', opioid: 'Morphine', response: 'Favorable' }],
      noKnownAllergy: true,
      allergies: [],
      genotypeAvailable: 'No',
    }),
    result: {
      disclaimer: DEMO_DISCLAIMER,
      preferred: {
        name: 'Morphine IV',
        eligibility: 'Eligible',
        subtitle: 'Highest simulated prediction among Eligible options',
        route: 'IV',
        predictedDeltaPain60: 4.2,
      },
      alternatives: [
        {
          id: 'hydromorphone-iv',
          name: 'Hydromorphone IV',
          eligibility: 'Eligible',
          route: 'IV',
          predictedDeltaPain60: 3.9,
          note: 'Eligible alternative in the parenteral pathway.',
        },
        {
          id: 'fentanyl-iv',
          name: 'Fentanyl IV',
          eligibility: 'Eligible',
          route: 'IV',
          predictedDeltaPain60: 3.6,
          note: 'Eligible; typically reserved when morphine is unsuitable.',
        },
        {
          id: 'tramadol-iv',
          name: 'Tramadol IV',
          eligibility: 'Eligible',
          route: 'IV',
          predictedDeltaPain60: 2.8,
          note: 'Eligible but lower simulated pain reduction in this demo case.',
        },
      ],
      doseGuidance:
        'No cited renal or hepatic dose-adjustment excerpt applies. Any institutional dose must be verified by a clinician before prescribing.',
      prediction: {
        label: 'Simulated pain reduction',
        note: 'Predefined demo output for presentation. Not a live model run.',
      },
      pgx: {
        genotypeAvailable: false,
        activityScore: null,
        predictedPhenotype: null,
        adjustedScore: null,
        functionalPhenotype: null,
        phenoconversion: false,
        inhibitionRisk: null,
        error: null,
      },
      safety: {
        renal: {
          title: 'Renal function',
          message: 'eGFR 110 mL/min/1.73m². No renal caution triggered in this demo case.',
          tone: 'info',
        },
        hepatic: {
          title: 'Hepatic assessment',
          message: 'Clinician classified hepatic impairment as none.',
          tone: 'info',
        },
        interaction: null,
        allergy: null,
      },
      explanation: explanation([
        'Clinical pathway: parenteral severe VOC.',
        'Morphine IV has the highest simulated prediction among Eligible options in this pathway.',
        'Documented previous response: Morphine (Favorable).',
        'CYP2D6 genotype was not available.',
      ]),
      followUp: {
        timing: 'Reassess pain within 15–30 minutes after IV opioid',
        message: 'Reassess analgesia, sedation, and respiratory status per local VOC protocol.',
      },
    },
  },
  {
    id: 'omar',
    code: 'DEMO-02',
    name: 'Omar Al-Harbi',
    shortTitle: 'Renal impairment VOC',
    scenario:
      'Adult with HbSC and reduced eGFR presenting with severe VOC. Renal status reshapes eligibility.',
    highlight: 'eGFR 38 · renal caution pathway',
    tone: 'warning',
    form: baseForm({
      age: '41',
      sex: 'Male',
      weight: '78',
      heightCm: '173',
      bmi: '26.1',
      baselinePainScore: 8,
      scdGenotype: 'HbSC',
      vocHistory: '2',
      egfr: '38',
      comorbidities: ['Chronic kidney disease'],
      medications: ['Hydroxyurea'],
      noBaselineOpioid: true,
      opioidTolerance: 'No',
      previousResponses: [
        { id: 'omar-prev-1', opioid: 'Hydromorphone', response: 'Inadequate' },
      ],
      noKnownAllergy: false,
      allergies: [{ id: 'omar-alg-1', drug: 'Codeine', reaction: 'Rash' }],
      genotypeAvailable: 'No',
    }),
    result: {
      disclaimer: DEMO_DISCLAIMER,
      preferred: {
        name: 'Fentanyl IV',
        eligibility: 'Eligible',
        subtitle: 'Highest simulated prediction among Eligible options',
        route: 'IV',
        predictedDeltaPain60: 3.7,
      },
      alternatives: [
        {
          id: 'morphine-iv',
          name: 'Morphine IV',
          eligibility: 'Caution',
          route: 'IV',
          predictedDeltaPain60: null,
          note: 'eGFR 38: reduced clearance of active metabolites. Clinician review required.',
        },
        {
          id: 'hydromorphone-iv',
          name: 'Hydromorphone IV',
          eligibility: 'Caution',
          route: 'IV',
          predictedDeltaPain60: null,
          note: 'eGFR <60: caution for metabolite accumulation. Prior response was inadequate.',
        },
        {
          id: 'tramadol-iv',
          name: 'Tramadol IV',
          eligibility: 'Caution',
          route: 'IV',
          predictedDeltaPain60: null,
          note: 'Reduced clearance at this eGFR; not ranked while Caution applies.',
        },
        {
          id: 'codeine',
          name: 'Codeine',
          eligibility: 'Avoid',
          route: 'Oral',
          predictedDeltaPain60: null,
          note: 'Documented codeine allergy — not recommended and not ranked.',
        },
      ],
      doseGuidance:
        'Morphine IV: eGFR <60 — caution for metabolite accumulation. Hydromorphone IV: eGFR <60 — caution. These are cited renal-rule excerpts from the v2.1 logic. No automatic dose is prescribed in this demo.',
      prediction: {
        label: 'Simulated pain reduction',
        note: 'Predefined demo output for presentation. Not a live model run.',
      },
      pgx: {
        genotypeAvailable: false,
        activityScore: null,
        predictedPhenotype: null,
        adjustedScore: null,
        functionalPhenotype: null,
        phenoconversion: false,
        inhibitionRisk: null,
        error: null,
      },
      safety: {
        renal: {
          title: 'Renal safety alert',
          message:
            'eGFR 38 mL/min/1.73m². Drug-specific renal tiers moved morphine, hydromorphone, and tramadol to Caution.',
          tone: 'warning',
        },
        hepatic: {
          title: 'Hepatic assessment',
          message: 'Clinician classified hepatic impairment as none.',
          tone: 'info',
        },
        interaction: null,
        allergy: {
          title: 'Allergy / intolerance',
          message: 'Codeine: documented allergy or intolerance.',
        },
      },
      explanation: explanation([
        'Clinical pathway: parenteral severe VOC with renal caution.',
        'Fentanyl IV remained Eligible and ranks highest among Eligible options.',
        'Not recommended and not ranked: Codeine.',
        'Documented previous response: Hydromorphone (Inadequate).',
      ]),
      followUp: {
        timing: 'Reassess pain within 15–30 minutes after IV opioid',
        message: 'Include renal monitoring and sedation checks in the reassessment plan.',
      },
    },
  },
  {
    id: 'layla',
    code: 'DEMO-03',
    name: 'Layla Mansour',
    shortTitle: 'PGx + drug interaction VOC',
    scenario:
      'Adult with available CYP2D6 genotype on a strong inhibitor, illustrating phenoconversion and interaction flags.',
    highlight: 'CYP2D6 *1/*41 · phenoconversion',
    tone: 'genetic',
    form: baseForm({
      age: '33',
      sex: 'Female',
      weight: '58',
      heightCm: '160',
      bmi: '22.7',
      baselinePainScore: 9,
      scdGenotype: 'HbSS',
      vocHistory: '5',
      egfr: '105',
      comorbidities: [],
      medications: ['Paroxetine', 'Clarithromycin', 'Hydroxyurea'],
      noBaselineOpioid: true,
      opioidTolerance: 'No',
      previousResponses: [],
      noKnownAllergy: true,
      allergies: [],
      genotypeAvailable: 'Yes',
      allele1: '*1',
      allele2: '*41',
      strongCyp3a4Inhibitor: 'Yes',
    }),
    result: {
      disclaimer: DEMO_DISCLAIMER,
      preferred: {
        name: 'Morphine IV',
        eligibility: 'Eligible',
        subtitle: 'Highest simulated prediction among Eligible options',
        route: 'IV',
        predictedDeltaPain60: 4.0,
      },
      alternatives: [
        {
          id: 'hydromorphone-iv',
          name: 'Hydromorphone IV',
          eligibility: 'Eligible',
          route: 'IV',
          predictedDeltaPain60: 3.8,
          note: 'Eligible alternative; not CYP2D6-dependent.',
        },
        {
          id: 'fentanyl-iv',
          name: 'Fentanyl IV',
          eligibility: 'Caution',
          route: 'IV',
          predictedDeltaPain60: null,
          note: 'Clarithromycin (strong CYP3A4 inhibitor): interaction caution for fentanyl.',
        },
        {
          id: 'codeine',
          name: 'Codeine',
          eligibility: 'Avoid',
          route: 'Oral',
          predictedDeltaPain60: null,
          note: 'Functional CYP2D6 poor metabolizer after phenoconversion — avoid codeine.',
        },
        {
          id: 'tramadol',
          name: 'Tramadol',
          eligibility: 'Avoid',
          route: 'IV / Oral',
          predictedDeltaPain60: null,
          note: 'Functional CYP2D6 poor metabolizer; serotonergic interaction risk with paroxetine.',
        },
      ],
      doseGuidance:
        'No cited renal or hepatic dose-adjustment excerpt applies to the Eligible options. Interaction and PGx flags are shown under Safety. Verify any institutional dose before prescribing.',
      prediction: {
        label: 'Simulated pain reduction',
        note: 'Predefined demo output for presentation. Not a live model run.',
      },
      pgx: {
        genotypeAvailable: true,
        activityScore: 1.5,
        predictedPhenotype: 'Normal metabolizer',
        adjustedScore: 0,
        functionalPhenotype: 'Poor metabolizer',
        phenoconversion: true,
        inhibitionRisk: {
          title: 'Phenoconversion alert',
          message:
            'Paroxetine (strong CYP2D6 inhibitor) adjusts genotype-predicted NM (*1/*41) to a functional poor-metabolizer phenotype.',
        },
        error: null,
      },
      safety: {
        renal: {
          title: 'Renal function',
          message: 'eGFR 105 mL/min/1.73m². No renal caution triggered.',
          tone: 'info',
        },
        hepatic: {
          title: 'Hepatic assessment',
          message: 'Clinician classified hepatic impairment as none.',
          tone: 'info',
        },
        interaction: {
          title: 'Class-wide monitoring alert',
          message:
            'Serotonergic interaction risk: tramadol with paroxetine. Strong CYP3A4 inhibitor (clarithromycin) flagged for fentanyl caution.',
        },
        allergy: null,
      },
      explanation: explanation([
        'Clinical pathway: parenteral severe VOC.',
        'Genotype-predicted CYP2D6 phenotype: Normal metabolizer.',
        'Functional CYP2D6 phenotype after inhibitor adjustment: Poor metabolizer.',
        'Strong CYP2D6 inhibitor exposure (Paroxetine).',
        'Not recommended and not ranked: Codeine, Tramadol.',
      ]),
      followUp: {
        timing: 'Reassess pain within 15–30 minutes after IV opioid',
        message: 'Monitor for serotonergic symptoms and sedation while interacting drugs continue.',
      },
    },
  },
  {
    id: 'faisal',
    code: 'DEMO-04',
    name: 'Faisal Nasser',
    shortTitle: 'Allergy + opioid tolerance VOC',
    scenario:
      'Opioid-tolerant adult with morphine allergy and a prior adverse hydromorphone response.',
    highlight: 'Morphine allergy · tolerant patient',
    tone: 'warning',
    form: baseForm({
      age: '36',
      sex: 'Male',
      weight: '81',
      heightCm: '178',
      bmi: '25.6',
      baselinePainScore: 10,
      scdGenotype: 'HbSS',
      vocHistory: '7',
      egfr: '118',
      comorbidities: ['Obstructive sleep apnea'],
      medications: ['Oxycodone', 'Folic acid'],
      noBaselineOpioid: false,
      baselineOpioids: [
        {
          id: 'faisal-base-1',
          drug: 'Oxycodone',
          dose: '10 mg every 6 h',
          route: 'Oral',
          mgPerDay: '40',
          daysRegular: '21',
        },
      ],
      homeDailyOme: '60',
      opioidTolerance: 'Yes',
      previousResponses: [
        { id: 'faisal-prev-1', opioid: 'Hydromorphone', response: 'Adverse' },
      ],
      noKnownAllergy: false,
      allergies: [
        {
          id: 'faisal-alg-1',
          drug: 'Morphine',
          reaction: 'Urticaria / angioedema',
        },
      ],
      genotypeAvailable: 'No',
      respiratoryCompromise: 'No',
    }),
    result: {
      disclaimer: DEMO_DISCLAIMER,
      preferred: {
        name: 'Fentanyl IV',
        eligibility: 'Eligible',
        subtitle: 'Only Eligible option remaining after safety review',
        route: 'IV',
        predictedDeltaPain60: 3.5,
      },
      alternatives: [
        {
          id: 'morphine-iv',
          name: 'Morphine IV',
          eligibility: 'Avoid',
          route: 'IV',
          predictedDeltaPain60: null,
          note: 'Documented morphine allergy with urticaria/angioedema — avoid.',
        },
        {
          id: 'hydromorphone-iv',
          name: 'Hydromorphone IV',
          eligibility: 'Caution',
          route: 'IV',
          predictedDeltaPain60: null,
          note: 'Previous adverse hydromorphone response; clinician review required.',
        },
        {
          id: 'tramadol-iv',
          name: 'Tramadol IV',
          eligibility: 'Caution',
          route: 'IV',
          predictedDeltaPain60: null,
          note: 'Opioid-tolerant patient; tramadol alone is unlikely to meet severe VOC needs.',
        },
      ],
      doseGuidance:
        'Opioid-tolerant presentation: individualize dosing under clinician supervision. No automatic mg proposal is shown in this public demo. Verify institutional protocol before prescribing.',
      prediction: {
        label: 'Simulated pain reduction',
        note: 'Predefined demo output for presentation. Not a live model run.',
      },
      pgx: {
        genotypeAvailable: false,
        activityScore: null,
        predictedPhenotype: null,
        adjustedScore: null,
        functionalPhenotype: null,
        phenoconversion: false,
        inhibitionRisk: null,
        error: null,
      },
      safety: {
        renal: {
          title: 'Renal function',
          message: 'eGFR 118 mL/min/1.73m². No renal caution triggered.',
          tone: 'info',
        },
        hepatic: {
          title: 'Hepatic assessment',
          message: 'Clinician classified hepatic impairment as none.',
          tone: 'info',
        },
        interaction: null,
        allergy: {
          title: 'Allergy / intolerance alert',
          message: 'Morphine: documented allergy with urticaria/angioedema.',
        },
        monitoring: {
          title: 'Respiratory monitoring',
          message:
            'Obstructive sleep apnea plus opioid tolerance: heighten monitoring for sedation and respiratory depression.',
        },
      },
      explanation: explanation([
        'Clinical pathway: parenteral severe VOC.',
        'Fentanyl IV is the only Eligible option after allergy and prior-adverse review.',
        'Not recommended and not ranked: Morphine IV.',
        'Documented previous response: Hydromorphone (Adverse).',
        'Opioid tolerance flag is Yes based on home oxycodone use.',
      ]),
      followUp: {
        timing: 'Reassess pain within 15–30 minutes after IV opioid',
        message: 'Prioritize airway and sedation monitoring given OSA and opioid tolerance.',
      },
    },
  },
]

export function getDemoCase(caseId) {
  return DEMO_CASES.find((item) => item.id === caseId) || null
}
