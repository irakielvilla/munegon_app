import { h } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import ModalOverlay from '../ui/ModalOverlay';

const fmtBs = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

interface ModalAvanceEfectivoProps {
  onConfirmar: (montoEfectivo: number, metodoPago: string, porcentaje: number) => void;
  onCerrar: () => void;
}

export default function ModalAvanceEfectivo({ onConfirmar, onCerrar }: ModalAvanceEfectivoProps) {
  const [montoFisicoStr, setMontoFisicoStr] = useState('');
  const [metodoPago, setMetodoPago] = useState('BS_DEBITO'); // 'BS_DEBITO' o 'BS_PAGO_MOVIL'

  const porcentaje = metodoPago === 'BS_DEBITO' ? 20 : 10;
  const montoEfectivo = parseFloat(montoFisicoStr) || 0;
  
  const totalACobrar = useMemo(() => {
    return montoEfectivo + (montoEfectivo * (porcentaje / 100));
  }, [montoEfectivo, porcentaje]);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (montoEfectivo > 0) {
      onConfirmar(montoEfectivo, metodoPago, porcentaje);
    }
  };

  return (
    <ModalOverlay>
      <form class="modal-card" onSubmit={handleSubmit}>
        <div class="modal-header">
          <h2>💸 Avance de Efectivo</h2>
          <button type="button" class="modal-close" onClick={onCerrar}>✕</button>
        </div>
        
        <p class="modal-section-label" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          Ingresa el monto de efectivo (Bs) que entregarás.
        </p>

        <div class="modal-totales">
          <div class="monto-bs">
            <span>Físico a Entregar</span>
            <strong>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={montoFisicoStr}
                onInput={e => setMontoFisicoStr((e.target as HTMLInputElement).value)}
                placeholder="0.00"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  fontSize: 'inherit',
                  fontWeight: 'inherit',
                  width: '100px',
                  outline: 'none',
                  borderBottom: '2px solid rgba(255,255,255,0.2)'
                }}
                autoFocus
              />
            </strong>
          </div>
          <div class="monto-usd">
            <span>Total a Cobrar</span>
            <strong>Bs {fmtBs(totalACobrar)}</strong>
          </div>
        </div>

        <p class="modal-section-label">Forma de Pago del Cliente</p>
        <div class="forma-pago-grid">
          <button
            type="button"
            class={`forma-btn ${metodoPago === 'BS_DEBITO' ? 'activa' : ''}`}
            onClick={() => setMetodoPago('BS_DEBITO')}
          >
            <span class="forma-icon">💳</span>
            <span class="forma-label">Débito (+20%)</span>
          </button>
          <button
            type="button"
            class={`forma-btn ${metodoPago === 'BS_PAGO_MOVIL' ? 'activa' : ''}`}
            onClick={() => setMetodoPago('BS_PAGO_MOVIL')}
          >
            <span class="forma-icon">📱</span>
            <span class="forma-label">Pago Móvil (+10%)</span>
          </button>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-cancelar" onClick={onCerrar}>Cancelar</button>
          <button type="submit" class="btn-confirmar" disabled={montoEfectivo <= 0}>
            ✅ Confirmar y Cobrar
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
