// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Punto de entrada Tauri (lib.rs)
// ══════════════════════════════════════════════════════════════

mod commands;
pub mod db;
mod sync_watcher;

/// Estado gestionado por Tauri que almacena las credenciales de Supabase.
/// La SERVICE_ROLE_KEY se lee en tiempo de COMPILACIÓN (option_env!) y
/// se guarda en memoria RAM de la app. Nunca aparece en archivos JS.
#[derive(Clone)]
pub struct SupabaseConfig {
    pub url: String,
    pub service_role_key: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Cargar .env en modo desarrollo (debug) para que std::env::var funcione
    #[cfg(debug_assertions)]
    {
        let _ = dotenvy::dotenv();
    }

    // Leer credenciales de Supabase:
    // - En builds de producción: option_env! las embebe al compilar (más seguro).
    // - En desarrollo: cae al fallback std::env::var (lee del .env en tiempo de ejecución).
    let supabase_url = option_env!("SUPABASE_URL")
        .map(|s| s.to_string())
        .unwrap_or_else(|| std::env::var("SUPABASE_URL").unwrap_or_default());

    let service_role_key = option_env!("SUPABASE_SERVICE_ROLE_KEY")
        .map(|s| s.to_string())
        .unwrap_or_else(|| std::env::var("SUPABASE_SERVICE_ROLE_KEY").unwrap_or_default());

    if service_role_key.is_empty() {
        eprintln!(
            "[App] ⚠️  SUPABASE_SERVICE_ROLE_KEY no está configurada. El sync no funcionará."
        );
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Registrar las credenciales en el estado gestionado de Tauri
        .manage(SupabaseConfig {
            url: supabase_url,
            service_role_key,
        })
        .setup(|app| {
            let intervalo_secs: u64 = std::env::var("SYNC_INTERVAL_SECS")
                .unwrap_or_else(|_| "300".to_string())
                .parse()
                .unwrap_or(300);

            let app_handle = app.handle().clone();
            sync_watcher::iniciar_watcher(app_handle, intervalo_secs);

            println!(
                "[App] ✅ Muñegon POS iniciado. Sync watcher activo (intervalo: {}s)",
                intervalo_secs
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Usuarios (Login)
            commands::ventas::listar_usuarios,
            // Productos
            commands::ventas::listar_productos,
            commands::ventas::listar_productos_admin,
            commands::ventas::crear_producto,
            commands::ventas::actualizar_producto,
            // Configuración (tasa de cambio, IVA, etc.)
            commands::ventas::obtener_configuracion,
            commands::ventas::actualizar_configuracion,
            // Ventas
            commands::ventas::crear_venta,
            // Cortes de Caja
            commands::ventas::registrar_corte_caja,
            commands::ventas::listar_cortes_caja,
            commands::ventas::resumen_ventas_dia,
            // Sincronización Offline-First
            commands::ventas::obtener_ventas_pendientes,
            commands::ventas::obtener_productos_pendientes,
            commands::ventas::obtener_logs_pendientes,
            commands::ventas::obtener_cortes_pendientes,
            commands::ventas::marcar_sincronizados,
            commands::ventas::guardar_datos_pull,
            sync_watcher::forzar_sincronizacion,
            // Autenticación
            commands::ventas::verificar_pin,
            // Reportes PDF
            commands::reportes::generar_pdf_corte,
            commands::reportes::generar_pdf_corte_z,
            commands::reportes::obtener_datos_pdf_corte,
            commands::reportes::guardar_y_abrir_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("Error al iniciar Muñegon POS");
}
