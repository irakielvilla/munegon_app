// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — TablaInventario (Preact)
// CRUD de productos — solo ADMIN
// ══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'preact/hooks';
import { api } from '../../lib/api';
import { requireAuth } from '@lib/auth';
import ModalOverlay from '../ui/ModalOverlay';

interface Producto {
  id: string;
  sku: string;
  nombre: string;
  descripcion: string | null;
  precioUSD: string;
  stock: number;
  stockMinimo: number;
  activo: boolean;
}

type ModalMode = null | 'nuevo' | 'editar';

const emptyProducto = (): Omit<Producto, 'id' | 'activo'> => ({
  sku: '',
  nombre: '',
  descripcion: '',
  precioUSD: '',
  stock: 0,
  stockMinimo: 5,
});

function generateSKU(name: string): string {
  if (!name) return '';

  const cleaned = name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ");

  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return '';

  let sizeSuffix = '';
  const lastWord = words[words.length - 1];
  if (/^\d+(ML|G|GR|KG|L|OZ)?$/.test(lastWord)) {
    const numMatch = lastWord.match(/^\d+/);
    if (numMatch) {
      sizeSuffix = numMatch[0];
      words.pop();
    }
  }

  if (words.length === 0) return sizeSuffix;

  const connectors = new Set(['DE', 'CON', 'EL', 'LA', 'PARA', 'Y', 'A', 'OF', 'WITH', 'THE']);
  const filteredWords = words.filter((w, idx) => {
    if (idx === 0 || idx === words.length - 1) return true;
    return !connectors.has(w) && w.length > 2;
  });

  const finalWords = filteredWords.length > 0 ? filteredWords : words;
  const skuParts: string[] = [];

  if (finalWords.length === 1) {
    skuParts.push(finalWords[0].slice(0, 3));
  } else if (finalWords.length === 2) {
    skuParts.push(finalWords[0].slice(0, 3));
    skuParts.push(finalWords[1].slice(0, 3));
  } else {
    skuParts.push(finalWords[0].slice(0, 3));
    skuParts.push(finalWords[1].slice(0, 3));

    if (finalWords.length === 3) {
      skuParts.push(finalWords[2].slice(0, 3));
    } else {
      let variantInitials = '';
      for (let i = 2; i < finalWords.length; i++) {
        variantInitials += finalWords[i].charAt(0);
      }
      if (variantInitials) {
        skuParts.push(variantInitials);
      }
    }
  }

  if (sizeSuffix) {
    skuParts.push(sizeSuffix);
  }

  return skuParts.join('-');
}


