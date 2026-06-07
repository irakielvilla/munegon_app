// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Watcher de Sincronización (Rust)
//
// Responsabilidad ÚNICA: vigilar el tiempo y la conectividad.
// NO toca datos. Solo dispara el evento "ejecutar-sincronizacion"
// cuando se cumplen ambas condiciones: hay internet y pasó el intervalo.
// El trabajo pesado lo hace el frontend (JS/Prisma/Supabase).
// ══════════════════════════════════════════════════════════════

use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Inicia el bucle de vigilancia en un hilo Tokio separado.
/// No bloquea el hilo principal de Tauri.
pub fn iniciar_watcher(app: AppHandle, intervalo_secs: u64) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(intervalo_secs)).await;

            if tiene_internet().await {
                println!("[SyncWatcher] 🌐 Internet detectado. Disparando evento de sincronización...");

                // Solo dispara el evento — JS hace el trabajo pesado
                if let Err(e) = app.emit("ejecutar-sincronizacion", ()) {
                    eprintln!("[SyncWatcher] ⚠️ Error al emitir evento: {}", e);
                }
            } else {
                println!("[SyncWatcher] 📴 Sin internet. Sync pospuesto.");
            }
        }
    });
}

/// Comprueba conectividad con un HEAD request liviano.
/// Timeout de 3 segundos para no ralentizar el ciclo.
async fn tiene_internet() -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap_or_default();

    client
        .head("https://www.google.com")
        .send()
        .await
        .is_ok()
}
