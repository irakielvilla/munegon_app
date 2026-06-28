import { useState, useEffect } from 'preact/hooks';
import { Component } from 'preact';

class ErrorBoundary extends Component<any, { hasError: boolean; error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: 'red', background: '#fff', height: '100vh' }}>
          <h2>Algo falló en la pantalla de deudas:</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {this.state.error?.toString()}
          </pre>
          <pre style={{ fontSize: '0.8rem', marginTop: '1rem', color: '#555' }}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

import { api, isTauri, parseLocalDate } from '../../lib/api';
import { getSession } from '../../lib/auth';
import ModalOverlay from '../ui/ModalOverlay';

interface ClienteInfo {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  activo: boolean;
  observaciones?: string | null;
}

interface LineaDeudaInfo {
  id: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnit: string;
  subtotal: string;
  pagada: boolean;
}

interface DeudaInfo {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  subtotal: string;
  impuesto: string;
  total: string;
  creadoEn: string;
  pagada: boolean;
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

interface ModalClienteProps {
  initialNombre?: string;
  initialApellido?: string;
  initialTelefono?: string;
  isEditing?: boolean;
  onConfirmar: (nombre: string, apellido: string, telefono?: string) => Promise<void>;
  onCerrar: () => void;
}

function ModalCliente({ initialNombre = '', initialApellido = '', initialTelefono = '', isEditing = false, onConfirmar, onCerrar }: ModalClienteProps) {
  const [nuevoNombre, setNuevoNombre] = useState(initialNombre);
  const [nuevoApellido, setNuevoApellido] = useState(initialApellido);
  const [nuevoTelefono, setNuevoTelefono] = useState(initialTelefono);
  const [procesando, setProcesando] = useState(false);

  const guardar = async () => {
    if (!nuevoNombre.trim() || !nuevoApellido.trim()) {
      alert('Nombre y apellido son obligatorios.');
      return;
    }
    setProcesando(true);
    try {
      await onConfirmar(nuevoNombre.trim(), nuevoApellido.trim(), nuevoTelefono.trim() || undefined);
      onCerrar();
    } catch (e) {
      alert(`Error ${isEditing ? 'editando' : 'creando'} cliente: ${e}`);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <ModalOverlay>
      <div class="modal-card" style={{ maxWidth: '400px' }}>
        <div class="modal-header">
          <h2>{isEditing ? '✏️ Editar Cliente' : '➕ Registrar Nuevo Cliente'}</h2>
          <button class="modal-close" onClick={onCerrar}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <div class="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <label for="nuevo-nombre" style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>Nombre *</label>
            <input
              id="nuevo-nombre"
              type="text"
              value={nuevoNombre}
              onInput={e => setNuevoNombre((e.target as HTMLInputElement).value.toUpperCase())}
              placeholder="Ej. DANIEL"
              style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', padding: '0.6rem', fontSize: '0.95rem', outline: 'none', textTransform: 'uppercase' }}
              autoFocus
            />
          </div>
          <div class="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <label for="nuevo-apellido" style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>Apellido *</label>
            <input
              id="nuevo-apellido"
              type="text"
              value={nuevoApellido}
              onInput={e => setNuevoApellido((e.target as HTMLInputElement).value.toUpperCase())}
              placeholder="Ej. TREJO"
              style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', padding: '0.6rem', fontSize: '0.95rem', outline: 'none', textTransform: 'uppercase' }}
            />
          </div>
          <div class="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <label for="nuevo-telefono" style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>Teléfono (opcional)</label>
            <input
              id="nuevo-telefono"
              type="text"
              value={nuevoTelefono}
              onInput={e => setNuevoTelefono((e.target as HTMLInputElement).value)}
              placeholder="Ej. 04121234567"
              style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', padding: '0.6rem', fontSize: '0.95rem', outline: 'none' }}
            />
          </div>
        </div>
        <div class="modal-actions" style={{ marginTop: '1.5rem' }}>
          <button class="btn-cancelar" onClick={onCerrar}>Cancelar</button>
          <button class="btn-confirmar" onClick={guardar} disabled={procesando}>
            {procesando ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Crear Cliente')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function PanelDeudasContenido() {
  const [clientes, setClientes] = useState<ClienteInfo[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [totalesCliente, setTotalesCliente] = useState<Record<string, number>>({});
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteInfo | null>(null);
  const [observacionesLocales, setObservacionesLocales] = useState('');
  const [deudas, setDeudas] = useState<DeudaInfo[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [cargandoDetalles, setCargandoDetalles] = useState(false);

  // Estados de cobro
  const [config, setConfig] = useState<ConfigApp>({ tasa_cambio_bsd: '1.00', iva_porcentaje: '16' });
  const [modoCobroActivo, setModoCobroActivo] = useState(false);
  const [lineasSeleccionadas, setLineasSeleccionadas] = useState<Record<string, { deudaId: string; subtotal: number; impuesto: number }>>({});
  const [modalPagoOpen, setModalPagoOpen] = useState(false);
  const [procesando, setProcesando] = useState(false);

  // Estados de edición y gestión
  const [modoEdicionActivo, setModoEdicionActivo] = useState(false);
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [editandoCliente, setEditandoCliente] = useState(false);
  const [mostrarPagados, setMostrarPagados] = useState(true);
  const [mostrarObservaciones, setMostrarObservaciones] = useState(false);
  const [modalWA, setModalWA] = useState(false);
  const [textoWA, setTextoWA] = useState('');

  const handleCrearCliente = async (nombre: string, apellido: string, telefono?: string) => {
    const id = await api.crear_cliente(nombre, apellido, telefono);
    alert('Cliente creado exitosamente');
    cargarClientes();
    // Auto seleccionar el nuevo cliente
    const info = { id, nombre, apellido, telefono: telefono || null, activo: true };
    seleccionarCliente(info);
  };

  const handleEditarCliente = async (nombre: string, apellido: string, telefono?: string) => {
    if (!clienteSeleccionado) return;
    await api.actualizar_cliente(clienteSeleccionado.id, nombre, apellido, telefono);
    cargarClientes();
    setClienteSeleccionado({
      ...clienteSeleccionado,
      nombre,
      apellido,
      telefono: telefono || null,
    });
  };

  const handleBorrarCliente = async () => {
    if (!clienteSeleccionado) return;
    const total = totalesCliente[clienteSeleccionado.id] || 0;
    if (total > 0) {
      alert('⚠️ No se puede borrar este cliente porque tiene deudas pendientes.');
      return;
    }
    if (confirm(`¿Estás seguro de borrar a ${clienteSeleccionado.nombre} ${clienteSeleccionado.apellido}?`)) {
      try {
        await api.eliminar_cliente(clienteSeleccionado.id);
        setClienteSeleccionado(null);
        setDeudas([]);
        cargarClientes();
      } catch (e) {
        alert(String(e));
      }
    }
  };

  const handleEliminarDeuda = async (deudaId: string) => {
    if (confirm('⚠️ ¿Estás seguro de eliminar esta compra completa? Todos los productos regresarán al inventario.')) {
      try {
        await api.eliminar_deuda(deudaId);
        seleccionarCliente(clienteSeleccionado!);
        cargarClientes();
      } catch (e) {
        alert(String(e));
      }
    }
  };

  const handleEliminarLinea = async (deudaId: string, lineaId: string) => {
    if (confirm('¿Eliminar este producto de la deuda? Volverá al inventario.')) {
      try {
        await api.eliminar_linea_deuda(deudaId, lineaId);
        seleccionarCliente(clienteSeleccionado!);
        cargarClientes();
      } catch (e) {
        alert(String(e));
      }
    }
  };

  const handleCambiarCantidadLinea = async (deudaId: string, lineaId: string, nuevaCantidad: number) => {
    if (nuevaCantidad < 1) return;
    try {
      await api.actualizar_cantidad_linea_deuda(deudaId, lineaId, nuevaCantidad);
      seleccionarCliente(clienteSeleccionado!);
      cargarClientes();
    } catch (e) {
      alert(String(e));
    }
  };

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
        const dList = await api.listar_deudas_cliente(c.id) as unknown as DeudaInfo[];
        let total = 0;
        for (const deuda of dList) {
          if (!deuda.pagada) {
            const origSubtotal = parseFloat(deuda.subtotal) || 1;
            const origImpuesto = parseFloat(deuda.impuesto) || 0;
            const ratio = origImpuesto / origSubtotal;
            for (const linea of deuda.lineas) {
              if (!linea.pagada) {
                const lineaSubtotal = parseFloat(linea.subtotal) || 0;
                total += lineaSubtotal + (lineaSubtotal * ratio);
              }
            }
          }
        }
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
    setObservacionesLocales(cliente.observaciones || '');
    setCargandoDetalles(true);
    // Limpiar selección de cobro al cambiar de cliente
    setModoCobroActivo(false);
    setLineasSeleccionadas({});
    try {
      const dList = await api.listar_deudas_cliente(cliente.id);
      setDeudas(dList as unknown as DeudaInfo[]);
    } catch (e) {
      console.error('Error cargando deudas del cliente:', e);
    } finally {
      setCargandoDetalles(false);
    }
  };

  const handleBlurObservaciones = async () => {
    if (!clienteSeleccionado) return;
    try {
      await api.actualizar_observaciones_cliente(clienteSeleccionado.id, observacionesLocales);
      // Actualizamos silenciosamente la info local para que perdure al recargar la lista
      setClienteSeleccionado(prev => prev ? { ...prev, observaciones: observacionesLocales } : null);
      setClientes(prev => prev.map(c => c.id === clienteSeleccionado.id ? { ...c, observaciones: observacionesLocales } : c));
    } catch (e) {
      console.error('Error guardando observaciones:', e);
    }
  };

  const toggleLinea = (deuda: DeudaInfo, linea: LineaDeudaInfo) => {
    if (linea.pagada) return;
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

  const toggleTodasLineas = (deuda: DeudaInfo, seleccionar: boolean) => {
    setLineasSeleccionadas((prev) => {
      const copy = { ...prev };
      deuda.lineas.forEach((linea) => {
        if (linea.pagada) return;
        if (seleccionar) {
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
        } else {
          delete copy[linea.id];
        }
      });
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

  const totalGlobal = Object.values(totalesCliente).reduce((acc, curr) => acc + curr, 0);

  const tasaNum = parseFloat(config.tasa_cambio_bsd) || 1;

  // Totales de la selección actual
  const selectedSubtotal = Object.values(lineasSeleccionadas).reduce((acc, curr) => acc + curr.subtotal, 0);
  const selectedImpuesto = Object.values(lineasSeleccionadas).reduce((acc, curr) => acc + curr.impuesto, 0);
  const selectedTotal = selectedSubtotal + selectedImpuesto;

  // Filtrar clientes
  const term = busqueda.toLowerCase().trim();
  const clientesFiltrados = term === ''
    ? clientes
    : clientes.filter(c =>
      c.nombre.toLowerCase().includes(term) ||
      c.apellido.toLowerCase().includes(term) ||
      (c.telefono && c.telefono.includes(term))
    );

  const deudasVisibles = mostrarPagados
    ? deudas
    : deudas
      .map(d => ({ ...d, lineas: d.lineas.filter(l => !l.pagada) }))
      .filter(d => !d.pagada && d.lineas.length > 0);

  const generarMensajeWhatsApp = () => {
    if (!clienteSeleccionado) return;

    const deudasPendientes = deudasVisibles.filter(d => !d.pagada && d.lineas.some(l => !l.pagada));
    if (deudasPendientes.length === 0) {
      alert('No hay deudas pendientes para generar un resumen.');
      return;
    }

    let mensaje = `Hola 👋 ${clienteSeleccionado.nombre} ${clienteSeleccionado.apellido},\nAquí tienes el detalle de tu deuda pendiente:\n\n`;

    const grupos: Record<string, { lineas: LineaDeudaInfo[], subtotal: number }> = {};
    for (const d of deudasPendientes) {
      const fecha = formatFecha(d.creadoEn).split(' a las ')[0];
      if (!grupos[fecha]) grupos[fecha] = { lineas: [], subtotal: 0 };

      for (const l of d.lineas) {
        if (!l.pagada) {
          grupos[fecha].lineas.push(l);
          const ratio = (parseFloat(d.impuesto) || 0) / (parseFloat(d.subtotal) || 1);
          const lTotal = (parseFloat(l.subtotal) || 0) * (1 + ratio);
          grupos[fecha].subtotal += lTotal;
        }
      }
    }

    for (const [fecha, data] of Object.entries(grupos)) {
      if (data.lineas.length === 0) continue;
      mensaje += `📅 Fecha: ${fecha}\n`;
      data.lineas.forEach((l, i) => {
        const rombo = i % 2 === 0 ? '🔸' : '🔹';
        mensaje += `${rombo} ${l.cantidad}x ${l.productoNombre}\n`;
      });
      mensaje += `Subtotal del día: $${fmtBs(data.subtotal)} ❗\n\n`;
    }

    mensaje += `-----------------------------------\n`;
    mensaje += `Total Deuda Acumulada: $${fmtBs(totalAcumulado)} USD ❗❗\n`;

    setTextoWA(mensaje);
    setModalWA(true);
  };

  return (
    <div class="deudas-container">
      {/* Columna izquierda */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', height: '100%', minHeight: 0 }}>
        {/* Nuevo contenedor: Total General por Cobrar */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '0.25rem 1rem 0.25rem 1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.2rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text2)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total por Cobrar</span>
          <strong style={{ fontSize: '1.8rem', color: 'var(--accent2)', fontWeight: '800' }}>${fmtBs(totalGlobal)}</strong>
        </div>

        {/* Lateral izquierdo: Lista de clientes deudores */}
        <aside class="deudas-sidebar" style={{ flex: 1, minHeight: 0 }}>
          <div class="deudas-sidebar-header">
            👥 Clientes Deudores
          </div>
          <div class="deudas-search-container" style={{ padding: '0.7rem 0.40rem', borderBottom: '1px solid var(--border)' }}>
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={busqueda}
              onInput={(e) => setBusqueda((e.target as HTMLInputElement).value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.35rem',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg3)',
                color: 'var(--text)',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>
          <div class="deudas-client-list">
            {cargandoLista && clientesFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text2)' }}>
                Cargando catálogo...
              </div>
            ) : clientesFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text2)', fontSize: '0.85rem' }}>
                {clientes.length === 0 ? 'No hay clientes registrados en cuentas por cobrar.' : 'No se encontraron clientes para la búsqueda.'}
              </div>
            ) : (
              clientesFiltrados.map((c) => {
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
          <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.55rem', background: 'var(--bg-surface)', marginTop: 'auto' }}>
            <button
              style={{ width: '100%', padding: '0.25rem', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--text-on-accent)', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
              onClick={() => setCreandoCliente(true)}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              ➕ Agregar Cliente
            </button>
            <button
              style={{ width: '100%', padding: '0.25rem', borderRadius: '6px', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: '600', cursor: clienteSeleccionado ? 'pointer' : 'not-allowed', opacity: clienteSeleccionado ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
              disabled={!clienteSeleccionado}
              onClick={() => setEditandoCliente(true)}
              onMouseEnter={(e) => !clienteSeleccionado ? null : (e.currentTarget.style.background = 'var(--bg3)')}
              onMouseLeave={(e) => !clienteSeleccionado ? null : (e.currentTarget.style.background = 'transparent')}
            >
              ✏️ Editar Cliente
            </button>
            <button
              style={{ width: '100%', padding: '0.25rem', borderRadius: '6px', border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', fontWeight: '600', cursor: clienteSeleccionado ? 'pointer' : 'not-allowed', opacity: clienteSeleccionado ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
              disabled={!clienteSeleccionado}
              onClick={handleBorrarCliente}
              onMouseEnter={(e) => !clienteSeleccionado ? null : (e.currentTarget.style.background = 'var(--danger)', e.currentTarget.style.color = 'var(--bg-base)')}
              onMouseLeave={(e) => !clienteSeleccionado ? null : (e.currentTarget.style.background = 'transparent', e.currentTarget.style.color = 'var(--danger)')}
            >
              🗑️ Borrar Cliente
            </button>
          </div>
        </aside>
      </div>

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
                <div class="deudas-total-acumulado" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem' }}>Deuda Total</span>
                  <strong style={{ fontSize: '1.2rem' }}>${fmtBs(totalAcumulado)}</strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginRight: '1rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={mostrarPagados} onChange={e => setMostrarPagados((e.target as HTMLInputElement).checked)} />
                    Mostrar cobrados
                  </label>
                  <button
                    onClick={generarMensajeWhatsApp}
                    style={{ background: '#25D366', color: 'black', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', fontWeight: 'bold' }}
                  >
                    💬 Resumen
                  </button>
                </div>
                {deudas.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button
                      class={`btn-cobrar-deuda-trigger ${modoEdicionActivo ? 'cancelar' : ''}`}
                      onClick={() => {
                        setModoEdicionActivo(!modoEdicionActivo);
                        if (!modoEdicionActivo) setModoCobroActivo(false);
                      }}
                      style={modoEdicionActivo ? undefined : { background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)' }}
                    >
                      {modoEdicionActivo ? '❌ Terminar Edición' : '✏️ Editar Deuda'}
                    </button>
                    <button
                      class={`btn-cobrar-deuda-trigger ${modoCobroActivo ? 'cancelar' : ''}`}
                      onClick={() => {
                        if (modoCobroActivo) {
                          setModoCobroActivo(false);
                          setLineasSeleccionadas({});
                        } else {
                          setModoCobroActivo(true);
                          setModoEdicionActivo(false);
                        }
                      }}
                    >
                      {modoCobroActivo ? '❌ Cancelar Cobro' : 'Cobrar Deuda'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Lista de deudas desglosada por sesiones/fechas */}
            {cargandoDetalles ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text2)' }}>
                ⏳ Cargando desglose de deudas...
              </div>
            ) : deudasVisibles.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text2)', fontSize: '0.9rem' }}>
                ✅ Este cliente no tiene cuentas pendientes de pago en la vista actual.
              </div>
            ) : (
              <>
                <div class="deudas-sessions-list">
                  {deudasVisibles.map((d) => (
                    <div key={d.id} class="deuda-session-card" style={d.pagada ? { opacity: 0.6, background: 'var(--bg2)' } : {}}>
                      {/* Encabezado de la transacción/sesión de compra */}
                      <div class="deuda-session-header">
                        <span class="deuda-session-date">
                          📅 Compra: {formatFecha(d.creadoEn)}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <span class="deuda-session-total">
                            Total compra: ${fmtBs(parseFloat(d.total))} USD
                          </span>
                          {modoEdicionActivo && (
                            <button
                              style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.5rem' }}
                              onClick={() => handleEliminarDeuda(d.id)}
                              title="Eliminar compra completa"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Detalle de productos llevados ese día */}
                      <div class="deuda-session-details">
                        <table class="deuda-items-table">
                          <thead>
                            <tr>
                              {modoCobroActivo && (
                                <th style={{ width: '40px', textAlign: 'center' }}>
                                  {!d.pagada && (
                                    <input
                                      type="checkbox"
                                      checked={d.lineas.filter(l => !l.pagada).length > 0 && d.lineas.filter(l => !l.pagada).every(l => !!lineasSeleccionadas[l.id])}
                                      onChange={(e) => {
                                        const checked = (e.target as HTMLInputElement).checked;
                                        toggleTodasLineas(d, checked);
                                      }}
                                      style={{ cursor: 'pointer', scale: '1.2' }}
                                      title="Seleccionar todos"
                                    />
                                  )}
                                </th>
                              )}
                              <th>Producto</th>
                              <th style={{ textAlign: 'center' }}>Cantidad</th>
                              <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                              <th style={{ textAlign: 'right' }}>Subtotal</th>
                              <th style={{ textAlign: 'right' }}>Subtotal en Bs</th>
                              {modoEdicionActivo && <th style={{ width: '60px', textAlign: 'center' }}></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {d.lineas.map((linea) => {
                              const style = linea.pagada ? { textDecoration: 'line-through', color: 'var(--text2)' } : {};
                              return (
                                <tr key={linea.id} style={style}>
                                  {modoCobroActivo && (
                                    <td style={{ textAlign: 'center' }}>
                                      {linea.pagada ? (
                                        <span title="Cobrado">✔️</span>
                                      ) : (
                                        <input
                                          type="checkbox"
                                          checked={!!lineasSeleccionadas[linea.id]}
                                          onChange={() => toggleLinea(d, linea)}
                                          style={{ cursor: 'pointer', scale: '1.2' }}
                                        />
                                      )}
                                    </td>
                                  )}
                                  <td>{linea.productoNombre}</td>
                                  <td style={{ textAlign: 'center' }}>
                                    {modoEdicionActivo && !linea.pagada ? (
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                                        <button
                                          onClick={() => handleCambiarCantidadLinea(d.id, linea.id, linea.cantidad - 1)}
                                          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.1rem 0.4rem', cursor: 'pointer', color: 'var(--text)' }}
                                        >-</button>
                                        <span style={{ minWidth: '1.5rem', textAlign: 'center' }}>{linea.cantidad}</span>
                                        <button
                                          onClick={() => handleCambiarCantidadLinea(d.id, linea.id, linea.cantidad + 1)}
                                          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.1rem 0.4rem', cursor: 'pointer', color: 'var(--text)' }}
                                        >+</button>
                                      </div>
                                    ) : (
                                      linea.cantidad
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'right' }}>${fmtBs(parseFloat(linea.precioUnit))}</td>
                                  <td style={{ textAlign: 'right' }}>${fmtBs(parseFloat(linea.subtotal))}</td>
                                  <td style={{ textAlign: 'right' }}>Bs {fmtBs(parseFloat(linea.subtotal) * tasaNum)}</td>
                                  {modoEdicionActivo && (
                                    <td style={{ textAlign: 'center' }}>
                                      {!linea.pagada && (
                                        <button
                                          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1rem' }}
                                          onClick={() => handleEliminarLinea(d.id, linea.id)}
                                          title="Eliminar producto"
                                        >
                                          ❌
                                        </button>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
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

            {/* Cuadro de Observaciones (Fijo al final) */}
            <div style={{ marginTop: 'auto', padding: '0.5rem 0.30rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '0.2rem 0' }}
                  onClick={() => setMostrarObservaciones(!mostrarObservaciones)}
                >
                  <label style={{ fontSize: '0.85rem', color: 'var(--text2)', fontWeight: '600', cursor: 'pointer', margin: 0 }}>
                    📝 Observaciones del Cliente
                  </label>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text2)', userSelect: 'none' }}>
                    {mostrarObservaciones ? '▲ Ocultar' : '▼ Mostrar'}
                  </span>
                </div>
                {mostrarObservaciones && (
                  <textarea
                    value={observacionesLocales}
                    onInput={e => setObservacionesLocales((e.target as HTMLTextAreaElement).value)}
                    onBlur={handleBlurObservaciones}
                    placeholder="Escribe notas, promesas de pago o detalles del cliente aquí... (Se guarda automáticamente al hacer clic fuera)"
                    style={{
                      width: '100%',
                      minHeight: '110px',
                      padding: '0.8rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg3)',
                      color: 'var(--text)',
                      fontSize: '0.9rem',
                      resize: 'vertical',
                      outline: 'none',
                      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
                      marginTop: '0rem'
                    }}
                  />
                )}
              </div>
            </div>
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

        {/* Modal Crear Cliente */}
        {creandoCliente && (
          <ModalCliente
            onConfirmar={handleCrearCliente}
            onCerrar={() => setCreandoCliente(false)}
          />
        )}

        {/* Modal Editar Cliente */}
        {editandoCliente && clienteSeleccionado && (
          <ModalCliente
            initialNombre={clienteSeleccionado.nombre}
            initialApellido={clienteSeleccionado.apellido}
            initialTelefono={clienteSeleccionado.telefono || ''}
            isEditing={true}
            onConfirmar={handleEditarCliente}
            onCerrar={() => setEditandoCliente(false)}
          />
        )}

        {/* Modal Resumen WhatsApp */}
        {modalWA && (
          <ModalOverlay>
            <div class="modal-card" style={{ minWidth: '550px', minHeight: '600px' }}>
              <div class="modal-header">
                <h2>💬 Resumen de Deuda</h2>
                <button class="modal-close" onClick={() => setModalWA(false)}>✕</button>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>Copia este mensaje y envíalo al cliente por WhatsApp:</p>
                <textarea
                  value={textoWA}
                  readOnly
                  style={{ width: '100%', height: '350px', padding: '0.8rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '0.9rem', resize: 'none' }}
                />
                <button
                  class="btn-confirmar"
                  onClick={() => {
                    navigator.clipboard.writeText(textoWA);
                    alert('¡Mensaje copiado al portapapeles!');
                  }}
                  style={{ background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  📋 Copiar Mensaje
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}
      </main>
    </div>
  );
}

export default function PanelDeudas() {
  return (
    <ErrorBoundary>
      <PanelDeudasContenido />
    </ErrorBoundary>
  );
}
