// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Comandos Tauri: Ventas & Configuración
// ══════════════════════════════════════════════════════════════

use rusqlite::{params, params_from_iter};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use uuid::Uuid;
use crate::db::open_db;

// ── DTOs ──────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct LineaVentaInput {
    pub producto_id: String,
    pub cantidad: i64,
    pub precio_unit: String,
    pub subtotal: String,
}

#[derive(Serialize, Deserialize)]
pub struct Producto {
    pub id: String,
    pub sku: String,
    pub nombre: String,
    pub descripcion: Option<String>,
    #[serde(rename = "precioUSD")]
    pub precio_usd: String,
    pub stock: i64,
    #[serde(rename = "stockMinimo")]
    pub stock_minimo: i64,
    pub activo: bool,
}

#[derive(Serialize, Deserialize)]
pub struct ConfigApp {
    pub tasa_cambio_bsd: String,
    pub iva_porcentaje: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorteCajaInfo {
    pub id: String,
    pub tipo: String,
    pub usuario_id: String,
    pub nombre_usuario: String,
    pub total_calculado: String,
    pub total_declarado: String,
    pub diferencia: String,
    pub creado_en: String,
}

#[derive(Serialize, Deserialize)]
pub struct UsuarioInfo {
    pub id: String,
    pub nombre: String,
    pub rol: String,
    pub activo: bool,
}

// ── Command: Usuarios ─────────────────────────────────────────

/// Lista todos los usuarios activos para el selector de login.
/// No devuelve el PIN (seguridad).
#[tauri::command]
pub fn listar_usuarios() -> Result<Vec<UsuarioInfo>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nombre, rol, activo FROM Usuario WHERE activo = 1 ORDER BY nombre")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(UsuarioInfo {
                id: row.get(0)?,
                nombre: row.get(1)?,
                rol: row.get(2)?,
                activo: row.get::<_, i32>(3)? == 1,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

// ── Commands: Productos ───────────────────────────────────────

/// Lista productos activos con stock > 0 (vista cajero)
#[tauri::command]
pub fn listar_productos() -> Result<Vec<Producto>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, sku, nombre, descripcion, precioUSD, stock, stockMinimo, activo
             FROM Producto WHERE activo = 1 AND stock > 0
             ORDER BY nombre ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Producto {
                id: row.get(0)?,
                sku: row.get(1)?,
                nombre: row.get(2)?,
                descripcion: row.get(3)?,
                precio_usd: row.get(4)?,
                stock: row.get(5)?,
                stock_minimo: row.get(6)?,
                activo: row.get::<_, i32>(7)? == 1,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

/// Lista TODOS los productos (vista admin)
#[tauri::command]
pub fn listar_productos_admin() -> Result<Vec<Producto>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, sku, nombre, descripcion, precioUSD, stock, stockMinimo, activo
             FROM Producto ORDER BY nombre ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Producto {
                id: row.get(0)?,
                sku: row.get(1)?,
                nombre: row.get(2)?,
                descripcion: row.get(3)?,
                precio_usd: row.get(4)?,
                stock: row.get(5)?,
                stock_minimo: row.get(6)?,
                activo: row.get::<_, i32>(7)? == 1,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

#[tauri::command]
pub fn crear_producto(
    sku: String,
    nombre: String,
    descripcion: Option<String>,
    precio_usd: String,
    stock: i64,
    stock_minimo: i64,
) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO Producto (id, sku, nombre, descripcion, precioUSD, stock, stockMinimo, activo, isSynced, creadoEn, actualizadoEn)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 0, datetime('now', 'localtime'), datetime('now', 'localtime'))",
        params![id, sku, nombre, descripcion, precio_usd, stock, stock_minimo],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn actualizar_producto(
    id: String,
    sku: String,
    nombre: String,
    descripcion: Option<String>,
    precio_usd: String,
    stock: i64,
    stock_minimo: i64,
    activo: bool,
) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE Producto SET sku=?1, nombre=?2, descripcion=?3, precioUSD=?4,
         stock=?5, stockMinimo=?6, activo=?7, isSynced=0, actualizadoEn=datetime('now', 'localtime')
         WHERE id=?8",
        params![sku, nombre, descripcion, precio_usd, stock, stock_minimo, activo as i32, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Commands: Configuración ───────────────────────────────────

#[tauri::command]
pub fn obtener_configuracion() -> Result<ConfigApp, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    let tasa = conn
        .query_row(
            "SELECT valor FROM Configuracion WHERE clave = 'tasa_cambio_bsd'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "1.00".to_string());

    let iva = conn
        .query_row(
            "SELECT valor FROM Configuracion WHERE clave = 'iva_porcentaje'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "16".to_string());

    Ok(ConfigApp {
        tasa_cambio_bsd: tasa,
        iva_porcentaje: iva,
    })
}

#[tauri::command]
pub fn actualizar_configuracion(clave: String, valor: String) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO Configuracion (clave, valor, updatedAt) VALUES (?1, ?2, datetime('now', 'localtime'))
         ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor, updatedAt=datetime('now', 'localtime')",
        params![clave, valor],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Commands: Ventas ──────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineaInput {
    pub producto_id: String,
    pub cantidad: i64,
    pub precio_unit: String,
    pub subtotal: String,
}

#[tauri::command]
pub fn crear_venta(
    usuario_id: String,
    subtotal: String,
    impuesto: String,
    total: String,
    forma_pago: String,
    moneda: String,
    referencia_pago: Option<String>,
    tasa_cambio: Option<String>,
    lineas: Vec<LineaInput>,
) -> Result<String, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let venta_id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO Venta (id, usuarioId, subtotal, impuesto, total, formaPago, moneda, referenciaPago, tasaCambio, isSynced, creadoEn)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, datetime('now', 'localtime'))",
        params![venta_id, usuario_id, subtotal, impuesto, total, forma_pago, moneda, referencia_pago, tasa_cambio],
    )
    .map_err(|e| e.to_string())?;

    for linea in &lineas {
        let linea_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO LineaVenta (id, ventaId, productoId, cantidad, precioUnit, subtotal)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![linea_id, venta_id, linea.producto_id, linea.cantidad, linea.precio_unit, linea.subtotal],
        )
        .map_err(|e| e.to_string())?;

        // Descontar stock
        conn.execute(
            "UPDATE Producto SET stock = stock - ?1, isSynced = 0, actualizadoEn = datetime('now', 'localtime') WHERE id = ?2",
            params![linea.cantidad, linea.producto_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(venta_id)
}

// ── Commands: Cortes de Caja ──────────────────────────────────

#[tauri::command]
pub fn registrar_corte_caja(
    tipo: String,
    usuario_id: String,
    total_calculado: String,
    total_declarado: String,
    diferencia: String,
) -> Result<String, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let corte_id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO CorteCaja (id, tipo, usuarioId, totalCalculado, totalDeclarado, diferencia, isSynced, creadoEn)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, datetime('now', 'localtime'))",
        params![corte_id, tipo, usuario_id, total_calculado, total_declarado, diferencia],
    )
    .map_err(|e| e.to_string())?;

