import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const serviceKey = getKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
const publicKey = getKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')

if (!supabaseUrl || !serviceKey || !publicKey) {
  throw new Error('Supabase function environment is incomplete')
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

function getKey(jsonName: string, legacyName: string): string {
  const raw = Deno.env.get(jsonName)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed.default) return String(parsed.default)
    } catch (_error) {
      // Fall back to the legacy environment variable.
    }
  }
  return Deno.env.get(legacyName) || ''
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function unauthorized(): Response {
  return jsonResponse({ error: 'invalid login credentials' }, 401)
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function quotePostgrestValue(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[*%,_]/g, (character) => '\\' + character)
  return '"' + escaped + '"'
}

async function findInvestigator(identifier: string) {
  const filter = quotePostgrestValue(identifier)
  const { data, error } = await admin
    .from('investigators')
    .select('id,account,email,auth_login_email,auth_user_id,is_active')
    .eq('is_active', true)
    .or(
      'account.ilike.' + filter +
      ',email.ilike.' + filter +
      ',auth_login_email.ilike.' + filter
    )
    .limit(2)

  if (error) throw error
  return data && data.length === 1 ? data[0] : null
}

async function signInWithEmail(email: string, password: string) {
  const response = await fetch(
    supabaseUrl + '/auth/v1/token?grant_type=password',
    {
      method: 'POST',
      headers: {
        apikey: publicKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    }
  )

  const text = await response.text()
  let payload: Record<string, unknown> = {}
  try {
    payload = text ? JSON.parse(text) : {}
  } catch (_error) {
    payload = {}
  }

  return { response, payload }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405)
  }

  try {
    const body = await request.json()
    const identifier = String(body?.identifier || '').trim()
    const password = String(body?.password || '')

    if (!identifier || !password || identifier.length > 320 || password.length > 1024) {
      return unauthorized()
    }

    const investigator = await findInvestigator(identifier)
    if (!investigator) return unauthorized()

    const loginEmail = String(
      investigator.auth_login_email || investigator.email || ''
    ).trim().toLowerCase()
    if (!validEmail(loginEmail)) return unauthorized()

    const authResult = await signInWithEmail(loginEmail, password)
    if (!authResult.response.ok) return unauthorized()

    const authUserId = String(
      (authResult.payload.user as { id?: string } | undefined)?.id || ''
    )
    if (!authUserId) return unauthorized()

    if (
      investigator.auth_user_id &&
      String(investigator.auth_user_id) !== authUserId
    ) {
      return unauthorized()
    }

    const hasSeparateAuthEmail =
      investigator.auth_login_email &&
      String(investigator.auth_login_email).trim().toLowerCase() !==
        String(investigator.email || '').trim().toLowerCase()
    if (hasSeparateAuthEmail && !investigator.auth_user_id) {
      return unauthorized()
    }

    return new Response(JSON.stringify(authResult.payload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (_error) {
    return jsonResponse({ error: 'login service unavailable' }, 500)
  }
})
