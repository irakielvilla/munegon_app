const fs = require('fs');

// PATCH TerminalCaja.tsx
const cajaPath = 'src/components/pos/TerminalCaja.tsx';
let cajaContent = fs.readFileSync(cajaPath, 'utf8');

if (!cajaContent.includes('isTauri')) {
    cajaContent = cajaContent.replace(
        "import { api, type Producto, type LineaInput, type ConfigApp, type CorteCajaInfo } from '../../lib/api';",
        "import { api, isTauri, type Producto, type LineaInput, type ConfigApp, type CorteCajaInfo } from '../../lib/api';"
    );
}

const oldCobrarBtn = `<button
                id="btn-cobrar"
                class="btn-cobrar"
                disabled={carrito.length === 0 || procesando}
                onClick={() => setModalActivo('pago')}
              >
                {procesando ? '⏳ Procesando...' : \`💰 Cobrar Bs \${fmtBs(totalUSD * tasaNum)}\`}
              </button>`;
const newCobrarBtn = `<button
                id="btn-cobrar"
                class="btn-cobrar"
                disabled={carrito.length === 0 || procesando || !isTauri()}
                onClick={() => setModalActivo('pago')}
                title={!isTauri() ? "Solo disponible para Escritorio" : ""}
              >
                {!isTauri() ? '🔒 Solo disponible para Escritorio' : procesando ? '⏳ Procesando...' : \`💰 Cobrar Bs \${fmtBs(totalUSD * tasaNum)}\`}
              </button>`;
cajaContent = cajaContent.replace(oldCobrarBtn, newCobrarBtn);

const oldCorteBtn = `<button class="btn-corte-x" onClick={() => setModalActivo('corte')}>
                  Corte X / Z
                </button>`;
const newCorteBtn = `<button class="btn-corte-x" onClick={() => setModalActivo('corte')} disabled={!isTauri()} title={!isTauri() ? "Solo disponible para Escritorio" : ""}>
                  {!isTauri() ? '🔒 Corte X / Z (Solo Escritorio)' : 'Corte X / Z'}
                </button>`;
cajaContent = cajaContent.replace(oldCorteBtn, newCorteBtn);
fs.writeFileSync(cajaPath, cajaContent);


// PATCH PanelDeudas.tsx
const deudasPath = 'src/components/deudas/PanelDeudas.tsx';
let deudasContent = fs.readFileSync(deudasPath, 'utf8');

if (!deudasContent.includes('isTauri')) {
    deudasContent = deudasContent.replace(
        "import { api, parseLocalDate } from '../../lib/api';",
        "import { api, isTauri, parseLocalDate } from '../../lib/api';"
    );
}

const oldAbonarBtn = `<button class="btn-accion abonar" onClick={abrirModalAbono}>
                  💰 Abonar/Pagar
                </button>`;
const newAbonarBtn = `<button class="btn-accion abonar" onClick={abrirModalAbono} disabled={!isTauri()} title={!isTauri() ? "Solo disponible para Escritorio" : ""}>
                  {!isTauri() ? '🔒 Solo disponible para Escritorio' : '💰 Abonar/Pagar'}
                </button>`;
deudasContent = deudasContent.replace(oldAbonarBtn, newAbonarBtn);

const oldFiarBtn = `<button class="btn-accion fiar" onClick={() => window.location.href = '/caja'}>
                  🛒 Nueva Deuda (Caja)
                </button>`;
const newFiarBtn = `<button class="btn-accion fiar" onClick={() => window.location.href = '/caja'} disabled={!isTauri()} title={!isTauri() ? "Solo disponible para Escritorio" : ""}>
                  {!isTauri() ? '🔒 Solo Escritorio' : '🛒 Nueva Deuda (Caja)'}
                </button>`;
deudasContent = deudasContent.replace(oldFiarBtn, newFiarBtn);

const oldEliminarLinea = `<button class="btn-icon btn-eliminar" onClick={() => handleEliminarLinea(deuda.id, linea.id)} title="Eliminar producto de la deuda">
                                    🗑️
                                  </button>`;
const newEliminarLinea = `<button class="btn-icon btn-eliminar" onClick={() => handleEliminarLinea(deuda.id, linea.id)} disabled={!isTauri()} title={!isTauri() ? "Solo disponible para Escritorio" : "Eliminar producto de la deuda"}>
                                    🗑️
                                  </button>`;
deudasContent = deudasContent.replace(oldEliminarLinea, newEliminarLinea);

