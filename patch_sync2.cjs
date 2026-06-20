const fs = require('fs');

const filePath = String.raw`c:\Users\iraki\Desktop\Muñegon app carpeta\Muñegon App\src-tauri\src\commands\ventas.rs`;
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Update eliminar_deuda
const oldEliminar = `    tx.execute("UPDATE Deuda SET activo = false, isSynced = 0 WHERE id = ?1", rusqlite::params![deuda_id]).map_err(|e| e.to_string())?;`;
const newEliminar = `    tx.execute("UPDATE Deuda SET activo = false, anulada = true, isSynced = 0 WHERE id = ?1", rusqlite::params![deuda_id]).map_err(|e| e.to_string())?;`;
content = content.replace(oldEliminar, newEliminar);

// 2. Update obtener_deudas_pendientes
const oldQuery = `"SELECT id, clienteId, usuarioId, subtotal, impuesto, total, activo, creadoEn FROM Deuda WHERE isSynced = 0"`;
const newQuery = `"SELECT id, clienteId, usuarioId, subtotal, impuesto, total, activo, anulada, creadoEn FROM Deuda WHERE isSynced = 0"`;
content = content.replace(oldQuery, newQuery);

const oldJson = `                "total": row.get::<_, String>(5)?,
                "activo": row.get::<_, i32>(6)? == 1,
                "creadoEn": row.get::<_, String>(7)?,
                "lineas": [],`;
const newJson = `                "total": row.get::<_, String>(5)?,
                "activo": row.get::<_, i32>(6)? == 1,
                "anulada": row.get::<_, i32>(7)? == 1,
                "creadoEn": row.get::<_, String>(8)?,
                "lineas": [],`;
content = content.replace(oldJson, newJson);

fs.writeFileSync(filePath, content, 'utf-8');
console.log("Updated ventas.rs successfully.");
