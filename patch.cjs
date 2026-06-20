const fs = require('fs');
const path = 'src-tauri/src/commands/ventas.rs';
let content = fs.readFileSync(path, 'utf8');

// 1. Fix listar_deudas_cliente Deuda query
content = content.replace(
    /WHERE d\.clienteId = \?1\s+ORDER BY d\.creadoEn DESC/g,
    "WHERE d.clienteId = ?1 AND d.activo = 1\n             ORDER BY d.creadoEn DESC"
);

// 2. Fix listar_deudas_cliente LineaDeuda query
content = content.replace(
    /WHERE ld\.deudaId = \?1/g,
    "WHERE ld.deudaId = ?1 AND ld.activo = 1"
);

// 3. Append the new backend commands with Soft Deletes logic
const appendCode = `
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
    tx.execute("UPDATE Deuda SET activo = false, isSynced = 0 WHERE id = ?1", rusqlite::params![deuda_id]).map_err(|e| e.to_string())?;

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

    tx.execute("UPDATE LineaDeuda SET activo = false WHERE id = ?1", rusqlite::params![linea_id]).map_err(|e| e.to_string())?;

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
`;

if (!content.includes('pub fn eliminar_cliente')) {
    content += appendCode;
}

fs.writeFileSync(path, content);
console.log('Patch applied successfully');
