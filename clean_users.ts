import { createClient } from '@libsql/client';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const db = createClient({ url: process.env.DATABASE_URL! });
const supabase = createSupabaseClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
  console.log("Descargando usuarios desde Supabase...");
  const { data: usuarios, error } = await supabase.from('Usuario').select('*');
  
  if (error || !usuarios) {
    console.error("Error al obtener usuarios de Supabase:", error);
    return;
  }

  console.log(`Encontrados ${usuarios.length} usuarios en Supabase. Limpiando DB local...`);
  
  // Limpiar registros dependientes
  await db.execute("DELETE FROM LogCambio");
  await db.execute("DELETE FROM CorteCaja");
  await db.execute("DELETE FROM LineaVenta");
  await db.execute("DELETE FROM Venta");
  
  // Limpiar usuarios locales
  await db.execute("DELETE FROM Usuario");
  
  // Insertar los de Supabase
  for (const u of usuarios) {
    await db.execute({
      sql: "INSERT INTO Usuario (id, nombre, pin, rol, activo, creadoEn) VALUES (?, ?, ?, ?, ?, ?)",
      args: [u.id, u.nombre, u.pin, u.rol, u.activo ? 1 : 0, u.creadoEn]
    });
  }
  console.log("✅ Usuarios locales sincronizados con Supabase.");
}

main().catch(console.error);
