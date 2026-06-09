// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Listener de Eventos de Sincronización
// Escucha el evento "ejecutar-sincronizacion" disparado por Rust
// y delega el trabajo al Web Worker de sync.
//
// FLUJO:
//   Rust dispara evento → listener llama invoke para obtener
//   registros pendientes → los envía al Worker → Worker sube a
//   Supabase → listener recibe IDs y los marca como sincronizados
//   vía otro invoke a Rust.
// ══════════════════════════════════════════════════════════════

import { listen, emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

export interface SyncConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

interface SyncResult {
  ok: boolean;
  synced: number;
  ventaIds: string[];
  productoIds: string[];
  logIds: string[];
  error?: string;
  pullData?: {
    usuarios: any[];
    productos: any[];
  };
}

/**
 * Inicia el listener del evento Tauri.
 * Debe llamarse una sola vez al iniciar la aplicación (en BaseLayout).
 */
export async function iniciarSyncListener(config: SyncConfig): Promise<void> {
  await listen('ejecutar-sincronizacion', async () => {
    console.log('[Sync] 🔔 Evento recibido de Rust. Cargando registros pendientes...');

    try {
      // Obtener registros pendientes via Rust (que lee SQLite)
      const [ventas, productos, logs] = await Promise.all([
        invoke<Record<string, unknown>[]>('obtener_ventas_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_productos_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_logs_pendientes'),
      ]);

      const total = ventas.length + productos.length + logs.length;
      console.log(`[Sync] 📦 Pendientes para subir: ${ventas.length} ventas, ${productos.length} productos, ${logs.length} logs`);

      // Delegar al Worker (no bloquea la UI)
      const worker = new Worker(
        new URL('../workers/sync.worker.ts', import.meta.url),
        { type: 'module' },
      );

      worker.postMessage({
        supabaseUrl: config.supabaseUrl,
        supabaseKey: config.supabaseKey,
        ventas,
        productos,
        logs,
      });

      worker.onmessage = async (e: MessageEvent<SyncResult>) => {
        const result = e.data;

        if (result.ok) {
          console.log(`[Sync] ✅ Subidos a Supabase: ${result.synced} registros`);

          // Marcar como sincronizados en SQLite (vía Rust)
          await invoke('marcar_sincronizados', {
            ventaIds: result.ventaIds,
            productoIds: result.productoIds,
            logIds: result.logIds,
          });

          // Guardar datos descargados (Pull)
          if (result.pullData) {
            await invoke('guardar_datos_pull', { payload: result.pullData });
            console.log(`[Sync] 📥 Pull guardado localmente: ${result.pullData.usuarios.length} usuarios, ${result.pullData.productos.length} productos`);
          }

          await emit('sync-completado', {
            timestamp: new Date().toISOString(),
            synced: result.synced,
          });
          // alert(`Sincronización exitosa: ${result.synced} subidos.`);
        } else {
          console.error('[Sync] ❌ Error en sincronización:', result.error);
          alert('Error sincronizando con la Nube: ' + result.error);
          await emit('sync-fallido', {
            timestamp: new Date().toISOString(),
            error: result.error,
          });
        }

        worker.terminate();
      };

      worker.onerror = async (err) => {
        console.error('[Sync] ❌ Error fatal en el worker:', err.message);
        await emit('sync-fallido', {
          timestamp: new Date().toISOString(),
          error: err.message,
        });
        alert('Error fatal en el worker: ' + err.message);
        worker.terminate();
      };
    } catch (err) {
      console.error('[Sync] ❌ Error al cargar pendientes:', err);
      alert('Error al cargar pendientes locales: ' + String(err));
    }
  });

  console.log('[Sync] 👂 Listener activo — esperando señal de Rust.');
}