    Ok(corte_id)
}

#[tauri::command]
pub fn listar_cortes_caja() -> Result<Vec<CorteCajaInfo>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.tipo, c.usuarioId, u.nombre, c.totalCalculado,
                    c.totalDeclarado, c.diferencia, c.creadoEn
             FROM CorteCaja c
             JOIN Usuario u ON c.usuarioId = u.id
             ORDER BY c.creadoEn DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(CorteCajaInfo {
                id: row.get(0)?,
                tipo: row.get(1)?,
                usuario_id: row.get(2)?,
                nombre_usuario: row.get(3)?,
                total_calculado: row.get(4)?,
                total_declarado: row.get(5)?,
                diferencia: row.get(6)?,
                creado_en: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

// ── Commands: Sincronización Offline-First ────────────────────
// Estos comandos son usados por el sync-listener (JS) para:
// 1. Obtener registros con isSynced=false (para subirlos a Supabase)
// 2. Marcar registros como sincronizados tras confirmar el upsert

#[tauri::command]
pub fn obtener_ventas_pendientes() -> Result<Vec<serde_json::Value>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, usuarioId, subtotal, impuesto, total, formaPago,
                    moneda, referenciaPago, tasaCambio, creadoEn
             FROM Venta WHERE isSynced = 0",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "usuarioId": row.get::<_, String>(1)?,
                "subtotal": row.get::<_, String>(2)?,
                "impuesto": row.get::<_, String>(3)?,
                "total": row.get::<_, String>(4)?,
                "formaPago": row.get::<_, String>(5)?,
                "moneda": row.get::<_, String>(6)?,
                "referenciaPago": row.get::<_, Option<String>>(7)?,
                "tasaCambio": row.get::<_, Option<String>>(8)?,
                "creadoEn": row.get::<_, String>(9)?,
                "isSynced": false,
            }))
        })
        .map_err(|e| e.to_string())?;

    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

#[tauri::command]
pub fn obtener_productos_pendientes() -> Result<Vec<serde_json::Value>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, sku, nombre, descripcion, precioUSD, stock, stockMinimo, activo, creadoEn
             FROM Producto WHERE isSynced = 0",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "sku": row.get::<_, String>(1)?,
                "nombre": row.get::<_, String>(2)?,
                "descripcion": row.get::<_, Option<String>>(3)?,
                "precioUSD": row.get::<_, String>(4)?,
                "stock": row.get::<_, i64>(5)?,
                "stockMinimo": row.get::<_, i64>(6)?,
                "activo": row.get::<_, i32>(7)? == 1,
                "creadoEn": row.get::<_, String>(8)?,
                "isSynced": false,
            }))
        })
        .map_err(|e| e.to_string())?;

    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

