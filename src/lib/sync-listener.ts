// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Listener de Eventos de Sincronización
// Escucha el evento "ejecutar-sincronizacion" disparado por Rust
// y realiza la sincronización directamente en el hilo principal.
//
// FLUJO:
//   Rust dispara evento → listener llama invoke para obtener
//   registros pendientes → sube a Supabase directamente →
//   actualiza SQLite local.
// ══════════════════════════════════════════════════════════════

import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { createClient } from '@supabase/supabase-js';

function showSyncToast(message: string) {
  const toast = document.createElement('div');
  toast.innerText = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.left = '20px';
  toast.style.backgroundColor = '#10b981';
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

  // Trigger reflow for transition
  void toast.offsetWidth;
  toast.style.opacity = '1';

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 500); // Wait for transition
  }, 5000); // 5 seconds
}

export interface SyncConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

export async function iniciarSyncListener(config: SyncConfig): Promise<void> {
  const hacerSync = async () => {
    try {
      console.log('[Sync] 🔔 Iniciando sincronización...');

      const [ventas, productos, logs, cortes] = await Promise.all([
        invoke<Record<string, unknown>[]>('obtener_ventas_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_productos_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_logs_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_cortes_pendientes'),
      ]);

      console.log(`[Sync] 📦 Pendientes para subir: ${ventas.length} ventas, ${productos.length} productos, ${logs.length} logs, ${cortes.length} cortes`);

      // ── EJECUTAR SYNC DIRECTAMENTE EN EL HILO PRINCIPAL ──
      const supabase = createClient(config.supabaseUrl, config.supabaseKey);
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

      // 3. Ventas y sus Lineas (Dependen de Producto y CorteCaja)
      if (ventas.length > 0) {
        // Separamos las relaciones nested (lineas) de los objetos de venta principales
        const ventasData = ventas.map((v) => {
          const { lineas, ...vRest } = v;
          return {
            ...vRest,
            isSynced: true
          } as any;
        });

        // Aplanamos todas las lineas de todas las ventas para subirlas
        const lineasData = ventas.flatMap((v) => (v['lineas'] as any[] || []));

        // 1. Obtener IDs de las ventas que vamos a subir
        const ventaIdsSubir = ventasData.map((v: any) => v.id as string);

        // 2. Consultar en Supabase cuáles de estas ventas ya existen antes de subirlas
        const { data: existingVentas, error: checkErr } = await supabase
          .from('Venta')
          .select('id')
          .in('id', ventaIdsSubir);

        if (checkErr) throw new Error(`Error verificando ventas existentes: ${checkErr.message}`);
        const existingVentaIds = new Set(existingVentas?.map((v) => v.id) || []);

        // 3. Subir primero las ventas
        const { error: vErr } = await supabase.from('Venta').upsert(ventasData, { onConflict: 'id' });
        if (vErr) throw new Error(`Ventas: ${vErr.message}`);

        // 4. Subir las líneas de venta
        if (lineasData.length > 0) {
          const { error: lErr } = await supabase.from('LineaVenta').upsert(lineasData, { onConflict: 'id' });
          if (lErr) throw new Error(`Lineas de venta: ${lErr.message}`);
        }

        // 5. Descontar el stock en Supabase solo para las ventas que eran NUEVAS
        const nuevasVentas = ventas.filter((v) => !existingVentaIds.has(v['id'] as string));
        const nuevasLineasData = nuevasVentas.flatMap((v) => (v['lineas'] as any[] || []));

        if (nuevasLineasData.length > 0) {
          const stockUpdates: Record<string, number> = {};
          for (const linea of nuevasLineasData) {
            const pid = linea.productoId;
            stockUpdates[pid] = (stockUpdates[pid] || 0) + (linea.cantidad as number);
          }

          console.log(`[Sync] 📦 Descontando stock en Supabase para ${Object.keys(stockUpdates).length} productos...`);
          for (const [productoId, cantidadRestar] of Object.entries(stockUpdates)) {
            const { data: p, error: pErr } = await supabase
              .from('Producto')
              .select('stock')
              .eq('id', productoId)
              .single();

            if (pErr) {
              console.error(`[Sync] Error al obtener stock para ${productoId}:`, pErr.message);
              continue;
            }

            if (p) {
              const { error: uErr } = await supabase
                .from('Producto')
                .update({ stock: p.stock - cantidadRestar })
                .eq('id', productoId);

              if (uErr) {
                console.error(`[Sync] Error al actualizar stock para ${productoId}:`, uErr.message);
              } else {
                console.log(`[Sync] Stock de ${productoId} decrementado en ${cantidadRestar}. Nuevo: ${p.stock - cantidadRestar}`);
              }
            }
          }
        }

        ventaIds.push(...ventas.map((v) => v['id'] as string));
        totalSynced += ventas.length;
      }

      // 4. Logs (Dependen de todo lo anterior y de Usuario)
      if (logs.length > 0) {
        const { error } = await supabase.from('LogCambio').upsert(logs, { onConflict: 'id' });
        if (error) throw new Error(`Logs: ${error.message}`);
        logIds.push(...logs.map((l) => l['id'] as string));
        totalSynced += logs.length;
      }

      // 5. Pull
      const { data: pullUsuarios, error: uErr } = await supabase.from('Usuario').select('*');
      if (uErr) console.error('[Sync] Error pull usuarios:', uErr.message);

      const { data: pullProductos, error: pErr } = await supabase.from('Producto').select('*');
      if (pErr) console.error('[Sync] Error pull productos:', pErr.message);

      const { data: pullCortes, error: cErr } = await supabase.from('CorteCaja').select('*');
      if (cErr) console.error('[Sync] Error pull cortes:', cErr.message);

      const pullData = {
        usuarios: pullUsuarios || [],
        productos: pullProductos || [],
        cortes: pullCortes || []
      };

      // 6. Guardar Pull en SQLite local
      await invoke('guardar_datos_pull', { payload: pullData });
      console.log(`[Sync] 📥 Pull guardado: ${pullData.usuarios.length} usuarios, ${pullData.productos.length} productos, ${pullData.cortes.length} cortes.`);

      // 7. Marcar Push como sincronizado en SQLite
      if (totalSynced > 0) {
        await invoke('marcar_sincronizados', { ventaIds, productoIds, logIds, corteIds });
        console.log(`[Sync] ✅ SQLite actualizado. ${totalSynced} registros marcados.`);
      }

      showSyncToast('Sincronización exitosa con la nube');

      await emit('sync-completado', {
        timestamp: new Date().toISOString(),
        synced: totalSynced,
      });

    } catch (err: any) {
      console.error('[Sync] ❌ Error en sincronización:', err);
      alert('Error en Sincronización: ' + err.message);
      await emit('sync-fallido', {
        timestamp: new Date().toISOString(),
        error: err.message,
      });
    }
  };

  // Truco: exponer a window para lanzarlo manualmente
  (window as any).forzarSincronizacion = hacerSync;

  try {
    // Escuchar el evento que manda Rust
    await listen('ejecutar-sincronizacion', hacerSync);
    console.log('[Sync] 👂 Listener activo — esperando señal de Rust.');
  } catch (err) {
    console.warn('[Sync] No se pudo registrar el listener de Tauri (¿ejecutando en navegador web?):', err);
  }
}
