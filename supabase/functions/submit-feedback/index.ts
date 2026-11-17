/**
 * SCDAid Expert Insights — public feedback intake.
 * Deploy with: supabase functions deploy submit-feedback
 *
 * Secrets required (set in Supabase Dashboard → Edge Functions → Secrets):
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - RATE_LIMIT_SALT (random string; never commit)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const PROFESSIONAL_ROLES = new Set([
  'physician',
  'pharmacist',
  'researcher',
  'student',
  'other',
])
const CATEGORIES = new Set(['clinical', 'usability', 'ai_technology', 'general'])
const RATE_LIMIT = 5
const RATE_WINDOW_SECONDS = 900

/** Comma-separated origins; defaults cover GitHub Pages + local Vite. */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://masheljmil123-svg.github.io',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
]

function allowedOrigins(): string[] {
  const fromEnv = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return fromEnv.length ? fromEnv : DEFAULT_ALLOWED_ORIGINS
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || ''
  const allowOrigin = allowedOrigins().includes(origin) ? origin : allowedOrigins()[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  })
}

function trimOrNull(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  if (!text) return null
  return text.slice(0, max)
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(req) })
  }

  if (req.method !== 'POST') {
    return json(req, 405, { ok: false, error: 'Method not allowed.' })
  }

  const origin = req.headers.get('Origin') || ''
  if (origin && !allowedOrigins().includes(origin)) {
    return json(req, 403, { ok: false, error: 'Origin not allowed.' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const salt = Deno.env.get('RATE_LIMIT_SALT')

  if (!supabaseUrl || !serviceKey || !salt) {
    console.error('Missing Edge Function secrets')
    return json(req, 500, { ok: false, error: 'Server configuration error.' })
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json(req, 400, { ok: false, error: 'Invalid JSON body.' })
  }

  // Honeypot — bots fill hidden fields; humans leave empty
  if (trimOrNull(payload.company_url, 200) || trimOrNull(payload.website, 200)) {
    return json(req, 200, { ok: true })
  }

  const professionalRole = String(payload.professional_role || '').trim()
  const category = String(payload.category || '').trim()
  const message = String(payload.message || '').trim()
  const name = trimOrNull(payload.name, 120)
  const email = trimOrNull(payload.email, 254)

  if (!PROFESSIONAL_ROLES.has(professionalRole)) {
    return json(req, 400, { ok: false, error: 'Select a valid professional role.' })
  }
  if (!CATEGORIES.has(category)) {
    return json(req, 400, { ok: false, error: 'Select a valid feedback category.' })
  }
  if (message.length < 20 || message.length > 2000) {
    return json(req, 400, { ok: false, error: 'Message must be between 20 and 2000 characters.' })
  }
  if (email && !isValidEmail(email)) {
    return json(req, 400, { ok: false, error: 'Enter a valid email address or leave it blank.' })
  }

  const forwarded = req.headers.get('x-forwarded-for') || ''
  const ip = forwarded.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || 'unknown'
  const ipHash = await sha256Hex(`${salt}:${ip}`)
  const userAgent = (req.headers.get('user-agent') || '').slice(0, 400)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: allowed, error: rateError } = await admin.rpc('check_feedback_rate_limit', {
    p_ip_hash: ipHash,
    p_limit: RATE_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  })

  if (rateError) {
    console.error('Rate limit RPC failed', rateError)
    return json(req, 500, { ok: false, error: 'Unable to process submission right now.' })
  }

  if (allowed !== true) {
    return json(req, 429, { ok: false, error: 'Too many submissions. Please try again later.' })
  }

  const { error: insertError } = await admin.from('expert_feedback').insert({
    professional_role: professionalRole,
    category,
    name,
    email,
    message,
    submitter_ip_hash: ipHash,
    user_agent: userAgent || null,
  })

  if (insertError) {
    console.error('Insert failed', insertError)
    return json(req, 500, { ok: false, error: 'Unable to store feedback.' })
  }

  return json(req, 200, { ok: true })
})
