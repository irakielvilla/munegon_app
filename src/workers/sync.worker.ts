// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Web Worker de Sincronización
// Ejecuta en un hilo separado para no bloquear la UI.
//
// ARQUITECTURA:
//   sync-listener.ts (hilo principal)
//     → invoke Tauri → Rust obtiene pendientes de SQLite
//     → postMessage al Worker con los datos
//   sync.worker.ts (hilo worker)
//     → sube datos a Supabase vía REST
//     → devuelve IDs sincronizados al hilo principal
//     → hilo principal invoca Tauri → Rust marca isSynced=true
//
// IMPORTANTE: Este archivo NO importa Prisma ni módulos de Node.js.
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

// ── Tipos ────────────────────────────────────────────────────

interface SyncPayload {
  supabaseUrl: string;
  supabaseKey: string;
  /** Registros pendientes obtenidos por el hilo principal via invoke */
  ventas: Record<string, unknown>[];
  productos: Record<string, unknown>[];
  logs: Record<string, unknown>[];
}

interface SyncResult {
  ok: boolean;
  synced: number;
  /** IDs de los registros que se subieron correctamente */
  ventaIds: string[];
  productoIds: string[];
  logIds: string[];
  error?: string;
  pullData?: {
    usuarios: any[];
    productos: any[];
  };
}

// ── Entry point del worker ────────────────────────────────────

self.onmessage = async (e: MessageEvent<SyncPayload>) => {
  const { supabaseUrl, supabaseKey, ventas, productos, logs } = e.data;
  const result = await ejecutarSync(supabaseUrl, supabaseKey, ventas, productos, logs);
  self.postMessage(result);
};

// ── Lógica principal ──────────────────────────────────────────

async function ejecutarSync(
  supabaseUrl: string,
  supabaseKey: string,
  ventas: Record<string, unknown>[],
  productos: Record<string, unknown>[],
  logs: Record<string, unknown>[],
): Promise<SyncResult> {
  let totalSynced = 0;
  const ventaIds: string[] = [];
  const productoIds: string[] = [];
  const logIds: string[] = [];

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 1. Ventas ─────────────────────────────────────────────
    if (ventas.length > 0) {
      const { error } = await supabase
        .from('Venta')
        .upsert(ventas, { onConflict: 'id' });
      if (error) throw new Error(`Ventas: ${error.message}`);
      ventaIds.push(...ventas.map((v) => v['id'] as string));
      totalSynced += ventas.length;
    }

    // ── 2. Productos ──────────────────────────────────────────
    if (productos.length > 0) {
      const { error } = await supabase
        .from('Producto')
        .upsert(productos, { onConflict: 'id' });
      if (error) throw new Error(`Productos: ${error.message}`);
      productoIds.push(...productos.map((p) => p['id'] as string));
      totalSynced += productos.length;
    }

    // ── 3. Logs de auditoría ──────────────────────────────────
    if (logs.length > 0) {
      const { error } = await supabase
        .from('LogCambio')
        .upsert(logs, { onConflict: 'id' });
      if (error) throw new Error(`Logs: ${error.message}`);
      logIds.push(...logs.map((l) => l['id'] as string));
      totalSynced += logs.length;
    }

    // ── 4. Pull de Data Web (Usuarios y Productos) ────────────
    const { data: pullUsuarios, error: uErr } = await supabase.from('Usuario').select('*');
    if (uErr) console.error('[SyncWorker] Error pull usuarios:', uErr.message);

    const { data: pullProductos, error: pErr } = await supabase.from('Producto').select('*');
    if (pErr) console.error('[SyncWorker] Error pull productos:', pErr.message);

    return { 
      ok: true, 
      synced: totalSynced, 
      ventaIds, 
      productoIds, 
      logIds,
      pullData: {
        usuarios: pullUsuarios || [],
        productos: pullProductos || []
      }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SyncWorker] Error:', message);
    return { ok: false, synced: totalSynced, ventaIds, productoIds, logIds, error: message };
  }
}
