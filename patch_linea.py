import os

db_path = r"c:\Users\iraki\Desktop\Muñegon app carpeta\Muñegon App\src-tauri\src\db.rs"
with open(db_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    "subtotal TEXT NOT NULL,",
    "subtotal TEXT NOT NULL,\n                anulada BOOLEAN NOT NULL DEFAULT 0,"
)

# Also add migration
migration = """        // Migración 3: Añadir anulada a LineaDeuda
        let _ = conn.execute(
            "ALTER TABLE LineaDeuda ADD COLUMN anulada BOOLEAN NOT NULL DEFAULT 0",
            [],
        );"""
if "Migración 3: Añadir anulada a LineaDeuda" not in content:
    content = content.replace("Ok(())", migration + "\n\n    Ok(())")

with open(db_path, "w", encoding="utf-8") as f:
    f.write(content)

print("db.rs patched.")
