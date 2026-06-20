-- ══════════════════════════════════════════════════════════════
-- MUÑEGON POS — Script de Creación de Base de Datos en Supabase
-- Ejecuta este script en el "SQL Editor" de Supabase
-- ══════════════════════════════════════════════════════════════

-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────────────────────
-- USUARIOS Y ROLES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE "Usuario" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "nombre" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────────────────────
-- INVENTARIO
-- ──────────────────────────────────────────────────────────────
CREATE TABLE "Producto" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "sku" TEXT UNIQUE NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "monedaBase" TEXT NOT NULL DEFAULT 'USD',
    "precio" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "stockMinimo" INTEGER NOT NULL DEFAULT 5,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "isSynced" BOOLEAN NOT NULL DEFAULT true
);

-- ──────────────────────────────────────────────────────────────
-- CORTES DE CAJA
-- ──────────────────────────────────────────────────────────────
CREATE TABLE "CorteCaja" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tipo" TEXT NOT NULL,
    "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id"),
    "totalCalculado" TEXT NOT NULL,
    "totalDeclarado" TEXT NOT NULL,
    "diferencia" TEXT NOT NULL,
    "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "isSynced" BOOLEAN NOT NULL DEFAULT true
);

-- ──────────────────────────────────────────────────────────────
-- VENTAS / POS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE "Venta" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id"),
    "corteCajaId" UUID REFERENCES "CorteCaja"("id"),
    "subtotal" TEXT NOT NULL,
    "impuesto" TEXT NOT NULL,
    "total" TEXT NOT NULL,
    "formaPago" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "referenciaPago" TEXT,
    "tasaCambio" TEXT,
    "creadoEn" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "isSynced" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE "LineaVenta" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "ventaId" UUID NOT NULL REFERENCES "Venta"("id") ON DELETE CASCADE,
    "productoId" UUID NOT NULL REFERENCES "Producto"("id"),
    "cantidad" INTEGER NOT NULL,
    "precioUnit" TEXT NOT NULL,
    "subtotal" TEXT NOT NULL
);

-- ──────────────────────────────────────────────────────────────
-- CONFIGURACIÓN DEL SISTEMA
-- ──────────────────────────────────────────────────────────────
CREATE TABLE "Configuracion" (
    "clave" TEXT PRIMARY KEY,
    "valor" TEXT NOT NULL,
    "descripcion" TEXT,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insertar configuración por defecto
INSERT INTO "Configuracion" ("clave", "valor", "descripcion") VALUES
('tasa_cambio_bsd', '1.00', 'Tasa de cambio de USD a Bolívares'),
('iva_porcentaje', '16', 'Porcentaje de IVA a aplicar en ventas')
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- LOG DE AUDITORÍA
-- ──────────────────────────────────────────────────────────────
CREATE TABLE "LogCambio" (
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
