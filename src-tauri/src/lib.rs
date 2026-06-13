// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Punto de entrada Tauri (lib.rs)
// ══════════════════════════════════════════════════════════════

mod sync_watcher;
mod commands;
pub mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Leer el intervalo de sync desde variable de entorno.
            // Default: 300 segundos (5 minutos) si no está definido.
            let intervalo_secs: u64 = std::env::var("SYNC_INTERVAL_SECS")
                .unwrap_or_else(|_| "300".to_string())
                .parse()
                .unwrap_or(300);

            // Iniciar el watcher en background.
            let app_handle = app.handle().clone();
            sync_watcher::iniciar_watcher(app_handle, intervalo_secs);

            println!("[App] ✅ Muñegon POS iniciado. Sync watcher activo (intervalo: {}s)", intervalo_secs);
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
