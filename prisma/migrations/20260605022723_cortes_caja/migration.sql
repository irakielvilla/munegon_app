-- CreateTable
CREATE TABLE "CorteCaja" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "totalCalculado" TEXT NOT NULL,
    "totalDeclarado" TEXT NOT NULL,
    "diferencia" TEXT NOT NULL,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSynced" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CorteCaja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Venta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "corteCajaId" TEXT,
    "subtotal" TEXT NOT NULL,
    "impuesto" TEXT NOT NULL,
    "total" TEXT NOT NULL,
    "formaPago" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "referenciaPago" TEXT,
    "tasaCambio" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSynced" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Venta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Venta_corteCajaId_fkey" FOREIGN KEY ("corteCajaId") REFERENCES "CorteCaja" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Venta" ("creadoEn", "formaPago", "id", "impuesto", "isSynced", "moneda", "referenciaPago", "subtotal", "tasaCambio", "total", "usuarioId") SELECT "creadoEn", "formaPago", "id", "impuesto", "isSynced", "moneda", "referenciaPago", "subtotal", "tasaCambio", "total", "usuarioId" FROM "Venta";
DROP TABLE "Venta";
ALTER TABLE "new_Venta" RENAME TO "Venta";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
