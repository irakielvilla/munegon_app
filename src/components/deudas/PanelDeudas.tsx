import { useState, useEffect } from 'preact/hooks';
import { api, parseLocalDate } from '../../lib/api';
import { getSession } from '../../lib/auth';
import ModalOverlay from '../ui/ModalOverlay';

interface ClienteInfo {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  activo: boolean;
}

interface LineaDeudaInfo {
  id: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnit: string;
  subtotal: string;
}

interface DeudaInfo {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  subtotal: string;
  impuesto: string;
  total: string;
  creadoEn: string;
  lineas: LineaDeudaInfo[];
}

interface ConfigApp {
  tasa_cambio_bsd: string;
  iva_porcentaje: string;
}

interface ModalPagoDeudaProps {
  totalUSD: number;
  tasa: string;
  onConfirmar: (forma: string, referencia?: string) => void;
  onCerrar: () => void;
}

function ModalPagoDeuda({ totalUSD, tasa, onConfirmar, onCerrar }: ModalPagoDeudaProps) {
  const [forma, setForma] = useState<string>('BS_EFECTIVO');
  const [referencia, setReferencia] = useState('');

  const tasaNum = parseFloat(tasa) || 1;
  const totalBs = totalUSD * tasaNum;

  const formas = [
    { key: 'USD_EFECTIVO', label: 'USD Efectivo', icon: '💵' },
    { key: 'BS_EFECTIVO', label: 'Bs Efectivo', icon: '💴' },
    { key: 'BS_DEBITO', label: 'Bs Débito', icon: '💳' },
    { key: 'BS_PAGO_MOVIL', label: 'Pago Móvil', icon: '📱' },
  ];

  const handleConfirmar = () => {
    if (forma === 'BS_PAGO_MOVIL' && !referencia.trim()) {
      alert('La referencia del Pago Móvil es obligatoria.');
      return;
    }
    onConfirmar(forma, referencia.trim() || undefined);
  };

  return (
    <ModalOverlay>
      <div class="modal-card">
        <div class="modal-header">
          <h2>💳 Registrar Pago de Deuda</h2>
          <button class="modal-close" onClick={onCerrar}>✕</button>
        </div>

        <div class="modal-totales">
          <div class="monto-bs">
            <span>Total</span>
            <strong>Bs {totalBs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}</strong>
          </div>
          <div class="monto-usd">
            <span>Equivalente</span>
            <strong>${totalUSD.toFixed(2)} USD</strong>
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

        <div class="modal-actions" style={{ marginTop: '1.5rem' }}>
          <button class="btn-cancelar" onClick={onCerrar}>Cancelar</button>
          <button id="confirmar-pago" class="btn-confirmar" onClick={handleConfirmar}>
            ✅ Confirmar Pago
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

const fmtBs = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const formatFecha = (isoStr: string) => {
  try {
    const dateObj = parseLocalDate(isoStr);
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaNombre = diasSemana[dateObj.getDay()];
    const dia = dateObj.getDate();
    const mes = dateObj.getMonth() + 1;
    const anio = dateObj.getFullYear();

    let horas = dateObj.getHours();
    const minutos = dateObj.getMinutes().toString().padStart(2, '0');
    const ampm = horas >= 12 ? 'pm' : 'am';
    horas = horas % 12;
    horas = horas ? horas : 12;

    return `${diaNombre} ${dia}-${mes}-${anio} a las ${horas}:${minutos}${ampm}`;
  } catch (e) {
    return isoStr;
  }
};

export default function PanelDeudas() {
  const [clientes, setClientes] = useState<ClienteInfo[]>([]);
  const [totalesCliente, setTotalesCliente] = useState<Record<string, number>>({});
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteInfo | null>(null);
  const [deudas, setDeudas] = useState<DeudaInfo[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [cargandoDetalles, setCargandoDetalles] = useState(false);

  // Estados de cobro
  const [config, setConfig] = useState<ConfigApp>({ tasa_cambio_bsd: '1.00', iva_porcentaje: '16' });
  const [modoCobroActivo, setModoCobroActivo] = useState(false);
  const [lineasSeleccionadas, setLineasSeleccionadas] = useState<Record<string, { deudaId: string; subtotal: number; impuesto: number }>>({});
  const [modalPagoOpen, setModalPagoOpen] = useState(false);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    cargarClientes();
    cargarConfig();
  }, []);

  const cargarConfig = async () => {
    try {
      const data = await api.obtener_configuracion();
      setConfig(data);
    } catch (e) {
      console.error('Error cargando configuración:', e);
    }
  };

  const cargarClientes = async () => {
    setCargandoLista(true);
    try {
      const lista = await api.listar_clientes();
      setClientes(lista);

      const mapTotales: Record<string, number> = {};
      for (const c of lista) {
        const dList = await api.listar_deudas_cliente(c.id);
        const total = dList.reduce((acc, curr) => acc + parseFloat(curr.total), 0);
        mapTotales[c.id] = total;
      }
      setTotalesCliente(mapTotales);

      // Auto-seleccionar primer cliente si hay alguno y no tenemos ninguno seleccionado aún
      if (lista.length > 0 && !clienteSeleccionado) {
        seleccionarCliente(lista[0]);
      }
    } catch (e) {
      console.error('Error cargando clientes de deudas:', e);
    } finally {
      setCargandoLista(false);
    }
  };

  const seleccionarCliente = async (cliente: ClienteInfo) => {
    setClienteSeleccionado(cliente);
    setCargandoDetalles(true);
    // Limpiar selección de cobro al cambiar de cliente
    setModoCobroActivo(false);
    setLineasSeleccionadas({});
    try {
      const dList = await api.listar_deudas_cliente(cliente.id);
      setDeudas(dList);
    } catch (e) {
      console.error('Error cargando deudas del cliente:', e);
    } finally {
      setCargandoDetalles(false);
    }
  };

  const toggleLinea = (deuda: DeudaInfo, linea: LineaDeudaInfo) => {
    setLineasSeleccionadas((prev) => {
      const copy = { ...prev };
      if (copy[linea.id]) {
        delete copy[linea.id];
      } else {
        const subtotal = parseFloat(linea.subtotal) || 0;
        const origSubtotal = parseFloat(deuda.subtotal) || 1;
        const origImpuesto = parseFloat(deuda.impuesto) || 0;
        const ratio = origImpuesto / origSubtotal;
        const impuesto = subtotal * ratio;

        copy[linea.id] = {
          deudaId: deuda.id,
          subtotal,
          impuesto,
        };
      }
      return copy;
    });
  };

  const procesarPagoDeuda = async (forma: string, referencia?: string) => {
    const session = getSession();
    if (!session) {
      alert('Sesión no encontrada. Por favor inicia sesión nuevamente.');
      return;
    }

    setProcesando(true);
    setModalPagoOpen(false);

    try {
      const lineasAPagar = Object.entries(lineasSeleccionadas).map(([lineaId, info]) => ({
        deudaId: info.deudaId,
        lineaId,
      }));

      await api.pagar_deudas_productos({
        usuarioId: session.usuarioId,
        formaPago: forma,
        moneda: forma.startsWith('USD') ? 'USD' : 'BS',
        referenciaPago: referencia,
        tasaCambio: config.tasa_cambio_bsd,
        lineasAPagar,
      });

      alert('Pago de deudas registrado correctamente');
      setModoCobroActivo(false);
      setLineasSeleccionadas({});

      // Recargar datos
      if (clienteSeleccionado) {
        seleccionarCliente(clienteSeleccionado);
      }
      cargarClientes();
    } catch (e) {
      alert(`Error al procesar el pago: ${e}`);
    } finally {
      setProcesando(false);
    }
  };

  const totalAcumulado = clienteSeleccionado
    ? (totalesCliente[clienteSeleccionado.id] || 0)
    : 0;

  const tasaNum = parseFloat(config.tasa_cambio_bsd) || 1;

  // Totales de la selección actual
  const selectedSubtotal = Object.values(lineasSeleccionadas).reduce((acc, curr) => acc + curr.subtotal, 0);
  const selectedImpuesto = Object.values(lineasSeleccionadas).reduce((acc, curr) => acc + curr.impuesto, 0);
  const selectedTotal = selectedSubtotal + selectedImpuesto;

  return (
    <div class="deudas-container">
      {/* Lateral izquierdo: Lista de clientes deudores */}
      <aside class="deudas-sidebar">
        <div class="deudas-sidebar-header">
          👥 Clientes de Cuentas por Cobrar
        </div>
        <div class="deudas-client-list">
          {cargandoLista && clientes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text2)' }}>
              Cargando catálogo...
            </div>
          ) : clientes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text2)', fontSize: '0.85rem' }}>
              No hay clientes registrados en cuentas por cobrar.
            </div>
          ) : (
            clientes.map((c) => {
              const activo = clienteSeleccionado?.id === c.id;
              const total = totalesCliente[c.id] || 0;
              return (
                <button
                  key={c.id}
                  class={`deudas-client-card ${activo ? 'activo' : ''}`}
                  onClick={() => seleccionarCliente(c)}
                >
                  <div class="deudas-client-info-block">
                    <div class="deudas-client-name">{c.nombre} {c.apellido}</div>
                    {c.telefono && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginTop: '0.1rem' }}>
                        📞 {c.telefono}
                      </div>
                    )}
                  </div>
                  <div class="deudas-client-total">
                    ${fmtBs(total)}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Pane central: Detalle de deudas del cliente seleccionado */}
      <main class="deudas-main">
        {!clienteSeleccionado ? (
          <div class="deudas-main-empty">
            <span class="deudas-empty-icon">👥</span>
            <span>Selecciona un cliente para ver su cuenta por cobrar</span>
          </div>
        ) : (
          <>
            {/* Header del Main */}
            <div class="deudas-main-header">
              <div>
                <h2>{clienteSeleccionado.nombre} {clienteSeleccionado.apellido}</h2>
                {clienteSeleccionado.telefono && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text2)', margin: '0.25rem 0 0 0' }}>
                    Teléfono: {clienteSeleccionado.telefono}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div class="deudas-total-acumulado">
                  <span>Deuda Total Pendiente</span>
                  <strong>${fmtBs(totalAcumulado)} USD</strong>
                </div>
                {deudas.length > 0 && (
                  <button
                    class={`btn-cobrar-deuda-trigger ${modoCobroActivo ? 'cancelar' : ''}`}
                    onClick={() => {
                      if (modoCobroActivo) {
                        setModoCobroActivo(false);
                        setLineasSeleccionadas({});
                      } else {
                        setModoCobroActivo(true);
                      }
                    }}
                  >
                    {modoCobroActivo ? '❌ Cancelar Cobro' : 'Cobrar Deuda'}
                  </button>
                )}
              </div>
            </div>

            {/* Lista de deudas desglosada por sesiones/fechas */}
            {cargandoDetalles ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text2)' }}>
                ⏳ Cargando desglose de deudas...
              </div>
            ) : deudas.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text2)', fontSize: '0.9rem' }}>
                ✅ Este cliente no tiene cuentas pendientes de pago.
              </div>
            ) : (
              <>
                <div class="deudas-sessions-list">
                  {deudas.map((d) => (
                    <div key={d.id} class="deuda-session-card">
                      {/* Encabezado de la transacción/sesión de compra */}
                      <div class="deuda-session-header">
                        <span class="deuda-session-date">
                          📅 Compra: {formatFecha(d.creadoEn)}
                        </span>
                        <span class="deuda-session-total">
                          Total compra: ${fmtBs(parseFloat(d.total))} USD
                        </span>
                      </div>
                      {/* Detalle de productos llevados ese día */}
                      <div class="deuda-session-details">
                        <table class="deuda-items-table">
                          <thead>
                            <tr>
                              {modoCobroActivo && <th style={{ width: '40px', textAlign: 'center' }}></th>}
                              <th>Producto</th>
                              <th style={{ textAlign: 'center' }}>Cantidad</th>
                              <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                              <th style={{ textAlign: 'right' }}>Subtotal</th>
                              <th style={{ textAlign: 'right' }}>Subtotal en Bs</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.lineas.map((linea) => (
                              <tr key={linea.id}>
                                {modoCobroActivo && (
                                  <td style={{ textAlign: 'center' }}>
                                    <input
                                      type="checkbox"
                                      checked={!!lineasSeleccionadas[linea.id]}
                                      onChange={() => toggleLinea(d, linea)}
                                      style={{ cursor: 'pointer', scale: '1.2' }}
                                    />
                                  </td>
                                )}
                                <td>{linea.productoNombre}</td>
                                <td style={{ textAlign: 'center' }}>{linea.cantidad}</td>
                                <td style={{ textAlign: 'right' }}>${fmtBs(parseFloat(linea.precioUnit))}</td>
                                <td style={{ textAlign: 'right' }}>${fmtBs(parseFloat(linea.subtotal))}</td>
                                <td style={{ textAlign: 'right' }}>Bs {fmtBs(parseFloat(linea.subtotal) * tasaNum)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Panel de checkout inferior consolidado */}
                {modoCobroActivo && (
                  <div class="deuda-cobro-main-footer">
                    <div class="deuda-cobro-main-totales">
                      <div class="deuda-cobro-main-totales-item">
                        <span>Productos Marcados</span>
                        <strong>{Object.keys(lineasSeleccionadas).length}</strong>
                      </div>
                      <div class="deuda-cobro-main-totales-item">
                        <span>Subtotal</span>
                        <strong>${fmtBs(selectedSubtotal)} USD</strong>
                        <span class="total-bs">({fmtBs(selectedSubtotal * tasaNum)} Bs)</span>
                      </div>
                      <div class="deuda-cobro-main-totales-item">
                        <span>Total (con IVA)</span>
                        <strong style={{ color: 'var(--accent2)' }}>${fmtBs(selectedTotal)} USD</strong>
                        <span class="total-bs">({fmtBs(selectedTotal * tasaNum)} Bs)</span>
                      </div>
                    </div>
                    <div class="deuda-cobro-main-acciones">
                      <button
                        class="btn-cancelar-cobro-main"
                        onClick={() => {
                          setModoCobroActivo(false);
                          setLineasSeleccionadas({});
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        class="btn-confirmar-cobro-main"
                        onClick={() => setModalPagoOpen(true)}
                        disabled={selectedSubtotal <= 0 || procesando}
                      >
                        {procesando ? 'Procesando...' : '💵 Cobrar Selección'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Modal de Pago */}
        {modalPagoOpen && (
          <ModalPagoDeuda
            totalUSD={selectedTotal}
            tasa={config.tasa_cambio_bsd}
            onConfirmar={procesarPagoDeuda}
            onCerrar={() => setModalPagoOpen(false)}
          />
        )}
      </main>
    </div>
  );
}
