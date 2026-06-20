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
    #[serde(rename = "monedaBase")]
    pub moneda_base: String,
    pub precio: String,
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
            "SELECT id, sku, nombre, descripcion, monedaBase, precio, stock, stockMinimo, activo
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
                moneda_base: row.get(4)?,
                precio: row.get(5)?,
                stock: row.get(6)?,
                stock_minimo: row.get(7)?,
                activo: row.get::<_, i32>(8)? == 1,
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
            "SELECT id, sku, nombre, descripcion, monedaBase, precio, stock, stockMinimo, activo
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
                moneda_base: row.get(4)?,
                precio: row.get(5)?,
                stock: row.get(6)?,
                stock_minimo: row.get(7)?,
                activo: row.get::<_, i32>(8)? == 1,
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
    moneda_base: String,
    precio: String,
    stock: i64,
    stock_minimo: i64,
) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO Producto (id, sku, nombre, descripcion, monedaBase, precio, stock, stockMinimo, activo, isSynced, creadoEn, actualizadoEn)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, 0, datetime('now'), datetime('now'))",
        params![id, sku, nombre, descripcion, moneda_base, precio, stock, stock_minimo],
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
    moneda_base: String,
    precio: String,
    stock: i64,
    stock_minimo: i64,
    activo: bool,
) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE Producto SET sku=?1, nombre=?2, descripcion=?3, monedaBase=?4, precio=?5,
         stock=?6, stockMinimo=?7, activo=?8, isSynced=0, actualizadoEn=datetime('now')
         WHERE id=?9",
        params![sku, nombre, descripcion, moneda_base, precio, stock, stock_minimo, activo as i32, id],
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
        "INSERT INTO Configuracion (clave, valor, updatedAt) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor, updatedAt=datetime('now')",
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
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, datetime('now'))",
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

        // Descontar stock (sin marcar isSynced=0 para no pisar stock de Supabase al sincronizar)
        conn.execute(
            "UPDATE Producto SET stock = stock - ?1, actualizadoEn = datetime('now') WHERE id = ?2",
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
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, datetime('now'))",
        params![corte_id, tipo, usuario_id, total_calculado, total_declarado, diferencia],
    )
    .map_err(|e| e.to_string())?;

    // Si es Corte X (de turno), asociamos las ventas de hoy pendientes a este corte
    if tipo == "X" {
        conn.execute(
            "UPDATE Venta SET corteCajaId = ?1, isSynced = 0
             WHERE date(creadoEn, 'localtime') = date('now', 'localtime')
               AND corteCajaId IS NULL",
            params![corte_id],
        )
        .map_err(|e| e.to_string())?;
    }

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
    
    // Primero, obtener las ventas
    let mut stmt = conn
        .prepare(
            "SELECT id, usuarioId, corteCajaId, subtotal, impuesto, total, formaPago,
                    moneda, referenciaPago, tasaCambio, creadoEn
             FROM Venta WHERE isSynced = 0",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,        // id
                row.get::<_, String>(1)?,        // usuarioId
                row.get::<_, Option<String>>(2)?,// corteCajaId
                row.get::<_, String>(3)?,        // subtotal
                row.get::<_, String>(4)?,        // impuesto
                row.get::<_, String>(5)?,        // total
                row.get::<_, String>(6)?,        // formaPago
                row.get::<_, String>(7)?,        // moneda
                row.get::<_, Option<String>>(8)?,// referenciaPago
                row.get::<_, Option<String>>(9)?,// tasaCambio
                row.get::<_, String>(10)?,       // creadoEn
            ))
        })
        .map_err(|e| e.to_string())?;

    let sales_list: Vec<_> = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    
    // Liberar la consulta de ventas para poder consultar las líneas con la misma conexión
    drop(stmt);

    let mut ventas_json = Vec::new();
    for (id, usuario_id, corte_caja_id, subtotal, impuesto, total, forma_pago, moneda, referencia_pago, tasa_cambio, creado_en) in sales_list {
        // Consultar las líneas de esta venta
        let mut lineas_stmt = conn.prepare(
            "SELECT id, ventaId, productoId, cantidad, precioUnit, subtotal 
             FROM LineaVenta WHERE ventaId = ?1"
        ).map_err(|e| e.to_string())?;
        
        let lineas_rows = lineas_stmt.query_map(params![id], |linea_row| {
            Ok(serde_json::json!({
                "id": linea_row.get::<_, String>(0)?,
                "ventaId": linea_row.get::<_, String>(1)?,
                "productoId": linea_row.get::<_, String>(2)?,
                "cantidad": linea_row.get::<_, i64>(3)?,
                "precioUnit": linea_row.get::<_, String>(4)?,
                "subtotal": linea_row.get::<_, String>(5)?,
            }))
        }).map_err(|e| e.to_string())?;
        
        let mut lineas = Vec::new();
        for lr in lineas_rows {
            lineas.push(lr.map_err(|e| e.to_string())?);
        }

        ventas_json.push(serde_json::json!({
            "id": id,
            "usuarioId": usuario_id,
            "corteCajaId": corte_caja_id, // ← incluido para que Supabase lo reciba en el upsert
            "subtotal": subtotal,
            "impuesto": impuesto,
            "total": total,
            "formaPago": forma_pago,
            "moneda": moneda,
            "referenciaPago": referencia_pago,
            "tasaCambio": tasa_cambio,
            "creadoEn": creado_en,
            "isSynced": false,
            "lineas": lineas
        }));
    }

    Ok(ventas_json)
}

