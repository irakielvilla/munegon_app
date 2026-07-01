// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — GestorComandas (Preact)
// Módulo completo de comandas: panel de cards + vista detalle
// ══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'preact/hooks';
import { api, type ComandaInfo, type LineaComandaInfo, type Producto, type ConfigApp } from '../../lib/api';
import { getSession } from '@lib/auth';
import '../../styles/comandas.css';

// ── Tipos locales ─────────────────────────────────────────────

type Vista = 'panel' | 'detalle';
type FormaPago = 'USD_EFECTIVO' | 'BS_EFECTIVO' | 'BS_DEBITO' | 'BS_PAGO_MOVIL' | 'CUENTA_COBRAR';
type ModalActivo = null | 'crear' | 'editar' | 'eliminar' | 'pago' | 'historial';

// ── Helpers ───────────────────────────────────────────────────

const fmt2 = (n: number) => n.toFixed(2);
const fmtBs = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getProductPriceUSD(p: Producto, tasa: number): number {
  const raw = parseFloat(p.precio) || 0;
  return p.monedaBase === 'BS' ? raw / tasa : raw;
}

function formatHora(isoStr: string): string {
  const d = new Date(isoStr.includes('T') ? isoStr : isoStr.replace(' ', 'T') + 'Z');
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

function formatFechaHora(isoStr: string | null): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr.includes('T') ? isoStr : isoStr.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + formatHora(isoStr);
}

// ══════════════════════════════════════════════════════════════
// MODAL: Crear Comanda
// ══════════════════════════════════════════════════════════════

