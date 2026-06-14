// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Edge Function: fn-auth
// Maneja login: listar usuarios y verificar PIN (SHA-256)
// ══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-munegon-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Guard: verificar token secreto
  const apiSecret = Deno.env.get('MUNEGON_API_SECRET')
  if (!apiSecret || req.headers.get('X-Munegon-Key') !== apiSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Cliente Supabase con Service Role Key (ignorara el RLS)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    const body = await req.json()
    const { accion } = body

    // ── Listar usuarios activos ─────────────────────────────
    if (accion === 'listar') {
      const { data, error } = await supabase
        .from('Usuario')
        .select('id, nombre, rol, activo')
        .eq('activo', true)
        .order('nombre')
      if (error) throw error
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Verificar PIN ───────────────────────────────────────
    if (accion === 'verificar_pin') {
      const { usuarioId, pin } = body as { usuarioId: string; pin: string }

      // SHA-256 del PIN (misma lógica que crypto-js en el frontend)
      const msgBuffer = new TextEncoder().encode(pin)
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

      const { data, error } = await supabase
        .from('Usuario')
        .select('pin')
        .eq('id', usuarioId)
        .eq('activo', true)
        .single()

      if (error || !data) {
        return new Response(JSON.stringify(false), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify(data.pin === hashHex), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: `Acción desconocida: ${accion}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[fn-auth] Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
