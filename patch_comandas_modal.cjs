const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'comandas', 'GestorComandas.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add imports
content = content.replace(
    "import '../../styles/comandas.css';",
    "import ModalOverlay from '../ui/ModalOverlay';\nimport '../../styles/comandas.css';\nimport '../../styles/caja.css';"
);

// 2. Replace ModalPago
const modalPagoRegex = /function ModalPago\(\{[^]*?\}\) \{[^]*?\}\n\n\/\/ ══════════════════════════════════════════════════════════════\n\/\/ MODAL: Historial/m;

const newModalPago = `function ModalPago({ totalUSD, tasa, onConfirmar, onCerrar }: {
  totalUSD: number;
  tasa: string;
  onConfirmar: (forma: FormaPago, referencia?: string, clienteId?: string) => void;
  onCerrar: () => void;
}) {
  const [forma, setForma] = useState<FormaPago | null>(null);
  const [ref, setRef] = useState('');
  
  // Client selection state
  const [clientes, setClientes] = useState<ClienteInfo[]>([]);
  const [clienteId, setClienteId] = useState<string>('');
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [cargandoClientes, setCargandoClientes] = useState(false);
  
  const tasaNum = parseFloat(tasa) || 1;
  const totalBs = totalUSD * tasaNum;

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
      if (lista.length > 0) setClienteId(lista[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setCargandoClientes(false);
    }
  };

  const clientesFiltrados = clientes.filter(c => 
    \`\${c.nombre} \${c.apellido}\`.toLowerCase().includes(busquedaCliente.toLowerCase())
  );

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
              <strong>\${fmt2(totalUSD)} USD</strong>
            </div>
          </div>

          <p class="modal-section-label">Forma de pago</p>
          <div class="forma-pago-grid">
            {METODOS.map((m) => (
              <button
                key={m.forma}
                id={\`forma-\${m.forma.toLowerCase()}\`}
                class={\`forma-btn \${forma === m.forma ? 'activa' : ''}\`}
                onClick={() => setForma(m.forma)}
              >
                <span class="forma-icon">{m.icon}</span>
                <span class="forma-label">{m.label}</span>
              </button>
            ))}
          </div>

          {(forma === 'BS_PAGO_MOVIL' || forma === 'BS_DEBITO') && (
            <div class="referencia-group">
              <label for="referencia-input">Nº de referencia *</label>
              <input
                id="referencia-input"
                type="text"
                placeholder="Últimos 4 dígitos"
                value={ref}
                onInput={(e) => {
                  const rawVal = (e.target as HTMLInputElement).value;
                  const numericVal = rawVal.replace(/\\D/g, '').slice(0, 4);
                  setRef(numericVal);
                }}
                maxLength={4}
              />
            </div>
          )}

          <div class="modal-actions">
            <button class="btn-cancelar" onClick={onCerrar}>Cancelar</button>
            <button
              id="confirmar-pago"
              class={\`btn-confirmar \${forma === 'CUENTA_COBRAR' ? 'btn-confirmar--credito' : ''}\`}
              disabled={!forma || (forma === 'CUENTA_COBRAR' && !clienteId)}
              onClick={() => forma && onConfirmar(forma, ref || undefined, forma === 'CUENTA_COBRAR' ? clienteId : undefined)}
            >
              {forma === 'CUENTA_COBRAR' ? '💾 Guardar Deuda' : '✅ Confirmar Pago'}
            </button>
          </div>
        </div>

        {forma === 'CUENTA_COBRAR' && (
          <div class="cliente-cobrar-lateral">
            <div class="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label for="cliente-select" style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>Seleccionar Cliente *</label>
              <input
                type="text"
                placeholder="🔍 Buscar cliente deudor..."
                value={busquedaCliente}
                onInput={(e) => setBusquedaCliente((e.target as HTMLInputElement).value)}
                style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', padding: '0.4rem', fontSize: '0.85rem', outline: 'none' }}
              />
              <div class="cliente-select-row" style={{ flexDirection: 'column', width: '100%' }}>
                {cargandoClientes ? (
                  <span style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>Cargando clientes...</span>
                ) : (
                  <select
                    id="cliente-select"
                    value={clienteId}
                    onChange={(e) => setClienteId((e.target as HTMLSelectElement).value)}
                    class="cliente-select"
                    style={{ width: '100%' }}
                    size={5}
                  >
                    {clientesFiltrados.length === 0 ? (
                      <option value="">No se encontraron clientes</option>
                    ) : (
                      clientesFiltrados.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} {c.apellido} - {c.cedula}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: '0.5rem' }}>
                Nota: Debes crear al cliente desde el módulo de Caja si no existe.
              </span>
            </div>
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}

// ══════════════════════════════════════════════════════════════
// MODAL: Historial`;

if (content.match(modalPagoRegex)) {
    content = content.replace(modalPagoRegex, newModalPago);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('Successfully patched GestorComandas.tsx');
} else {
    console.log('Could not find ModalPago using regex');
}
