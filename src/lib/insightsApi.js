import { supabase, supabaseConfigured } from './supabaseClient.js'

function requireClient() {
  if (!supabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }
  return supabase
}

/**
 * Public submission — goes through the Edge Function (never direct table insert).
 * Does not send patient assessment or demo case data.
 */
export async function submitExpertFeedback(fields) {
  const client = requireClient()
  const { data, error } = await client.functions.invoke('submit-feedback', {
    body: {
      professional_role: fields.professionalRole,
      category: fields.category,
      name: fields.name || null,
      email: fields.email || null,
      message: fields.message,
      company_url: fields.companyUrl || '',
      website: fields.website || '',
    },
  })

  if (error) {
    let serverMessage = ''
    try {
      const body = await error?.context?.json?.()
      serverMessage = body?.error || ''
    } catch {
      /* ignore parse failures */
    }
    if (error?.context?.status === 429 || /too many/i.test(serverMessage)) {
      throw new Error(serverMessage || 'Too many submissions. Please try again later.')
    }
    throw new Error(serverMessage || error.message || 'Unable to submit feedback.')
  }

  if (!data?.ok) {
    throw new Error(data?.error || 'Unable to submit feedback.')
  }

  return true
}

export async function fetchInsightsProfile(userId) {
  const client = requireClient()
  const { data, error } = await client
    .from('insights_profiles')
    .select('user_id, role, display_name')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function listExpertFeedback() {
  const client = requireClient()
  const { data, error } = await client
    .from('expert_feedback')
    .select(
      'id, professional_role, category, name, email, message, status, status_updated_at, created_at',
    )
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

/** Admin only — RLS + DB trigger reject supervisors and content mutations. */
export async function updateFeedbackStatus(id, status) {
  const client = requireClient()
  const { data, error } = await client
    .from('expert_feedback')
    .update({ status })
    .eq('id', id)
    .select(
      'id, professional_role, category, name, email, message, status, status_updated_at, created_at',
    )
    .single()

  if (error) throw new Error(error.message)
  return data
}
