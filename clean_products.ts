import { createClient } from '@libsql/client';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const db = createClient({ url: process.env.DATABASE_URL! });
const supabase = createSupabaseClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
  console.log("Descargando productos desde Supabase...");
  const { data: productos, error } = await supabase.from('Producto').select('*');
  
  if (error || !productos) {
    console.error("Error al obtener productos de Supabase:", error);
    return;
  }

  console.log(`Encontrados ${productos.length} productos en Supabase. Limpiando DB local...`);
  
  // Limpiar registros dependientes para evitar errores de clave foránea
  await db.execute("DELETE FROM LogCambio");
  await db.execute("DELETE FROM CorteCaja");
  await db.execute("DELETE FROM LineaVenta");
  await db.execute("DELETE FROM Venta");
  
  // Limpiar productos locales
  await db.execute("DELETE FROM Producto");
  
  // Insertar los productos de Supabase
  for (const p of productos) {
    await db.execute({
      sql: `INSERT INTO Producto (id, sku, nombre, descripcion, precioUSD, stock, stockMinimo, activo, creadoEn, actualizadoEn, isSynced) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      args: [
        p.id,
        p.sku,
        p.nombre,
        p.descripcion || null,
        p.precioUSD,
        p.stock,
        p.stockMinimo,
        p.activo ? 1 : 0,
        p.creadoEn,
        p.actualizadoEn
      ]
    });
  }
  
  console.log("✅ Productos locales sincronizados con Supabase.");
}

main().catch(console.error);
