// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Componente de Mantenimiento (Preact)
// Estética premium, centrado y con animación sutil.
// ══════════════════════════════════════════════════════════════

interface MantenimientoProps {
  modulo: string;
}

export default function Mantenimiento({ modulo }: MantenimientoProps) {
  return (
    <div class="maintenance-container">
      {/* Estilos específicos inyectados directamente */}
      <style>{`
        .maintenance-container {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100vh;
          background: #0d0e12;
          color: #f1f5f9;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          padding: 20px;
          box-sizing: border-box;
        }

        .maintenance-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-radius: 24px;
          padding: 48px 32px;
          text-align: center;
          max-width: 450px;
          width: 100%;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          border-top: 1px solid rgba(240, 180, 41, 0.2); /* Sutil brillo dorado arriba */
        }

        .maintenance-icon-wrapper {
          display: inline-block;
          font-size: 5rem;
          margin-bottom: 24px;
          animation: floatAnimation 3s ease-in-out infinite;
          filter: drop-shadow(0 10px 15px rgba(240, 180, 41, 0.2));
        }

        .maintenance-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0 0 12px 0;
          letter-spacing: -0.02em;
        }

        .maintenance-modulo {
          color: #f0b429;
          font-weight: 800;
        }

        .maintenance-text {
          font-size: 0.95rem;
          line-height: 1.6;
          color: #94a3b8;
          margin: 0;
        }

        @keyframes floatAnimation {
          0% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-12px) rotate(3deg);
          }
          100% {
            transform: translateY(0px) rotate(0deg);
          }
        }
      `}</style>

      <div class="maintenance-card">
        <div class="maintenance-icon-wrapper" aria-hidden="true">
          🚧
        </div>
        <h1 class="maintenance-title">
          Módulo <span class="maintenance-modulo">{modulo}</span>
        </h1>
        <p class="maintenance-text">
          Por los momentos este módulo se encuentra en mantenimiento.
        </p>
      </div>
    </div>
  );
}