export default function TablaInventario() {
  requireAuth();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [soloStockBajo, setSoloStockBajo] = useState(false);
  const [modal, setModal] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<Producto | null>(null);
  const [form, setForm] = useState(emptyProducto());
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [skuEdited, setSkuEdited] = useState(false);

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    try {
      const data = await api.listar_productos_admin();
      setProductos(data);
    } catch (e) {
      flashMsg('error', `Error cargando productos: ${e}`);
    }
  };

  const flashMsg = (tipo: 'ok' | 'error', texto: string) => {
    setMsg({ tipo, texto });
    setTimeout(() => setMsg(null), 3000);
  };

  const abrirNuevo = () => {
    setForm(emptyProducto());
    setEditTarget(null);
    setSkuEdited(false);
    setModal('nuevo');
  };

  const abrirEditar = (p: Producto) => {
    setForm({
      sku: p.sku,
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      precioUSD: p.precioUSD,
      stock: p.stock,
      stockMinimo: p.stockMinimo,
    });
    setEditTarget(p);
    setSkuEdited(true);
    setModal('editar');
  };

  const cerrarModal = () => { setModal(null); setEditTarget(null); };

  const handleNombreInput = (e: Event) => {
    const val = (e.target as HTMLInputElement).value.toUpperCase();
    setForm((f) => {
      const updated = { ...f, nombre: val };
      if (modal === 'nuevo' && !skuEdited) {
        updated.sku = generateSKU(val);
      }
      return updated;
    });
  };


  const handleGuardar = async () => {
    if (!form.nombre.trim() || !form.sku.trim() || !form.precioUSD) {
      flashMsg('error', 'SKU, nombre y precio son obligatorios.');
      return;
    }
    setGuardando(true);
    try {
      const payload = {
        sku: form.sku,
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        precioUsd: String(parseFloat(form.precioUSD).toFixed(2)),
        stock: form.stock,
        stockMinimo: form.stockMinimo,
      };

      if (modal === 'nuevo') {
        await api.crear_producto(payload);
        flashMsg('ok', '✅ Producto creado');
      } else if (editTarget) {
        await api.actualizar_producto({
          id: editTarget.id,
          ...payload,
          activo: editTarget.activo,
        });
        flashMsg('ok', '✅ Producto actualizado');
      }
      cerrarModal();
      cargar();
    } catch (e) {
      flashMsg('error', `Error: ${e}`);
    } finally {
      setGuardando(false);
    }
  };

  const toggleActivo = async (p: Producto) => {
    try {
      await api.actualizar_producto({
        id: p.id,
        sku: p.sku,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precioUsd: p.precioUSD,
        stock: p.stock,
        stockMinimo: p.stockMinimo,
        activo: !p.activo,
      });
      cargar();
    } catch (e) {
      flashMsg('error', `Error: ${e}`);
    }
  };

  const filtered = productos.filter((p) => {
    const matchBusqueda =
      busqueda === '' ||
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.sku.toLowerCase().includes(busqueda.toLowerCase());
    const matchStock = !soloStockBajo || p.stock <= p.stockMinimo;
    return matchBusqueda && matchStock;
  });

  const setField = (key: keyof typeof form, val: string | number) =>
    setForm((f) => ({ ...f, [key]: val }));

  return (
    <div class="inv-container">
      {/* ── Toolbar ── */}
      <div class="inv-toolbar">
        <div class="inv-search">
          <span>🔍</span>
          <input
            id="busqueda-inventario"
            type="text"
            placeholder="Buscar por nombre o SKU…"
            value={busqueda}
            onInput={(e) => setBusqueda((e.target as HTMLInputElement).value)}
          />
        </div>
        <label class="stock-toggle">
          <input
            id="filtro-stock-bajo"
            type="checkbox"
            checked={soloStockBajo}
            onChange={(e) => setSoloStockBajo((e.target as HTMLInputElement).checked)}
          />
          ⚠️ Solo stock bajo
        </label>
        <button id="btn-nuevo-producto" class="btn-nuevo" onClick={abrirNuevo}>
          + Nuevo Producto
        </button>
      </div>

      {/* ── Flash ── */}
      {msg && <div class={`inv-flash inv-flash-${msg.tipo}`}>{msg.texto}</div>}

      {/* ── Tabla ── */}
      <div class="inv-table-wrap">
        <table class="inv-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Nombre</th>
              <th>Precio USD</th>
              <th>Stock</th>
              <th>Mín.</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colspan={7} class="inv-empty">Sin productos</td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} class={!p.activo ? 'row-inactivo' : ''}>
                  <td class="td-sku">{p.sku}</td>
                  <td class="td-nombre">{p.nombre}</td>
                  <td class="td-precio">${parseFloat(p.precioUSD).toFixed(2)}</td>
                  <td class={`td-stock ${p.stock <= p.stockMinimo ? 'stock-critico' : ''}`}>
                    {p.stock <= p.stockMinimo && '⚠️ '}{p.stock}
                  </td>
                  <td class="td-min">{p.stockMinimo}</td>
                  <td>
                    <span class={`badge-estado ${p.activo ? 'activo' : 'inactivo'}`}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td class="td-actions">
                    <button id={`editar-${p.id}`} class="btn-action edit" onClick={() => abrirEditar(p)}>✏️</button>
                    <button id={`toggle-${p.id}`} class="btn-action toggle" onClick={() => toggleActivo(p)}>
                      {p.activo ? '🔒' : '🔓'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Modal Producto ── */}
      {modal && (
        <ModalOverlay>
          <div class="modal-card inv-modal">
            <div class="modal-header">
              <h2>{modal === 'nuevo' ? '+ Nuevo Producto' : '✏️ Editar Producto'}</h2>
              <button class="modal-close" onClick={cerrarModal}>✕</button>
            </div>

            <div class="inv-form">
              <div class="form-row">
                <div class="form-group">
                  <div class="sku-label-row">
                    <label for="f-sku">SKU *</label>
                    {form.nombre.trim() && (
                      <button
                        type="button"
                        class="btn-auto-sku"
                        onClick={() => {
                          setSkuEdited(false);
                          setField('sku', generateSKU(form.nombre));
                        }}
                      >
                        Generar ⚡
                      </button>
                    )}
                  </div>
                  <input
                    id="f-sku"
                    type="text"
                    style={{ textTransform: 'uppercase' }}
                    value={form.sku}
                    onInput={(e) => {
                      setSkuEdited(true);
                      setField('sku', (e.target as HTMLInputElement).value.toUpperCase());
                    }}
                    placeholder="EJ-001"
                  />
                </div>
                <div class="form-group">
                  <label for="f-precio">Precio USD *</label>
                  <input id="f-precio" type="number" min="0" step="0.01" value={form.precioUSD} onInput={(e) => setField('precioUSD', (e.target as HTMLInputElement).value)} placeholder="0.00" />
                </div>
              </div>
              <div class="form-group">
                <label for="f-nombre">Nombre *</label>
                <input id="f-nombre" type="text" style={{ textTransform: 'uppercase' }} value={form.nombre} onInput={handleNombreInput} placeholder="Nombre del producto" />
              </div>
              <div class="form-group">
                <label for="f-desc">Descripción</label>
                <input id="f-desc" type="text" style={{ textTransform: 'uppercase' }} value={form.descripcion ?? ''} onInput={(e) => setField('descripcion', (e.target as HTMLInputElement).value.toUpperCase())} placeholder="Opcional" />
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="f-stock">Stock inicial</label>
                  <input id="f-stock" type="number" min="0" value={form.stock} onInput={(e) => setField('stock', parseInt((e.target as HTMLInputElement).value) || 0)} />
                </div>
                <div class="form-group">
                  <label for="f-stock-min">Stock mínimo</label>
                  <input id="f-stock-min" type="number" min="0" value={form.stockMinimo} onInput={(e) => setField('stockMinimo', parseInt((e.target as HTMLInputElement).value) || 0)} />
                </div>
              </div>
            </div>

            <div class="modal-actions">
              <button class="btn-cancelar" onClick={cerrarModal}>Cancelar</button>
              <button id="guardar-producto" class="btn-confirmar" onClick={handleGuardar} disabled={guardando}>
                {guardando ? '⏳ Guardando…' : '💾 Guardar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
