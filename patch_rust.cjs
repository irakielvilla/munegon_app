const fs = require('fs');

// Patch db.rs
const dbPath = 'src-tauri/src/db.rs';
let dbContent = fs.readFileSync(dbPath, 'utf-8');
dbContent = dbContent.replace('subtotal TEXT NOT NULL,', 'subtotal TEXT NOT NULL,\n                anulada BOOLEAN NOT NULL DEFAULT 0,');
const migration = `        // Migración 3: Añadir anulada a LineaDeuda
        let _ = conn.execute(
            "ALTER TABLE LineaDeuda ADD COLUMN anulada BOOLEAN NOT NULL DEFAULT 0",
            [],
        );`;
if (!dbContent.includes('Migración 3:')) {
    dbContent = dbContent.replace('Ok(())', migration + '\n\n    Ok(())');
}
fs.writeFileSync(dbPath, dbContent);
console.log('db.rs patched');

// Patch ventas.rs
const ventasPath = 'src-tauri/src/commands/ventas.rs';
let ventasContent = fs.readFileSync(ventasPath, 'utf-8');

ventasContent = ventasContent.replace(
    'tx.execute("UPDATE LineaDeuda SET activo = false WHERE id = ?1", rusqlite::params![linea_id])',
    'tx.execute("UPDATE LineaDeuda SET activo = false, anulada = true WHERE id = ?1", rusqlite::params![linea_id])'
);

ventasContent = ventasContent.replace(
    'SELECT id, deudaId, productoId, cantidad, precioUnit, subtotal, activo FROM LineaDeuda',
    'SELECT id, deudaId, productoId, cantidad, precioUnit, subtotal, activo, anulada FROM LineaDeuda'
);

ventasContent = ventasContent.replace(
    '"activo": row.get::<_, i32>(6)? == 1,\n                    }))',
    '"activo": row.get::<_, i32>(6)? == 1,\n                        "anulada": row.get::<_, i32>(7)? == 1,\n                    }))'
);

ventasContent = ventasContent.replace(
    'INSERT INTO LineaDeuda (id, deudaId, productoId, cantidad, precioUnit, subtotal, activo)\\n                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
    'INSERT INTO LineaDeuda (id, deudaId, productoId, cantidad, precioUnit, subtotal, activo, anulada)\\n                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
);

ventasContent = ventasContent.replace(
    'params![l_id, l_deuda_id, l_producto_id, l_cantidad, l_precio, l_subtotal, l_activo]',
    'params![l_id, l_deuda_id, l_producto_id, l_cantidad, l_precio, l_subtotal, l_activo, if l.get("anulada").and_then(|a| a.as_bool()).unwrap_or(false) { 1 } else { 0 }]'
);

fs.writeFileSync(ventasPath, ventasContent);
console.log('ventas.rs patched');
