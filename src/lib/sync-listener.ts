// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Listener de Eventos de Sincronización
// Escucha el evento "ejecutar-sincronizacion" disparado por Rust
// y realiza la sincronización directamente en el hilo principal.
//
// SEGURIDAD: Las credenciales de Supabase (SERVICE_ROLE_KEY) llegan
// en el payload del evento de Rust. Rust las lee del entorno al
// compilar (option_env!) y las inyecta en tiempo de ejecución.
// La key NUNCA está en ningún archivo JS estático.
//
// FLUJO:
//   Rust dispara evento (con credenciales en payload)
//   → listener crea cliente Supabase con SERVICE_ROLE_KEY
//   → sube datos pendientes de SQLite
//   → descarga datos actualizados
//   → Rust marca registros como sincronizados
// ══════════════════════════════════════════════════════════════

import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { createClient } from '@supabase/supabase-js';

// Payload que Rust inyecta en el evento (ver sync_watcher.rs)
interface SyncEventPayload {
  supabase_url: string;
  service_role_key: string;
}

function showSyncToast(message: string, tipo: 'ok' | 'error' = 'ok') {
  const toast = document.createElement('div');
  toast.innerText = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.left = '20px';
  toast.style.backgroundColor = tipo === 'ok' ? '#10b981' : '#ef4444';
  toast.style.color = '#ffffff';
  toast.style.padding = '8px 16px';
  toast.style.borderRadius = '6px';
  toast.style.fontSize = '14px';
  toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.08)';
  toast.style.zIndex = '9999';
  toast.style.fontWeight = '600';
  toast.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  toast.style.transition = 'opacity 0.5s ease-in-out';
  toast.style.opacity = '0';
  toast.style.pointerEvents = 'none';

  document.body.appendChild(toast);
  void toast.offsetWidth;
  toast.style.opacity = '1';

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 500);
  }, 5000);
}

