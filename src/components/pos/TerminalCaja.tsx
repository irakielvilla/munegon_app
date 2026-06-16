// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — TerminalCaja (Preact)
// Interfaz completa del punto de venta
// ══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'preact/hooks';
import { api } from '../../lib/api';
import { getSession, destroySession } from '@lib/auth';
import ModalOverlay from '../ui/ModalOverlay';

// ── Tipos ────────────────────────────────────────────────────

interface Producto {
  id: string;
  sku: string;
  nombre: string;
  precioUSD: string;
  stock: number;
  activo: boolean;
}

interface LineaCarrito {
  producto: Producto;
  cantidad: number;
}

interface ConfigApp {
  tasa_cambio_bsd: string;
  iva_porcentaje: string;
}

type FormaPago = 'USD_EFECTIVO' | 'BS_EFECTIVO' | 'BS_DEBITO' | 'BS_PAGO_MOVIL' | 'CUENTA_COBRAR';
type ModalActivo = null | 'pago' | 'corte';

// ── Tipos Corte X ─────────────────────────────────────────────

interface ResumenDia {
  bsEfectivo: string;
  bsDebito: string;
  bsPagoMovil: string;
  usdEfectivo: string;
}

interface ConteoFisico {
  bsEfectivo: string;
  bsDebito: string;
  bsPagoMovil: string;
  usdEfectivo: string;
}

const NOMBRES_CAMPOS: Record<keyof ConteoFisico, string> = {
  bsEfectivo:  'Efectivo Bs',
  bsDebito:    'Débito Bs',
  bsPagoMovil: 'Pago Móvil Bs',
  usdEfectivo: 'Efectivo $',
};

function detectarCamposEnCero(conteo: ConteoFisico): string[] {
  return (Object.keys(conteo) as (keyof ConteoFisico)[])
    .filter((k) => conteo[k] === '' || parseFloat(conteo[k] || '0') === 0)
    .map((k) => NOMBRES_CAMPOS[k]);
}

// ── Helpers numéricos ─────────────────────────────────────────

const fmt2 = (n: number) => n.toFixed(2);
const fmtBs = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ══════════════════════════════════════════════════════════════
// WIDGET TASA DE CAMBIO
// ══════════════════════════════════════════════════════════════

interface TasaWidgetProps {
  tasa: string;
  onTasaCambiada: (nueva: string) => void;
}