function ModalCrear({ onConfirmar, onCerrar }: { onConfirmar: (nombre: string) => void; onCerrar: () => void }) {
  const [nombre, setNombre] = useState('');
  const ok = nombre.trim().length > 0;

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && ok) onConfirmar(nombre.trim());
    if (e.key === 'Escape') onCerrar();
  };

  return (
    <div class="cmd-overlay" onClick={onCerrar}>
      <div class="cmd-modal" onClick={(e) => e.stopPropagation()}>
        <h2 class="cmd-modal-title">🍽️ Nueva Comanda</h2>
        <label class="cmd-label">Nombre del cliente</label>
        <input
          id="input-nombre-comanda"
          class="cmd-input"
          type="text"
          placeholder="Ej: Mesa 3, Juan García..."
          value={nombre}
          onInput={(e) => setNombre((e.target as HTMLInputElement).value)}
          onKeyDown={handleKey}
          autoFocus
        />
        <div class="cmd-modal-actions">
          <button class="cmd-btn cmd-btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button class="cmd-btn cmd-btn-primary" disabled={!ok} onClick={() => onConfirmar(nombre.trim())}>
            Crear comanda
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MODAL: Editar Nombre
// ══════════════════════════════════════════════════════════════

function ModalEditar({ nombreActual, onConfirmar, onCerrar }: { nombreActual: string; onConfirmar: (n: string) => void; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(nombreActual);
  const ok = nombre.trim().length > 0 && nombre.trim() !== nombreActual;

  return (
    <div class="cmd-overlay" onClick={onCerrar}>
      <div class="cmd-modal" onClick={(e) => e.stopPropagation()}>
        <h2 class="cmd-modal-title">✏️ Editar Comanda</h2>
        <label class="cmd-label">Nombre del cliente</label>
        <input
          id="input-editar-nombre"
          class="cmd-input"
          type="text"
          value={nombre}
          onInput={(e) => setNombre((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && ok) onConfirmar(nombre.trim()); if (e.key === 'Escape') onCerrar(); }}
          autoFocus
        />
        <div class="cmd-modal-actions">
          <button class="cmd-btn cmd-btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button class="cmd-btn cmd-btn-primary" disabled={!ok} onClick={() => onConfirmar(nombre.trim())}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MODAL: Confirmar Eliminar
// ══════════════════════════════════════════════════════════════

function ModalEliminar({ nombre, onConfirmar, onCerrar }: { nombre: string; onConfirmar: () => void; onCerrar: () => void }) {
  return (
    <div class="cmd-overlay" onClick={onCerrar}>
      <div class="cmd-modal" onClick={(e) => e.stopPropagation()}>
        <h2 class="cmd-modal-title">🗑️ Eliminar Comanda</h2>
        <p class="cmd-modal-text">
          ¿Eliminar la comanda de <strong>{nombre}</strong>?<br />
          Los productos regresarán al inventario.
        </p>
        <div class="cmd-modal-actions">
          <button class="cmd-btn cmd-btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button class="cmd-btn cmd-btn-danger" onClick={onConfirmar}>Eliminar</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MODAL: Pago
// ══════════════════════════════════════════════════════════════

const METODOS: { forma: FormaPago; label: string; icon: string; moneda: string }[] = [
  { forma: 'USD_EFECTIVO', label: 'Efectivo USD', icon: '💵', moneda: 'USD' },
  { forma: 'BS_EFECTIVO',  label: 'Efectivo Bs',  icon: '💴', moneda: 'BS' },
  { forma: 'BS_DEBITO',    label: 'Débito Bs',    icon: '💳', moneda: 'BS' },
  { forma: 'BS_PAGO_MOVIL',label: 'Pago Móvil',   icon: '📱', moneda: 'BS' },
];

function ModalPago({ totalUSD, tasa, onConfirmar, onCerrar }: {
  totalUSD: number;
  tasa: string;
  onConfirmar: (forma: FormaPago, referencia?: string) => void;
  onCerrar: () => void;
}) {
  const [forma, setForma] = useState<FormaPago | null>(null);
  const [ref, setRef] = useState('');
  const tasaNum = parseFloat(tasa) || 1;
  const totalBs = totalUSD * tasaNum;
  const needsRef = forma === 'BS_DEBITO' || forma === 'BS_PAGO_MOVIL';

  return (
    <div class="cmd-overlay" onClick={onCerrar}>
      <div class="cmd-modal cmd-modal-pago" onClick={(e) => e.stopPropagation()}>
        <h2 class="cmd-modal-title">💰 Cobrar Comanda</h2>

        <div class="pago-totales">
          <div class="pago-total-usd">${fmt2(totalUSD)} USD</div>
          <div class="pago-total-bs">Bs {fmtBs(totalBs)}</div>
          <div class="pago-tasa">Tasa: {tasa} Bs/$</div>
        </div>

        <div class="pago-metodos">
          {METODOS.map((m) => (
            <button
              key={m.forma}
              class={`pago-metodo-btn ${forma === m.forma ? 'selected' : ''}`}
              onClick={() => setForma(m.forma)}
            >
              <span class="pago-icon">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {needsRef && (
          <div>
            <label class="cmd-label">Referencia (opcional)</label>
            <input
              class="cmd-input"
              placeholder="Nro de referencia..."
              value={ref}
              onInput={(e) => setRef((e.target as HTMLInputElement).value)}
            />
          </div>
        )}

        <div class="cmd-modal-actions">
          <button class="cmd-btn cmd-btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button
            class="cmd-btn cmd-btn-success"
            disabled={!forma}
            onClick={() => forma && onConfirmar(forma, ref || undefined)}
          >
            Confirmar cobro
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MODAL: Historial
// ══════════════════════════════════════════════════════════════

function ModalHistorial({ historial, tasa, onCerrar }: { historial: ComandaInfo[]; tasa: string; onCerrar: () => void }) {
  const tasaNum = parseFloat(tasa) || 1;

  return (
    <div class="cmd-overlay" onClick={onCerrar}>
      <div class="cmd-modal cmd-modal-historial" onClick={(e) => e.stopPropagation()}>
        <h2 class="cmd-modal-title">📋 Historial de Comandas</h2>
        {historial.length === 0 ? (
          <p class="cmd-empty">Sin comandas cobradas aún.</p>
        ) : (
          <div class="historial-lista">
            {historial.map((c) => {
              const totalUSD = parseFloat(c.total) || 0;
              return (
                <div key={c.id} class="historial-item">
                  <div class="historial-nombre">{c.nombre}</div>
                  <div class="historial-total">${fmt2(totalUSD)} USD</div>
                  <div class="historial-bs">Bs {fmtBs(totalUSD * tasaNum)}</div>
                  <div class="historial-fecha">{formatFechaHora(c.cobradoEn)}</div>
                  <div class="historial-productos">{c.numLineas} producto{c.numLineas !== 1 ? 's' : ''}</div>
                </div>
              );
            })}
          </div>
        )}
        <div class="cmd-modal-actions">
          <button class="cmd-btn cmd-btn-primary" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// VISTA A — Panel Principal (grid de cards)
// ══════════════════════════════════════════════════════════════

function PanelComandas({
  comandas, tasa, cargando, error, mensaje,
  onCrear, onEditar, onEliminar, onHistorial, onVerDetalle,
}: {
  comandas: ComandaInfo[];
  tasa: string;
  cargando: boolean;
  error: string | null;
  mensaje: { tipo: 'ok' | 'error'; texto: string } | null;
  onCrear: () => void;
  onEditar: (c: ComandaInfo) => void;
  onEliminar: (c: ComandaInfo) => void;
  onHistorial: () => void;
  onVerDetalle: (c: ComandaInfo) => void;
}) {
  const tasaNum = parseFloat(tasa) || 1;
  const [selected, setSelected] = useState<string | null>(null);

  const sel = comandas.find((c) => c.id === selected) ?? null;

  return (
    <div class="cmd-panel">
      {/* Header */}
      <header class="cmd-header">
        <div class="cmd-header-left">
          <span class="cmd-logo">🍽️ <strong>Comandas</strong></span>
          <span class="cmd-count">{comandas.length} abierta{comandas.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="cmd-header-actions">
          <button id="btn-crear-comanda" class="cmd-btn cmd-btn-primary" onClick={onCrear}>
            + Crear comanda
          </button>
          <button
            id="btn-editar-comanda"
            class="cmd-btn cmd-btn-secondary"
            disabled={!sel}
            onClick={() => sel && onEditar(sel)}
          >
            ✏️ Editar
          </button>
          <button
            id="btn-eliminar-comanda"
            class="cmd-btn cmd-btn-danger"
            disabled={!sel}
            onClick={() => sel && onEliminar(sel)}
          >
            🗑️ Eliminar
          </button>
          <button id="btn-historial-comanda" class="cmd-btn cmd-btn-ghost" onClick={onHistorial}>
            📋 Historial
          </button>
        </div>
      </header>

      {/* Flash */}
      {mensaje && <div class={`cmd-flash cmd-flash-${mensaje.tipo}`}>{mensaje.texto}</div>}

      {/* Cuerpo */}
      <div class="cmd-body">
        {cargando ? (
          <div class="cmd-loading">⏳ Cargando comandas…</div>
        ) : error ? (
          <div class="cmd-error">{error}</div>
        ) : comandas.length === 0 ? (
          <div class="cmd-empty-panel">
            <div class="cmd-empty-icon">🍽️</div>
            <h3>Sin comandas abiertas</h3>
            <p>Crea una nueva comanda para comenzar a tomar pedidos.</p>
            <button class="cmd-btn cmd-btn-primary" onClick={onCrear}>+ Crear comanda</button>
          </div>
        ) : (
          <div class="cmd-grid">
            {comandas.map((c) => {
              const totalUSD = parseFloat(c.total) || 0;
              const totalBs = totalUSD * tasaNum;
              const isSelected = selected === c.id;
              return (
                <div
                  key={c.id}
                  class={`comanda-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelected(isSelected ? null : c.id)}
                  onDblClick={() => onVerDetalle(c)}
                  title="Doble click para ver detalle"
                >
                  <div class="card-nombre">{c.nombre}</div>
                  <div class="card-hora">🕐 {formatHora(c.creadoEn)}</div>
                  <div class="card-total-usd">${fmt2(totalUSD)}</div>
                  <div class="card-total-bs">Bs {fmtBs(totalBs)}</div>
                  <div class="card-productos">
                    {c.numLineas} producto{c.numLineas !== 1 ? 's' : ''}
                  </div>
                  <button
                    class="card-btn-abrir"
                    onClick={(e) => { e.stopPropagation(); onVerDetalle(c); }}
                  >
                    Abrir →
                  </button>
                  {isSelected && <div class="card-selected-badge">✓</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// VISTA B — Detalle de Comanda
// ══════════════════════════════════════════════════════════════

function DetalleComandaVista({
  comanda, lineas, productos, config, procesando, mensaje,
  onVolver, onAgregarProducto, onEliminarLinea, onCobrar,
}: {
  comanda: ComandaInfo;
  lineas: LineaComandaInfo[];
  productos: Producto[];
  config: ConfigApp;
  procesando: boolean;
  mensaje: { tipo: 'ok' | 'error'; texto: string } | null;
  onVolver: () => void;
  onAgregarProducto: (p: Producto) => void;
  onEliminarLinea: (lineaId: string) => void;
  onCobrar: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const tasaNum = parseFloat(config.tasa_cambio_bsd) || 1;

  const productosFiltrados = productos.filter(
    (p) =>
      busqueda === '' ||
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.sku.toLowerCase().includes(busqueda.toLowerCase()),
  );

  const totalUSD = parseFloat(comanda.total) || 0;
  const subtotalUSD = parseFloat(comanda.subtotal) || 0;
  const impuestoUSD = parseFloat(comanda.impuesto) || 0;

  return (
    <div class="cmd-detalle">
      {/* Header detalle */}
      <header class="cmd-header">
        <div class="cmd-header-left">
          <button id="btn-volver-panel" class="cmd-btn cmd-btn-ghost cmd-btn-back" onClick={onVolver}>
            ← Volver
          </button>
          <span class="cmd-logo">🍽️ <strong>{comanda.nombre}</strong></span>
        </div>
        <div class="cmd-header-right">
          <button
            id="btn-cobrar-comanda"
            class="cmd-btn cmd-btn-success"
            disabled={lineas.length === 0 || procesando}
            onClick={onCobrar}
          >
            {procesando ? '⏳ Procesando…' : `💰 Cobrar $${fmt2(totalUSD)}`}
          </button>
        </div>
      </header>

      {mensaje && <div class={`cmd-flash cmd-flash-${mensaje.tipo}`}>{mensaje.texto}</div>}

      <div class="cmd-detalle-body">
        {/* Panel izquierdo: catálogo */}
        <section class="detalle-catalogo">
          <div class="busqueda-bar">
            <span class="busqueda-icon">🔍</span>
            <input
              id="busqueda-detalle"
              type="text"
              placeholder="Buscar producto..."
              value={busqueda}
              onInput={(e) => setBusqueda((e.target as HTMLInputElement).value)}
              class="busqueda-input"
            />
          </div>
          <div class="detalle-productos-grid">
            {productosFiltrados.length === 0 ? (
              <div class="cmd-empty">Sin resultados</div>
            ) : (
              productosFiltrados.map((p) => {
                const agotado = p.stock <= 0;
                const precioUSD = getProductPriceUSD(p, tasaNum);
                return (
                  <button
                    key={p.id}
                    id={`prod-cmd-${p.id}`}
                    class={`producto-card ${agotado ? 'producto-agotado' : ''}`}
                    onClick={() => !agotado && onAgregarProducto(p)}
                    disabled={agotado}
                    title={agotado ? 'Sin stock' : `Agregar ${p.nombre}`}
                  >
                    <span class="prod-nombre">{p.nombre}</span>
                    <span class="prod-sku">{p.sku}</span>
                    <span class={`prod-stock ${agotado ? 'stock-agotado' : p.stock <= 5 ? 'stock-bajo' : ''}`}>
                      {agotado ? 'AGOTADO' : `Stock: ${p.stock}`}
                    </span>
                    <div class="prod-footer">
                      {p.monedaBase === 'BS' ? (
                        <>
                          <span class="prod-precio">Bs {fmtBs(parseFloat(p.precio) || 0)}</span>
                          <span class="prod-precio-usd">${precioUSD.toFixed(2)} USD</span>
                        </>
                      ) : (
                        <>
                          <span class="prod-precio">${precioUSD.toFixed(2)} USD</span>
                          <span class="prod-precio-usd">Bs {fmtBs(precioUSD * tasaNum)}</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Panel derecho: comanda */}
        <aside class="detalle-comanda-panel">
          <div class="comanda-lineas-header">
            <h3>🍽️ Pedido</h3>
            <span class="lineas-count">{lineas.length} ítem{lineas.length !== 1 ? 's' : ''}</span>
          </div>

          <div class="comanda-lineas">
            {lineas.length === 0 ? (
              <div class="cmd-empty">Agrega productos del catálogo</div>
            ) : (
              lineas.map((l) => {
                const subtotalNum = parseFloat(l.subtotal) || 0;
                return (
                  <div key={l.id} class="comanda-linea">
                    <div class="linea-info">
                      <span class="linea-nombre">{l.productoNombre}</span>
                      <span class="linea-cant">×{l.cantidad}</span>
                    </div>
                    <div class="linea-right">
                      <span class="linea-subtotal">${fmt2(subtotalNum)}</span>
                      <button
                        id={`eliminar-linea-${l.id}`}
                        class="linea-btn-eliminar"
                        onClick={() => onEliminarLinea(l.id)}
                        title="Eliminar del pedido"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Totalizador */}
          <div class="comanda-totalizador">
            <div class="total-row">
              <span>Subtotal</span>
              <span>${fmt2(subtotalUSD)}</span>
            </div>
            <div class="total-row">
              <span>IVA ({config.iva_porcentaje}%)</span>
              <span>${fmt2(impuestoUSD)}</span>
            </div>
            <div class="total-row total-final">
              <span>TOTAL</span>
              <span>${fmt2(totalUSD)}</span>
            </div>
            <div class="total-bs-secundario">Bs {fmtBs(totalUSD * tasaNum)}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE RAÍZ: GestorComandas
// ══════════════════════════════════════════════════════════════

export default function GestorComandas() {
  const session = getSession();

  // ── Estado global ─────────────────────────────────────────
  const [vista, setVista] = useState<Vista>('panel');
  const [comandas, setComandas] = useState<ComandaInfo[]>([]);
  const [historial, setHistorial] = useState<ComandaInfo[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [config, setConfig] = useState<ConfigApp>({ tasa_cambio_bsd: '1.00', iva_porcentaje: '16' });
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Comanda en detalle
  const [comandaActual, setComandaActual] = useState<ComandaInfo | null>(null);
  const [lineasActuales, setLineasActuales] = useState<LineaComandaInfo[]>([]);

  // Modales
  const [modal, setModal] = useState<ModalActivo>(null);
  const [comandaModal, setComandaModal] = useState<ComandaInfo | null>(null);

  // ── Cargar datos iniciales ─────────────────────────────────
  const cargarComandas = useCallback(async () => {
    try {
      const data = await api.listar_comandas();
      setComandas(data);
    } catch (e) {
      setError(`Error al cargar comandas: ${e}`);
    }
  }, []);

  const cargarProductos = useCallback(async () => {
    try {
      const data = await api.listar_productos();
      setProductos(data);
    } catch (e) {
      console.error('Error cargando productos:', e);
    }
  }, []);

  const cargarConfig = useCallback(async () => {
    try {
      const data = await api.obtener_configuracion();
      setConfig(data);
    } catch (e) {
      console.error('Error cargando config:', e);
    }
  }, []);

  useEffect(() => {
    Promise.all([cargarComandas(), cargarProductos(), cargarConfig()]).finally(() =>
      setCargando(false),
    );
  }, []);

  // ── Flash helper ──────────────────────────────────────────
  const flash = (tipo: 'ok' | 'error', texto: string) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje(null), 3500);
  };

  // ── Cargar detalle de comanda ─────────────────────────────
  const abrirDetalle = async (c: ComandaInfo) => {
    setProcesando(true);
    try {
      const detalle = await api.obtener_detalle_comanda(c.id);
      setComandaActual(detalle.comanda);
      setLineasActuales(detalle.lineas);
      setVista('detalle');
    } catch (e) {
      flash('error', `Error: ${e}`);
    } finally {
      setProcesando(false);
    }
  };

  const volverPanel = async () => {
    setVista('panel');
    setComandaActual(null);
    setLineasActuales([]);
    await cargarComandas();
    await cargarProductos();
  };

  // ── Acciones del Panel ────────────────────────────────────

  const handleCrear = async (nombre: string) => {
    if (!session) return;
    setModal(null);
    setProcesando(true);
    try {
      await api.crear_comanda(session.usuarioId, nombre);
      await cargarComandas();
      flash('ok', `✅ Comanda "${nombre}" creada`);
    } catch (e) {
      flash('error', `❌ Error: ${e}`);
    } finally {
      setProcesando(false);
    }
  };

  const handleEditar = async (nombre: string) => {
    if (!comandaModal) return;
    setModal(null);
    setProcesando(true);
    try {
      await api.editar_nombre_comanda(comandaModal.id, nombre);
      await cargarComandas();
      // Si estamos en detalle de esta misma comanda, actualizarla
      if (comandaActual?.id === comandaModal.id) {
        setComandaActual((prev) => prev ? { ...prev, nombre } : prev);
      }
      flash('ok', `✅ Nombre actualizado`);
    } catch (e) {
      flash('error', `❌ Error: ${e}`);
    } finally {
      setProcesando(false);
      setComandaModal(null);
    }
  };

  const handleEliminar = async () => {
    if (!comandaModal) return;
    setModal(null);
    setProcesando(true);
    try {
      await api.eliminar_comanda(comandaModal.id);
      await cargarComandas();
      await cargarProductos();
      flash('ok', `✅ Comanda eliminada. Stock restaurado.`);
    } catch (e) {
      flash('error', `❌ Error: ${e}`);
    } finally {
      setProcesando(false);
      setComandaModal(null);
    }
  };

  const handleAbrirHistorial = async () => {
    try {
      const data = await api.listar_historial_comandas();
      setHistorial(data);
      setModal('historial');
    } catch (e) {
      flash('error', `❌ Error al cargar historial: ${e}`);
    }
  };

  // ── Acciones del Detalle ──────────────────────────────────

  const handleAgregarProducto = async (p: Producto) => {
    if (!comandaActual || !session) return;
    const tasaNum = parseFloat(config.tasa_cambio_bsd) || 1;
    const precioUnit = getProductPriceUSD(p, tasaNum);
    setProcesando(true);
    try {
      await api.agregar_producto_comanda(
        comandaActual.id,
        p.id,
        1,
        precioUnit.toFixed(4),
        fmt2(precioUnit),
      );
      // Recargar detalle
      const detalle = await api.obtener_detalle_comanda(comandaActual.id);
      setComandaActual(detalle.comanda);
      setLineasActuales(detalle.lineas);
      // Actualizar stock local
      setProductos((prev) =>
        prev.map((prod) => prod.id === p.id ? { ...prod, stock: prod.stock - 1 } : prod),
      );
    } catch (e) {
      flash('error', `❌ ${e}`);
    } finally {
      setProcesando(false);
    }
  };

  const handleEliminarLinea = async (lineaId: string) => {
    if (!comandaActual) return;
    setProcesando(true);
    try {
      await api.eliminar_linea_comanda(comandaActual.id, lineaId);
      const detalle = await api.obtener_detalle_comanda(comandaActual.id);
      setComandaActual(detalle.comanda);
      setLineasActuales(detalle.lineas);
      await cargarProductos();
    } catch (e) {
      flash('error', `❌ ${e}`);
    } finally {
      setProcesando(false);
    }
  };

  const handleCobrar = async (forma: FormaPago, referencia?: string) => {
    if (!comandaActual || !session) return;
    setModal(null);
    setProcesando(true);
    try {
      await api.cobrar_comanda({
        comandaId: comandaActual.id,
        usuarioId: session.usuarioId,
        formaPago: forma,
        moneda: forma.startsWith('USD') ? 'USD' : 'BS',
        referenciaPago: referencia,
        tasaCambio: config.tasa_cambio_bsd,
      });
      flash('ok', '✅ Comanda cobrada exitosamente');
      setTimeout(() => volverPanel(), 1500);
    } catch (e) {
      flash('error', `❌ Error al cobrar: ${e}`);
    } finally {
      setProcesando(false);
    }
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div class="gestor-comandas">
      {vista === 'panel' ? (
        <PanelComandas
          comandas={comandas}
          tasa={config.tasa_cambio_bsd}
          cargando={cargando}
          error={error}
          mensaje={mensaje}
          onCrear={() => setModal('crear')}
          onEditar={(c) => { setComandaModal(c); setModal('editar'); }}
          onEliminar={(c) => { setComandaModal(c); setModal('eliminar'); }}
          onHistorial={handleAbrirHistorial}
          onVerDetalle={abrirDetalle}
        />
      ) : (
        comandaActual && (
          <DetalleComandaVista
            comanda={comandaActual}
            lineas={lineasActuales}
            productos={productos}
            config={config}
            procesando={procesando}
            mensaje={mensaje}
            onVolver={volverPanel}
            onAgregarProducto={handleAgregarProducto}
            onEliminarLinea={handleEliminarLinea}
            onCobrar={() => setModal('pago')}
          />
        )
      )}

      {/* Modales */}
      {modal === 'crear' && (
        <ModalCrear onConfirmar={handleCrear} onCerrar={() => setModal(null)} />
      )}
      {modal === 'editar' && comandaModal && (
        <ModalEditar
          nombreActual={comandaModal.nombre}
          onConfirmar={handleEditar}
          onCerrar={() => { setModal(null); setComandaModal(null); }}
        />
      )}
      {modal === 'eliminar' && comandaModal && (
        <ModalEliminar
          nombre={comandaModal.nombre}
          onConfirmar={handleEliminar}
          onCerrar={() => { setModal(null); setComandaModal(null); }}
        />
      )}
      {modal === 'pago' && comandaActual && (
        <ModalPago
          totalUSD={parseFloat(comandaActual.total) || 0}
          tasa={config.tasa_cambio_bsd}
          onConfirmar={handleCobrar}
          onCerrar={() => setModal(null)}
        />
      )}
      {modal === 'historial' && (
        <ModalHistorial
          historial={historial}
          tasa={config.tasa_cambio_bsd}
          onCerrar={() => setModal(null)}
        />
      )}
    </div>
  );
}
