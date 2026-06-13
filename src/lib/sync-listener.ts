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
          };
        });

        // Aplanamos todas las lineas de todas las ventas para subirlas
        const lineasData = ventas.flatMap((v) => (v['lineas'] as any[] || []));

        // Subir primero las ventas (por restricciones de llave foránea en LineaVenta)
        const { error: vErr } = await supabase.from('Venta').upsert(ventasData, { onConflict: 'id' });
        if (vErr) throw new Error(`Ventas: ${vErr.message}`);

        // Subir las líneas de venta
        if (lineasData.length > 0) {
          const { error: lErr } = await supabase.from('LineaVenta').upsert(lineasData, { onConflict: 'id' });
          if (lErr) throw new Error(`Lineas de venta: ${lErr.message}`);
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

      alert(`¡Sincronización Completada!\n\nSubidos: ${totalSynced} registros\nDescargados: ${pullData.usuarios.length} usuarios, ${pullData.productos.length} productos y ${pullData.cortes.length} cortes.`);

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
