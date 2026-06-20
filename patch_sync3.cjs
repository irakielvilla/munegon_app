const fs = require('fs');

const filePath = String.raw`c:\Users\iraki\Desktop\Muñegon app carpeta\Muñegon App\src-tauri\src\commands\ventas.rs`;
let content = fs.readFileSync(filePath, 'utf-8');

const pullPayloadOld = `pub struct PullPayload {
    pub usuarios: Vec<serde_json::Value>,
    pub productos: Vec<serde_json::Value>,
    pub cortes: Vec<serde_json::Value>,
    pub ventas: Vec<serde_json::Value>,
    pub lineas: Vec<serde_json::Value>,
    pub configuracion: Vec<serde_json::Value>,
}`;

const pullPayloadNew = `pub struct PullPayload {
    pub usuarios: Vec<serde_json::Value>,
    pub productos: Vec<serde_json::Value>,
    pub cortes: Vec<serde_json::Value>,
    pub ventas: Vec<serde_json::Value>,
    pub lineas: Vec<serde_json::Value>,
    pub configuracion: Vec<serde_json::Value>,
    pub clientes: Vec<serde_json::Value>,
    pub deudas: Vec<serde_json::Value>,
    pub lineas_deuda: Vec<serde_json::Value>,
}`;
content = content.replace(pullPayloadOld, pullPayloadNew);

// Now find where `guardar_datos_pull` handles the data. It ends with handling `configuracion` and then `Ok(())`.
const pullConfigOld = `    // 6. Guardar Configuración (Solo IVA para no pisar la tasa de cambio local de forma agresiva)
    for cfg in payload.configuracion {
        let clave = cfg["clave"].as_str().unwrap_or("");
        let valor = cfg["valor"].as_str().unwrap_or("");
        
        tx.execute(
            "INSERT INTO Configuracion (clave, valor, updatedAt)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(clave) DO UPDATE SET 
             valor=excluded.valor, updatedAt=datetime('now')",
            params![clave, valor],
        ).unwrap_or_default();
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())`;

const pullConfigNew = `    // 6. Guardar Configuración (Solo IVA para no pisar la tasa de cambio local de forma agresiva)
    for cfg in payload.configuracion {
        let clave = cfg["clave"].as_str().unwrap_or("");
        let valor = cfg["valor"].as_str().unwrap_or("");
        
        tx.execute(
            "INSERT INTO Configuracion (clave, valor, updatedAt)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(clave) DO UPDATE SET 
             valor=excluded.valor, updatedAt=datetime('now')",
            params![clave, valor],
        ).unwrap_or_default();
    }

    // 7. Guardar Clientes
    for c in payload.clientes {
        let id = c["id"].as_str().unwrap_or("");
        let nombre = c["nombre"].as_str().unwrap_or("");
        let apellido = c["apellido"].as_str().unwrap_or("");
        let telefono = c["telefono"].as_str(); // Optional
        let activo = c["activo"].as_bool().unwrap_or(true) as i32;
        let creado_en = c["creadoEn"].as_str().unwrap_or("");

        tx.execute(
            "INSERT INTO Cliente (id, nombre, apellido, telefono, activo, creadoEn, isSynced)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)
             ON CONFLICT(id) DO UPDATE SET 
             nombre=excluded.nombre, apellido=excluded.apellido, telefono=excluded.telefono,
             activo=excluded.activo, isSynced=1, creadoEn=excluded.creadoEn",
            params![id, nombre, apellido, telefono, activo, creado_en],
        ).unwrap_or_default();
    }

    // 8. Guardar Deudas
    for d in payload.deudas {
        let id = d["id"].as_str().unwrap_or("");
        let cliente_id = d["clienteId"].as_str().unwrap_or("");
        let usuario_id = d["usuarioId"].as_str().unwrap_or("");
        let subtotal = d["subtotal"].as_str().unwrap_or("0");
        let impuesto = d["impuesto"].as_str().unwrap_or("0");
        let total = d["total"].as_str().unwrap_or("0");
        let activo = d["activo"].as_bool().unwrap_or(true) as i32;
        let anulada = d["anulada"].as_bool().unwrap_or(false) as i32;
        let creado_en = d["creadoEn"].as_str().unwrap_or("");

        tx.execute(
            "INSERT INTO Deuda (id, clienteId, usuarioId, subtotal, impuesto, total, activo, anulada, creadoEn, isSynced)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1)
             ON CONFLICT(id) DO UPDATE SET 
             clienteId=excluded.clienteId, usuarioId=excluded.usuarioId, subtotal=excluded.subtotal,
             impuesto=excluded.impuesto, total=excluded.total, activo=excluded.activo, anulada=excluded.anulada,
             isSynced=1, creadoEn=excluded.creadoEn",
            params![id, cliente_id, usuario_id, subtotal, impuesto, total, activo, anulada, creado_en],
        ).unwrap_or_default();
    }

    // 9. Guardar Lineas Deuda
    for l in payload.lineas_deuda {
        let id = l["id"].as_str().unwrap_or("");
        let deuda_id = l["deudaId"].as_str().unwrap_or("");
        let producto_id = l["productoId"].as_str().unwrap_or("");
        let cantidad = l["cantidad"].as_i64().unwrap_or(0);
        let precio_unit = l["precioUnit"].as_str().unwrap_or("0");
        let subtotal = l["subtotal"].as_str().unwrap_or("0");
        let activo = l["activo"].as_bool().unwrap_or(true) as i32;

        tx.execute(
            "INSERT INTO LineaDeuda (id, deudaId, productoId, cantidad, precioUnit, subtotal, activo)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET 
             cantidad=excluded.cantidad, precioUnit=excluded.precioUnit, subtotal=excluded.subtotal,
             activo=excluded.activo",
            params![id, deuda_id, producto_id, cantidad, precio_unit, subtotal, activo],
        ).unwrap_or_default();
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())`;

content = content.replace(pullConfigOld, pullConfigNew);
fs.writeFileSync(filePath, content, 'utf-8');
console.log("Updated guardar_datos_pull successfully.");