#[tauri::command]
pub fn obtener_logs_pendientes() -> Result<Vec<serde_json::Value>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, entidad, entidadId, campo, valorAntes, valorDespues, usuarioId, creadoEn
             FROM LogCambio WHERE isSynced = 0",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "entidad": row.get::<_, String>(1)?,
                "entidadId": row.get::<_, String>(2)?,
                "campo": row.get::<_, String>(3)?,
                "valorAntes": row.get::<_, Option<String>>(4)?,
                "valorDespues": row.get::<_, Option<String>>(5)?,
                "usuarioId": row.get::<_, String>(6)?,
                "creadoEn": row.get::<_, String>(7)?,
                "isSynced": false,
            }))
        })
        .map_err(|e| e.to_string())?;

    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

#[tauri::command]
pub fn marcar_sincronizados(
    venta_ids: Vec<String>,
    producto_ids: Vec<String>,
    log_ids: Vec<String>,
) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // Marcar ventas
    for id in &venta_ids {
        conn.execute("UPDATE Venta SET isSynced = 1 WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
    }

    // Marcar productos
    for id in &producto_ids {
        conn.execute("UPDATE Producto SET isSynced = 1 WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
    }

    // Marcar logs
    for id in &log_ids {
        conn.execute("UPDATE LogCambio SET isSynced = 1 WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ── Commands: Resumen del Día (Corte X) ──────────────────────

/// Totales del día agrupados por forma de pago.
///
/// Para formas de pago en Bs (BS_EFECTIVO, BS_DEBITO, BS_PAGO_MOVIL):
///   Suma = total(USD) × tasaCambio(snapshot) → resultado en Bs
///   (Preparado para migración futura donde total ya se guardará en Bs directamente)
///
/// Para USD_EFECTIVO:
///   Suma directamente en USD.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumenDia {
    pub bs_efectivo: String,    // Total Bs de ventas BS_EFECTIVO del día
    pub bs_debito: String,      // Total Bs de ventas BS_DEBITO del día
    pub bs_pago_movil: String,  // Total Bs de ventas BS_PAGO_MOVIL del día
    pub usd_efectivo: String,   // Total USD de ventas USD_EFECTIVO del día
}

#[tauri::command]
pub fn resumen_ventas_dia() -> Result<ResumenDia, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // Suma para una forma de pago en Bs: total * tasaCambio
    let suma_bs = |forma: &str| -> Result<f64, String> {
        conn.query_row(
            "SELECT COALESCE(
                SUM(CAST(total AS REAL) * COALESCE(CAST(tasaCambio AS REAL), 1.0)),
                0.0
             )
             FROM Venta
             WHERE formaPago = ?1
               AND date(creadoEn) = date('now', 'localtime')",
            params![forma],
            |row| row.get::<_, f64>(0),
        )
        .map_err(|e| e.to_string())
    };

    // Suma para USD_EFECTIVO: directamente en USD
    let suma_usd = || -> Result<f64, String> {
        conn.query_row(
            "SELECT COALESCE(SUM(CAST(total AS REAL)), 0.0)
             FROM Venta
             WHERE formaPago = 'USD_EFECTIVO'
               AND date(creadoEn) = date('now', 'localtime')",
            [],
            |row| row.get::<_, f64>(0),
        )
        .map_err(|e| e.to_string())
    };

    Ok(ResumenDia {
        bs_efectivo:   format!("{:.2}", suma_bs("BS_EFECTIVO")?),
        bs_debito:     format!("{:.2}", suma_bs("BS_DEBITO")?),
        bs_pago_movil: format!("{:.2}", suma_bs("BS_PAGO_MOVIL")?),
        usd_efectivo:  format!("{:.2}", suma_usd()?),
    })
}

// ── Command: Autenticación ─────────────────────────────────────

/// Verifica el PIN ingresado por el usuario contra el hash SHA-256 almacenado.
/// Devuelve `true` si el PIN es correcto, `false` en caso contrario.
/// No lanza error para no exponer información sobre el usuario.
#[tauri::command]
pub fn verificar_pin(usuario_id: String, pin: String) -> Result<bool, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // Calcular SHA-256 del PIN ingresado
    let mut hasher = Sha256::new();
    hasher.update(pin.as_bytes());
    let hash_ingresado = format!("{:x}", hasher.finalize());

    // Buscar el hash almacenado para el usuario
    let resultado: rusqlite::Result<String> = conn.query_row(
        "SELECT pin FROM Usuario WHERE id = ?1 AND activo = 1",
        params![usuario_id],
        |row| row.get(0),
    );

    match resultado {
        Ok(hash_db) => Ok(hash_db == hash_ingresado),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false), // usuario no existe o inactivo
        Err(e) => Err(e.to_string()),
    }
}

