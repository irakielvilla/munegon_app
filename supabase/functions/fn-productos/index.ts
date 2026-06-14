// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Edge Function: fn-productos
// Maneja el CRUD de productos del inventario
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

    // ── Listar productos activos con stock (Caja) ───────────
    if (accion === 'listar') {
      const { data, error } = await supabase
        .from('Producto')
        .select('*')
        .eq('activo', true)
        .gt('stock', 0)
        .order('nombre')
      if (error) throw error
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Listar todos los productos (Admin) ──────────────────
    if (accion === 'listar_admin') {
      const { data, error } = await supabase
        .from('Producto')
        .select('*')
        .order('nombre')
      if (error) throw error
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Crear producto ──────────────────────────────────────
    if (accion === 'crear') {
      const { accion: _, ...payload } = body
      const supabasePayload = { ...payload, precioUSD: payload.precioUsd, isSynced: true }
      delete supabasePayload.precioUsd
      const { error } = await supabase.from('Producto').insert([supabasePayload])
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Actualizar producto ─────────────────────────────────
    if (accion === 'actualizar') {
      const { accion: _, ...payload } = body
      const supabasePayload = { ...payload }
      if (supabasePayload.precioUsd !== undefined) {
        supabasePayload.precioUSD = supabasePayload.precioUsd
        delete supabasePayload.precioUsd
      }
      const { error } = await supabase
        .from('Producto')
        .update(supabasePayload)
        .eq('id', payload.id)
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
    console.error('[fn-productos] Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
