import os
import re

# Patch TerminalCaja.tsx
file_path = r"c:\Users\iraki\Desktop\Muñegon app carpeta\Muñegon App\src\components\pos\TerminalCaja.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Make sure isTauri is imported
if "import { api, isTauri, type Producto, type LineaInput, type ConfigApp, type CorteCajaInfo } from '../../lib/api';" not in content:
    content = content.replace("import { api, type Producto, type LineaInput, type ConfigApp, type CorteCajaInfo } from '../../lib/api';", "import { api, isTauri, type Producto, type LineaInput, type ConfigApp, type CorteCajaInfo } from '../../lib/api';")

# Replace btn-cobrar
old_btn = """              <button
                id="btn-cobrar"
                class="btn-cobrar"
                disabled={carrito.length === 0 || procesando}
                onClick={() => setModalActivo('pago')}
              >
                {procesando ? '⏳ Procesando...' : `💰 Cobrar Bs ${fmtBs(totalUSD * tasaNum)}`}
              </button>"""

new_btn = """              <button
                id="btn-cobrar"
                class="btn-cobrar"
                disabled={carrito.length === 0 || procesando || !isTauri()}
                onClick={() => {
                  if (!isTauri()) return;
                  setModalActivo('pago')
                }}
                title={!isTauri() ? "Solo disponible en Escritorio" : ""}
              >
                {!isTauri() ? '🔒 Solo Escritorio' : procesando ? '⏳ Procesando...' : `💰 Cobrar Bs ${fmtBs(totalUSD * tasaNum)}`}
              </button>"""

content = content.replace(old_btn, new_btn)

# Replace the clear button as well? "Limpiar" can still work on web, it's just client side.
# Disable corte X / corte Z in web mode

old_corte = """                <button class="btn-corte-x" onClick={() => setModalActivo('corte')}>
                  Corte X / Z
                </button>"""
new_corte = """                <button class="btn-corte-x" onClick={() => setModalActivo('corte')} disabled={!isTauri()} title={!isTauri() ? "Solo disponible en Escritorio" : ""}>
                  {!isTauri() ? '🔒 Corte X / Z (Solo Escritorio)' : 'Corte X / Z'}
                </button>"""
content = content.replace(old_corte, new_corte)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("TerminalCaja.tsx patched")