// ── Commands: Sincronización (Pull) ──────────────────────────

#[derive(Deserialize)]
pub struct PullPayload {
    usuarios: Vec<serde_json::Value>,
    productos: Vec<serde_json::Value>,
}

#[tauri::command]
pub fn guardar_datos_pull(payload: PullPayload) -> Result<(), String> {
    let mut conn = open_db().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut pulled_user_ids = Vec::new();
    let mut pulled_product_ids = Vec::new();

    // 1. Guardar Usuarios
    for u in payload.usuarios {
        let id = u["id"].as_str().unwrap_or("");
        if !id.is_empty() {
            pulled_user_ids.push(id.to_string());
        }
        let nombre = u["nombre"].as_str().unwrap_or("");
        let pin = u["pin"].as_str().unwrap_or("");
        let rol = u["rol"].as_str().unwrap_or("");
        let activo = u["activo"].as_bool().unwrap_or(true) as i32;

        tx.execute(
            "INSERT INTO Usuario (id, nombre, pin, rol, activo, creadoEn)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET 
             nombre=excluded.nombre, pin=excluded.pin, rol=excluded.rol, activo=excluded.activo",
            params![id, nombre, pin, rol, activo],
        ).unwrap_or_default();
    }

    // 2. Guardar Productos
    for p in payload.productos {
        let id = p["id"].as_str().unwrap_or("");
        if !id.is_empty() {
            pulled_product_ids.push(id.to_string());
        }
        let sku = p["sku"].as_str().unwrap_or("");
        let nombre = p["nombre"].as_str().unwrap_or("");
        let desc = p["descripcion"].as_str(); // Optional
        let precio_usd = p["precioUSD"].as_str().unwrap_or("0");
        let stock = p["stock"].as_i64().unwrap_or(0);
        let stock_min = p["stockMinimo"].as_i64().unwrap_or(0);
        let activo = p["activo"].as_bool().unwrap_or(true) as i32;

        tx.execute(
            "INSERT INTO Producto (id, sku, nombre, descripcion, precioUSD, stock, stockMinimo, activo, isSynced, creadoEn, actualizadoEn)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET 
             sku=excluded.sku, nombre=excluded.nombre, descripcion=excluded.descripcion,
             precioUSD=excluded.precioUSD, stock=excluded.stock, stockMinimo=excluded.stockMinimo,
             activo=excluded.activo, isSynced=1, actualizadoEn=datetime('now')",
            params![id, sku, nombre, desc, precio_usd, stock, stock_min, activo],
        ).unwrap_or_default();
    }

    // 3. Limpiar / desactivar usuarios eliminados en Supabase
    if !pulled_user_ids.is_empty() {
        let placeholders = pulled_user_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let delete_sql = format!(
            "DELETE FROM Usuario 
             WHERE id NOT IN ({}) 
             AND id NOT IN (SELECT DISTINCT usuarioId FROM Venta)
             AND id NOT IN (SELECT DISTINCT usuarioId FROM LogCambio)
             AND id NOT IN (SELECT DISTINCT usuarioId FROM CorteCaja)",
            placeholders
        );
        let params: Vec<&str> = pulled_user_ids.iter().map(|s| s.as_str()).collect();
        tx.execute(&delete_sql, params_from_iter(params.iter())).unwrap_or_default();

        let deactivate_sql = format!(
            "UPDATE Usuario SET activo = 0 WHERE id NOT IN ({})",
            placeholders
        );
        tx.execute(&deactivate_sql, params_from_iter(params.iter())).unwrap_or_default();
    }

    // 4. Limpiar / desactivar productos eliminados en Supabase
    if !pulled_product_ids.is_empty() {
        let placeholders = pulled_product_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let delete_sql = format!(
            "DELETE FROM Producto 
             WHERE id NOT IN ({}) 
             AND id NOT IN (SELECT DISTINCT productoId FROM LineaVenta)",
            placeholders
        );
        let params: Vec<&str> = pulled_product_ids.iter().map(|s| s.as_str()).collect();
        tx.execute(&delete_sql, params_from_iter(params.iter())).unwrap_or_default();

        let deactivate_sql = format!(
            "UPDATE Producto SET activo = 0 WHERE id NOT IN ({})",
            placeholders
        );
        tx.execute(&deactivate_sql, params_from_iter(params.iter())).unwrap_or_default();
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
