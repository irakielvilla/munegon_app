-- ══════════════════════════════════════════════════════════════
-- MUÑEGON POS — Schema Completo de Base de Datos (Supabase)
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
-- Idempotente: se puede ejecutar múltiples veces sin errores.
-- ══════════════════════════════════════════════════════════════

-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════════════════════════
-- 1. USUARIOS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "Usuario" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "nombre" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ══════════════════════════════════════════════════════════════
-- 2. PRODUCTOS (Inventario)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "Producto" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "sku" TEXT UNIQUE NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "monedaBase" TEXT NOT NULL DEFAULT 'USD',
    "precio" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "stockMinimo" INTEGER NOT NULL DEFAULT 5,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "isSynced" BOOLEAN NOT NULL DEFAULT true
);

-- ══════════════════════════════════════════════════════════════
-- 3. CORTES DE CAJA
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "CorteCaja" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tipo" TEXT NOT NULL,
    "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id"),
    "totalCalculado" TEXT NOT NULL,
    "totalDeclarado" TEXT NOT NULL,
    "diferencia" TEXT NOT NULL,
    "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "isSynced" BOOLEAN NOT NULL DEFAULT true
);

-- ══════════════════════════════════════════════════════════════
-- 4. VENTAS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "Venta" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id"),
    "corteCajaId" UUID REFERENCES "CorteCaja"("id"),
    "subtotal" TEXT NOT NULL,
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "impuesto" TEXT NOT NULL,
    "total" TEXT NOT NULL,
    "formaPago" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "referenciaPago" TEXT,
    "tasaCambio" TEXT,
    "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "isSynced" BOOLEAN NOT NULL DEFAULT true,
    "esCobroDeuda" BOOLEAN NOT NULL DEFAULT false
);

-- ══════════════════════════════════════════════════════════════
-- 5. LÍNEAS DE VENTA
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "LineaVenta" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "ventaId" UUID NOT NULL REFERENCES "Venta"("id") ON DELETE CASCADE,
    "productoId" UUID NOT NULL REFERENCES "Producto"("id"),
    "cantidad" INTEGER NOT NULL,
    "precioUnit" TEXT NOT NULL,
    "subtotal" TEXT NOT NULL
);

-- ══════════════════════════════════════════════════════════════
-- 6. CONFIGURACIÓN
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "Configuracion" (
    "clave" TEXT PRIMARY KEY,
    "valor" TEXT NOT NULL,
    "descripcion" TEXT,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "Configuracion" ("clave", "valor", "descripcion") VALUES
    ('tasa_cambio_bsd', '1.00', 'Tasa de cambio de USD a Bolívares'),
    ('iva_porcentaje', '16', 'Porcentaje de IVA a aplicar en ventas')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 7. LOG DE AUDITORÍA
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "LogCambio" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valorAntes" TEXT,
    "valorDespues" TEXT,
    "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id"),
    "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "isSynced" BOOLEAN NOT NULL DEFAULT true
);

-- ══════════════════════════════════════════════════════════════
-- 8. CLIENTES (Cuentas por Cobrar)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "Cliente" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "telefono" TEXT,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "isSynced" BOOLEAN NOT NULL DEFAULT true
);

-- ══════════════════════════════════════════════════════════════
-- 9. DEUDAS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "Deuda" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "clienteId" UUID NOT NULL REFERENCES "Cliente"("id"),
    "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id"),
    "subtotal" TEXT NOT NULL,
    "impuesto" TEXT NOT NULL,
    "total" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "isSynced" BOOLEAN NOT NULL DEFAULT true
);

-- ══════════════════════════════════════════════════════════════
-- 10. LÍNEAS DE DEUDA
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "LineaDeuda" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "deudaId" UUID NOT NULL REFERENCES "Deuda"("id") ON DELETE CASCADE,
    "productoId" UUID NOT NULL REFERENCES "Producto"("id"),
    "cantidad" INTEGER NOT NULL,
    "precioUnit" TEXT NOT NULL,
    "subtotal" TEXT NOT NULL,
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true
);

-- ══════════════════════════════════════════════════════════════
-- 11. COMANDAS (Mesas / Turnos)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "Comanda" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "nombre" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'abierta',
    "subtotal" TEXT NOT NULL DEFAULT '0.00',
    "impuesto" TEXT NOT NULL DEFAULT '0.00',
    "total" TEXT NOT NULL DEFAULT '0.00',
    "ventaId" UUID REFERENCES "Venta"("id"),
    "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id"),
    "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "cobradoEn" TIMESTAMP WITH TIME ZONE
);

-- ══════════════════════════════════════════════════════════════
-- 12. LÍNEAS DE COMANDA
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "LineaComanda" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "comandaId" UUID NOT NULL REFERENCES "Comanda"("id") ON DELETE CASCADE,
    "productoId" UUID NOT NULL REFERENCES "Producto"("id"),
    "cantidad" INTEGER NOT NULL,
    "precioUnit" TEXT NOT NULL,
    "subtotal" TEXT NOT NULL
);

-- ══════════════════════════════════════════════════════════════
-- MIGRACIONES: Columnas nuevas en tablas existentes (idempotentes)
-- Ejecutar si la BD ya existía con el schema anterior a 2026-08-10.
-- ══════════════════════════════════════════════════════════════

DO $$
BEGIN
    ALTER TABLE "Venta" ADD COLUMN "anulada" BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "Venta" ADD COLUMN "esCobroDeuda" BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "Producto" ADD COLUMN "eliminado" BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