const oldEliminarDeuda = `<button class="btn-accion eliminar" onClick={() => handleEliminarDeuda(deuda.id)}>
                        🗑️ Eliminar Deuda Completa
                      </button>`;
const newEliminarDeuda = `<button class="btn-accion eliminar" onClick={() => handleEliminarDeuda(deuda.id)} disabled={!isTauri()} title={!isTauri() ? "Solo disponible para Escritorio" : ""}>
                        🗑️ Eliminar Deuda Completa
                      </button>`;
deudasContent = deudasContent.replace(oldEliminarDeuda, newEliminarDeuda);

const oldNuevoClienteBtn = `<button class="btn-nuevo-cliente" onClick={() => setModalActivo('cliente')}>
            ➕ Nuevo Cliente
          </button>`;
const newNuevoClienteBtn = `<button class="btn-nuevo-cliente" onClick={() => setModalActivo('cliente')} disabled={!isTauri()} title={!isTauri() ? "Solo disponible para Escritorio" : ""}>
            {!isTauri() ? '🔒 Solo disponible para Escritorio' : '➕ Nuevo Cliente'}
          </button>`;
deudasContent = deudasContent.replace(oldNuevoClienteBtn, newNuevoClienteBtn);
fs.writeFileSync(deudasPath, deudasContent);


// PATCH TablaInventario.tsx
const invPath = 'src/components/inventario/TablaInventario.tsx';
let invContent = fs.readFileSync(invPath, 'utf8');

if (!invContent.includes('isTauri')) {
    invContent = invContent.replace(
        "import { api, type Producto } from '../../lib/api';",
        "import { api, isTauri, type Producto } from '../../lib/api';"
    );
}

const oldNuevoProdBtn = `<button class="btn-nuevo" onClick={abrirNuevo}>
          ➕ Añadir Producto
        </button>`;
const newNuevoProdBtn = `<button class="btn-nuevo" onClick={abrirNuevo} disabled={!isTauri()} title={!isTauri() ? "Solo disponible para Escritorio" : ""}>
          {!isTauri() ? '🔒 Solo disponible para Escritorio' : '➕ Añadir Producto'}
        </button>`;
invContent = invContent.replace(oldNuevoProdBtn, newNuevoProdBtn);

const oldActionBtns = `<div class="td-acciones">
                  <button class="btn-icon" onClick={() => abrirEditar(prod)} title="Editar">✏️</button>
                  <button class="btn-icon" onClick={() => handleEliminar(prod.id)} title="Desactivar">🗑️</button>
                </div>`;
const newActionBtns = `<div class="td-acciones">
                  <button class="btn-icon" onClick={() => abrirEditar(prod)} disabled={!isTauri()} title={!isTauri() ? "Solo Escritorio" : "Editar"}>✏️</button>
                  <button class="btn-icon" onClick={() => handleEliminar(prod.id)} disabled={!isTauri()} title={!isTauri() ? "Solo Escritorio" : "Desactivar"}>🗑️</button>
                </div>`;
invContent = invContent.replace(oldActionBtns, newActionBtns);
fs.writeFileSync(invPath, invContent);


// PATCH administracion.astro
const adminPath = 'src/pages/administracion.astro';
let adminContent = fs.readFileSync(adminPath, 'utf8');
if (!adminContent.includes('isTauri')) {
  adminContent = adminContent.replace(
    "import { isUserLoggedIn } from '../../lib/auth';",
    "import { isUserLoggedIn } from '../../lib/auth';\nimport { isTauri } from '../../lib/api';"
  );
}

const oldAdminBtn = `<button id="btn-guardar-config" class="btn-primario">
              💾 Guardar Configuración
            </button>`;
const newAdminBtn = `<button id="btn-guardar-config" class="btn-primario" disabled>
              💾 Guardar Configuración
            </button>`;
// Since astro component scripts run on client we can just add a global script to disable if not tauri
const scriptToDisable = `
    const isTauri = () => typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window);
    if (!isTauri()) {
      const btn = document.getElementById('btn-guardar-config');
      if (btn) {
        btn.disabled = true;
        btn.innerText = '🔒 Solo disponible para Escritorio';
      }
    }
`;
if (!adminContent.includes('Solo disponible para Escritorio')) {
    adminContent = adminContent.replace(
        "function initAdmin() {",
        "function initAdmin() {\n" + scriptToDisable
    );
    fs.writeFileSync(adminPath, adminContent);
}

console.log("UI React Components and Astro patched successfully.");
