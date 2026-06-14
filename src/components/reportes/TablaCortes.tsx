// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — TablaCortes (Preact)
// Historial de Cortes de Caja — solo ADMIN
// Incluye botón "Emitir Corte Z" con modal previo avanzado
// ══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'preact/hooks';
import { api, parseLocalDate, type ResumenDia, type ConfigApp } from '../../lib/api';
import { requireAuth, getSession } from '@lib/auth';
import ModalOverlay from '../ui/ModalOverlay';

// ── Tipos ─────────────────────────────────────────────────────

interface CorteCaja {
  id: string;
  tipo: 'X' | 'Z';
  usuarioId: string;
  nombreUsuario: string;
  totalCalculado: string;
  totalDeclarado: string;
  diferencia: string;
  creadoEn: string;
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

const fmt2 = (n: number) => n.toFixed(2);
const fmtBs = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ══════════════════════════════════════════════════════════════
// MODAL CORTE Z (Avanzado)
// ══════════════════════════════════════════════════════════════

interface ModalCorteZProps {
  onConfirmar: (conteo: ConteoFisico) => Promise<void>;
  onCerrar: () => void;
  generando: boolean;
}

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
        <p class="popup-pregunta">¿ESTÁS SEGURO QUE QUIERES HACER EL CORTE Z?</p>
        <div class="popup-acciones">
          <button class="popup-btn-no" onClick={onCancelar}>No, revisar</button>
          <button class="popup-btn-si" onClick={onConfirmar}>Sí, continuar</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

const FILAS_CORTE = [
  { key: 'bsEfectivo'  as keyof ConteoFisico, icono: '💴', label: 'Efectivo Bs',   unidad: 'Bs'  },
  { key: 'bsDebito'    as keyof ConteoFisico, icono: '💳', label: 'Débito Bs',     unidad: 'Bs'  },
  { key: 'bsPagoMovil' as keyof ConteoFisico, icono: '📱', label: 'Pago Móvil Bs', unidad: 'Bs'  },
  { key: 'usdEfectivo' as keyof ConteoFisico, icono: '💵', label: 'Efectivo $',    unidad: 'USD' },
] as const;

function ModalCorteZ({ onConfirmar, onCerrar, generando }: ModalCorteZProps) {
  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [conteo, setConteo] = useState<ConteoFisico>({
    bsEfectivo: '', bsDebito: '', bsPagoMovil: '', usdEfectivo: '',
  });
  const [camposEnCero, setCamposEnCero] = useState<string[]>([]);
  const [mostrarPopup, setMostrarPopup] = useState(false);

  useEffect(() => {
    api.resumen_ventas_dia(false)
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
      onConfirmar(conteo);
    }
  };

  const confirmarDesdePopup = () => {
    setMostrarPopup(false);
    onConfirmar(conteo);
  };

  const sistemaValor = (key: keyof ConteoFisico): string => {
    if (!resumen) return '0.00';
    const raw = resumen[key];
    const num = parseFloat(raw) || 0;
    return key === 'usdEfectivo' ? `$ ${fmt2(num)} USD` : `Bs ${fmtBs(num)}`;
  };

  return (
    <ModalOverlay>
      <div class="modal-card modal-corte">
        <div class="modal-header corte-header">
          <h2>📄 Emitir Corte Z — Cierre de Día</h2>
          <button class="modal-close" onClick={onCerrar} disabled={generando}>✕</button>
        </div>

        {cargando ? (
          <div class="corte-cargando"><span class="spinner">⏳</span> Cargando datos del día…</div>
        ) : errorCarga ? (
          <div class="corte-error">❌ No se pudo cargar el resumen del día.</div>
        ) : (
          <div class="corte-columnas">
            <div class="corte-col-header">SISTEMA (HOY)</div>
            <div class="corte-col-header">CONTEO FÍSICO</div>

            {FILAS_CORTE.map((fila) => (
              <>
                <div class="corte-celda corte-celda-sistema">
                  <span class="corte-fila-icono">{fila.icono}</span>
                  <div class="corte-fila-info">
                    <span class="corte-fila-label">{fila.label}</span>
                    <strong class="corte-monto-sistema">{sistemaValor(fila.key)}</strong>
                  </div>
                </div>

                <div class="corte-celda corte-celda-conteo">
                  <div class="conteo-input-wrapper">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={conteo[fila.key]}
                      onInput={(e) => actualizarConteo(fila.key, (e.target as HTMLInputElement).value)}
                      class="conteo-input"
                      disabled={generando}
                    />
                    <span class="conteo-unidad">{fila.unidad}</span>
                  </div>
                </div>
              </>
            ))}
          </div>
        )}

        <p class="corte-advertencia" style={{ marginTop: '20px' }}>
          ⚠️ El <strong>Corte Z</strong> cierra el día contablemente y registra las diferencias. 
          El Efectivo Bs y USD se usará como monto inicial del día siguiente.
        </p>

        <div class="modal-actions">
          <button class="btn-cancelar" onClick={onCerrar} disabled={generando}>Cancelar</button>
          <button
            class="btn-confirmar btn-corte-z-confirm"
            onClick={handleRegistrar}
            disabled={cargando || generando}
          >
            {generando ? '⏳ Generando PDF…' : '📄 Registrar Corte Z'}
          </button>
        </div>

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
// COMPONENTE PRINCIPAL — TablaCortes
// ══════════════════════════════════════════════════════════════

export default function TablaCortes() {
  requireAuth('ADMIN');

  const session = getSession();

  const [cortes, setCortes] = useState<CorteCaja[]>([]);
  const [config, setConfig] = useState<ConfigApp>({ tasa_cambio_bsd: '1.00', iva_porcentaje: '16' });
  const [generandoPDF, setGenerandoPDF] = useState<string | null>(null);
  const [generandoZ, setGenerandoZ] = useState(false);
  const [mostrarModalZ, setMostrarModalZ] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useEffect(() => { 
    cargar(); 
    api.obtener_configuracion().then(setConfig).catch(console.error);
  }, []);

  const cargar = async () => {
    try {
      const data = await api.listar_cortes_caja();
      setCortes(data);
    } catch (e) {
      flashMsg('error', `Error cargando cortes: ${e}`);
    }
  };

  const flashMsg = (tipo: 'ok' | 'error', texto: string) => {
    setMsg({ tipo, texto });
    setTimeout(() => setMsg(null), 6000);
  };

  const exportarPDF = async (corteId: string) => {
    setGenerandoPDF(corteId);
    try {
      const ruta = await api.generar_pdf_corte({ corteId });
      flashMsg('ok', `✅ PDF guardado en: ${ruta}`);
    } catch (e) {
      flashMsg('error', `Error generando PDF: ${e}`);
    } finally {
      setGenerandoPDF(null);
    }
  };

  const emitirCorteZ = async (conteo: ConteoFisico) => {
    if (!session) { flashMsg('error', 'Sin sesión activa.'); return; }
    setGenerandoZ(true);
    try {
      const tasa = parseFloat(config.tasa_cambio_bsd) || 1;
      
      const declaradoBs = (parseFloat(conteo.bsEfectivo) || 0)
        + (parseFloat(conteo.bsDebito) || 0)
        + (parseFloat(conteo.bsPagoMovil) || 0);
      const declaradoUSD = (parseFloat(conteo.usdEfectivo) || 0);

      const totalUsdEquiv = declaradoBs / tasa + declaradoUSD;

      const totalDeclaradoStr = JSON.stringify({
        bsEfectivo:  fmt2(parseFloat(conteo.bsEfectivo)  || 0),
        bsDebito:    fmt2(parseFloat(conteo.bsDebito)    || 0),
        bsPagoMovil: fmt2(parseFloat(conteo.bsPagoMovil) || 0),
        usdEfectivo: fmt2(declaradoUSD),
        totalUsdEquiv: fmt2(totalUsdEquiv),
        tasaCambio: config.tasa_cambio_bsd,
      });

      const ruta = await api.generar_pdf_corte_z({
        usuarioId: session.usuarioId,
        totalDeclarado: totalDeclaradoStr,
        tasaCambio: config.tasa_cambio_bsd,
      });
      setMostrarModalZ(false);
      flashMsg('ok', `✅ Corte Z emitido. PDF: ${ruta}`);
      await cargar();
    } catch (e) {
      flashMsg('error', `Error en Corte Z: ${e}`);
    } finally {
      setGenerandoZ(false);
    }
  };

  const fmt = (iso: string) => {
    const d = parseLocalDate(iso);
    return d.toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };

  const difNum = (s: string) => {
    try { return parseFloat(JSON.parse(s).totalUsdEquiv ?? s); } catch { return parseFloat(s); }
  };

  const renderDeclarado = (s: string) => {
    try {
      const d = JSON.parse(s);
      return `$${d.totalUsdEquiv} USD (Bs: ${d.bsEfectivo}, $: ${d.usdEfectivo})`;
    } catch {
      return `Bs ${parseFloat(s).toFixed(2)}`;
    }
  };

  return (
    <div class="rep-container">
      <div class="rep-header">
        <h1>📊 Reportes — Cortes de Caja</h1>
        <div class="rep-header-actions">
          <button class="btn-recargar" style={{ marginRight: '10px' }} onClick={() => (window as any).forzarSincronizacion?.()}>☁️ Sincronizar</button>
          <button class="btn-recargar" onClick={cargar}>🔄 Actualizar</button>
          <button class="btn-corte-z" onClick={() => setMostrarModalZ(true)} disabled={generandoZ}>
            📄 Emitir Corte Z
          </button>
        </div>
      </div>

      {msg && <div class={`inv-flash inv-flash-${msg.tipo}`}>{msg.texto}</div>}

      <div class="inv-table-wrap">
        <table class="inv-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Cajero</th>
              <th>Fecha/Hora</th>
              <th>Total Sistema</th>
              <th>Total Declarado</th>
              <th>Diferencia (USD)</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {cortes.length === 0 ? (
              <tr><td colspan={7} class="inv-empty">No hay cortes registrados aún</td></tr>
            ) : (
              cortes.map((c) => {
                const dif = parseFloat(c.diferencia) || 0;
                return (
                  <tr key={c.id}>
                    <td><span class={`badge-tipo tipo-${c.tipo.toLowerCase()}`}>Corte {c.tipo}</span></td>
                    <td>{c.nombreUsuario}</td>
                    <td class="td-fecha">{fmt(c.creadoEn)}</td>
                    <td>$ {parseFloat(c.totalCalculado).toFixed(2)} USD</td>
                    <td class="td-declarado">{renderDeclarado(c.totalDeclarado)}</td>
                    <td class={dif >= 0 ? 'sobrante' : 'faltante'}>
                      {dif >= 0 ? '+' : ''}{dif.toFixed(2)}
                    </td>
                    <td>
                      <button class="btn-pdf" onClick={() => exportarPDF(c.id)} disabled={generandoPDF === c.id}>
                        {generandoPDF === c.id ? '⏳' : '📄 PDF'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {mostrarModalZ && (
        <ModalCorteZ
          onConfirmar={emitirCorteZ}
          onCerrar={() => !generandoZ && setMostrarModalZ(false)}
          generando={generandoZ}
        />
      )}
    </div>
  );
}
