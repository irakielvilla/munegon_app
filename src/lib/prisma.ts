// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Cliente Prisma con adaptador libsql
// Singleton para evitar múltiples conexiones en desarrollo.
// ══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

function createPrismaClient() {
  const rawUrl = import.meta.env['DATABASE_URL'] as string | undefined;
  let url = '';
  if (rawUrl) {
    if (rawUrl.startsWith('file:')) {
      url = pathToFileURL(path.resolve(rawUrl.substring(5))).href;
    } else {
      url = rawUrl;
    }
  } else {
    url = pathToFileURL(path.resolve('prisma', 'dev.db')).href;
  }
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({ adapter });
}

// Singleton: reutiliza la instancia en desarrollo para evitar
// agotar el pool de conexiones con Hot Module Replacement.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (import.meta.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
