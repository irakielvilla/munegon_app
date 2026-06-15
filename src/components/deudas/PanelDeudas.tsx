import { useState, useEffect } from 'preact/hooks';
import { api, parseLocalDate } from '../../lib/api';

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

  useEffect(() => {
    cargarClientes();
  }, []);

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
      
      // Auto-seleccionar primer cliente si hay alguno
      if (lista.length > 0) {
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
    try {
      const dList = await api.listar_deudas_cliente(cliente.id);
      setDeudas(dList);
    } catch (e) {
      console.error('Error cargando deudas del cliente:', e);
    } finally {
      setCargandoDetalles(false);
    }
  };

  const totalAcumulado = clienteSeleccionado 
    ? (totalesCliente[clienteSeleccionado.id] || 0) 
    : 0;

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
              <div class="deudas-total-acumulado">
                <span>Deuda Total Pendiente</span>
                <strong>${fmtBs(totalAcumulado)} USD</strong>
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
                            <th>Producto</th>
                            <th style={{ textAlign: 'center' }}>Cantidad</th>
                            <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                            <th style={{ textAlign: 'right' }}>Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.lineas.map((linea) => (
                            <tr key={linea.id}>
                              <td>{linea.productoNombre}</td>
                              <td style={{ textAlign: 'center' }}>{linea.cantidad}</td>
                              <td style={{ textAlign: 'right' }}>${fmtBs(parseFloat(linea.precioUnit))}</td>
                              <td style={{ textAlign: 'right' }}>${fmtBs(parseFloat(linea.subtotal))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
