// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Seed de Base de Datos
//
// Uso: npm run db:seed
// El script se ejecuta con `node --env-file=.env` que carga
// DATABASE_URL automáticamente antes de que Prisma arranque.
// ══════════════════════════════════════════════════════════════

import { PrismaClient, Rol } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// PrismaLibSql en Prisma 7 es un AdapterFactory — recibe {url}, no un cliente ya creado.
const getDbUrl = () => {
  const fromEnv = process.env['DATABASE_URL'];
  if (fromEnv) {
    if (fromEnv.startsWith('file:')) {
      const dbPath = fromEnv.substring(5);
      return pathToFileURL(path.resolve(dbPath)).href;
    }
    return fromEnv;
  }
  const absPath = path.resolve(process.cwd(), 'prisma', 'dev.db');
  return pathToFileURL(absPath).href;
};

const dbUrl = getDbUrl();

// ✅ Correcto: pasar config object directamente al factory
const adapter = new PrismaLibSql({ url: dbUrl });
const prisma = new PrismaClient({ adapter });


function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

async function main() {
  console.log('🌱 Iniciando seed de Muñegon POS...');
  console.log(`   DB: ${dbUrl}\n`);

  // ── Usuarios ──────────────────────────────────────────────
  const usuarios: { id: string; nombre: string; rol: Rol; pin: string }[] = [
    { id: 'seed-admin', nombre: 'Irani', rol: Rol.ADMIN, pin: '123456' },
    { id: 'seed-cajero-1', nombre: 'Irakiel', rol: Rol.ADMIN, pin: '2409' },
    { id: 'seed-cajero-2', nombre: 'Andrea', rol: Rol.CAJERO, pin: '1234' },
    { id: 'seed-israel', nombre: 'Israel', rol: Rol.CAJERO, pin: '1234' },
  ];

  for (const u of usuarios) {
    await prisma.usuario.upsert({
      where: { id: u.id },
      update: { nombre: u.nombre, rol: u.rol, pin: hashPin(u.pin) },
      create: { id: u.id, nombre: u.nombre, rol: u.rol, pin: hashPin(u.pin), activo: true },
    });
    console.log(`  ✅ ${u.nombre} [${u.rol}]  PIN demo: ${u.pin}`);
  }

  // ── Configuración base ────────────────────────────────────
  const configs = [
    { clave: 'nombre_negocio', valor: 'Muñegon', descripcion: 'Nombre del negocio en reportes' },
    { clave: 'tasa_cambio_bsd', valor: '36.50', descripcion: 'Tasa Bs/USD — actualizar diariamente' },
    { clave: 'iva_porcentaje', valor: '0', descripcion: 'Porcentaje IVA aplicado a ventas' },
    { clave: 'moneda_principal', valor: 'USD', descripcion: 'Moneda principal del sistema' },
    { clave: 'sync_habilitado', valor: 'true', descripcion: 'Sincronización con Supabase activa' },
  ];

  for (const c of configs) {
    await prisma.configuracion.upsert({
      where: { clave: c.clave },
      update: { valor: c.valor },
      create: c,
    });
    console.log(`  ⚙️  ${c.clave} = ${c.valor}`);
  }

  // ── Clientes ──────────────────────────────────────────────
  const clientes = [
    { id: 'seed-cliente-daniel', nombre: 'Daniel', apellido: 'Trejo', telefono: '04121234567' },
    { id: 'seed-cliente-carlos', nombre: 'Carlos', apellido: 'Perez', telefono: '04249876543' },
    { id: 'seed-cliente-maria', nombre: 'Maria', apellido: 'Gomez', telefono: '04161112233' },
  ];

  for (const c of clientes) {
    await prisma.cliente.upsert({
      where: { id: c.id },
      update: { nombre: c.nombre, apellido: c.apellido, telefono: c.telefono },
      create: c,
    });
    console.log(`  👥 Cliente: ${c.nombre} ${c.apellido}`);
  }

  console.log('\n✨ Seed completado.');
  console.log('⚠️  Cambia los PINs antes de entregar al cliente.\n');
}

main()
  .catch(e => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
