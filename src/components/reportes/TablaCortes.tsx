// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — TablaCortes (Preact)
// Historial de Cortes de Caja — solo ADMIN
// Incluye botón "Emitir Corte Z" con modal previo
// ══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'preact/hooks';
import { api } from '../../lib/api';
import { requireAuth, getSession } from '@lib/auth';

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

// ══════════════════════════════════════════════════════════════
// MODAL CORTE Z
// ══════════════════════════════════════════════════════════════

interface ModalCorteZProps {
  onConfirmar: (efectivoBs: string) => Promise<void>;
  onCerrar: () => void;
  generando: boolean;
}

function ModalCorteZ({ onConfirmar, onCerrar, generando }: ModalCorteZProps) {
  const [efectivoBs, setEfectivoBs] = useState('');
  const [error, setError] = useState('');

  const handleConfirmar = async () => {
    const num = parseFloat(efectivoBs);
    if (efectivoBs.trim() === '' || isNaN(num) || num < 0) {
      setError('Ingresa un monto válido (puede ser 0 si la caja quedó vacía).');
      return;
    }
    setError('');
    await onConfirmar(efectivoBs.trim());
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirmar();
    if (e.key === 'Escape') onCerrar();
  };

  return (
    <div class="modal-overlay" onClick={onCerrar}>
      <div class="modal-card inv-modal corte-z-modal" onClick={(e) => e.stopPropagation()}>

        {/* Encabezado */}
        <div class="modal-header">
          <h2>📄 Emitir Corte Z — Cierre de Día</h2>
          <button class="modal-close" onClick={onCerrar} disabled={generando}>✕</button>
        </div>

        {/* Información */}
        <div class="corte-z-info">
          <p>
            El <strong>Corte Z</strong> cierra el día contablemente:
            registra los totales, genera el PDF y marca todas las
            ventas de hoy como cerradas.
          </p>
          <p class="corte-z-aviso">
            ⚠️ Esta acción <strong>no se puede deshacer</strong>.
            Solo el administrador puede emitirlo.
          </p>
        </div>

        {/* Campo: Efectivo Bs en caja */}
        <div class="inv-form">
          <div class="form-group">
            <label for="efectivo-bs-input">
              💴 Efectivo Bs en caja al cierre
              <span class="form-hint"> — será el monto inicial del día siguiente</span>
            </label>
            <div class="efectivo-input-group">
              <span class="efectivo-prefix">Bs</span>
              <input
                id="efectivo-bs-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={efectivoBs}
                onInput={(e) => { setEfectivoBs((e.target as HTMLInputElement).value); setError(''); }}
                onKeyDown={handleKeyDown}
                disabled={generando}
                autoFocus
              />
            </div>
            {error && <span class="form-error">{error}</span>}
          </div>
        </div>

        {/* Acciones */}
        <div class="modal-actions">
          <button class="btn-cancelar" onClick={onCerrar} disabled={generando}>
            Cancelar
          </button>
          <button
            id="confirmar-corte-z"
            class="btn-confirmar btn-corte-z-confirm"
            onClick={handleConfirmar}
            disabled={generando}
          >
            {generando ? '⏳ Generando PDF…' : '📄 Generar Corte Z'}
          </button>
        </div>

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL — TablaCortes
// ══════════════════════════════════════════════════════════════

export default function TablaCortes() {
  requireAuth('ADMIN');

  const session = getSession();

  const [cortes, setCortes] = useState<CorteCaja[]>([]);
  const [generandoPDF, setGenerandoPDF] = useState<string | null>(null);
  const [generandoZ, setGenerandoZ] = useState(false);
  const [mostrarModalZ, setMostrarModalZ] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useEffect(() => { cargar(); }, []);

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

  // ── PDF de un corte existente (Corte X) ──────────────────────
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

  // ── Emitir Corte Z ───────────────────────────────────────────
  const emitirCorteZ = async (efectivoBs: string) => {
    if (!session) { flashMsg('error', 'Sin sesión activa.'); return; }
    setGenerandoZ(true);
    try {
      const ruta = await api.generar_pdf_corte_z({
        usuarioId: session.usuarioId,
        efectivoBsCaja: efectivoBs,
      });
      setMostrarModalZ(false);
      flashMsg('ok', `✅ Corte Z emitido. PDF: ${ruta}`);
      await cargar(); // refrescar tabla
    } catch (e) {
      flashMsg('error', `Error en Corte Z: ${e}`);
    } finally {
      setGenerandoZ(false);
    }
  };

  // ── Formateo ─────────────────────────────────────────────────
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const difNum = (s: string) => {
    // totalDeclarado puede ser JSON (Corte X nuevo) o número simple
    try { return parseFloat(JSON.parse(s).totalUsdEquiv ?? s); } catch { return parseFloat(s); }
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <div class="rep-container">

      {/* Header con botón Corte Z */}
      <div class="rep-header">
        <h1>📊 Reportes — Cortes de Caja</h1>
        <div class="rep-header-actions">
          <button class="btn-recargar" onClick={cargar}>🔄 Actualizar</button>
          <button
            id="btn-emitir-corte-z"
            class="btn-corte-z"
            onClick={() => setMostrarModalZ(true)}
            disabled={generandoZ}
          >
            📄 Emitir Corte Z
          </button>
        </div>
      </div>

      {/* Flash message */}
      {msg && <div class={`inv-flash inv-flash-${msg.tipo}`}>{msg.texto}</div>}

      {/* Tabla de historial */}
      <div class="inv-table-wrap">
        <table class="inv-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Cajero</th>
              <th>Fecha/Hora</th>
              <th>Total Sistema</th>
              <th>Total Declarado</th>
              <th>Diferencia</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {cortes.length === 0 ? (
              <tr>
                <td colspan={7} class="inv-empty">No hay cortes registrados aún</td>
              </tr>
            ) : (
              cortes.map((c) => {
                const dif = difNum(c.diferencia);
                return (
                  <tr key={c.id}>
                    <td>
                      <span class={`badge-tipo tipo-${c.tipo.toLowerCase()}`}>
                        Corte {c.tipo}
                      </span>
                    </td>
                    <td>{c.nombreUsuario}</td>
                    <td class="td-fecha">{fmt(c.creadoEn)}</td>
                    <td>Bs {parseFloat(c.totalCalculado).toFixed(2)}</td>
                    <td class="td-declarado">
                      {c.tipo === 'Z'
                        ? `Bs ${parseFloat(c.totalDeclarado).toFixed(2)} (caja)`
                        : c.totalDeclarado}
                    </td>
                    <td class={dif >= 0 ? 'sobrante' : 'faltante'}>
                      {dif >= 0 ? '+' : ''}{dif.toFixed(2)}
                    </td>
                    <td>
                      <button
                        id={`pdf-${c.id}`}
                        class="btn-pdf"
                        onClick={() => exportarPDF(c.id)}
                        disabled={generandoPDF === c.id}
                      >
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

      {/* Modal Corte Z */}
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