#[tauri::command]
pub fn obtener_productos_pendientes() -> Result<Vec<serde_json::Value>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, sku, nombre, descripcion, monedaBase, precio, stock, stockMinimo, activo, creadoEn
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
                "monedaBase": row.get::<_, String>(4)?,
                "precio": row.get::<_, String>(5)?,
                "stock": row.get::<_, i64>(6)?,
                "stockMinimo": row.get::<_, i64>(7)?,
                "activo": row.get::<_, i32>(8)? == 1,
                "creadoEn": row.get::<_, String>(9)?,
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
pub fn obtener_cortes_pendientes() -> Result<Vec<serde_json::Value>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, tipo, usuarioId, totalCalculado, totalDeclarado, diferencia, creadoEn
             FROM CorteCaja WHERE isSynced = 0",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "tipo": row.get::<_, String>(1)?,
                "usuarioId": row.get::<_, String>(2)?,
                "totalCalculado": row.get::<_, String>(3)?,
                "totalDeclarado": row.get::<_, String>(4)?,
                "diferencia": row.get::<_, String>(5)?,
                "creadoEn": row.get::<_, String>(6)?,
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
    corte_ids: Vec<String>,
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

    // Marcar cortes
    for id in &corte_ids {
        conn.execute("UPDATE CorteCaja SET isSynced = 1 WHERE id = ?1", params![id])
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
pub fn resumen_ventas_dia(solo_pendientes: bool) -> Result<ResumenDia, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // Suma para una forma de pago en Bs: total * tasaCambio
    let suma_bs = |forma: &str| -> Result<f64, String> {
        let sql = if solo_pendientes {
            "SELECT COALESCE(
                SUM(CAST(total AS REAL) * COALESCE(CAST(tasaCambio AS REAL), 1.0)),
                0.0
             )
             FROM Venta
             WHERE formaPago = ?1
               AND date(creadoEn, 'localtime') = date('now', 'localtime')
               AND corteCajaId IS NULL"
        } else {
            "SELECT COALESCE(
                SUM(CAST(total AS REAL) * COALESCE(CAST(tasaCambio AS REAL), 1.0)),
                0.0
             )
             FROM Venta
             WHERE formaPago = ?1
               AND date(creadoEn, 'localtime') = date('now', 'localtime')"
        };
        conn.query_row(
            sql,
            params![forma],
            |row| row.get::<_, f64>(0),
        )
        .map_err(|e| e.to_string())
    };

    // Suma para USD_EFECTIVO: directamente en USD
    let suma_usd = || -> Result<f64, String> {
        let sql = if solo_pendientes {
            "SELECT COALESCE(SUM(CAST(total AS REAL)), 0.0)
             FROM Venta
             WHERE formaPago = 'USD_EFECTIVO'
               AND date(creadoEn, 'localtime') = date('now', 'localtime')
               AND corteCajaId IS NULL"
        } else {
            "SELECT COALESCE(SUM(CAST(total AS REAL)), 0.0)
             FROM Venta
             WHERE formaPago = 'USD_EFECTIVO'
               AND date(creadoEn, 'localtime') = date('now', 'localtime')"
        };
        conn.query_row(
            sql,
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
    cortes: Vec<serde_json::Value>,
    ventas: Option<Vec<serde_json::Value>>,
    lineas: Option<Vec<serde_json::Value>>,
    clientes: Option<Vec<serde_json::Value>>,
    deudas: Option<Vec<serde_json::Value>>,
    lineas_deuda: Option<Vec<serde_json::Value>>,
    configuracion: Option<Vec<serde_json::Value>>,
}

#[tauri::command]
pub fn guardar_datos_pull(payload: PullPayload) -> Result<(), String> {
    let mut conn = open_db().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut pulled_user_ids = Vec::new();
    let mut pulled_product_ids = Vec::new();
    let mut pulled_corte_ids = Vec::new();

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
        let moneda_base = p["monedaBase"].as_str().unwrap_or("USD");
        let precio = p["precio"].as_str().unwrap_or("0");
        let stock = p["stock"].as_i64().unwrap_or(0);
        let stock_min = p["stockMinimo"].as_i64().unwrap_or(0);
        let activo = p["activo"].as_bool().unwrap_or(true) as i32;

        tx.execute(
            "INSERT INTO Producto (id, sku, nombre, descripcion, monedaBase, precio, stock, stockMinimo, activo, isSynced, creadoEn, actualizadoEn)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET 
             sku=excluded.sku, nombre=excluded.nombre, descripcion=excluded.descripcion,
             monedaBase=excluded.monedaBase, precio=excluded.precio, stock=excluded.stock, stockMinimo=excluded.stockMinimo,
             activo=excluded.activo, isSynced=1, actualizadoEn=datetime('now')",
            params![id, sku, nombre, desc, moneda_base, precio, stock, stock_min, activo],
        ).unwrap_or_default();
    }

    // 3. Guardar Cortes de Caja
    for c in payload.cortes {
        let id = c["id"].as_str().unwrap_or("");
        if !id.is_empty() {
            pulled_corte_ids.push(id.to_string());
        }
        let tipo = c["tipo"].as_str().unwrap_or("X");
        let usuario_id = c["usuarioId"].as_str().unwrap_or("");
        let total_calculado = c["totalCalculado"].as_str().unwrap_or("0.00");
        let total_declarado = c["totalDeclarado"].as_str().unwrap_or("");
        let diferencia = c["diferencia"].as_str().unwrap_or("0.00");
        let creado_en = c["creadoEn"].as_str().unwrap_or("");

        tx.execute(
            "INSERT INTO CorteCaja (id, tipo, usuarioId, totalCalculado, totalDeclarado, diferencia, isSynced, creadoEn)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)
             ON CONFLICT(id) DO UPDATE SET 
             tipo=excluded.tipo, usuarioId=excluded.usuarioId, totalCalculado=excluded.totalCalculado,
             totalDeclarado=excluded.totalDeclarado, diferencia=excluded.diferencia, isSynced=1, creadoEn=excluded.creadoEn",
            params![id, tipo, usuario_id, total_calculado, total_declarado, diferencia, creado_en],
        ).unwrap_or_default();
    }

    // 4. Limpiar / desactivar usuarios eliminados en Supabase
    if pulled_user_ids.is_empty() {
        tx.execute(
            "DELETE FROM Usuario 
             WHERE id NOT IN (SELECT DISTINCT usuarioId FROM Venta)
             AND id NOT IN (SELECT DISTINCT usuarioId FROM LogCambio)
             AND id NOT IN (SELECT DISTINCT usuarioId FROM CorteCaja)",
            [],
        ).unwrap_or_default();

        tx.execute("UPDATE Usuario SET activo = 0", []).unwrap_or_default();
    } else {
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

    // 5. Limpiar / desactivar productos eliminados en Supabase
    if pulled_product_ids.is_empty() {
        tx.execute(
            "DELETE FROM Producto 
             WHERE id NOT IN (SELECT DISTINCT productoId FROM LineaVenta)",
            [],
        ).unwrap_or_default();

        tx.execute("UPDATE Producto SET activo = 0", []).unwrap_or_default();
    } else {
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

    // 6. Limpiar cortes eliminados en Supabase
    if pulled_corte_ids.is_empty() {
        tx.execute(
            "DELETE FROM CorteCaja 
             WHERE id NOT IN (SELECT DISTINCT corteCajaId FROM Venta WHERE corteCajaId IS NOT NULL)",
            [],
        ).unwrap_or_default();
    } else {
        let placeholders = pulled_corte_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let delete_sql = format!(
            "DELETE FROM CorteCaja 
             WHERE id NOT IN ({}) 
             AND id NOT IN (SELECT DISTINCT corteCajaId FROM Venta WHERE corteCajaId IS NOT NULL)",
            placeholders
        );
        let params: Vec<&str> = pulled_corte_ids.iter().map(|s| s.as_str()).collect();
        tx.execute(&delete_sql, params_from_iter(params.iter())).unwrap_or_default();
    }

    // 7. Guardar Ventas
    if let Some(ventas) = payload.ventas {
        for v in ventas {
            let id = v["id"].as_str().unwrap_or("");
            if id.is_empty() { continue; }
            let usuario_id = v["usuarioId"].as_str().unwrap_or("");
            let corte_caja_id = v["corteCajaId"].as_str(); // Option
            let subtotal = v["subtotal"].as_str().unwrap_or("0.00");
            let impuesto = v["impuesto"].as_str().unwrap_or("0.00");
            let total = v["total"].as_str().unwrap_or("0.00");
            let forma_pago = v["formaPago"].as_str().unwrap_or("");
            let moneda = v["moneda"].as_str().unwrap_or("");
            let referencia_pago = v["referenciaPago"].as_str(); // Option
            let tasa_cambio = v["tasaCambio"].as_str(); // Option
            let creado_en = v["creadoEn"].as_str().unwrap_or("");

            let _ = tx.execute(
                "INSERT INTO Venta (id, usuarioId, corteCajaId, subtotal, impuesto, total, formaPago, moneda, referenciaPago, tasaCambio, isSynced, creadoEn)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11)
                 ON CONFLICT(id) DO UPDATE SET 
                 usuarioId=excluded.usuarioId, corteCajaId=excluded.corteCajaId, subtotal=excluded.subtotal,
                 impuesto=excluded.impuesto, total=excluded.total, formaPago=excluded.formaPago,
                 moneda=excluded.moneda, referenciaPago=excluded.referenciaPago, tasaCambio=excluded.tasaCambio,
                 isSynced=1, creadoEn=excluded.creadoEn",
                params![id, usuario_id, corte_caja_id, subtotal, impuesto, total, forma_pago, moneda, referencia_pago, tasa_cambio, creado_en],
            );
        }
    }

    // 8. Guardar Líneas de Venta
    if let Some(lineas) = payload.lineas {
        for l in lineas {
            let id = l["id"].as_str().unwrap_or("");
            if id.is_empty() { continue; }
            let venta_id = l["ventaId"].as_str().unwrap_or("");
            let producto_id = l["productoId"].as_str().unwrap_or("");
            let cantidad = l["cantidad"].as_i64().unwrap_or(0);
            let precio_unit = l["precioUnit"].as_str().unwrap_or("0.00");
            let subtotal = l["subtotal"].as_str().unwrap_or("0.00");

            let _ = tx.execute(
                "INSERT INTO LineaVenta (id, ventaId, productoId, cantidad, precioUnit, subtotal)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET 
                 ventaId=excluded.ventaId, productoId=excluded.productoId,
                 cantidad=excluded.cantidad, precioUnit=excluded.precioUnit, subtotal=excluded.subtotal",
                params![id, venta_id, producto_id, cantidad, precio_unit, subtotal],
            );
        }
    }

    // 9. Guardar Configuración (IVA)
    if let Some(config) = payload.configuracion {
        for c in config {
            let clave = c["clave"].as_str().unwrap_or("");
            let valor = c["valor"].as_str().unwrap_or("");
            if !clave.is_empty() {
                let _ = tx.execute(
                    "INSERT INTO Configuracion (clave, valor, updatedAt) VALUES (?1, ?2, datetime('now'))
                     ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor, updatedAt=datetime('now')",
                    params![clave, valor],
                );
            }
        }
    }

    // 10. Guardar Clientes
    if let Some(clientes) = payload.clientes {
        for c in clientes {
            let id = c["id"].as_str().unwrap_or("");
            if id.is_empty() { continue; }
            let nombre = c["nombre"].as_str().unwrap_or("");
            let apellido = c["apellido"].as_str().unwrap_or("");
            let telefono = c["telefono"].as_str(); // Option
            let activo = c["activo"].as_bool().unwrap_or(true) as i32;
            let creado_en = c["creadoEn"].as_str().unwrap_or("");

            let _ = tx.execute(
                "INSERT INTO Cliente (id, nombre, apellido, telefono, activo, isSynced, creadoEn)
                 VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)
                 ON CONFLICT(id) DO UPDATE SET 
                 nombre=excluded.nombre, apellido=excluded.apellido, telefono=excluded.telefono,
                 activo=excluded.activo, isSynced=1, creadoEn=excluded.creadoEn",
                params![id, nombre, apellido, telefono, activo, creado_en],
            );
        }
    }

    // 11. Guardar Deudas
    if let Some(deudas) = payload.deudas {
        for d in deudas {
            let id = d["id"].as_str().unwrap_or("");
            if id.is_empty() { continue; }
            let cliente_id = d["clienteId"].as_str().unwrap_or("");
            let usuario_id = d["usuarioId"].as_str().unwrap_or("");
            let subtotal = d["subtotal"].as_str().unwrap_or("0.00");
            let impuesto = d["impuesto"].as_str().unwrap_or("0.00");
            let total = d["total"].as_str().unwrap_or("0.00");
            let activo = d["activo"].as_bool().unwrap_or(true) as i32;
            let anulada = d["anulada"].as_bool().unwrap_or(false) as i32;
            let creado_en = d["creadoEn"].as_str().unwrap_or("");

            let _ = tx.execute(
                "INSERT INTO Deuda (id, clienteId, usuarioId, subtotal, impuesto, total, activo, anulada, isSynced, creadoEn)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)
                 ON CONFLICT(id) DO UPDATE SET 
                 clienteId=excluded.clienteId, usuarioId=excluded.usuarioId, subtotal=excluded.subtotal,
                 impuesto=excluded.impuesto, total=excluded.total, activo=excluded.activo, 
                 anulada=excluded.anulada, isSynced=1, creadoEn=excluded.creadoEn",
                params![id, cliente_id, usuario_id, subtotal, impuesto, total, activo, anulada, creado_en],
            );
        }
    }

    // 12. Guardar Líneas de Deuda
    if let Some(lineas_deuda) = payload.lineas_deuda {
        for l in lineas_deuda {
            let id = l["id"].as_str().unwrap_or("");
            if id.is_empty() { continue; }
            let deuda_id = l["deudaId"].as_str().unwrap_or("");
            let producto_id = l["productoId"].as_str().unwrap_or("");
            let cantidad = l["cantidad"].as_i64().unwrap_or(0);
            let precio_unit = l["precioUnit"].as_str().unwrap_or("0.00");
            let subtotal = l["subtotal"].as_str().unwrap_or("0.00");
            let activo = l["activo"].as_bool().unwrap_or(true) as i32;
            let anulada = l["anulada"].as_bool().unwrap_or(false) as i32;

            let _ = tx.execute(
                "INSERT INTO LineaDeuda (id, deudaId, productoId, cantidad, precioUnit, subtotal, activo, anulada)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET 
                 deudaId=excluded.deudaId, productoId=excluded.productoId,
                 cantidad=excluded.cantidad, precioUnit=excluded.precioUnit, subtotal=excluded.subtotal,
                 activo=excluded.activo, anulada=excluded.anulada",
                params![id, deuda_id, producto_id, cantidad, precio_unit, subtotal, activo, anulada],
            );
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ── Commands: Cuentas por Cobrar ──────────────────────────────

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClienteInfo {
    pub id: String,
    pub nombre: String,
    pub apellido: String,
    pub telefono: Option<String>,
    pub activo: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineaDeudaInfo {
    pub id: String,
    pub producto_id: String,
    pub producto_nombre: String,
    pub cantidad: i64,
    pub precio_unit: String,
    pub subtotal: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeudaInfo {
    pub id: String,
    pub usuario_id: String,
    pub usuario_nombre: String,
    pub subtotal: String,
    pub impuesto: String,
    pub total: String,
    pub creado_en: String,
    pub lineas: Vec<LineaDeudaInfo>,
}

#[tauri::command]
pub fn listar_clientes() -> Result<Vec<ClienteInfo>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nombre, apellido, telefono, activo FROM Cliente WHERE activo = 1 ORDER BY nombre ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ClienteInfo {
                id: row.get(0)?,
                nombre: row.get(1)?,
                apellido: row.get(2)?,
                telefono: row.get(3)?,
                activo: row.get::<_, i32>(4)? == 1,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

#[tauri::command]
pub fn crear_cliente(nombre: String, apellido: String, telefono: Option<String>) -> Result<String, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO Cliente (id, nombre, apellido, telefono, activo, creadoEn, isSynced)
         VALUES (?1, ?2, ?3, ?4, 1, datetime('now'), 0)",
        params![id, nombre, apellido, telefono],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn crear_deuda(
    cliente_id: String,
    usuario_id: String,
    subtotal: String,
    impuesto: String,
    total: String,
    lineas: Vec<LineaInput>,
) -> Result<String, String> {
    let mut conn = open_db().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    let deuda_id = Uuid::new_v4().to_string();

    tx.execute(
        "INSERT INTO Deuda (id, clienteId, usuarioId, subtotal, impuesto, total, creadoEn, isSynced)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), 0)",
        params![deuda_id, cliente_id, usuario_id, subtotal, impuesto, total],
    )
    .map_err(|e| e.to_string())?;

    for linea in &lineas {
        let linea_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO LineaDeuda (id, deudaId, productoId, cantidad, precioUnit, subtotal)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![linea_id, deuda_id, linea.producto_id, linea.cantidad, linea.precio_unit, linea.subtotal],
        )
        .map_err(|e| e.to_string())?;

        // Descontar stock del producto
        tx.execute(
            "UPDATE Producto SET stock = stock - ?1, actualizadoEn = datetime('now') WHERE id = ?2",
            params![linea.cantidad, linea.producto_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(deuda_id)
}

#[tauri::command]
pub fn listar_deudas_cliente(cliente_id: String) -> Result<Vec<DeudaInfo>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    
    // Obtener todas las deudas del cliente
    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.usuarioId, u.nombre, d.subtotal, d.impuesto, d.total, d.creadoEn
             FROM Deuda d
             JOIN Usuario u ON d.usuarioId = u.id
             WHERE d.clienteId = ?1 AND d.activo = 1
             ORDER BY d.creadoEn DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![cliente_id], |row| {
            Ok((
                row.get::<_, String>(0)?, // id
                row.get::<_, String>(1)?, // usuarioId
                row.get::<_, String>(2)?, // usuarioNombre
                row.get::<_, String>(3)?, // subtotal
                row.get::<_, String>(4)?, // impuesto
                row.get::<_, String>(5)?, // total
                row.get::<_, String>(6)?, // creadoEn
            ))
        })
        .map_err(|e| e.to_string())?;

    let deudas_raw: Vec<_> = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    drop(stmt);

    let mut resultado = Vec::new();

    for (id, usuario_id, usuario_nombre, subtotal, impuesto, total, creado_en) in deudas_raw {
        // Obtener las líneas de esta deuda
        let mut lineas_stmt = conn
            .prepare(
                "SELECT ld.id, ld.productoId, p.nombre, ld.cantidad, ld.precioUnit, ld.subtotal
                 FROM LineaDeuda ld
                 JOIN Producto p ON ld.productoId = p.id
                 WHERE ld.deudaId = ?1 AND ld.activo = 1",
            )
            .map_err(|e| e.to_string())?;

        let lineas_rows = lineas_stmt
            .query_map(params![id], |row| {
                Ok(LineaDeudaInfo {
                    id: row.get(0)?,
                    producto_id: row.get(1)?,
                    producto_nombre: row.get(2)?,
                    cantidad: row.get(3)?,
                    precio_unit: row.get(4)?,
                    subtotal: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut lineas = Vec::new();
        for lr in lineas_rows {
            lineas.push(lr.map_err(|e| e.to_string())?);
        }

        resultado.push(DeudaInfo {
            id,
            usuario_id,
            usuario_nombre,
            subtotal,
            impuesto,
            total,
            creado_en,
            lineas,
        });
    }

    Ok(resultado)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagarDeudaLinea {
    pub deuda_id: String,
    pub linea_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagarDeudasProductosInput {
    pub usuario_id: String,
    pub forma_pago: String,
    pub moneda: String,
    pub referencia_pago: Option<String>,
    pub tasa_cambio: Option<String>,
    pub lineas_a_pagar: Vec<PagarDeudaLinea>,
}

#[tauri::command]
pub fn pagar_deudas_productos(
    payload: PagarDeudasProductosInput,
) -> Result<String, String> {
    let mut conn = open_db().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut subtotal_venta: f64 = 0.0;
    let mut impuesto_venta: f64 = 0.0;
    let mut lineas_venta_info = Vec::new();

    // 1. Obtener detalles de cada línea de deuda y calcular impuestos proporcionales
    for item in &payload.lineas_a_pagar {
        // Consultar la deuda para obtener el ratio de impuesto original
        let (orig_subtotal_str, orig_impuesto_str): (String, String) = tx
            .query_row(
                "SELECT subtotal, impuesto FROM Deuda WHERE id = ?1",
                params![item.deuda_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Deuda {} no encontrada: {}", item.deuda_id, e))?;

        let orig_subtotal: f64 = orig_subtotal_str.parse().unwrap_or(1.0);
        let orig_impuesto: f64 = orig_impuesto_str.parse().unwrap_or(0.0);
        let ratio_impuesto = if orig_subtotal > 0.0 { orig_impuesto / orig_subtotal } else { 0.0 };

        // Consultar la línea de deuda
        let (producto_id, cantidad, precio_unit, subtotal_linea_str): (String, i64, String, String) = tx
            .query_row(
                "SELECT productoId, cantidad, precioUnit, subtotal FROM LineaDeuda WHERE id = ?1",
                params![item.linea_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .map_err(|e| format!("Línea de deuda {} no encontrada: {}", item.linea_id, e))?;

        let subtotal_linea: f64 = subtotal_linea_str.parse().unwrap_or(0.0);
        let impuesto_linea = subtotal_linea * ratio_impuesto;

        subtotal_venta += subtotal_linea;
        impuesto_venta += impuesto_linea;

        lineas_venta_info.push((producto_id, cantidad, precio_unit, subtotal_linea_str));
    }

    let total_venta = subtotal_venta + impuesto_venta;

    // 2. Registrar la venta en la base de datos
    let venta_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO Venta (id, usuarioId, subtotal, impuesto, total, formaPago, moneda, referenciaPago, tasaCambio, isSynced, esCobroDeuda, creadoEn)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, 1, datetime('now'))",
        params![
            venta_id,
            payload.usuario_id,
            format!("{:.2}", subtotal_venta),
            format!("{:.2}", impuesto_venta),
            format!("{:.2}", total_venta),
            payload.forma_pago,
            payload.moneda,
            payload.referencia_pago,
            payload.tasa_cambio,
        ],
    )
    .map_err(|e| e.to_string())?;

    // 3. Crear las líneas de venta correspondientes (sin descontar stock)
    for (producto_id, cantidad, precio_unit, subtotal_linea) in &lineas_venta_info {
        let linea_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO LineaVenta (id, ventaId, productoId, cantidad, precioUnit, subtotal)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                linea_id,
                venta_id,
                producto_id,
                cantidad,
                precio_unit,
                subtotal_linea,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // 4. Eliminar las líneas de deuda seleccionadas
    for item in &payload.lineas_a_pagar {
        tx.execute("UPDATE LineaDeuda SET activo = 0 WHERE id = ?1", params![item.linea_id])
            .map_err(|e| e.to_string())?;
    }

    // 5. Agrupar las líneas pagadas por deuda_id para actualizar/eliminar las deudas padre
    let mut deudas_afectadas = std::collections::HashSet::new();
    for item in &payload.lineas_a_pagar {
        deudas_afectadas.insert(&item.deuda_id);
    }

    for deuda_id in deudas_afectadas {
        // Verificar si quedan líneas de deuda
        let remaining_count: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM LineaDeuda WHERE deudaId = ?1 AND activo = 1",
                params![deuda_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if remaining_count == 0 {
            // Si ya no quedan productos, eliminar la deuda por completo
            tx.execute("UPDATE Deuda SET activo = 0, isSynced = 0 WHERE id = ?1", params![deuda_id])
                .map_err(|e| e.to_string())?;
        } else {
            // Obtener el ratio de impuesto original nuevamente para esta deuda
            let (orig_subtotal_str, orig_impuesto_str): (String, String) = tx
                .query_row(
                    "SELECT subtotal, impuesto FROM Deuda WHERE id = ?1",
                    params![deuda_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(|e| e.to_string())?;

            let orig_subtotal: f64 = orig_subtotal_str.parse().unwrap_or(1.0);
            let orig_impuesto: f64 = orig_impuesto_str.parse().unwrap_or(0.0);
            let ratio_impuesto = if orig_subtotal > 0.0 { orig_impuesto / orig_subtotal } else { 0.0 };

            // Recalcular el nuevo subtotal de la deuda
            let remaining_subtotal_str: String = tx
                .query_row(
                    "SELECT COALESCE(SUM(CAST(subtotal AS REAL)), 0.0) FROM LineaDeuda WHERE deudaId = ?1 AND activo = 1",
                    params![deuda_id],
                    |row| {
                        let val: f64 = row.get(0)?;
                        Ok(format!("{:.2}", val))
                    },
                )
                .map_err(|e| e.to_string())?;

            let remaining_subtotal: f64 = remaining_subtotal_str.parse().unwrap_or(0.0);
            let remaining_impuesto = remaining_subtotal * ratio_impuesto;
            let remaining_total = remaining_subtotal + remaining_impuesto;

            tx.execute(
                "UPDATE Deuda SET subtotal = ?2, impuesto = ?3, total = ?4, isSynced = 0 WHERE id = ?1",
                params![
                    deuda_id,
                    format!("{:.2}", remaining_subtotal),
                    format!("{:.2}", remaining_impuesto),
                    format!("{:.2}", remaining_total),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(venta_id)
}


// ── Comandos: Edición de Deudas ───────────────────────────────

#[tauri::command]
pub fn eliminar_cliente(cliente_id: String) -> Result<(), String> {
    let mut conn = open_db().map_err(|e| e.to_string())?;
    let (deuda_count,): (i64,) = conn
        .query_row(
            "SELECT COUNT(*) FROM Deuda WHERE clienteId = ?1 AND activo = 1",
            rusqlite::params![cliente_id],
            |row| row.try_into(),
        )
        .unwrap_or((0,));

    if deuda_count > 0 {
        return Err("No se puede borrar el cliente porque tiene deudas pendientes.".to_string());
    }

    conn.execute("UPDATE Cliente SET activo = false, isSynced = 0 WHERE id = ?1", rusqlite::params![cliente_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn eliminar_deuda(deuda_id: String) -> Result<(), String> {
    let mut conn = open_db().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut devoluciones = Vec::new();
    {
        let mut stmt = tx.prepare("SELECT productoId, cantidad FROM LineaDeuda WHERE deudaId = ?1 AND activo = 1").map_err(|e| e.to_string())?;
        let mut rows = stmt.query(rusqlite::params![deuda_id]).map_err(|e| e.to_string())?;
        
        while let Some(row) = rows.next().unwrap_or(None) {
            let producto_id: String = row.get(0).unwrap_or_default();
            let cantidad: i64 = row.get(1).unwrap_or(0);
            devoluciones.push((producto_id, cantidad));
        }
    }

    for (producto_id, cantidad) in devoluciones {
        tx.execute(
            "UPDATE Producto SET stock = stock + ?1, actualizadoEn = datetime('now') WHERE id = ?2",
            rusqlite::params![cantidad, producto_id],
        ).map_err(|e| e.to_string())?;
    }

    tx.execute("UPDATE LineaDeuda SET activo = false WHERE deudaId = ?1", rusqlite::params![deuda_id]).map_err(|e| e.to_string())?;
    tx.execute("UPDATE Deuda SET activo = false, anulada = true, isSynced = 0 WHERE id = ?1", rusqlite::params![deuda_id]).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn eliminar_linea_deuda(deuda_id: String, linea_id: String) -> Result<(), String> {
    let mut conn = open_db().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let (producto_id, cantidad): (String, i64) = tx
        .query_row(
            "SELECT productoId, cantidad FROM LineaDeuda WHERE id = ?1",
            rusqlite::params![linea_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE Producto SET stock = stock + ?1, actualizadoEn = datetime('now') WHERE id = ?2",
        rusqlite::params![cantidad, producto_id],
    ).map_err(|e| e.to_string())?;

    tx.execute("UPDATE LineaDeuda SET activo = false, anulada = true WHERE id = ?1", rusqlite::params![linea_id]).map_err(|e| e.to_string())?;

    let lineas_count: i64 = tx
        .query_row("SELECT COUNT(*) FROM LineaDeuda WHERE deudaId = ?1 AND activo = 1", rusqlite::params![deuda_id], |row| row.get(0))
        .unwrap_or(0);

    if lineas_count == 0 {
        tx.execute("UPDATE Deuda SET activo = false, isSynced = 0 WHERE id = ?1", rusqlite::params![deuda_id]).map_err(|e| e.to_string())?;
    } else {
        let (orig_subtotal_str, orig_impuesto_str): (String, String) = tx
            .query_row("SELECT subtotal, impuesto FROM Deuda WHERE id = ?1", rusqlite::params![deuda_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?;

        let orig_subtotal: f64 = orig_subtotal_str.parse().unwrap_or(1.0);
        let orig_impuesto: f64 = orig_impuesto_str.parse().unwrap_or(0.0);
        let ratio_impuesto = if orig_subtotal > 0.0 { orig_impuesto / orig_subtotal } else { 0.0 };

        let remaining_subtotal_str: String = tx
            .query_row("SELECT COALESCE(SUM(CAST(subtotal AS REAL)), 0.0) FROM LineaDeuda WHERE deudaId = ?1 AND activo = 1", rusqlite::params![deuda_id], |row| Ok(format!("{:.2}", row.get::<usize, f64>(0)?)))
            .map_err(|e| e.to_string())?;

        let remaining_subtotal: f64 = remaining_subtotal_str.parse().unwrap_or(0.0);
        let remaining_impuesto = remaining_subtotal * ratio_impuesto;
        let remaining_total = remaining_subtotal + remaining_impuesto;

        tx.execute(
            "UPDATE Deuda SET subtotal = ?2, impuesto = ?3, total = ?4, isSynced = 0 WHERE id = ?1",
            rusqlite::params![deuda_id, format!("{:.2}", remaining_subtotal), format!("{:.2}", remaining_impuesto), format!("{:.2}", remaining_total)],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn actualizar_cantidad_linea_deuda(deuda_id: String, linea_id: String, nueva_cantidad: i64) -> Result<(), String> {
    let mut conn = open_db().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let (producto_id, cantidad_anterior, precio_unit_str): (String, i64, String) = tx
        .query_row(
            "SELECT productoId, cantidad, precioUnit FROM LineaDeuda WHERE id = ?1",
            rusqlite::params![linea_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let diferencia = cantidad_anterior - nueva_cantidad;
    
    tx.execute(
        "UPDATE Producto SET stock = stock + ?1, actualizadoEn = datetime('now') WHERE id = ?2",
        rusqlite::params![diferencia, producto_id],
    ).map_err(|e| e.to_string())?;

    let precio_unit: f64 = precio_unit_str.parse().unwrap_or(0.0);
    let nuevo_subtotal = (nueva_cantidad as f64) * precio_unit;

    tx.execute(
        "UPDATE LineaDeuda SET cantidad = ?2, subtotal = ?3 WHERE id = ?1",
        rusqlite::params![linea_id, nueva_cantidad, format!("{:.2}", nuevo_subtotal)],
    ).map_err(|e| e.to_string())?;

    let (orig_subtotal_str, orig_impuesto_str): (String, String) = tx
        .query_row("SELECT subtotal, impuesto FROM Deuda WHERE id = ?1", rusqlite::params![deuda_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?;

    let orig_subtotal: f64 = orig_subtotal_str.parse().unwrap_or(1.0);
    let orig_impuesto: f64 = orig_impuesto_str.parse().unwrap_or(0.0);
    let ratio_impuesto = if orig_subtotal > 0.0 { orig_impuesto / orig_subtotal } else { 0.0 };

    let remaining_subtotal_str: String = tx
        .query_row("SELECT COALESCE(SUM(CAST(subtotal AS REAL)), 0.0) FROM LineaDeuda WHERE deudaId = ?1 AND activo = 1", rusqlite::params![deuda_id], |row| Ok(format!("{:.2}", row.get::<usize, f64>(0)?)))
        .map_err(|e| e.to_string())?;

    let remaining_subtotal: f64 = remaining_subtotal_str.parse().unwrap_or(0.0);
    let remaining_impuesto = remaining_subtotal * ratio_impuesto;
    let remaining_total = remaining_subtotal + remaining_impuesto;

    tx.execute(
        "UPDATE Deuda SET subtotal = ?2, impuesto = ?3, total = ?4, isSynced = 0 WHERE id = ?1",
        rusqlite::params![deuda_id, format!("{:.2}", remaining_subtotal), format!("{:.2}", remaining_impuesto), format!("{:.2}", remaining_total)],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ── Sincronización: Cuentas por Cobrar ───────────────────────

#[tauri::command]
pub fn obtener_clientes_pendientes() -> Result<Vec<serde_json::Value>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nombre, apellido, telefono, activo, creadoEn FROM Cliente WHERE isSynced = 0")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "nombre": row.get::<_, String>(1)?,
                "apellido": row.get::<_, String>(2)?,
                "telefono": row.get::<_, Option<String>>(3)?,
                "activo": row.get::<_, i32>(4)? == 1,
                "creadoEn": row.get::<_, String>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut clientes = Vec::new();
    for row in rows {
        if let Ok(c) = row {
            clientes.push(c);
        }
    }
    Ok(clientes)
}

#[tauri::command]
pub fn obtener_deudas_pendientes() -> Result<Vec<serde_json::Value>, String> {
    let mut conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, clienteId, usuarioId, subtotal, impuesto, total, activo, anulada, creadoEn FROM Deuda WHERE isSynced = 0")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "clienteId": row.get::<_, String>(1)?,
                "usuarioId": row.get::<_, String>(2)?,
                "subtotal": row.get::<_, String>(3)?,
                "impuesto": row.get::<_, String>(4)?,
                "total": row.get::<_, String>(5)?,
                "activo": row.get::<_, i32>(6)? == 1,
                "anulada": row.get::<_, i32>(7)? == 1,
                "creadoEn": row.get::<_, String>(8)?,
                "lineas": [],
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut deudas = Vec::new();
    for row in rows {
        if let Ok(mut d) = row {
            let deuda_id = d["id"].as_str().unwrap().to_string();
            let mut stmt_lineas = conn
                .prepare("SELECT id, deudaId, productoId, cantidad, precioUnit, subtotal, activo, anulada FROM LineaDeuda WHERE deudaId = ?1")
                .unwrap();
            let lineas_rows = stmt_lineas
                .query_map(rusqlite::params![deuda_id], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, String>(0)?,
                        "deudaId": row.get::<_, String>(1)?,
                        "productoId": row.get::<_, String>(2)?,
                        "cantidad": row.get::<_, i64>(3)?,
                        "precioUnit": row.get::<_, String>(4)?,
                        "subtotal": row.get::<_, String>(5)?,
                        "activo": row.get::<_, i32>(6)? == 1,
                    }))
                })
                .unwrap();

            let mut lineas_arr = Vec::new();
            for l_row in lineas_rows {
                if let Ok(l) = l_row {
                    lineas_arr.push(l);
                }
            }

            d["lineas"] = serde_json::Value::Array(lineas_arr);
            deudas.push(d);
        }
    }
    Ok(deudas)
}
