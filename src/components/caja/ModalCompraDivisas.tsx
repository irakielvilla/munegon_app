import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import ModalOverlay from '../ui/ModalOverlay';
import { api } from '../../lib/api';

const fmtBs = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

interface ModalCompraDivisasProps {
  onConfirmar: (montoUsd: number, tasaAcordada: number, metodoPagoSalida: string, tasaCambioSistema: string) => void;
  onCerrar: () => void;
}

export default function ModalCompraDivisas({ onConfirmar, onCerrar }: ModalCompraDivisasProps) {
  const [montoUsdStr, setMontoUsdStr] = useState('');
  const [tasaAcordadaStr, setTasaAcordadaStr] = useState('');
  const [tasaSistema, setTasaSistema] = useState('1.00');
  const [metodoPago, setMetodoPago] = useState('BS_PAGO_MOVIL');

  useEffect(() => {
    // Cargar la tasa del sistema por defecto
    api.obtener_configuracion().then(config => {
      setTasaSistema(config.tasa_cambio_bsd);
      setTasaAcordadaStr(config.tasa_cambio_bsd);
    }).catch(e => console.error(e));
  }, []);

  const montoUsd = parseFloat(montoUsdStr) || 0;
  const tasaAcordada = parseFloat(tasaAcordadaStr) || 0;
  
  const totalBsAPagar = montoUsd * tasaAcordada;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (montoUsd > 0 && tasaAcordada > 0) {
      onConfirmar(montoUsd, tasaAcordada, metodoPago, tasaSistema);
    }
  };

  return (
    <ModalOverlay>
      <form class="modal-card" onSubmit={handleSubmit}>
        <div class="modal-header">
          <h2>💵 Compra de Divisas</h2>
          <button type="button" class="modal-close" onClick={onCerrar}>✕</button>
        </div>
        
        <p class="modal-section-label" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          Ingresa los dólares que recibes y verifica la tasa.
        </p>

        <div class="modal-totales">
          <div class="monto-usd">
            <span>$ a Comprar</span>
            <strong>
              <span style={{ marginRight: '0.2rem' }}>$</span>
              <input
                type="number"
                step="1"
                min="1"
                required
                value={montoUsdStr}
                onInput={e => setMontoUsdStr((e.target as HTMLInputElement).value)}
                placeholder="0"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  fontSize: 'inherit',
                  fontWeight: 'inherit',
                  width: '80px',
                  outline: 'none',
                  borderBottom: '2px solid rgba(255,255,255,0.2)'
                }}
                autoFocus
              />
            </strong>
          </div>
          <div class="monto-bs">
            <span>Total Bs a Pagar</span>
            <strong>Bs {fmtBs(totalBsAPagar)}</strong>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text2)', marginRight: '0.5rem' }}>
            Tasa Acordada (Bs/$):
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            value={tasaAcordadaStr}
            onInput={e => setTasaAcordadaStr((e.target as HTMLInputElement).value)}
            placeholder={tasaSistema}
            style={{
              background: 'var(--bg3)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0.4rem',
              width: '90px',
              textAlign: 'center',
              fontWeight: 'bold',
              outline: 'none'
            }}
          />
        </div>

        <p class="modal-section-label">Método de Pago hacia el Cliente</p>
        <div class="forma-pago-grid">
          <button
            type="button"
            class={`forma-btn ${metodoPago === 'BS_PAGO_MOVIL' ? 'activa' : ''}`}
            onClick={() => setMetodoPago('BS_PAGO_MOVIL')}
          >
            <span class="forma-icon">📱</span>
            <span class="forma-label">Pago Móvil</span>
          </button>
          <button
            type="button"
            class={`forma-btn ${metodoPago === 'BS_EFECTIVO' ? 'activa' : ''}`}
            onClick={() => setMetodoPago('BS_EFECTIVO')}
          >
            <span class="forma-icon">💴</span>
            <span class="forma-label">Efectivo Bs</span>
          </button>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-cancelar" onClick={onCerrar}>Cancelar</button>
          <button type="submit" class="btn-confirmar" disabled={montoUsd <= 0 || tasaAcordada <= 0}>
            ✅ Confirmar y Pagar
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
