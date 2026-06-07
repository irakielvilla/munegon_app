// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Configuración Prisma 7
// La URL de conexión va aquí (no en schema.prisma) desde Prisma 7+
// PrismaLibSql es un AdapterFactory — recibe {url} directamente
// ══════════════════════════════════════════════════════════════

import { defineConfig } from 'prisma/config';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const getDbUrl = () => {
  const fromEnv = process.env['DATABASE_URL'];
  if (fromEnv) return fromEnv;
  // Ruta absoluta ASCII-safe como fallback (evita problemas con ñ en cwd)
  return 'file:C:/MunegonDB/dev.db';
};

export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',

  datasource: {
    url: getDbUrl(),
  },

  migrate: {
    async adapter() {
      // ✅ Factory pattern correcto para Prisma 7
      return new PrismaLibSql({ url: getDbUrl() });
    },
  },
});
