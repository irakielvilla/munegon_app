const fs = require('fs');

const filePath = String.raw`c:\Users\iraki\Desktop\Muñegon app carpeta\Muñegon App\src-tauri\src\commands\ventas.rs`;
let content = fs.readFileSync(filePath, 'utf-8');

const oldMarcarSig = `pub fn marcar_sincronizados(
    venta_ids: Vec<String>,
    producto_ids: Vec<String>,
    log_ids: Vec<String>,
    corte_ids: Vec<String>,
) -> Result<(), String> {`;

const newMarcarSig = `pub fn marcar_sincronizados(
    venta_ids: Vec<String>,
    producto_ids: Vec<String>,
    log_ids: Vec<String>,
    corte_ids: Vec<String>,
    cliente_ids: Vec<String>,
    deuda_ids: Vec<String>,
) -> Result<(), String> {`;

const oldMarcarBody = `    for id in &log_ids {
        conn.execute("UPDATE LogCambio SET isSynced = 1 WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
    }`;

const newMarcarBody = `    for id in &log_ids {
        conn.execute("UPDATE LogCambio SET isSynced = 1 WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
    }

    for id in &cliente_ids {
        conn.execute("UPDATE Cliente SET isSynced = 1 WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
    }

    for id in &deuda_ids {
        conn.execute("UPDATE Deuda SET isSynced = 1 WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
    }`;

content = content.replace(oldMarcarSig, newMarcarSig);
content = content.replace(oldMarcarBody, newMarcarBody);

const newFunctions = `
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
        .prepare("SELECT id, clienteId, usuarioId, subtotal, impuesto, total, activo, creadoEn FROM Deuda WHERE isSynced = 0")
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
                "creadoEn": row.get::<_, String>(7)?,
                "lineas": [],
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut deudas = Vec::new();
    for row in rows {
        if let Ok(mut d) = row {
            let deuda_id = d["id"].as_str().unwrap().to_string();
            let mut stmt_lineas = conn
                .prepare("SELECT id, deudaId, productoId, cantidad, precioUnit, subtotal, activo FROM LineaDeuda WHERE deudaId = ?1")
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
`;

content += newFunctions;

fs.writeFileSync(filePath, content, 'utf-8');
console.log("Updated ventas.rs successfully.");
