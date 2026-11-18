/**
 * SCDAid v2.1 context definitions copied from the verified evidence rebuild.
 * Models score only the strategies listed here. Routes are not interchangeable.
 */

export const EQUIVALENCE_MARGIN = 1

export const DRUGS = ['Morphine', 'Hydromorphone', 'Fentanyl', 'Oxycodone', 'Codeine', 'Tramadol']

export const CONTEXTS = {
  P: {
    id: 'P',
    label: 'Severe acute VOC (NRS 7–10) — initial parenteral treatment',
    strategies: ['Morphine_IV', 'Hydromorphone_IV', 'Fentanyl_IV', 'Tramadol_IV'],
    rulesOrder: ['Morphine_IV', 'Hydromorphone_IV', 'Fentanyl_IV', 'Tramadol_IV'],
    outcomeLabel: 'Predicted mean pain reduction over 30/60/90/120 min',
    outcomeNote:
      'SCDAid v2.1 parenteral model. Simulation-trained Linear Regression. Not a 60-minute-only prediction and not clinically validated.',
    followUpTiming: '30–60 minutes after the initial parenteral dose',
    followUpMessage:
      'Reassess pain, sedation, and respiratory status on the parenteral assessment schedule used by the v2.1 simulation (30, 60, 90, and 120 minutes).',
  },
  O: {
    id: 'O',
    label: 'Moderate pain (NRS 4–6) — oral treatment',
    strategies: ['Morphine_PO', 'Oxycodone_PO', 'Codeine_PO', 'Tramadol_PO'],
    rulesOrder: ['Morphine_PO', 'Oxycodone_PO', 'Tramadol_PO', 'Codeine_PO'],
    outcomeLabel: 'Predicted mean pain reduction over 60/120/180/240 min',
    outcomeNote:
      'SCDAid v2.1 oral model. Simulation-trained Linear Regression. Not clinically validated.',
    followUpTiming: '60–240 minutes after the oral dose',
    followUpMessage:
      'Reassess pain, sedation, and respiratory status across the oral window used by the v2.1 simulation (60, 120, 180, and 240 minutes).',
  },
}

export const PRIOR_CATEGORIES = ['Favorable', 'Inadequate', 'Adverse']

export const SEROTONERGIC_MEDICATIONS = [
  'fluoxetine',
  'paroxetine',
  'duloxetine',
  'sertraline',
  'escitalopram',
  'venlafaxine',
]

export const CYP3A4_STRONG_EXAMPLES = ['clarithromycin', 'itraconazole', 'ketoconazole', 'ritonavir']

export function strategyDrug(strategy) {
  return strategy.split('_')[0]
}

export function strategyRoute(strategy) {
  const route = strategy.split('_')[1]
  if (route === 'IV') return 'IV'
  if (route === 'PO') return 'Oral'
  return route
}

export function displayName(strategy) {
  return `${strategyDrug(strategy)} ${strategyRoute(strategy)}`
}
