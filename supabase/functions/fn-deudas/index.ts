// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Edge Function: fn-deudas
// Maneja la lectura de deudas y clientes para el modo web (Solo Consulta)
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

    // ── Listar Clientes Activos ─────────────────────────────
    if (accion === 'listar_clientes') {
      const { data, error } = await supabase
        .from('Cliente')
        .select('*')
        .eq('activo', true)
        .order('nombre')
      
      if (error) throw error
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Listar Deudas Activas de un Cliente ─────────────────
    if (accion === 'listar_deudas_cliente') {
      const { clienteId } = body
      if (!clienteId) throw new Error('clienteId es requerido')

      // Obtener las deudas activas junto con el nombre del usuario y sus líneas de deuda activas
      const { data: deudasRaw, error } = await supabase
        .from('Deuda')
        .select(`
          *,
          Usuario(nombre),
          LineaDeuda(*, Producto(nombre))
        `)
        .eq('clienteId', clienteId)
        .eq('activo', true)
        .order('creadoEn', { ascending: false })

      if (error) throw error

      // Mapear al formato esperado por el frontend
      const deudas = deudasRaw.map((d: any) => ({
        id: d.id,
        usuarioId: d.usuarioId,
        usuarioNombre: d.Usuario?.nombre || 'Desconocido',
        subtotal: d.subtotal,
        impuesto: d.impuesto,
        total: d.total,
        creadoEn: d.creadoEn,
        // Solo enviamos las líneas que no están anuladas ni pagadas
        lineas: (d.LineaDeuda || [])
          .filter((l: any) => l.activo === true)
          .map((l: any) => ({
            id: l.id,
            productoId: l.productoId,
            productoNombre: l.Producto?.nombre || 'Producto Eliminado',
            cantidad: l.cantidad,
            precioUnit: l.precioUnit,
            subtotal: l.subtotal
          }))
      }))

      return new Response(JSON.stringify(deudas), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: `Acción desconocida: ${accion}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[fn-deudas] Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
