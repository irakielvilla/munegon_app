// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Comandos Tauri: Comandas (Mesas / Turnos)
// ══════════════════════════════════════════════════════════════

use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::db::open_db;

// ── DTOs ──────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComandaInfo {
    pub id: String,
    pub nombre: String,
    pub estado: String,
    pub subtotal: String,
    pub impuesto: String,
    pub total: String,
    pub venta_id: Option<String>,
    pub usuario_id: String,
    pub creado_en: String,
    pub cobrado_en: Option<String>,
    pub num_lineas: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineaComandaInfo {
    pub id: String,
    pub comanda_id: String,
    pub producto_id: String,
    pub producto_nombre: String,
    pub moneda_base: String,
    pub cantidad: i64,
    pub precio_unit: String,
    pub subtotal: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetalleComanda {
    pub comanda: ComandaInfo,
    pub lineas: Vec<LineaComandaInfo>,
}


// ── Helper: recalcular totales de la comanda ──────────────────

fn recalcular_totales(conn: &rusqlite::Connection, comanda_id: &str, iva_porc: f64) -> rusqlite::Result<()> {
    let subtotal: f64 = conn.query_row(
        "SELECT COALESCE(SUM(CAST(subtotal AS REAL)), 0.0) FROM LineaComanda WHERE comandaId = ?1",
        params![comanda_id],
        |row| row.get(0),
    )?;
    let impuesto = subtotal * iva_porc;
    let total = subtotal + impuesto;
    conn.execute(
        "UPDATE Comanda SET subtotal = ?1, impuesto = ?2, total = ?3 WHERE id = ?4",
        params![
            format!("{:.2}", subtotal),
            format!("{:.2}", impuesto),
            format!("{:.2}", total),
            comanda_id
        ],
    )?;
    Ok(())
}

fn obtener_iva(conn: &rusqlite::Connection) -> f64 {
    conn.query_row(
        "SELECT valor FROM Configuracion WHERE clave = 'iva_porcentaje'",
        [],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|s| s.parse::<f64>().ok())
    .unwrap_or(16.0)
        / 100.0
}

// ── Command: Crear Comanda ────────────────────────────────────

#[tauri::command]
pub fn crear_comanda(usuario_id: String, nombre: String) -> Result<String, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO Comanda (id, nombre, estado, subtotal, impuesto, total, usuarioId, creadoEn)
         VALUES (?1, ?2, 'abierta', '0.00', '0.00', '0.00', ?3, datetime('now'))",
        params![id, nombre, usuario_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

// ── Command: Listar Comandas Abiertas ─────────────────────────

#[tauri::command]
pub fn listar_comandas() -> Result<Vec<ComandaInfo>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.nombre, c.estado, c.subtotal, c.impuesto, c.total,
                    c.ventaId, c.usuarioId, c.creadoEn, c.cobradoEn,
                    (SELECT COUNT(*) FROM LineaComanda lc WHERE lc.comandaId = c.id) as num_lineas
             FROM Comanda c
             WHERE c.estado = 'abierta'
             ORDER BY c.creadoEn ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ComandaInfo {
                id: row.get(0)?,
                nombre: row.get(1)?,
                estado: row.get(2)?,
                subtotal: row.get(3)?,
                impuesto: row.get(4)?,
                total: row.get(5)?,
                venta_id: row.get(6)?,
                usuario_id: row.get(7)?,
                creado_en: row.get(8)?,
                cobrado_en: row.get(9)?,
                num_lineas: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

// ── Command: Editar Nombre de Comanda ─────────────────────────

#[tauri::command]
pub fn editar_nombre_comanda(id: String, nombre: String) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE Comanda SET nombre = ?1 WHERE id = ?2 AND estado = 'abierta'",
        params![nombre, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Command: Eliminar Comanda (devuelve stock) ────────────────

#[tauri::command]
pub fn eliminar_comanda(id: String) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // Devolver stock de cada línea al inventario
    let mut stmt = conn
        .prepare("SELECT productoId, cantidad FROM LineaComanda WHERE comandaId = ?1")
        .map_err(|e| e.to_string())?;

    let lineas: Vec<(String, i64)> = stmt
        .query_map(params![id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    for (producto_id, cantidad) in lineas {
        conn.execute(
            "UPDATE Producto SET stock = stock + ?1, actualizadoEn = datetime('now') WHERE id = ?2",
            params![cantidad, producto_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // DELETE comanda (CASCADE elimina LineaComanda automáticamente)
    conn.execute("DELETE FROM Comanda WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Command: Agregar Producto a Comanda ───────────────────────

#[tauri::command]
pub fn agregar_producto_comanda(
    comanda_id: String,
    producto_id: String,
    cantidad: i64,
    precio_unit: String,
    subtotal: String,
) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // Validar stock disponible
    let stock_actual: i64 = conn
        .query_row(
            "SELECT stock FROM Producto WHERE id = ?1",
            params![producto_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Producto no encontrado: {}", e))?;

    if stock_actual < cantidad {
        return Err(format!(
            "Stock insuficiente. Disponible: {}, solicitado: {}",
            stock_actual, cantidad
        ));
    }

    // Verificar si ya existe esa línea en la comanda (mismo producto)
    let existe: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM LineaComanda WHERE comandaId = ?1 AND productoId = ?2",
            params![comanda_id, producto_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if existe {
        // Actualizar cantidad + subtotal de la línea existente
        conn.execute(
            "UPDATE LineaComanda SET cantidad = cantidad + ?1, subtotal = ?2
             WHERE comandaId = ?3 AND productoId = ?4",
            params![cantidad, subtotal, comanda_id, producto_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let linea_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO LineaComanda (id, comandaId, productoId, cantidad, precioUnit, subtotal)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![linea_id, comanda_id, producto_id, cantidad, precio_unit, subtotal],
        )
        .map_err(|e| e.to_string())?;
    }

    // Descontar stock inmediatamente
    conn.execute(
        "UPDATE Producto SET stock = stock - ?1, actualizadoEn = datetime('now') WHERE id = ?2",
        params![cantidad, producto_id],
    )
    .map_err(|e| e.to_string())?;

    // Recalcular totales de la comanda
    let iva = obtener_iva(&conn);
    recalcular_totales(&conn, &comanda_id, iva).map_err(|e| e.to_string())?;

    Ok(())
}

// ── Command: Eliminar Línea de Comanda (devuelve stock) ───────

#[tauri::command]
pub fn eliminar_linea_comanda(comanda_id: String, linea_id: String) -> Result<(), String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // Obtener cantidad y producto de la línea para devolver stock
    let (producto_id, cantidad): (String, i64) = conn
        .query_row(
            "SELECT productoId, cantidad FROM LineaComanda WHERE id = ?1 AND comandaId = ?2",
            params![linea_id, comanda_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Línea no encontrada: {}", e))?;

    // Devolver stock
    conn.execute(
        "UPDATE Producto SET stock = stock + ?1, actualizadoEn = datetime('now') WHERE id = ?2",
        params![cantidad, producto_id],
    )
    .map_err(|e| e.to_string())?;

    // Eliminar la línea
    conn.execute(
        "DELETE FROM LineaComanda WHERE id = ?1 AND comandaId = ?2",
        params![linea_id, comanda_id],
    )
    .map_err(|e| e.to_string())?;

    // Recalcular totales
    let iva = obtener_iva(&conn);
    recalcular_totales(&conn, &comanda_id, iva).map_err(|e| e.to_string())?;

    Ok(())
}

// ── Command: Obtener Detalle de Comanda ───────────────────────

#[tauri::command]
pub fn obtener_detalle_comanda(comanda_id: String) -> Result<DetalleComanda, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // Cabecera
    let comanda = conn
        .query_row(
            "SELECT c.id, c.nombre, c.estado, c.subtotal, c.impuesto, c.total,
                    c.ventaId, c.usuarioId, c.creadoEn, c.cobradoEn,
                    (SELECT COUNT(*) FROM LineaComanda lc WHERE lc.comandaId = c.id) as num_lineas
             FROM Comanda c WHERE c.id = ?1",
            params![comanda_id],
            |row| {
                Ok(ComandaInfo {
                    id: row.get(0)?,
                    nombre: row.get(1)?,
                    estado: row.get(2)?,
                    subtotal: row.get(3)?,
                    impuesto: row.get(4)?,
                    total: row.get(5)?,
                    venta_id: row.get(6)?,
                    usuario_id: row.get(7)?,
                    creado_en: row.get(8)?,
                    cobrado_en: row.get(9)?,
                    num_lineas: row.get(10)?,
                })
            },
        )
        .map_err(|e| format!("Comanda no encontrada: {}", e))?;

    // Líneas con nombre de producto y monedaBase
    let mut stmt = conn
        .prepare(
            "SELECT lc.id, lc.comandaId, lc.productoId, p.nombre, p.monedaBase,
                    lc.cantidad, lc.precioUnit, lc.subtotal
             FROM LineaComanda lc
             JOIN Producto p ON p.id = lc.productoId
             WHERE lc.comandaId = ?1
             ORDER BY lc.rowid ASC",
        )
        .map_err(|e| e.to_string())?;

    let lineas: Vec<LineaComandaInfo> = stmt
        .query_map(params![comanda_id], |row| {
            Ok(LineaComandaInfo {
                id: row.get(0)?,
                comanda_id: row.get(1)?,
                producto_id: row.get(2)?,
                producto_nombre: row.get(3)?,
                moneda_base: row.get(4)?,
                cantidad: row.get(5)?,
                precio_unit: row.get(6)?,
                subtotal: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(DetalleComanda { comanda, lineas })
}

// ── Command: Cobrar Comanda ───────────────────────────────────
// Crea una Venta (SIN descontar stock — ya fue descontado al agregar)
// y marca la comanda como 'cobrada'.

#[tauri::command]
pub fn cobrar_comanda(
    comanda_id: String,
    usuario_id: String,
    forma_pago: String,
    moneda: String,
    referencia_pago: Option<String>,
    tasa_cambio: Option<String>,
) -> Result<String, String> {
    let mut conn = open_db().map_err(|e| e.to_string())?;

    // Obtener datos de la comanda
    let (subtotal, impuesto, total): (String, String, String) = conn
        .query_row(
            "SELECT subtotal, impuesto, total FROM Comanda WHERE id = ?1 AND estado = 'abierta'",
            params![comanda_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Comanda no encontrada o ya cobrada: {}", e))?;

    // Obtener líneas para LineaVenta
    let lineas: Vec<(String, i64, String, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT productoId, cantidad, precioUnit, subtotal
                 FROM LineaComanda WHERE comandaId = ?1",
            )
            .map_err(|e| e.to_string())?;
        let resultado: Vec<(String, i64, String, String)> = stmt.query_map(params![comanda_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
        resultado
    };

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Crear Venta (stock ya fue descontado al agregar cada producto)
    let venta_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO Venta (id, usuarioId, subtotal, impuesto, total, formaPago, moneda,
                            referenciaPago, tasaCambio, isSynced, creadoEn)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, datetime('now'))",
        params![
            venta_id, usuario_id, subtotal, impuesto, total,
            forma_pago, moneda, referencia_pago, tasa_cambio
        ],
    )
    .map_err(|e| e.to_string())?;

    // Crear LineaVenta por cada línea de comanda
    for (producto_id, cantidad, precio_unit, linea_subtotal) in &lineas {
        let linea_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO LineaVenta (id, ventaId, productoId, cantidad, precioUnit, subtotal)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![linea_id, venta_id, producto_id, cantidad, precio_unit, linea_subtotal],
        )
        .map_err(|e| e.to_string())?;
    }

    // Marcar comanda como cobrada
    tx.execute(
        "UPDATE Comanda SET estado = 'cobrada', ventaId = ?1, cobradoEn = datetime('now') WHERE id = ?2",
        params![venta_id, comanda_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(venta_id)
}

// ── Command: Historial de Comandas Cobradas ───────────────────

#[tauri::command]
pub fn listar_historial_comandas() -> Result<Vec<ComandaInfo>, String> {
    let conn = open_db().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.nombre, c.estado, c.subtotal, c.impuesto, c.total,
                    c.ventaId, c.usuarioId, c.creadoEn, c.cobradoEn,
                    (SELECT COUNT(*) FROM LineaComanda lc WHERE lc.comandaId = c.id) as num_lineas
             FROM Comanda c
             WHERE c.estado = 'cobrada'
             ORDER BY c.cobradoEn DESC
             LIMIT 100",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ComandaInfo {
                id: row.get(0)?,
                nombre: row.get(1)?,
                estado: row.get(2)?,
                subtotal: row.get(3)?,
                impuesto: row.get(4)?,
                total: row.get(5)?,
                venta_id: row.get(6)?,
                usuario_id: row.get(7)?,
                creado_en: row.get(8)?,
                cobrado_en: row.get(9)?,
                num_lineas: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}
