import os
import re

db_path = r"c:\Users\iraki\Desktop\Muñegon app carpeta\Muñegon App\src-tauri\src\commands\ventas.rs"
with open(db_path, "r", encoding="utf-8") as f:
    content = f.read()

# Update eliminar_linea_deuda
content = content.replace(
    'tx.execute("UPDATE LineaDeuda SET activo = false WHERE id = ?1", rusqlite::params![linea_id])',
    'tx.execute("UPDATE LineaDeuda SET activo = false, anulada = true WHERE id = ?1", rusqlite::params![linea_id])'
)

# Update obtener_deudas_pendientes
content = content.replace(
    'SELECT id, deudaId, productoId, cantidad, precioUnit, subtotal, activo FROM LineaDeuda',
    'SELECT id, deudaId, productoId, cantidad, precioUnit, subtotal, activo, anulada FROM LineaDeuda'
)

content = content.replace(
    '"activo": row.get::<_, i32>(6)? == 1,\n                    }))',
    '"activo": row.get::<_, i32>(6)? == 1,\n                        "anulada": row.get::<_, i32>(7)? == 1,\n                    }))'
)

# Also ensure that Insert/Pull logic accommodates 'anulada' for LineaDeuda
content = content.replace(
    'INSERT INTO LineaDeuda (id, deudaId, productoId, cantidad, precioUnit, subtotal, activo)\n                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
    'INSERT INTO LineaDeuda (id, deudaId, productoId, cantidad, precioUnit, subtotal, activo, anulada)\n                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
)

content = content.replace(
    'params![l_id, l_deuda_id, l_producto_id, l_cantidad, l_precio, l_subtotal, l_activo]',
    'params![l_id, l_deuda_id, l_producto_id, l_cantidad, l_precio, l_subtotal, l_activo, if l.get("anulada").and_then(|a| a.as_bool()).unwrap_or(false) { 1 } else { 0 }]'
)

with open(db_path, "w", encoding="utf-8") as f:
    f.write(content)

print("ventas.rs patched.")
