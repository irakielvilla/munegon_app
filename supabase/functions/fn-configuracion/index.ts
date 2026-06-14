// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Edge Function: fn-configuracion
// Maneja la configuración global: tasa de cambio e IVA
// ══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-munegon-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const apiSecret = Deno.env.get('MUNEGON_API_SECRET')
  if (!apiSecret || req.headers.get('X-Munegon-Key') !== apiSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    const body = await req.json()
    const { accion } = body

    // ── Obtener toda la configuración ───────────────────────
    if (accion === 'obtener') {
      const { data, error } = await supabase
        .from('Configuracion')
        .select('clave, valor')
      if (error) throw error

      const config: Record<string, string> = {
        tasa_cambio_bsd: '1.00',
        iva_porcentaje: '16',
      }
      data?.forEach((d: { clave: string; valor: string }) => {
        config[d.clave] = d.valor
      })
      return new Response(JSON.stringify(config), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Actualizar una clave de configuración ───────────────
    if (accion === 'actualizar') {
      const { clave, valor } = body as { clave: string; valor: string }
      const { error } = await supabase
        .from('Configuracion')
        .upsert({ clave, valor })
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: `Acción desconocida: ${accion}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[fn-configuracion] Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
