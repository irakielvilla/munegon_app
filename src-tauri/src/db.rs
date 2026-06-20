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
    let mut conn = Connection::open(path)?;
    inicializar_tablas(&conn)?;
    ejecutar_migraciones(&mut conn)?;
    Ok(conn)
}

fn ejecutar_migraciones(conn: &mut Connection) -> rusqlite::Result<()> {
    // Verificar si la tabla Producto tiene la columna 'precioUSD' antigua
    let (has_precio_usd, has_moneda_base) = {
        let mut stmt = conn.prepare("PRAGMA table_info(Producto)")?;
        let mut has_precio_usd = false;
        let mut has_moneda_base = false;

        let rows = stmt.query_map([], |row| {
            let name: String = row.get(1)?;
            Ok(name)
        })?;

        for name_result in rows {
            if let Ok(name) = name_result {
                if name == "precioUSD" {
                    has_precio_usd = true;
                } else if name == "monedaBase" {
                    has_moneda_base = true;
                }
            }
        }
        (has_precio_usd, has_moneda_base)
    };

    if has_precio_usd && !has_moneda_base {
        // Ejecutar migración
        let tx = conn.transaction()?;
        tx.execute("ALTER TABLE Producto RENAME COLUMN precioUSD TO precio", [])?;
        tx.execute("ALTER TABLE Producto ADD COLUMN monedaBase TEXT NOT NULL DEFAULT 'USD'", [])?;
        
        // Limpiar los datos viejos que contenían "BS:"
        tx.execute("UPDATE Producto SET monedaBase = 'BS', precio = substr(precio, 4) WHERE precio LIKE 'BS:%'", [])?;
        tx.commit()?;
    }

            // Migración 3: Añadir anulada a LineaDeuda
        let _ = conn.execute(
            "ALTER TABLE LineaDeuda ADD COLUMN anulada BOOLEAN NOT NULL DEFAULT 0",
            [],
        );

    Ok(())
}

fn inicializar_tablas(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;

         CREATE TABLE IF NOT EXISTS Usuario (
             id TEXT PRIMARY KEY,
             nombre TEXT NOT NULL,
             pin TEXT NOT NULL,
             rol TEXT NOT NULL,
             activo INTEGER NOT NULL DEFAULT 1,
             creadoEn TEXT NOT NULL DEFAULT (datetime('now'))
         );

         CREATE TABLE IF NOT EXISTS Producto (
             id TEXT PRIMARY KEY,
             sku TEXT UNIQUE NOT NULL,
             nombre TEXT NOT NULL,
             descripcion TEXT,
             monedaBase TEXT NOT NULL DEFAULT 'USD',
             precio TEXT NOT NULL,
             stock INTEGER NOT NULL DEFAULT 0,
             stockMinimo INTEGER NOT NULL DEFAULT 5,
             activo INTEGER NOT NULL DEFAULT 1,
             creadoEn TEXT NOT NULL DEFAULT (datetime('now')),
             actualizadoEn TEXT NOT NULL DEFAULT (datetime('now')),
             isSynced INTEGER NOT NULL DEFAULT 0
         );

         CREATE TABLE IF NOT EXISTS CorteCaja (
             id TEXT PRIMARY KEY,
             tipo TEXT NOT NULL,
             usuarioId TEXT NOT NULL,
             totalCalculado TEXT NOT NULL,
             totalDeclarado TEXT NOT NULL,
             diferencia TEXT NOT NULL,
             creadoEn TEXT NOT NULL DEFAULT (datetime('now')),
             isSynced INTEGER NOT NULL DEFAULT 0,
             FOREIGN KEY(usuarioId) REFERENCES Usuario(id)
         );

         CREATE TABLE IF NOT EXISTS Venta (
             id TEXT PRIMARY KEY,
             usuarioId TEXT NOT NULL,
             corteCajaId TEXT,
             subtotal TEXT NOT NULL,
                anulada BOOLEAN NOT NULL DEFAULT 0,
             impuesto TEXT NOT NULL,
             total TEXT NOT NULL,
             formaPago TEXT NOT NULL,
             moneda TEXT NOT NULL,
             referenciaPago TEXT,
             tasaCambio TEXT,
             creadoEn TEXT NOT NULL DEFAULT (datetime('now')),
             isSynced INTEGER NOT NULL DEFAULT 0,
             FOREIGN KEY(usuarioId) REFERENCES Usuario(id),
             FOREIGN KEY(corteCajaId) REFERENCES CorteCaja(id)
         );

         CREATE TABLE IF NOT EXISTS LineaVenta (
             id TEXT PRIMARY KEY,
             ventaId TEXT NOT NULL,
             productoId TEXT NOT NULL,
             cantidad INTEGER NOT NULL,
             precioUnit TEXT NOT NULL,
             subtotal TEXT NOT NULL,
             FOREIGN KEY(ventaId) REFERENCES Venta(id),
             FOREIGN KEY(productoId) REFERENCES Producto(id)
         );

         CREATE TABLE IF NOT EXISTS Configuracion (
             clave TEXT PRIMARY KEY,
             valor TEXT NOT NULL,
             descripcion TEXT,
             updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
         );

         CREATE TABLE IF NOT EXISTS LogCambio (
             id TEXT PRIMARY KEY,
             entidad TEXT NOT NULL,
             entidadId TEXT NOT NULL,
             campo TEXT NOT NULL,
             valorAntes TEXT,
             valorDespues TEXT,
             usuarioId TEXT NOT NULL,
             creadoEn TEXT NOT NULL DEFAULT (datetime('now')),
             isSynced INTEGER NOT NULL DEFAULT 0,
             FOREIGN KEY(usuarioId) REFERENCES Usuario(id)
         );"
    )?;
    Ok(())
}

