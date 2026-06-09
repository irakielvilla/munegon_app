import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabase = createSupabaseClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
  console.log("Limpiando datos de prueba en Supabase...");

  // 1. Borrar LineaVenta
  console.log("Borrando LineaVenta...");
  const { error: err1 } = await supabase.from('LineaVenta').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err1) {
    console.error("Error al borrar LineaVenta:", err1.message);
  } else {
    console.log("✅ LineaVenta limpia.");
  }

  // 2. Borrar Venta
  console.log("Borrando Venta...");
  const { error: err2 } = await supabase.from('Venta').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err2) {
    console.error("Error al borrar Venta:", err2.message);
  } else {
    console.log("✅ Venta limpia.");
  }

  // 3. Borrar CorteCaja
  console.log("Borrando CorteCaja...");
  const { error: err3 } = await supabase.from('CorteCaja').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err3) {
    console.error("Error al borrar CorteCaja:", err3.message);
  } else {
    console.log("✅ CorteCaja limpia.");
  }

  // 4. Borrar LogCambio
  console.log("Borrando LogCambio...");
  const { error: err4 } = await supabase.from('LogCambio').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err4) {
    console.error("Error al borrar LogCambio:", err4.message);
  } else {
    console.log("✅ LogCambio limpio.");
  }
}

main().catch(console.error);
