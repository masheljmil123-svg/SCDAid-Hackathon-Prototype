export const PROFESSIONAL_ROLE_OPTIONS = [
  { value: 'physician', label: 'Physician' },
  { value: 'pharmacist', label: 'Pharmacist' },
  { value: 'researcher', label: 'Researcher' },
  { value: 'student', label: 'Student' },
  { value: 'other', label: 'Other' },
]

export const CATEGORY_OPTIONS = [
  { value: 'clinical', label: 'Clinical' },
  { value: 'usability', label: 'Usability' },
  { value: 'ai_technology', label: 'AI / Technology' },
  { value: 'general', label: 'General Suggestion' },
]

export const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'considered', label: 'Considered' },
  { value: 'implemented', label: 'Implemented' },
]

export const PRIVACY_NOTICE =
  'Please do not include identifiable patient information. Feedback is stored securely for the SCDAid team and project supervisor.'

export function labelFor(options, value) {
  return options.find((item) => item.value === value)?.label || value || '—'
}
