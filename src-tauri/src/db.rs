// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Base de Datos Centralizada
// ══════════════════════════════════════════════════════════════

use std::path::PathBuf;
use rusqlite::Connection;

/// Obtiene la ruta de la base de datos SQLite.
/// Prioridad:
///   1. Variable de entorno MUNEGON_DB_PATH (útil en dev y CI)
///   2. %APPDATA%\munegon-pos\pos.db  (producción — instalador MSI)
///   3. Fallback hardcodeado para compatibilidad con entornos sin AppData
pub fn db_path() -> PathBuf {
    // Cargar variables de entorno desde .env en modo debug/desarrollo
    #[cfg(debug_assertions)]
    {
        let _ = dotenvy::dotenv();
    }

    if let Ok(p) = std::env::var("MUNEGON_DB_PATH") {
        return PathBuf::from(p);
    }
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("C:/MunegonDB"))
        .join("munegon-pos")
        .join("pos.db")
}

/// Abre la conexión a la base de datos SQLite.
/// Crea los directorios intermedios de forma automática si no existen.
pub fn open_db() -> rusqlite::Result<Connection> {
    let path = db_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    Connection::open(path)
}
