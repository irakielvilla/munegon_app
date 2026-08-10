# Spec: Arreglar Deuda Técnica — Seguridad .env y supabase_schema.sql

> **Fecha**: 2026-08-10
> **Issues cubiertos**: #1 (supabase_schema.sql desactualizado), #2 (.env con SERVICE_ROLE_KEY)
> **Archivo de contexto**: `Archivos de Contexto/proyecto_muñegon_v2.md` secciones 4, 5, 8

---

## Resumen

Dos cambios independientes pero ambos del área de configuración/seguridad:

1. **Seguridad**: Eliminar `.env` de la raíz del proyecto (contiene `SUPABASE_SERVICE_ROLE_KEY` real) y migrar a `.env.development`
2. **Schema SQL**: Actualizar `supabase_schema.sql` para que refleje las 11 tablas y columnas reales del schema Rust/SQLite

Ambos cambios son seguros: no afectan el funcionamiento offline, el login, la sincronización existente, ni el binario de producción.

---

## Parte A — Seguridad de Variables de Entorno

### Situación actual

- `.env` en raíz contiene `SUPABASE_SERVICE_ROLE_KEY` y `PUBLIC_MUNEGON_API_SECRET` con valores reales
- `.gitignore` ya protege `*.env` (el archivo nunca se ha commiteado)
- Rust carga `.env` vía `dotenvy::dotenv()` en modo debug (`lib.rs:18`)
- En producción la key se embebe en el binario con `option_env!`

### Riesgo

Aunque `.gitignore` funciona, el archivo con credenciales reales sigue en disco. Posibles vectores:
- `git add -f .env` accidental (force-add manual o vía GUI)
- Compartir carpeta del proyecto por medios no-git (USB, ZIP, backup)
- Nuevo dev que hereda credenciales si el archivo llegara a filtrarse alguna vez
- Ambigüedad: `.env` parece "archivo del proyecto", no "archivo de mi máquina"

### Cambios

| # | Acción | Archivo | Detalle |
|---|---|---|---|
| A1 | **Eliminar** | `.env` (raíz) | Borrar el archivo con credenciales reales |
| A2 | **Actualizar** | `.env.example` | Agregar todas las variables que faltan: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_MUNEGON_API_SECRET`, `MUNEGON_DB_PATH`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| A3 | **Modificar** | `src-tauri/src/lib.rs` línea ~18 | Cambiar `let _ = dotenvy::dotenv();` → `let _ = dotenvy::from_filename(".env.development").ok();` |

### A3 — Código a cambiar en `lib.rs`

```rust
// ANTES:
#[cfg(debug_assertions)]
{
    let _ = dotenvy::dotenv();
}

// DESPUÉS:
#[cfg(debug_assertions)]
{
    // En desarrollo, cargar .env.development (nunca se commitea).
    // Si no existe, el sync watcher usará strings vacíos y la app funciona offline.
    let _ = dotenvy::from_filename(".env.development").ok();
}
```

### Flujo post-cambio

1. El usuario crea `.env.development` copiando de `.env.example` y llena sus credenciales reales
2. `cargo tauri dev` carga `.env.development` → sync funciona en desarrollo
3. `cargo tauri build` ignora archivos `.env` → la key se toma del entorno de compilación (`option_env!`)
4. El instalador `.msi` resultante lleva la key incrustada, sin dependencia de archivos

### Verificación de no-regresión

- Login offline: SIN cambios (usa SQLite local + SHA-256, no toca Supabase)
- Sync: si `.env.development` existe con keys → funciona igual. Si no existe → sync watcher emite strings vacíos, `sync-listener.ts` retorna early, la app sigue normal
- Binario de producción: SIN cambios (`option_env!` no depende de archivos en disco)
- `.gitignore`: SIN cambios (`*.env` ya cubre `.env.development`)

---

## Parte B — Actualización de supabase_schema.sql

### Situación actual

El archivo `supabase_schema.sql` (109 líneas) define solo 7 tablas:

- Usuario ✅
- Producto ⚠️ (falta columna `eliminado`)
- CorteCaja ✅
- Venta ⚠️ (faltan columnas `anulada`, `esCobroDeuda`)
- LineaVenta ✅
- Configuracion ✅
- LogCambio ✅

Faltan 5 tablas completas: Cliente, Deuda, LineaDeuda, Comanda, LineaComanda.

### Riesgo

Si alguien recrea la base de datos en Supabase ejecutando este script (SQL Editor → Run), las tablas faltantes no existirán. Las operaciones de sync que intenten leer/escribir en esas tablas fallarán con error 404/500.

### Schema completo de referencia (Rust `db.rs`)

Las 11 tablas con todas sus columnas (incluyendo las agregadas por migraciones):

```sql
Usuario (id, nombre, pin, rol, activo, creadoEn)
Producto (id, sku, nombre, descripcion, monedaBase, precio, stock, stockMinimo,
          activo, eliminado, creadoEn, actualizadoEn, isSynced)
