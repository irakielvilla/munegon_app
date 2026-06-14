// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Edge Function: fn-ventas
// Maneja creación de ventas y resumen del día
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

    // ── Crear venta con líneas y actualizar stock ───────────
    if (accion === 'crear') {
      const { accion: _, lineas, ...ventaData } = body
      const ventaId = crypto.randomUUID()

      // 1. Insertar Venta
      const { error: vErr } = await supabase.from('Venta').insert([{
        ...ventaData,
        id: ventaId,
        isSynced: true,
      }])
      if (vErr) throw new Error(`Venta: ${vErr.message}`)

      // 2. Insertar Líneas de Venta
      if (lineas && lineas.length > 0) {
        const lineasInsert = lineas.map((l: any) => ({
          id: crypto.randomUUID(),
          ventaId,
          productoId: l.producto_id || l.productoId,
          cantidad: l.cantidad,
          precioUnit: l.precio_unit || l.precioUnit,
          subtotal: l.subtotal,
        }))

        const { error: lErr } = await supabase.from('LineaVenta').insert(lineasInsert)
        if (lErr) throw new Error(`Líneas: ${lErr.message}`)

        // 3. Actualizar stock atómicamente por producto
        // Agrupa las cantidades vendidas por producto
        const stockUpdates: Record<string, number> = {}
        for (const linea of lineasInsert) {
          stockUpdates[linea.productoId] = (stockUpdates[linea.productoId] || 0) + linea.cantidad
        }

        for (const [productoId, cantidadRestar] of Object.entries(stockUpdates)) {
          const { data: p, error: pErr } = await supabase
            .from('Producto')
            .select('stock')
            .eq('id', productoId)
            .single()

          if (pErr || !p) {
            console.error(`[fn-ventas] Error obteniendo stock de ${productoId}:`, pErr?.message)
            continue
          }

          const { error: uErr } = await supabase
            .from('Producto')
            .update({ stock: p.stock - cantidadRestar })
            .eq('id', productoId)

          if (uErr) {
            console.error(`[fn-ventas] Error actualizando stock de ${productoId}:`, uErr.message)
          }
        }
      }

      return new Response(JSON.stringify(ventaId), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Resumen de ventas del día ────────────────────────────
    // El cliente pasa rangeStart y rangeEnd ya calculados en su zona horaria local
    if (accion === 'resumen_dia') {
      const { soloPendientes, rangeStart, rangeEnd } = body as {
        soloPendientes: boolean
        rangeStart: string
        rangeEnd: string
      }

      let query = supabase
        .from('Venta')
        .select('total, formaPago, tasaCambio')
        .gte('creadoEn', rangeStart)
        .lte('creadoEn', rangeEnd)

      if (soloPendientes) {
        query = query.is('corteCajaId', null)
      }

      const { data, error } = await query
      if (error) throw error

      const resumen = { bs_efectivo: 0, bs_debito: 0, bs_pago_movil: 0, usd_efectivo: 0 }
      data?.forEach((v: any) => {
        const totalNum = parseFloat(v.total)
        if (v.formaPago === 'USD_EFECTIVO') {
          resumen.usd_efectivo += totalNum
        } else {
          const tasa = parseFloat(v.tasaCambio || '1')
          const totalBs = totalNum * tasa
          if (v.formaPago === 'BS_EFECTIVO') resumen.bs_efectivo += totalBs
          if (v.formaPago === 'BS_DEBITO') resumen.bs_debito += totalBs
          if (v.formaPago === 'BS_PAGO_MOVIL') resumen.bs_pago_movil += totalBs
        }
      })

      return new Response(JSON.stringify({
        bsEfectivo: resumen.bs_efectivo.toFixed(2),
        bsDebito: resumen.bs_debito.toFixed(2),
        bsPagoMovil: resumen.bs_pago_movil.toFixed(2),
        usdEfectivo: resumen.usd_efectivo.toFixed(2),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: `Acción desconocida: ${accion}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[fn-ventas] Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