// iniciarSyncListener ya no recibe credenciales como parámetro.
// Las credenciales llegan en el payload del evento de Rust.
export async function iniciarSyncListener(): Promise<void> {
  const hacerSync = async (supabaseUrl: string, serviceRoleKey: string) => {
    try {
      console.log('[Sync] 🔔 Iniciando sincronización...');

      const [ventas, productos, logs, cortes] = await Promise.all([
        invoke<Record<string, unknown>[]>('obtener_ventas_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_productos_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_logs_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_cortes_pendientes'),
      ]);

      console.log(`[Sync] 📦 Pendientes: ${ventas.length} ventas, ${productos.length} productos, ${logs.length} logs, ${cortes.length} cortes`);

      // Crear cliente con SERVICE_ROLE_KEY recibida de Rust (ignora RLS)
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      let totalSynced = 0;
      const ventaIds: string[] = [];
      const productoIds: string[] = [];
      const logIds: string[] = [];
      const corteIds: string[] = [];

      // 1. Productos (Entidad independiente)
      if (productos.length > 0) {
        const { error } = await supabase.from('Producto').upsert(productos, { onConflict: 'id' });
        if (error) throw new Error(`Productos: ${error.message}`);
        productoIds.push(...productos.map((p) => p['id'] as string));
        totalSynced += productos.length;
      }

      // 2. Cortes de Caja (Ventas dependen de él)
      if (cortes.length > 0) {
        const cortesData = cortes.map((c) => ({ ...c, isSynced: true }));
        const { error } = await supabase.from('CorteCaja').upsert(cortesData, { onConflict: 'id' });
        if (error) throw new Error(`Cortes de Caja: ${error.message}`);
        corteIds.push(...cortes.map((c) => c['id'] as string));
        totalSynced += cortes.length;
      }

      // 3. Ventas y sus Líneas
      if (ventas.length > 0) {
        const ventasData = ventas.map((v) => {
          const { lineas, ...vRest } = v;
          return { ...vRest, isSynced: true } as any;
        });
        const lineasData = ventas.flatMap((v) => (v['lineas'] as any[] || []));
        const ventaIdsSubir = ventasData.map((v: any) => v.id as string);

        const { data: existingVentas, error: checkErr } = await supabase
          .from('Venta').select('id').in('id', ventaIdsSubir);
        if (checkErr) throw new Error(`Error verificando ventas: ${checkErr.message}`);
        const existingVentaIds = new Set(existingVentas?.map((v) => v.id) || []);

        const { error: vErr } = await supabase.from('Venta').upsert(ventasData, { onConflict: 'id' });
        if (vErr) throw new Error(`Ventas: ${vErr.message}`);

        if (lineasData.length > 0) {
          const { error: lErr } = await supabase.from('LineaVenta').upsert(lineasData, { onConflict: 'id' });
          if (lErr) throw new Error(`Lineas de venta: ${lErr.message}`);
        }

        // Descontar stock solo para ventas NUEVAS (no duplicadas)
        const nuevasVentas = ventas.filter((v) => !existingVentaIds.has(v['id'] as string));
        const nuevasLineas = nuevasVentas.flatMap((v) => (v['lineas'] as any[] || []));

        if (nuevasLineas.length > 0) {
          const stockUpdates: Record<string, number> = {};
          for (const linea of nuevasLineas) {
            const pid = linea.productoId;
            stockUpdates[pid] = (stockUpdates[pid] || 0) + (linea.cantidad as number);
          }
          for (const [productoId, cantidadRestar] of Object.entries(stockUpdates)) {
            const { data: p, error: pErr } = await supabase
              .from('Producto').select('stock').eq('id', productoId).single();
            if (pErr) { console.error(`[Sync] Error stock ${productoId}:`, pErr.message); continue; }
            if (p) {
              const { error: uErr } = await supabase
                .from('Producto').update({ stock: p.stock - cantidadRestar }).eq('id', productoId);
              if (uErr) console.error(`[Sync] Error update stock ${productoId}:`, uErr.message);
            }
          }
        }

        ventaIds.push(...ventas.map((v) => v['id'] as string));
        totalSynced += ventas.length;
      }

      // 4. Logs de auditoría
      if (logs.length > 0) {
        const { error } = await supabase.from('LogCambio').upsert(logs, { onConflict: 'id' });
        if (error) throw new Error(`Logs: ${error.message}`);
        logIds.push(...logs.map((l) => l['id'] as string));
        totalSynced += logs.length;
      }

      // 5. Pull: descargar datos actualizados desde Supabase → SQLite
      const { data: pullUsuarios, error: uErr } = await supabase.from('Usuario').select('*');
      if (uErr) console.error('[Sync] Error pull usuarios:', uErr.message);

      const { data: pullProductos, error: pErr } = await supabase.from('Producto').select('*');
      if (pErr) console.error('[Sync] Error pull productos:', pErr.message);

      const { data: pullCortes, error: cErr } = await supabase.from('CorteCaja').select('*');
      if (cErr) console.error('[Sync] Error pull cortes:', cErr.message);

      const { data: pullVentas, error: vErr } = await supabase.from('Venta').select('*');
      if (vErr) console.error('[Sync] Error pull ventas:', vErr.message);

      const { data: pullLineas, error: lErr } = await supabase.from('LineaVenta').select('*');
      if (lErr) console.error('[Sync] Error pull lineas:', lErr.message);

      await invoke('guardar_datos_pull', {
        payload: {
          usuarios: pullUsuarios || [],
          productos: pullProductos || [],
          cortes: pullCortes || [],
          ventas: pullVentas || [],
          lineas: pullLineas || [],
        },
      });
      console.log(`[Sync] 📥 Pull guardado: ${pullUsuarios?.length} usuarios, ${pullProductos?.length} productos, ${pullVentas?.length} ventas.`);

      if (totalSynced > 0) {
        await invoke('marcar_sincronizados', { ventaIds, productoIds, logIds, corteIds });
        console.log(`[Sync] ✅ ${totalSynced} registros marcados como sincronizados.`);
      }

      showSyncToast('Sincronización exitosa con la nube');
      await emit('sync-completado', { timestamp: new Date().toISOString(), synced: totalSynced });

    } catch (err: any) {
      console.error('[Sync] ❌ Error en sincronización:', err);
      const errorMsg = err?.message || String(err);
      showSyncToast('Error en Sincronización: ' + errorMsg, 'error');
      await emit('sync-fallido', { timestamp: new Date().toISOString(), error: errorMsg });
    }
  };

  try {
    // El payload del evento incluye las credenciales inyectadas por Rust
    await listen<SyncEventPayload>('ejecutar-sincronizacion', (event) => {
      const { supabase_url, service_role_key } = event.payload;
      hacerSync(supabase_url, service_role_key);
    });
    console.log('[Sync] 👂 Listener activo — esperando señal de Rust con credenciales.');

    // Exponer función global para forzar sync manualmente desde la consola o botones
    (window as any).forzarSincronizacion = async () => {
      try {
        console.log('[Sync] 🔄 Forzando sincronización manual...');
        await invoke('forzar_sincronizacion');
      } catch (err: any) {
        console.error('[Sync] ❌ Error al forzar sincronización:', err);
        showSyncToast('Sincronizacion Fallida a la nube, No hay internet', 'error');
      }
    };

  } catch (err) {
    console.warn('[Sync] No se pudo registrar el listener (¿ejecutando en navegador web?):', err);
  }

  // Desencadenar la sincronización inicial automáticamente
  if (typeof (window as any).forzarSincronizacion === 'function') {
    setTimeout(() => {
      console.log('[Sync] ⏳ Disparando sincronización inicial del sistema...');
      (window as any).forzarSincronizacion();
    }, 1500); // Pequeño retraso para dejar que la UI termine de montarse y renderizarse
  }
}
