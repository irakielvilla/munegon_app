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
  monedaBase: 'USD' | 'BS';
  precio: string;
  stock: number;
  stockMinimo: number;
  activo: boolean;
}

type ModalMode = null | 'nuevo' | 'editar';

const emptyProducto = (): Omit<Producto, 'id' | 'activo'> => ({
  sku: '',
  nombre: '',
  descripcion: '',
  monedaBase: 'USD',
  precio: '',
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
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activos' | 'inactivos'>('todos');
  const [filtroMoneda, setFiltroMoneda] = useState<'todos' | 'BS' | 'USD'>('todos');
  const [modal, setModal] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<Producto | null>(null);
  const [form, setForm] = useState(emptyProducto());
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [skuEdited, setSkuEdited] = useState(false);

  const [tasa, setTasa] = useState<number>(1);
  const [precioUSDInput, setPrecioUSDInput] = useState('');
  const [precioBSInput, setPrecioBSInput] = useState('');
  const [seBasaEn, setSeBasaEn] = useState<'USD' | 'BS'>('USD');

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    try {
      const [data, configData] = await Promise.all([
        api.listar_productos_admin(),
        api.obtener_configuracion()
      ]);
      setProductos(data);
      const rate = parseFloat(configData.tasa_cambio_bsd) || 1;
      setTasa(rate);
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
    setPrecioUSDInput('');
    setPrecioBSInput('');
    setSeBasaEn('USD');
    setEditTarget(null);
    setSkuEdited(false);
    setModal('nuevo');
  };

  const abrirEditar = (p: Producto) => {
    setForm({
      sku: p.sku,
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      monedaBase: p.monedaBase,
      precio: p.precio,
      stock: p.stock,
      stockMinimo: p.stockMinimo,
    });
    setEditTarget(p);
    setSkuEdited(true);

    if (p.monedaBase === 'BS') {
      setSeBasaEn('BS');
      setPrecioBSInput(p.precio);
      const bsNum = parseFloat(p.precio) || 0;
      setPrecioUSDInput(tasa > 0 ? (bsNum / tasa).toFixed(4) : '0.0000');
    } else {
      setSeBasaEn('USD');
      setPrecioUSDInput(p.precio);
      const usdNum = parseFloat(p.precio) || 0;
      setPrecioBSInput((usdNum * tasa).toFixed(4));
    }

    setModal('editar');
  };

  const cerrarModal = () => { setModal(null); setEditTarget(null); };

  const handleNombreInput = (e: Event) => {
    const val = (e.target as HTMLInputElement).value.toUpperCase();
    setForm((f) => ({ ...f, nombre: val }));
  };

  const handleNombreBlur = () => {
    if (modal === 'nuevo' && !skuEdited && form.nombre.trim()) {
      setForm((f) => ({ ...f, sku: generateSKU(f.nombre) }));
    }
  };

  const handleUSDInput = (e: Event) => {
    const val = (e.target as HTMLInputElement).value;
    setPrecioUSDInput(val);
    const usdNum = parseFloat(val);
    if (!isNaN(usdNum)) {
      setPrecioBSInput((usdNum * tasa).toFixed(4));
    } else {
      setPrecioBSInput('');
    }
  };

  const handleBSInput = (e: Event) => {
    const val = (e.target as HTMLInputElement).value;
    setPrecioBSInput(val);
    const bsNum = parseFloat(val);
    if (!isNaN(bsNum)) {
      setPrecioUSDInput(tasa > 0 ? (bsNum / tasa).toFixed(4) : '0.0000');
    } else {
      setPrecioUSDInput('');
    }
  };

  const handleGuardar = async () => {
    const isUSD = seBasaEn === 'USD';
    const activePriceInput = isUSD ? precioUSDInput : precioBSInput;
    if (!form.nombre.trim() || !form.sku.trim() || !activePriceInput) {
      flashMsg('error', 'SKU, nombre y precio son obligatorios.');
      return;
    }
    setGuardando(true);
    try {
      const finalPrecio = isUSD
        ? String((parseFloat(precioUSDInput) || 0).toFixed(4))
        : String((parseFloat(precioBSInput) || 0).toFixed(4));

      const payload = {
        sku: form.sku,
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        monedaBase: isUSD ? 'USD' : 'BS',
        precio: finalPrecio,
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
        monedaBase: p.monedaBase,
        precio: p.precio,
        stock: p.stock,
        stockMinimo: p.stockMinimo,
        activo: !p.activo,
      });
      cargar();
    } catch (e) {
      flashMsg('error', `Error: ${e}`);
    }
  };

  const handleEliminar = async (p: Producto) => {
    if (p.activo) {
      flashMsg('error', 'El producto debe estar inactivo para poder eliminarlo.');
      return;
    }
    const confirm = window.confirm(`¿Estás seguro de que quieres eliminar permanentemente el producto "${p.nombre}"?`);
    if (!confirm) return;

    try {
      await api.eliminar_producto(p.id);
      flashMsg('ok', '✅ Producto eliminado permanentemente');
      cargar();
    } catch (e) {
      flashMsg('error', `Error eliminando: ${e}`);
    }
  };

  const filtered = productos.filter((p) => {
    const matchBusqueda =
      busqueda === '' ||
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.sku.toLowerCase().includes(busqueda.toLowerCase());

    const matchStock = !soloStockBajo || p.stock <= p.stockMinimo;

    const matchEstado =
      filtroEstado === 'todos' ||
      (filtroEstado === 'activos' && p.activo) ||
      (filtroEstado === 'inactivos' && !p.activo);

    const matchMoneda =
      filtroMoneda === 'todos' ||
      p.monedaBase === filtroMoneda;

    return matchBusqueda && matchStock && matchEstado && matchMoneda;
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

        <button id="btn-nuevo-producto" class="btn-nuevo" onClick={abrirNuevo}>
          + Nuevo Producto
        </button>
      </div>

      <div class="inv-filtros-chips" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5%', flexWrap: 'wrap', padding: '0.6rem 1rem', background: '#f0b429', borderRadius: '8px' }}>
        <span style={{ fontWeight: 'bold', color: '#0f1117', marginRight: '0.5rem', fontSize: '0.9rem' }}>Filtrar:</span>
        <button
          onClick={() => setFiltroEstado(f => f === 'activos' ? 'todos' : 'activos')}
          style={{ background: filtroEstado === 'activos' ? '#0f1117' : 'rgba(0,0,0,0.12)', color: filtroEstado === 'activos' ? '#f0b429' : '#0f1117', border: 'none', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
        >Activos</button>
        <button
          onClick={() => setFiltroEstado(f => f === 'inactivos' ? 'todos' : 'inactivos')}
          style={{ background: filtroEstado === 'inactivos' ? '#0f1117' : 'rgba(0,0,0,0.12)', color: filtroEstado === 'inactivos' ? '#f0b429' : '#0f1117', border: 'none', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
        >Inactivos</button>
        <button
          onClick={() => setFiltroMoneda(f => f === 'BS' ? 'todos' : 'BS')}
          style={{ background: filtroMoneda === 'BS' ? '#0f1117' : 'rgba(0,0,0,0.12)', color: filtroMoneda === 'BS' ? '#f0b429' : '#0f1117', border: 'none', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
        >Solo Bs</button>
        <button
          onClick={() => setFiltroMoneda(f => f === 'USD' ? 'todos' : 'USD')}
          style={{ background: filtroMoneda === 'USD' ? '#0f1117' : 'rgba(0,0,0,0.12)', color: filtroMoneda === 'USD' ? '#f0b429' : '#0f1117', border: 'none', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
        >Solo $</button>
        <button
          onClick={() => setSoloStockBajo(!soloStockBajo)}
          style={{ background: soloStockBajo ? '#0f1117' : 'rgba(0,0,0,0.12)', color: soloStockBajo ? '#f0b429' : '#0f1117', border: 'none', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
        >⚠️ Stock Bajo</button>
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
              <th>Precio</th>
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
                  <td class="td-precio">
                    {p.monedaBase === 'BS' ? (
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{parseFloat(p.precio).toFixed(2)} Bs</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text2)', fontWeight: 'normal' }}>
                          ~ ${(tasa > 0 ? parseFloat(p.precio) / tasa : 0).toFixed(2)} USD
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontWeight: 'bold' }}>${parseFloat(p.precio).toFixed(2)} USD</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text2)', fontWeight: 'normal' }}>
                          ~ {(parseFloat(p.precio) * tasa).toFixed(2)} Bs
                        </div>
                      </div>
                    )}
                  </td>
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
                    {!p.activo && (
                      <button id={`eliminar-${p.id}`} class="btn-action btn-eliminar-item" onClick={() => handleEliminar(p)}>
                        🗑️
                      </button>
                    )}
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

            <div class="inv-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.25rem' }}>
              {/* ── Columna Izquierda: Info Básica ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '0.9rem', marginBottom: '0.2rem', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Información Básica</h3>

                <div class="form-group">
                  <label for="f-nombre">Nombre *</label>
                  <input id="f-nombre" type="text" style={{ textTransform: 'uppercase' }} value={form.nombre} onInput={handleNombreInput} onBlur={handleNombreBlur} placeholder="Nombre del producto" />
                </div>

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
                  <label for="f-desc" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    Descripción <span style={{ fontSize: '1rem', lineHeight: 1 }}>ℹ️</span>
                  </label>
                  <input id="f-desc" type="text" style={{ textTransform: 'uppercase' }} value={form.descripcion ?? ''} onInput={(e) => setField('descripcion', (e.target as HTMLInputElement).value.toUpperCase())} placeholder="Opcional" />
                </div>
              </div>

              {/* ── Columna Derecha: Precios y Stock ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '0.9rem', marginBottom: '0.2rem', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Precios y Stock</h3>

                <div class="form-group price-basis-group" style={{ marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text2)', display: 'block', marginBottom: '0.5rem' }}>
                    Moneda Base (origen del precio):
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setSeBasaEn('USD')}
                      style={{ flex: 1, padding: '0.4rem', borderRadius: '8px', border: seBasaEn === 'USD' ? '1px solid var(--accent)' : '1px solid var(--border)', background: seBasaEn === 'USD' ? 'rgba(108, 99, 255, 0.15)' : 'var(--bg3)', color: seBasaEn === 'USD' ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', fontWeight: seBasaEn === 'USD' ? 'bold' : 'normal', transition: 'all 0.2s', fontSize: '0.85rem' }}
                    >
                      $ Dólares
                    </button>
                    <button
                      type="button"
                      onClick={() => setSeBasaEn('BS')}
                      style={{ flex: 1, padding: '0.4rem', borderRadius: '8px', border: seBasaEn === 'BS' ? '1px solid var(--accent)' : '1px solid var(--border)', background: seBasaEn === 'BS' ? 'rgba(108, 99, 255, 0.15)' : 'var(--bg3)', color: seBasaEn === 'BS' ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', fontWeight: seBasaEn === 'BS' ? 'bold' : 'normal', transition: 'all 0.2s', fontSize: '0.85rem' }}
                    >
                      Bs Bolívares
                    </button>
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label for="f-precio">Precio USD *</label>
                    <input
                      id="f-precio"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={precioUSDInput}
                      onInput={handleUSDInput}
                      placeholder="0.0000"
                      style={seBasaEn === 'USD' ? { borderColor: 'var(--accent)' } : {}}
                    />
                  </div>
                  <div class="form-group">
                    <label for="f-precio-bs">Precio Bs *</label>
                    <input
                      id="f-precio-bs"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={precioBSInput}
                      onInput={handleBSInput}
                      placeholder="0.0000"
                      style={seBasaEn === 'BS' ? { borderColor: 'var(--accent)' } : {}}
                    />
                  </div>
                </div>

                <div class="form-row" style={{ marginTop: '0.2rem' }}>
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