CorteCaja (id, tipo, usuarioId, totalCalculado, totalDeclarado, diferencia, creadoEn, isSynced)
Venta (id, usuarioId, corteCajaId, subtotal, anulada, impuesto, total, formaPago, moneda,
       referenciaPago, tasaCambio, creadoEn, isSynced, esCobroDeuda)
LineaVenta (id, ventaId, productoId, cantidad, precioUnit, subtotal)
Configuracion (clave, valor, descripcion, updatedAt)
LogCambio (id, entidad, entidadId, campo, valorAntes, valorDespues, usuarioId, creadoEn, isSynced)
Cliente (id, nombre, apellido, telefono, observaciones, activo, creadoEn, isSynced)
Deuda (id, clienteId, usuarioId, subtotal, impuesto, total, activo, anulada, creadoEn, isSynced)
LineaDeuda (id, deudaId, productoId, cantidad, precioUnit, subtotal, anulada, activo)
Comanda (id, nombre, estado, subtotal, impuesto, total, ventaId, usuarioId, creadoEn, cobradoEn)
LineaComanda (id, comandaId, productoId, cantidad, precioUnit, subtotal)
```

### Cambios

| # | Acción | Archivo | Detalle |
|---|---|---|---|
| B1 | **Reescribir** | `supabase_schema.sql` | Reemplazar completamente con un script que: (a) `CREATE TABLE IF NOT EXISTS` las 11 tablas, (b) `ALTER TABLE ADD COLUMN IF NOT EXISTS` para las 4 columnas faltantes en tablas existentes, (c) `INSERT ON CONFLICT` configuraciones default, (d) foreign keys y tipos correctos |

### Estrategia de idempotencia

- **Tablas nuevas (5)**: `CREATE TABLE IF NOT EXISTS` — si la tabla ya existe, no pasa nada
- **Columnas nuevas en tablas existentes (4)**: Bloque `DO $$ BEGIN ALTER TABLE ... ADD COLUMN ...; EXCEPTION WHEN duplicate_column THEN NULL; END $$;` — si la columna ya existe (BD migrada), no truena

### Columnas faltantes en tablas existentes

| Tabla | Columna | Tipo |
|---|---|---|
| Venta | `anulada` | BOOLEAN NOT NULL DEFAULT false |
| Venta | `esCobroDeuda` | BOOLEAN NOT NULL DEFAULT false |
| Producto | `eliminado` | BOOLEAN NOT NULL DEFAULT false |

### Lo que NO se modifica

- **Edge Functions**: No requieren cambios (las tablas ya existen en Supabase, las funciones ya las consultan)
- **Sync listener** (`sync-listener.ts`): Ya maneja todas estas tablas y columnas
- **Código Rust** (`db.rs`): Ya tiene el schema correcto
- **Comandas**: No tienen `isSynced` — son 100% locales, no se sincronizan. El SQL las incluye por completitud pero el sync no las toca

### Verificación de no-regresión

- El script es idempotente: ejecutarlo en una BD que ya tiene las tablas no rompe nada
- El sync existente no se toca: las tablas/columnas ya existen en Supabase, el script solo documenta
- Las apps en producción no necesitan ejecutar este script (sus BDs ya están correctas)

---

## Plan de Implementación

### Orden de ejecución

1. **Parte A** (`.env`): seguro, sin dependencias
2. **Parte B** (`supabase_schema.sql`): seguro, sin dependencias

Ambos son independientes y se pueden hacer en cualquier orden.

### Archivos modificados

| Archivo | Acción | Parte |
|---|---|---|
| `.env` | **Eliminar** | A |
| `.env.example` | **Actualizar** (agregar variables faltantes) | A |
| `src-tauri/src/lib.rs` línea 18 | **Modificar** (cambiar dotenv call) | A |
| `supabase_schema.sql` | **Reescribir** (11 tablas + 4 columnas) | B |

### Verificación post-implementación

- [ ] `.env` ya no existe en el proyecto
- [ ] `.env.example` contiene todas las variables necesarias
- [ ] `cargo tauri dev` funciona con `.env.development` presente
- [ ] `cargo tauri dev` funciona SIN `.env.development` (modo offline silencioso)
- [ ] Login funciona offline (sin cambios)
- [ ] `supabase_schema.sql` se puede ejecutar en SQL Editor de Supabase sin errores
- [ ] Ejecutar el script 2 veces seguidas no produce errores (idempotencia)

---

## Notas

- Las **Comandas** no se sincronizan con Supabase (no tienen `isSynced`). Esto es por diseño: son entidades efímeras que viven solo en el SQLite local.
- Las **LineaDeuda** y **LineaComanda** viajan dentro del payload de sus entidades padre (Deuda y Comanda respectivamente) en el sync Pull. No tienen sync Push independiente.
- El `PUBLIC_MUNEGON_API_SECRET` también está en `.env` actual. Con el cambio, irá a `.env.development`. Este secreto lo usan las Edge Functions como autenticación (header `X-Munegon-Key`).
