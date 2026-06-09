import { createClient } from '@libsql/client';

const db = createClient({ url: process.env.DATABASE_URL! });

async function main() {
  console.log("Limpiando datos de venta locales (SQLite)...");

  await db.execute("DELETE FROM LogCambio");
  await db.execute("DELETE FROM CorteCaja");
  await db.execute("DELETE FROM LineaVenta");
  await db.execute("DELETE FROM Venta");

  console.log("✅ Datos de venta locales limpios.");
}

main().catch(console.error);
