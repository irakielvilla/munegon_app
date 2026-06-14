import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from the project root
dotenv.config({ path: 'c:/Users/iraki/Desktop/Muñegon app carpeta/Muñegon App/.env' });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Or SERVICE_ROLE_KEY if bypassing RLS

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key. Check .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSales() {
  console.log('Fetching sales for today...');
  
  // Let's get the date range for today in Venezuela time
  const now = new Date();
  // Venezuela is UTC-4
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(4, 0, 0, 0); // Midnight VET (4:00 AM UTC)
  
  const endOfDay = new Date(now);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
  endOfDay.setUTCHours(3, 59, 59, 999); // 11:59:59.999 PM VET
  
  console.log(`Start of day (UTC): ${startOfDay.toISOString()}`);
  console.log(`End of day (UTC): ${endOfDay.toISOString()}`);

  const { data, error } = await supabase
    .from('Venta')
    .select('*');

  if (error) {
    console.error('Error fetching sales:', error);
    return;
  }

  console.log(`Found ${data.length} sales today:`);
  console.table(data);
}

inspectSales();
