-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precioUSD" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "stockMinimo" INTEGER NOT NULL DEFAULT 5,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    "isSynced" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "subtotal" TEXT NOT NULL,
    "impuesto" TEXT NOT NULL,
    "total" TEXT NOT NULL,
    "formaPago" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "referenciaPago" TEXT,
    "tasaCambio" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSynced" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Venta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LineaVenta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ventaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnit" TEXT NOT NULL,
    "subtotal" TEXT NOT NULL,
    CONSTRAINT "LineaVenta_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LineaVenta_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Configuracion" (
    "clave" TEXT NOT NULL PRIMARY KEY,
    "valor" TEXT NOT NULL,
    "descripcion" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LogCambio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valorAntes" TEXT,
    "valorDespues" TEXT,
    "usuarioId" TEXT NOT NULL,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSynced" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "LogCambio_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Producto_sku_key" ON "Producto"("sku");
