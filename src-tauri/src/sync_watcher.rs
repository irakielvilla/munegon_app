// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Watcher de Sincronización (Rust)
//
// Responsabilidad: vigilar el tiempo y la conectividad.
// Cuando hay internet y pasó el intervalo, dispara el evento
// "ejecutar-sincronizacion" con las credenciales de Supabase
// incluidas en el payload (leídas desde el estado de Tauri).
//
// SEGURIDAD: La SERVICE_ROLE_KEY viaja en el payload del evento
// solo en tiempo de ejecución. Nunca está en ningún archivo JS.
// ══════════════════════════════════════════════════════════════

use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use crate::SupabaseConfig;

/// Payload serializable que recibirá sync-listener.ts en JavaScript.
/// Los campos usan snake_case para coincidir con la interfaz TypeScript.
#[derive(Clone, serde::Serialize)]
struct SyncEventPayload {
    supabase_url: String,
    service_role_key: String,
}

/// Inicia el bucle de vigilancia en un hilo Tokio separado.
/// No bloquea el hilo principal de Tauri.
pub fn iniciar_watcher(app: AppHandle, intervalo_secs: u64) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(intervalo_secs)).await;

            if tiene_internet().await {
                println!("[SyncWatcher] 🌐 Internet detectado. Disparando evento de sincronización...");

                // Leer las credenciales desde el estado gestionado de Tauri
                let config = app.state::<SupabaseConfig>();
                let payload = SyncEventPayload {
                    supabase_url: config.url.clone(),
                    service_role_key: config.service_role_key.clone(),
                };

                // El payload con las credenciales viaja de Rust → JS solo en este momento
                if let Err(e) = app.emit("ejecutar-sincronizacion", payload) {
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

/// Comando invocable desde JavaScript para forzar la sincronización manualmente
#[tauri::command]
pub async fn forzar_sincronizacion(app: AppHandle, config: tauri::State<'_, SupabaseConfig>) -> Result<(), String> {
    if tiene_internet().await {
        println!("[SyncWatcher] 🌐 (Manual) Forzando sincronización. Disparando evento...");
        let payload = SyncEventPayload {
            supabase_url: config.url.clone(),
            service_role_key: config.service_role_key.clone(),
        };
        app.emit("ejecutar-sincronizacion", payload)
            .map_err(|e| format!("Error al emitir evento: {}", e))?;
        Ok(())
    } else {
        Err("No hay conexión a internet para sincronizar.".to_string())
    }
}
