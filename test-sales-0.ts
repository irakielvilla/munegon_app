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
    const offsetMinutes = 0;
    const corteDate = new Date(corte.creadoEn);
    corteDate.setMinutes(corteDate.getMinutes() - offsetMinutes);
    const startOfDay = new Date(corteDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    startOfDay.setMinutes(startOfDay.getMinutes() + offsetMinutes);
    const endOfDay = new Date(corteDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
    endOfDay.setMinutes(endOfDay.getMinutes() + offsetMinutes);

    console.log('Querying from', startOfDay.toISOString(), 'to', endOfDay.toISOString());
    const { data: ventas } = await supabase.from('Venta')
      .select('id, creadoEn')
      .gte('creadoEn', startOfDay.toISOString())
      .lte('creadoEn', endOfDay.toISOString());
    
    console.log(`Hay ${ventas?.length} ventas en ese rango.`);
  }
}
check();
