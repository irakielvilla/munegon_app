// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Edge Function: fn-cortes
// Maneja Cortes X y Z, listado de cortes y datos para PDF
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

    // ── Registrar Corte X ───────────────────────────────────
    if (accion === 'registrar_x') {
      const { accion: _, rangeStart, rangeEnd, ...payload } = body
      const id = crypto.randomUUID()

      const { error } = await supabase
        .from('CorteCaja')
        .insert([{ ...payload, id, isSynced: true }])
      if (error) throw error

      // Asociar ventas sin corte del rango actual
      const { error: vErr } = await supabase
        .from('Venta')
        .update({ corteCajaId: id })
        .gte('creadoEn', rangeStart)
        .lte('creadoEn', rangeEnd)
        .is('corteCajaId', null)
      if (vErr) console.warn('[fn-cortes] Error asociando ventas al corte X:', vErr.message)

      return new Response(JSON.stringify(id), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Registrar Corte Z ───────────────────────────────────
    if (accion === 'registrar_z') {
      const { accion: _, rangeStart, rangeEnd, ...payload } = body
      const id = crypto.randomUUID()

      const { error: cErr } = await supabase
        .from('CorteCaja')
        .insert([{ ...payload, id, tipo: 'Z', isSynced: true }])
      if (cErr) throw cErr

      // Cerrar ventas del día que no tengan corte asignado
      const { error: vErr } = await supabase
        .from('Venta')
        .update({ corteCajaId: id })
        .gte('creadoEn', rangeStart)
        .lte('creadoEn', rangeEnd)
        .is('corteCajaId', null)
      if (vErr) console.warn('[fn-cortes] Error cerrando ventas del día:', vErr.message)

      return new Response(JSON.stringify(id), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Listar cortes con nombre de usuario ─────────────────
    if (accion === 'listar') {
      const { data, error } = await supabase
        .from('CorteCaja')
        .select('*, Usuario(nombre)')
        .order('creadoEn', { ascending: false })
      if (error) throw error

      const mapped = data.map((d: any) => ({
        id: d.id,
        tipo: d.tipo,
        usuarioId: d.usuarioId,
        nombreUsuario: d.Usuario?.nombre || 'Desconocido',
        totalCalculado: d.totalCalculado,
        totalDeclarado: d.totalDeclarado,
        diferencia: d.diferencia,
        creadoEn: d.creadoEn,
      }))

      return new Response(JSON.stringify(mapped), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Datos para generación de PDF ────────────────────────
    if (accion === 'datos_pdf') {
      const { corteId } = body as { corteId: string }

      // Obtener corte con usuario
      const { data: c, error: cErr } = await supabase
        .from('CorteCaja')
        .select('*, Usuario(nombre)')
        .eq('id', corteId)
        .single()
      if (cErr || !c) throw new Error(`Corte no encontrado: ${cErr?.message || 'sin datos'}`)

      const corte = {
        id: c.id,
        tipo: c.tipo,
        usuarioId: c.usuarioId,
        nombreUsuario: c.Usuario?.nombre || 'Desconocido',
        totalCalculado: c.totalCalculado,
        totalDeclarado: c.totalDeclarado,
        diferencia: c.diferencia,
        creadoEn: c.creadoEn,
      }

      // Obtener ventas del corte
      let queryVentas = supabase.from('Venta').select('total, formaPago, tasaCambio')
      if (corte.tipo === 'Z') {
        // Para tipo Z, el cliente pasará el rango si es necesario; aquí usamos corteCajaId
        queryVentas = queryVentas.eq('corteCajaId', corteId)
      } else {
        queryVentas = queryVentas.eq('corteCajaId', corteId)
      }
      const { data: ventas, error: vErr } = await queryVentas
      if (vErr) console.warn('[fn-cortes] Error cargando ventas:', vErr.message)

      // Obtener líneas agrupadas por producto
      const { data: lineasRaw, error: lErr } = await supabase
        .from('LineaVenta')
        .select('cantidad, precioUnit, subtotal, Producto(nombre), Venta!inner(corteCajaId)')
        .eq('Venta.corteCajaId', corteId)
      if (lErr) console.warn('[fn-cortes] Error cargando líneas:', lErr.message)

      // Agrupar por producto en el servidor
      const prodMap: Record<string, { cant: number; precio: number; subtotal: number }> = {}
      lineasRaw?.forEach((item: any) => {
        const nombre = item.Producto?.nombre || 'Producto Desconocido'
        const cant = item.cantidad || 0
        const precio = parseFloat(item.precioUnit) || 0
        const sub = parseFloat(item.subtotal) || 0
        if (!prodMap[nombre]) {
          prodMap[nombre] = { cant: 0, precio, subtotal: 0 }
        }
        prodMap[nombre].cant += cant
        prodMap[nombre].subtotal += sub
      })

      const lineas = Object.keys(prodMap)
        .sort()
        .map((name) => ({
          nombreProducto: name,
          cantidad: prodMap[name].cant,
          precioUnit: prodMap[name].precio.toFixed(2),
          subtotal: prodMap[name].subtotal,
        }))

      return new Response(JSON.stringify({ corte, ventas: ventas || [], lineas }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: `Acción desconocida: ${accion}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[fn-cortes] Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