function TasaWidget({ tasa, onTasaCambiada }: TasaWidgetProps) {
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState(tasa);

  useEffect(() => { setDraft(tasa); }, [tasa]);

  const confirmar = async () => {
    const valor = parseFloat(draft);
    if (isNaN(valor) || valor <= 0) {
      setDraft(tasa);
      setEditando(false);
      return;
    }
    const valorStr = fmt2(valor);
    try {
      await api.actualizar_configuracion('tasa_cambio_bsd', valorStr);
      onTasaCambiada(valorStr);
    } catch (e) {
      console.error('Error actualizando tasa:', e);
    }
    setEditando(false);
  };

  const cancelar = () => {
    setDraft(tasa);
    setEditando(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') confirmar();
    if (e.key === 'Escape') cancelar();
  };

  return (
    <div class="tasa-widget">
      <span class="tasa-label">1 USD =</span>
      {editando ? (
        <div class="tasa-edit-group">
          <input
            id="tasa-input"
            class="tasa-input"
            type="number"
            min="0.01"
            step="0.01"
            value={draft}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <span class="tasa-moneda">BsD</span>
          <button id="tasa-confirmar" class="tasa-btn confirm" onClick={confirmar} title="Confirmar (Enter)">✅</button>
          <button id="tasa-cancelar" class="tasa-btn cancel" onClick={cancelar} title="Cancelar (Esc)">❌</button>
        </div>
      ) : (
        <div class="tasa-display-group">
          <span class="tasa-valor">{parseFloat(tasa).toFixed(2)}</span>
          <span class="tasa-moneda">BsD</span>
          <button id="tasa-editar" class="tasa-btn edit" onClick={() => setEditando(true)} title="Editar tasa de cambio">✏️</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// WIDGET RELOJ
// ══════════════════════════════════════════════════════════════

function Reloj() {
  const [fecha, setFecha] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setFecha(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const diaSemana = dias[fecha.getDay()];
  const dia = fecha.getDate();
  const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const anio = fecha.getFullYear().toString().slice(-2);
  const strFecha = `${diaSemana} ${dia}-${mes}-${anio}`;

  let horas = fecha.getHours();
  const minutos = fecha.getMinutes().toString().padStart(2, '0');
  const ampm = horas >= 12 ? 'pm' : 'am';
  horas = horas % 12;
  horas = horas ? horas : 12; 
  const strHora = `${horas}:${minutos}${ampm}`;

  return (
    <div class="reloj-widget">
      <span class="reloj-fecha">{strFecha}</span>
      <span class="reloj-hora">{strHora}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MODAL DE PAGO
// ══════════════════════════════════════════════════════════════

interface ModalPagoProps {
  totalUSD: number;
  tasa: string;
  onConfirmar: (forma: FormaPago, referencia?: string, clienteId?: string) => void;
  onCerrar: () => void;
}

function ModalPago({ totalUSD, tasa, onConfirmar, onCerrar }: ModalPagoProps) {
  const [forma, setForma] = useState<FormaPago>('BS_EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [clientes, setClientes] = useState<any[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [cargandoClientes, setCargandoClientes] = useState(false);

  const tasaNum = parseFloat(tasa) || 1;
  const totalBs = totalUSD * tasaNum;

  const formas: { key: FormaPago; label: string; icon: string }[] = [
    { key: 'USD_EFECTIVO', label: 'USD Efectivo', icon: '💵' },
    { key: 'BS_EFECTIVO', label: 'Bs Efectivo', icon: '💴' },
    { key: 'BS_DEBITO', label: 'Bs Débito', icon: '💳' },
    { key: 'BS_PAGO_MOVIL', label: 'Pago Móvil', icon: '📱' },
    { key: 'CUENTA_COBRAR', label: 'A Crédito', icon: '👥' },
  ];

  useEffect(() => {
    if (forma === 'CUENTA_COBRAR') {
      cargarClientes();
    }
  }, [forma]);

  const cargarClientes = async () => {
    setCargandoClientes(true);
    try {
      const lista = await api.listar_clientes();
      setClientes(lista);
      if (lista.length > 0 && !clienteId) {
        setClienteId(lista[0].id);
      }
    } catch (e) {
      console.error('Error cargando clientes:', e);
    } finally {
      setCargandoClientes(false);
    }
  };

  const handleCrearCliente = async () => {
    if (!nuevoNombre.trim() || !nuevoApellido.trim()) {
      alert('Nombre y apellido son obligatorios.');
      return;
    }
    try {
      const id = await api.crear_cliente(nuevoNombre.trim(), nuevoApellido.trim(), nuevoTelefono.trim() || undefined);
      alert('Cliente creado correctamente');
      setNuevoNombre('');
      setNuevoApellido('');
      setNuevoTelefono('');
      setCreandoCliente(false);
      
      const lista = await api.listar_clientes();
      setClientes(lista);
      setClienteId(id);
    } catch (e) {
      alert(`Error creando cliente: ${e}`);
    }
  };

  const handleConfirmar = () => {
    if (forma === 'BS_PAGO_MOVIL' && !referencia.trim()) {
      alert('La referencia del Pago Móvil es obligatoria.');
      return;
    }
    if (forma === 'CUENTA_COBRAR' && !clienteId) {
      alert('Debes seleccionar un cliente.');
      return;
    }
    onConfirmar(forma, referencia.trim() || undefined, forma === 'CUENTA_COBRAR' ? clienteId : undefined);
  };

  return (
    <ModalOverlay>
      <div class="modal-flex-layout">
        <div class="modal-card">
          <div class="modal-header">
            <h2>💳 Procesar Pago</h2>
            <button class="modal-close" onClick={onCerrar}>✕</button>
          </div>

          <div class="modal-totales">
            <div class="monto-bs">
              <span>Total</span>
              <strong>Bs {fmtBs(totalBs)}</strong>
            </div>
            <div class="monto-usd">
              <span>Equivalente</span>
              <strong>${fmt2(totalUSD)} USD</strong>
            </div>
          </div>

          <p class="modal-section-label">Forma de pago</p>
          <div class="forma-pago-grid">
            {formas.map((f) => (
              <button
                key={f.key}
                id={`forma-${f.key.toLowerCase()}`}
                class={`forma-btn ${forma === f.key ? 'activa' : ''}`}
                onClick={() => setForma(f.key)}
              >
                <span class="forma-icon">{f.icon}</span>
                <span class="forma-label">{f.label}</span>
              </button>
            ))}
          </div>

          {forma === 'BS_PAGO_MOVIL' && (
            <div class="referencia-group">
              <label for="referencia-input">Nº de referencia *</label>
              <input
                id="referencia-input"
                type="text"
                placeholder="Últimos 4 dígitos"
                value={referencia}
                onInput={(e) => {
                  const rawVal = (e.target as HTMLInputElement).value;
                  const numericVal = rawVal.replace(/\D/g, '').slice(0, 4);
                  setReferencia(numericVal);
                }}
                maxLength={4}
              />
            </div>
          )}

          <div class="modal-actions">
            <button class="btn-cancelar" onClick={onCerrar}>Cancelar</button>
            <button
              id="confirmar-pago"
              class={`btn-confirmar ${forma === 'CUENTA_COBRAR' ? 'btn-confirmar--credito' : ''}`}
              onClick={handleConfirmar}
            >
              {forma === 'CUENTA_COBRAR' ? '💾 Guardar Deuda' : '✅ Confirmar Pago'}
            </button>
          </div>
        </div>

        {forma === 'CUENTA_COBRAR' && (
          <div class="cliente-cobrar-lateral">
            {!creandoCliente ? (
              <div class="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label for="cliente-select" style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>Seleccionar Cliente *</label>
                <div class="cliente-select-row">
                  {cargandoClientes ? (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>Cargando clientes...</span>
                  ) : (
                    <select
                      id="cliente-select"
                      value={clienteId}
                      onChange={(e) => setClienteId((e.target as HTMLSelectElement).value)}
                      class="cliente-select"
                    >
                      {clientes.length === 0 ? (
                        <option value="">No hay clientes registrados</option>
                      ) : (
                        clientes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre} {c.apellido}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                  <button
                    type="button"
                    class="btn-nuevo-cliente"
                    onClick={() => setCreandoCliente(true)}
                  >
                    ➕ Nuevo
                  </button>
                </div>
              </div>
            ) : (
              <div class="nuevo-cliente-form">
                <h4>➕ Registrar Nuevo Cliente</h4>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <div class="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <label for="nuevo-nombre" style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>Nombre *</label>
                    <input
                      id="nuevo-nombre"
                      type="text"
                      value={nuevoNombre}
                      onInput={(e) => setNuevoNombre((e.target as HTMLInputElement).value.toUpperCase())}
                      placeholder="Ej. DANIEL"
                      style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', padding: '0.4rem', fontSize: '0.85rem', outline: 'none', textTransform: 'uppercase' }}
                    />
                  </div>
                  <div class="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <label for="nuevo-apellido" style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>Apellido *</label>
                    <input
                      id="nuevo-apellido"
                      type="text"
                      value={nuevoApellido}
                      onInput={(e) => setNuevoApellido((e.target as HTMLInputElement).value.toUpperCase())}
                      placeholder="Ej. TREJO"
                      style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', padding: '0.4rem', fontSize: '0.85rem', outline: 'none', textTransform: 'uppercase' }}
                    />
                  </div>
                </div>
                <div class="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.25rem' }}>
                  <label for="nuevo-telefono" style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>Teléfono (Opcional)</label>
                  <input
                    id="nuevo-telefono"
                    type="text"
                    value={nuevoTelefono}
                    onInput={(e) => setNuevoTelefono((e.target as HTMLInputElement).value)}
                    placeholder="Ej. 04121234567"
                    style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', padding: '0.4rem', fontSize: '0.85rem', outline: 'none' }}
                  />
                </div>
                <div class="nuevo-cliente-actions">
                  <button
                    type="button"
                    class="btn-cancelar-mini"
                    onClick={() => setCreandoCliente(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    class="btn-guardar-mini"
                    onClick={handleCrearCliente}
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}

// ══════════════════════════════════════════════════════════════
// MODAL DE CORTE X — Rediseñado con 2 columnas
// ══════════════════════════════════════════════════════════════

interface ModalCorteXProps {
  tasa: string;
  onConfirmar: (conteo: ConteoFisico, resumen: ResumenDia) => void;
  onCerrar: () => void;
}

// ── Sub-componente: Popup de Advertencia ───────────────────────

interface PopupAdvertenciaProps {
  camposEnCero: string[];
  onConfirmar: () => void;
  onCancelar: () => void;
}

function PopupAdvertencia({ camposEnCero, onConfirmar, onCancelar }: PopupAdvertenciaProps) {
  const esSingular = camposEnCero.length === 1;
  const listaFormateada = camposEnCero
    .map((c) => `"${c.toUpperCase()}"`)
    .join(esSingular ? '' : ' Y ');
  const mensaje = esSingular
    ? `EL CAMPO ${listaFormateada} ESTÁ VACÍO.`
    : `LOS CAMPOS ${listaFormateada} ESTÁN VACÍOS.`;

  return (
    <ModalOverlay isPopup>
      <div class="popup-card">
        <div class="popup-icono">⚠️</div>
        <h3 class="popup-titulo">Advertencia</h3>
        <p class="popup-mensaje">{mensaje}</p>
        <p class="popup-pregunta">¿ESTÁS SEGURO QUE QUIERES HACER EL CORTE X?</p>
        <div class="popup-acciones">
          <button id="popup-no" class="popup-btn-no" onClick={onCancelar}>
            No, revisar
          </button>
          <button id="popup-si" class="popup-btn-si" onClick={onConfirmar}>
            Sí, continuar
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ── Filas del modal ────────────────────────────────────────────

const FILAS_CORTE = [
  { key: 'bsEfectivo'  as keyof ConteoFisico, icono: '💴', label: 'Efectivo Bs',   unidad: 'Bs'  },
  { key: 'bsDebito'    as keyof ConteoFisico, icono: '💳', label: 'Débito Bs',     unidad: 'Bs'  },
  { key: 'bsPagoMovil' as keyof ConteoFisico, icono: '📱', label: 'Pago Móvil Bs', unidad: 'Bs'  },
  { key: 'usdEfectivo' as keyof ConteoFisico, icono: '💵', label: 'Efectivo $',    unidad: 'USD' },
] as const;

// ── Componente principal ───────────────────────────────────────

function ModalCorteX({ onConfirmar, onCerrar }: ModalCorteXProps) {
  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [conteo, setConteo] = useState<ConteoFisico>({
    bsEfectivo: '', bsDebito: '', bsPagoMovil: '', usdEfectivo: '',
  });
  const [camposEnCero, setCamposEnCero] = useState<string[]>([]);
  const [mostrarPopup, setMostrarPopup] = useState(false);

  // Cargar resumen de ventas del turno actual (solo pendientes) al montar
  useEffect(() => {
    api.resumen_ventas_dia(true)
      .then((data) => { setResumen(data); setCargando(false); })
      .catch(() => { setErrorCarga(true); setCargando(false); });
  }, []);

  const actualizarConteo = (campo: keyof ConteoFisico, valor: string) => {
    setConteo((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleRegistrar = () => {
    const ceros = detectarCamposEnCero(conteo);
    if (ceros.length > 0) {
      setCamposEnCero(ceros);
      setMostrarPopup(true);
    } else {
      if (resumen) {
        onConfirmar(conteo, resumen);
      }
    }
  };

  const confirmarDesdePopup = () => {
    setMostrarPopup(false);
    if (resumen) {
      onConfirmar(conteo, resumen);
    }
  };

  // Valor del sistema para cada campo
  const sistemaValor = (key: keyof ConteoFisico): string => {
    if (!resumen) return '0.00';
    const raw = resumen[key];
    const num = parseFloat(raw) || 0;
    return key === 'usdEfectivo'
      ? `$ ${fmt2(num)} USD`
      : `Bs ${fmtBs(num)}`;
  };

  return (
    <ModalOverlay>
      <div class="modal-card modal-corte">

        {/* ── Encabezado ── */}
        <div class="modal-header corte-header">
          <h2>📊 Corte de Caja — Turno X</h2>
          <button class="modal-close" onClick={onCerrar}>✕</button>
        </div>

        {/* ── Cuerpo: 2 columnas ── */}
        {cargando ? (
          <div class="corte-cargando">
            <span class="spinner">⏳</span> Cargando datos del día…
          </div>
        ) : errorCarga ? (
          <div class="corte-error">❌ No se pudo cargar el resumen del día.</div>
        ) : (
          <div class="corte-columnas">
            {/* Encabezados de columna */}
            <div class="corte-col-header">SISTEMA (HOY)</div>
            <div class="corte-col-header">CONTEO FÍSICO</div>

            {/* Filas de forma de pago */}
            {FILAS_CORTE.map((fila) => (
              <>
                {/* Columna izquierda: sistema */}
                <div class="corte-celda corte-celda-sistema">
                  <span class="corte-fila-icono">{fila.icono}</span>
                  <div class="corte-fila-info">
                    <span class="corte-fila-label">{fila.label}</span>
                    <strong class="corte-monto-sistema">{sistemaValor(fila.key)}</strong>
                  </div>
                </div>

                {/* Columna derecha: input del cajero */}
                <div class="corte-celda corte-celda-conteo">
                  <div class="conteo-input-wrapper">
                    <input
                      id={`conteo-${fila.key}`}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={conteo[fila.key]}
                      onInput={(e) =>
                        actualizarConteo(fila.key, (e.target as HTMLInputElement).value)
                      }
                      class="conteo-input"
                    />
                    <span class="conteo-unidad">{fila.unidad}</span>
                  </div>
                </div>
              </>
            ))}
          </div>
        )}

        {/* ── Nota: sin auto-logout ── */}
        <p class="corte-advertencia">
          ℹ️ Al confirmar se registrará el corte. Puedes cerrar sesión desde el menú lateral cuando lo decidas.
        </p>

        {/* ── Acciones ── */}
        <div class="modal-actions">
          <button class="btn-cancelar" onClick={onCerrar}>Cancelar</button>
          <button
            id="confirmar-corte"
            class="btn-confirmar btn-corte"
            onClick={handleRegistrar}
            disabled={cargando}
          >
            📊 Registrar Corte X
          </button>
        </div>

        {/* ── Popup de advertencia campos en 0 ── */}
        {mostrarPopup && (
          <PopupAdvertencia
            camposEnCero={camposEnCero}
            onConfirmar={confirmarDesdePopup}
            onCancelar={() => setMostrarPopup(false)}
          />
        )}
      </div>
    </ModalOverlay>
  );
}

// ══════════════════════════════════════════════════════════════
// TERMINAL CAJA — Componente Principal
// ══════════════════════════════════════════════════════════════

export default function TerminalCaja() {
  const session = getSession();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [config, setConfig] = useState<ConfigApp>({ tasa_cambio_bsd: '1.00', iva_porcentaje: '16' });
  const [modalActivo, setModalActivo] = useState<ModalActivo>(null);
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Carga inicial
  useEffect(() => {
    cargarProductos();
    cargarConfig();
  }, []);

  const cargarProductos = async () => {
    try {
      const data = await api.listar_productos();
      setProductos(data.filter((p) => p.activo && p.stock > 0));
    } catch (e) {
      console.error('Error cargando productos:', e);
    }
  };

  const cargarConfig = async () => {
    try {
      const data = await api.obtener_configuracion();
      setConfig(data);
    } catch (e) {
      console.error('Error cargando config:', e);
    }
  };

  // ── Carrito ───────────────────────────────────────────────

  const agregarAlCarrito = useCallback((producto: Producto) => {
    setCarrito((prev) => {
      const idx = prev.findIndex((l) => l.producto.id === producto.id);
      if (idx >= 0) {
        if (prev[idx].cantidad >= producto.stock) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], cantidad: next[idx].cantidad + 1 };
        return next;
      }
      return [...prev, { producto, cantidad: 1 }];
    });
  }, []);

  const cambiarCantidad = (productoId: string, delta: number) => {
    setCarrito((prev) => {
      return prev
        .map((l) => {
          if (l.producto.id !== productoId) return l;
          const nueva = l.cantidad + delta;
          if (nueva <= 0) return null as unknown as LineaCarrito;
          if (nueva > l.producto.stock) return l;
          return { ...l, cantidad: nueva };
        })
        .filter(Boolean);
    });
  };

  const cambiarCantidadAbsoluta = (productoId: string, nueva: number) => {
    setCarrito((prev) => {
      return prev
        .map((l) => {
          if (l.producto.id !== productoId) return l;
          if (nueva <= 0) return null as unknown as LineaCarrito;
          const cantFinal = nueva > l.producto.stock ? l.producto.stock : nueva;
          return { ...l, cantidad: cantFinal };
        })
        .filter(Boolean);
    });
  };

  const vaciarCarrito = () => setCarrito([]);

  // ── Totales ───────────────────────────────────────────────

  const subtotalUSD = carrito.reduce(
    (acc, l) => acc + parseFloat(l.producto.precioUSD) * l.cantidad,
    0,
  );
  const ivaPorc = parseFloat(config.iva_porcentaje) / 100;
  const impuestoUSD = subtotalUSD * ivaPorc;
  const totalUSD = subtotalUSD + impuestoUSD;
  const tasaNum = parseFloat(config.tasa_cambio_bsd) || 1;

  // ── Pago ──────────────────────────────────────────────────

  const procesarPago = async (forma: FormaPago, referencia?: string, clienteId?: string) => {
    if (!session) return;
    setProcesando(true);
    setModalActivo(null);
    try {
      if (forma === 'CUENTA_COBRAR') {
        if (!clienteId) throw new Error('Cliente no seleccionado');
        await api.crear_deuda({
          clienteId,
          usuarioId: session.usuarioId,
          subtotal: fmt2(subtotalUSD),
          impuesto: fmt2(impuestoUSD),
          total: fmt2(totalUSD),
          lineas: carrito.map((l) => ({
            productoId: l.producto.id,
            cantidad: l.cantidad,
            precioUnit: l.producto.precioUSD,
            subtotal: fmt2(parseFloat(l.producto.precioUSD) * l.cantidad),
          })),
        });
        setMensaje({ tipo: 'ok', texto: '✅ Cuenta por cobrar registrada correctamente' });
      } else {
        await api.crear_venta({
          usuarioId: session.usuarioId,
          subtotal: fmt2(subtotalUSD),
          impuesto: fmt2(impuestoUSD),
          total: fmt2(totalUSD),
          formaPago: forma,
          moneda: forma.startsWith('USD') ? 'USD' : 'BS',
          referenciaPago: referencia ?? null,
          tasaCambio: config.tasa_cambio_bsd,
          lineas: carrito.map((l) => ({
            productoId: l.producto.id,
            cantidad: l.cantidad,
            precioUnit: l.producto.precioUSD,
            subtotal: fmt2(parseFloat(l.producto.precioUSD) * l.cantidad),
          })),
        });
        setMensaje({ tipo: 'ok', texto: '✅ Venta registrada correctamente' });
      }
      vaciarCarrito();
      cargarProductos(); // refresca stock
    } catch (e) {
      setMensaje({ tipo: 'error', texto: `❌ Error: ${e}` });
    } finally {
      setProcesando(false);
      setTimeout(() => setMensaje(null), 3500);
    }
  };

  // ── Corte X ───────────────────────────────────────────────

  const procesarCorteX = async (conteo: ConteoFisico, resumen: ResumenDia) => {
    if (!session) return;
    setProcesando(true);
    setModalActivo(null);
    try {
      const tasa = parseFloat(config.tasa_cambio_bsd) || 1;

      // Calcular el total calculado real del sistema (desde el resumen del turno)
      const sysBs = (parseFloat(resumen.bsEfectivo) || 0)
        + (parseFloat(resumen.bsDebito) || 0)
        + (parseFloat(resumen.bsPagoMovil) || 0);
      const sysUSD = parseFloat(resumen.usdEfectivo) || 0;
      const sysTotalUsdEquiv = sysBs / tasa + sysUSD;

      // Calcular el total declarado por el cajero
      const declaradoBs = (parseFloat(conteo.bsEfectivo) || 0)
        + (parseFloat(conteo.bsDebito) || 0)
        + (parseFloat(conteo.bsPagoMovil) || 0);
      const declaradoUSD = (parseFloat(conteo.usdEfectivo) || 0);
      const declaradoTotalUsdEquiv = declaradoBs / tasa + declaradoUSD;

      // Guardar totalDeclarado como JSON del conteo por forma de pago
      const totalDeclaradoStr = JSON.stringify({
        bsEfectivo:  fmt2(parseFloat(conteo.bsEfectivo)  || 0),
        bsDebito:    fmt2(parseFloat(conteo.bsDebito)    || 0),
        bsPagoMovil: fmt2(parseFloat(conteo.bsPagoMovil) || 0),
        usdEfectivo: fmt2(declaradoUSD),
        totalUsdEquiv: fmt2(declaradoTotalUsdEquiv),
        tasaCambio: config.tasa_cambio_bsd,
      });

      const corteId = await api.registrar_corte_caja({
        tipo: 'X',
        usuarioId: session.usuarioId,
        totalCalculado: fmt2(sysTotalUsdEquiv),
        totalDeclarado: totalDeclaradoStr,
        diferencia: fmt2(declaradoTotalUsdEquiv - sysTotalUsdEquiv),
      });

      // Generar y descargar el PDF de este Corte X
      await api.generar_pdf_corte({ corteId });

      setMensaje({ tipo: 'ok', texto: '✅ Corte X registrado y PDF generado. La sesión permanece activa.' });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: `❌ Error en corte: ${e}` });
    } finally {
      setProcesando(false);
      setTimeout(() => setMensaje(null), 5000);
    }
  };

  // ── Filtro de productos ───────────────────────────────────

  const productosFiltrados = productos.filter(
    (p) =>
      busqueda === '' ||
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.sku.toLowerCase().includes(busqueda.toLowerCase()),
  );

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════

  return (
    <div class="terminal-caja">
      {/* ── Barra Superior ── */}
      <header class="caja-header">
        <div class="caja-header-left">
          <span class="logo-text">Muñegon <span class="logo-pos">POS</span></span>
          <span class="cajero-badge">
            {session?.rol === 'ADMIN' ? '👑' : '🧑‍💼'} {session?.nombre}
          </span>
        </div>

        <TasaWidget
          tasa={config.tasa_cambio_bsd}
          onTasaCambiada={(nueva) => setConfig((c) => ({ ...c, tasa_cambio_bsd: nueva }))}
        />

        <div class="caja-header-right">
          <Reloj />
          <button
            id="btn-corte-x"
            class="btn-corte-x"
            onClick={() => setModalActivo('corte')}
            disabled={procesando}
          >
            📊 Corte X
          </button>
        </div>
      </header>

      {/* ── Mensaje flash ── */}
      {mensaje && (
        <div class={`flash-msg flash-${mensaje.tipo}`}>{mensaje.texto}</div>
      )}

      {/* ── Cuerpo ── */}
      <div class="caja-body">
        {/* ── Panel Izquierdo: Productos ── */}
        <section class="panel-productos">
          <div class="busqueda-bar">
            <span class="busqueda-icon">🔍</span>
            <input
              id="busqueda-productos"
              type="text"
              placeholder="Buscar por nombre..."
              value={busqueda}
              onInput={(e) => setBusqueda((e.target as HTMLInputElement).value)}
              class="busqueda-input"
            />
          </div>

          <div class="productos-grid">
            {productosFiltrados.length === 0 ? (
              <div class="empty-state">
                {busqueda ? 'Sin resultados' : 'No hay productos disponibles'}
              </div>
            ) : (
              productosFiltrados.map((p) => {
                const enCarrito = carrito.find((l) => l.producto.id === p.id);
                return (
                  <button
                    key={p.id}
                    id={`prod-${p.id}`}
                    class={`producto-card ${enCarrito ? 'en-carrito' : ''}`}
                    onClick={() => agregarAlCarrito(p)}
                  >
                    <span class="prod-nombre">{p.nombre}</span>
                    <span class="prod-sku">{p.sku}</span>
                    <span class={`prod-stock ${p.stock <= 5 ? 'stock-bajo' : ''}`}>
                      Stock: {p.stock}
                    </span>
                    <div class="prod-footer">
                      <div class="prod-precio-container">
                        <span class="prod-precio">Bs {fmtBs(parseFloat(p.precioUSD) * tasaNum)}</span>
                        <span class="prod-precio-usd">${parseFloat(p.precioUSD).toFixed(2)} USD</span>
                      </div>
                    </div>
                    {enCarrito && (
                      <span class="prod-badge">{enCarrito.cantidad}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* ── Panel Derecho: Carrito ── */}
        <aside class="panel-carrito">
          <div class="carrito-header">
            <h3>🛒 Carrito</h3>
            {carrito.length > 0 && (
              <button class="btn-vaciar" onClick={vaciarCarrito}>🗑 Vaciar</button>
            )}
          </div>

          <div class="carrito-lista">
            {carrito.length === 0 ? (
              <div class="carrito-empty">Agrega productos para comenzar</div>
            ) : (
              carrito.map((l) => (
                <div key={l.producto.id} class="carrito-linea">
                  <div class="linea-info">
                    <span class="linea-nombre">{l.producto.nombre}</span>
                    <span class="linea-precio">
                      Bs {fmtBs(parseFloat(l.producto.precioUSD) * l.cantidad * tasaNum)}
                    </span>
                  </div>
                  <div class="linea-controls">
                    <button
                      id={`menos-${l.producto.id}`}
                      class="qty-btn"
                      onClick={() => cambiarCantidad(l.producto.id, -1)}
                    >−</button>
                    <input
                      id={`qty-input-${l.producto.id}`}
                      class="qty-num-input"
                      type="number"
                      min="1"
                      max={l.producto.stock}
                      value={l.cantidad}
                      onInput={(e) => {
                        const val = parseInt((e.target as HTMLInputElement).value, 10);
                        if (!isNaN(val)) {
                          cambiarCantidadAbsoluta(l.producto.id, val);
                        }
                      }}
                      onBlur={(e) => {
                        const val = parseInt((e.target as HTMLInputElement).value, 10);
                        if (isNaN(val) || val <= 0) {
                          cambiarCantidadAbsoluta(l.producto.id, 1);
                        }
                      }}
                    />
                    <button
                      id={`mas-${l.producto.id}`}
                      class="qty-btn"
                      onClick={() => cambiarCantidad(l.producto.id, 1)}
                      disabled={l.cantidad >= l.producto.stock}
                    >+</button>
                    <button
                      id={`eliminar-${l.producto.id}`}
                      class="qty-btn btn-eliminar-item"
                      onClick={() => cambiarCantidadAbsoluta(l.producto.id, 0)}
                      title="Eliminar producto"
                    >✕</button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totalizador */}
          <div class="totalizador">
            <div class="total-row">
              <span>Subtotal</span>
              <span>Bs {fmtBs(subtotalUSD * tasaNum)}</span>
            </div>
            <div class="total-row">
              <span>IVA ({config.iva_porcentaje}%)</span>
              <span>Bs {fmtBs(impuestoUSD * tasaNum)}</span>
            </div>
            <div class="total-row total-final">
              <span>TOTAL</span>
              <span>Bs {fmtBs(totalUSD * tasaNum)}</span>
            </div>
            <div class="total-usd-secundario">
              $ {fmt2(totalUSD)} USD
            </div>

            <button
              id="btn-cobrar"
              class="btn-cobrar"
              disabled={carrito.length === 0 || procesando}
              onClick={() => setModalActivo('pago')}
            >
              {procesando ? '⏳ Procesando…' : `💳 Cobrar Bs ${fmtBs(totalUSD * tasaNum)}`}
            </button>
          </div>
        </aside>
      </div>

      {/* ── Modales ── */}
      {modalActivo === 'pago' && (
        <ModalPago
          totalUSD={totalUSD}
          tasa={config.tasa_cambio_bsd}
          onConfirmar={procesarPago}
          onCerrar={() => setModalActivo(null)}
        />
      )}

      {modalActivo === 'corte' && (
        <ModalCorteX
          tasa={config.tasa_cambio_bsd}
          onConfirmar={procesarCorteX}
          onCerrar={() => setModalActivo(null)}
        />
      )}
    </div>
  );
}
