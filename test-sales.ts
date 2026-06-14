import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://jehflrjnhyqzqqtmohkt.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || ''
);

async function check() {
  const { data: cortes } = await supabase.from('CorteCaja').select('*').order('creadoEn', { ascending: false }).limit(2);
  if (cortes && cortes.length > 0) {
    const corte = cortes[0];
    const offsetMinutes = new Date().getTimezoneOffset();
    const corteDate = new Date(corte.creadoEn);
    corteDate.setMinutes(corteDate.getMinutes() - offsetMinutes);
    const startOfDay = new Date(corteDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    startOfDay.setMinutes(startOfDay.getMinutes() + offsetMinutes);
    const endOfDay = new Date(corteDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
    endOfDay.setMinutes(endOfDay.getMinutes() + offsetMinutes);

    const { data: lineas } = await supabase.from('LineaVenta')
      .select('id, Venta!inner(creadoEn)')
      .gte('Venta.creadoEn', startOfDay.toISOString())
      .lte('Venta.creadoEn', endOfDay.toISOString());
    
    console.log(`Hay ${lineas?.length} lineas en ese rango.`);
  }
}
check();
