import { jsPDF } from 'jspdf';

/**
 * Convierte un string de fecha a Date local correctamente.
 * - Supabase devuelve: "2026-06-13T02:30:00+00:00" o "2026-06-13T02:30:00Z" → OK
 * - SQLite/Tauri synced devuelve: "2026-06-13 02:30:00" (sin zona) → lo tratamos como UTC
 * El resultado es siempre la hora correcta en la zona local del navegador.
 */
export function parseLocalDate(isoStr: string): Date {
  if (!isoStr) return new Date();
  // Normalizar separador de fecha/hora
  const normalized = isoStr.includes('T') ? isoStr : isoStr.replace(' ', 'T');
  // Si ya tiene zona horaria (Z o +/-HH:MM), parseamos directo
  const hasZone = normalized.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(normalized);
  // Sin zona asumimos UTC (así Supabase lo almacena internamente)
  return new Date(hasZone ? normalized : normalized + 'Z');
}

export function getLocalDayRange(dateInput?: string | Date) {
  const date = dateInput ? new Date(dateInput) : new Date();
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

// Tipos base (basados en Prisma/Rust)
export interface Producto {
  id: string;
  sku: string;
  nombre: string;
  descripcion: string | null;
  monedaBase: 'USD' | 'BS';
  precio: string;
  stock: number;
  stockMinimo: number;
  activo: boolean;
}

export interface ConfigApp {
  tasa_cambio_bsd: string;
  iva_porcentaje: string;
}

export interface CorteCajaInfo {
  id: string;
  tipo: 'X' | 'Z';
  usuarioId: string;
  nombreUsuario: string;
  totalCalculado: string;
  totalDeclarado: string;
  diferencia: string;
  creadoEn: string;
}

export interface Usuario {
  id: string;
  nombre: string;
  rol: string;
  activo: boolean;
}

export interface ResumenDia {
  bsEfectivo: string;
  bsDebito: string;
  bsPagoMovil: string;
  usdEfectivo: string;
}

export interface LineaInput {
  productoId: string;
  cantidad: number;
  precioUnit: string;
  subtotal: string;
}

export interface ClienteInfo {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  activo: boolean;
}

export interface LineaDeudaInfo {
  id: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnit: string;
  subtotal: string;
}

export interface DeudaInfo {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  subtotal: string;
  impuesto: string;
  total: string;
  creadoEn: string;
  lineas: LineaDeudaInfo[];
}

// ── Detección de entorno ──────────────────────────────────────
// Nota: en Tauri v2 puede ser __TAURI__, __TAURI_INTERNALS__ o __TAURI_IPC__
export const isTauri = () => typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window);

// Wrapper genérico para comandos Tauri (Rust)
async function invokeTauri<T>(cmd: string, args: any = {}): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<T>(cmd, args);
}

// ── Helper para llamar Edge Functions (versión web) ───────────
// La SERVICE_ROLE_KEY vive en el servidor de Supabase. El frontend
// solo necesita el token de acceso (MUNEGON_API_SECRET) y la URL base.
const EDGE_BASE_URL = import.meta.env.PUBLIC_SUPABASE_URL || '';
const EDGE_SECRET   = import.meta.env.PUBLIC_MUNEGON_API_SECRET || '';

async function callEdge<T>(fn: string, body: object): Promise<T> {
  const url = `${EDGE_BASE_URL}/functions/v1/${fn}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Munegon-Key': EDGE_SECRET,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => res.statusText);
    throw new Error(`[Edge ${fn}] ${res.status}: ${errBody}`);
  }
  return res.json() as Promise<T>;
}

// ──────────────────────────────────────────────────────────────
// API 
// ──────────────────────────────────────────────────────────────

export const api = {
  // ── CUENTAS POR COBRAR (LOCAL) ──
  listar_clientes: async (): Promise<ClienteInfo[]> => {
    if (isTauri()) return invokeTauri<ClienteInfo[]>('listar_clientes');
    throw new Error('Solo disponible en versión de escritorio (Tauri) por ahora');
  },

  crear_cliente: async (nombre: string, apellido: string, telefono?: string): Promise<string> => {
    if (isTauri()) return invokeTauri<string>('crear_cliente', { nombre, apellido, telefono: telefono || null });
    throw new Error('Solo disponible en versión de escritorio (Tauri) por ahora');
  },

  crear_deuda: async (payload: {
    clienteId: string;
    usuarioId: string;
    subtotal: string;
    impuesto: string;
    total: string;
    lineas: LineaInput[];
  }): Promise<string> => {
    if (isTauri()) return invokeTauri<string>('crear_deuda', payload);
    throw new Error('Solo disponible en versión de escritorio (Tauri) por ahora');
  },

  listar_deudas_cliente: async (clienteId: string): Promise<DeudaInfo[]> => {
    if (isTauri()) return invokeTauri<DeudaInfo[]>('listar_deudas_cliente', { clienteId });
    throw new Error('Solo disponible en versión de escritorio (Tauri) por ahora');
  },

  pagar_deudas_productos: async (payload: {
    usuarioId: string;
    formaPago: string;
    moneda: string;
    referenciaPago?: string;
    tasaCambio?: string;
    lineasAPagar: { deudaId: string; lineaId: string }[];
  }): Promise<string> => {
    if (isTauri()) return invokeTauri<string>('pagar_deudas_productos', { payload });
    throw new Error('Solo disponible en versión de escritorio (Tauri) por ahora');
  },

  eliminar_cliente: async (clienteId: string): Promise<void> => {
    if (isTauri()) return invokeTauri<void>('eliminar_cliente', { clienteId });
    throw new Error('Solo disponible en versión de escritorio (Tauri) por ahora');
  },

  eliminar_deuda: async (deudaId: string): Promise<void> => {
    if (isTauri()) return invokeTauri<void>('eliminar_deuda', { deudaId });
    throw new Error('Solo disponible en versión de escritorio (Tauri) por ahora');
  },

  eliminar_linea_deuda: async (deudaId: string, lineaId: string): Promise<void> => {
    if (isTauri()) return invokeTauri<void>('eliminar_linea_deuda', { deudaId, lineaId });
    throw new Error('Solo disponible en versión de escritorio (Tauri) por ahora');
  },

  actualizar_cantidad_linea_deuda: async (deudaId: string, lineaId: string, nuevaCantidad: number): Promise<void> => {
    if (isTauri()) return invokeTauri<void>('actualizar_cantidad_linea_deuda', { deudaId, lineaId, nuevaCantidad });
    throw new Error('Solo disponible en versión de escritorio (Tauri) por ahora');
  },

  // ── USUARIOS ──
  listar_usuarios: async (): Promise<Usuario[]> => {
    if (isTauri()) return invokeTauri<Usuario[]>('listar_usuarios');
    return callEdge<Usuario[]>('fn-auth', { accion: 'listar' });
  },

  verificar_pin: async (usuario_id: string, pin: string): Promise<boolean> => {
    if (isTauri()) return invokeTauri<boolean>('verificar_pin', { usuarioId: usuario_id, pin });
    return callEdge<boolean>('fn-auth', { accion: 'verificar_pin', usuarioId: usuario_id, pin });
  },

  // ── PRODUCTOS ──
  listar_productos: async (): Promise<Producto[]> => {
    if (isTauri()) return invokeTauri<Producto[]>('listar_productos');
    return callEdge<Producto[]>('fn-productos', { accion: 'listar' });
  },

  listar_productos_admin: async (): Promise<Producto[]> => {
    if (isTauri()) return invokeTauri<Producto[]>('listar_productos_admin');
    return callEdge<Producto[]>('fn-productos', { accion: 'listar_admin' });
  },

  crear_producto: async (payload: any): Promise<void> => {
    if (isTauri()) return invokeTauri<void>('crear_producto', payload);
    await callEdge<{ ok: boolean }>('fn-productos', { accion: 'crear', ...payload });
  },

  actualizar_producto: async (payload: any): Promise<void> => {
    if (isTauri()) return invokeTauri<void>('actualizar_producto', payload);
    await callEdge<{ ok: boolean }>('fn-productos', { accion: 'actualizar', ...payload });
  },

  // ── CONFIGURACIÓN ──
  obtener_configuracion: async (): Promise<ConfigApp> => {
    if (isTauri()) return invokeTauri<ConfigApp>('obtener_configuracion');
    return callEdge<ConfigApp>('fn-configuracion', { accion: 'obtener' });
  },

  actualizar_configuracion: async (clave: string, valor: string): Promise<void> => {
    if (isTauri()) return invokeTauri<void>('actualizar_configuracion', { clave, valor });
    await callEdge<{ ok: boolean }>('fn-configuracion', { accion: 'actualizar', clave, valor });
  },

  // ── VENTAS ──
  crear_venta: async (payload: any): Promise<string> => {
    if (isTauri()) return invokeTauri<string>('crear_venta', payload);
    // Web: la Edge Function maneja la inserción y el descuento de stock
    return callEdge<string>('fn-ventas', { accion: 'crear', ...payload });
  },

  resumen_ventas_dia: async (soloPendientes: boolean = false): Promise<ResumenDia> => {
    if (isTauri()) return invokeTauri<ResumenDia>('resumen_ventas_dia', { soloPendientes });
    // Web: pasamos el rango del día en hora local para que la Edge Function lo use
    const range = getLocalDayRange();
    return callEdge<ResumenDia>('fn-ventas', {
      accion: 'resumen_dia',
      soloPendientes,
      rangeStart: range.start,
      rangeEnd: range.end,
    });
  },

  // ── CORTES DE CAJA ──
  registrar_corte_caja: async (payload: any): Promise<string> => {
    if (isTauri()) return invokeTauri<string>('registrar_corte_caja', payload);
    // Web: la Edge Function crea el corte y asocia las ventas del rango
    const range = getLocalDayRange();
    return callEdge<string>('fn-cortes', {
      accion: 'registrar_x',
      rangeStart: range.start,
      rangeEnd: range.end,
      ...payload,
    });
  },

  listar_cortes_caja: async (): Promise<CorteCajaInfo[]> => {
    if (isTauri()) return invokeTauri<CorteCajaInfo[]>('listar_cortes_caja');
    return callEdge<CorteCajaInfo[]>('fn-cortes', { accion: 'listar' });
  },

  generar_pdf_corte: async (payload: { corteId: string }): Promise<string> => {
    let corte: any, ventas: any[], lineas: any[];
    const tzOffset = new Date().getTimezoneOffset();

    if (isTauri()) {
      try {
        // Intentar descargar desde Edge Function para obtener TODAS las ventas (incluidas las de otras laptops)
        const data = await callEdge<{ corte: any; ventas: any[]; lineas: any[] }>('fn-cortes', { 
          accion: 'datos_pdf', 
          corteId: payload.corteId,
          tzOffset 
        });
        corte = data.corte;
        ventas = data.ventas;
        lineas = data.lineas;
      } catch (e) {
        console.warn('[PDF] Modo offline o error de red. Usando SQLite local:', e);
        // Fallback offline: usar base local
        const localData = await invokeTauri<{ corte: any; ventas: any[]; lineas: any[] }>('obtener_datos_pdf_corte', { corteId: payload.corteId });
        corte = localData.corte;
        ventas = localData.ventas;
        lineas = localData.lineas;
      }
    } else {
      const data = await callEdge<{ corte: any; ventas: any[]; lineas: any[] }>('fn-cortes', { 
        accion: 'datos_pdf', 
        corteId: payload.corteId,
        tzOffset 
      });
      corte = data.corte;
      ventas = data.ventas;
      lineas = data.lineas;
    }

    // Calcular sistema y desglose
    const sys = { bsEfectivo: 0, bsDebito: 0, bsPagoMovil: 0, usdEfectivo: 0 };
    ventas.forEach((v) => {
      const totalNum = parseFloat(v.total) || 0;
      if (v.formaPago === 'USD_EFECTIVO') {
        sys.usdEfectivo += totalNum;
      } else {
        const tasa = parseFloat(v.tasaCambio || '1') || 1;
        const totalBs = totalNum * tasa;
        if (v.formaPago === 'BS_EFECTIVO') sys.bsEfectivo += totalBs;
        if (v.formaPago === 'BS_DEBITO') sys.bsDebito += totalBs;
        if (v.formaPago === 'BS_PAGO_MOVIL') sys.bsPagoMovil += totalBs;
      }
    });


    let decl: any = null;
    try {
      const parsed = JSON.parse(corte.totalDeclarado);
      // Asegurar que todos los campos requeridos existan
      decl = {
        bsEfectivo: parsed.bsEfectivo ?? '0.00',
        bsDebito: parsed.bsDebito ?? '0.00',
        bsPagoMovil: parsed.bsPagoMovil ?? '0.00',
        usdEfectivo: parsed.usdEfectivo ?? '0.00',
        totalUsdEquiv: parsed.totalUsdEquiv ?? '0.00',
        tasaCambio: parsed.tasaCambio ?? null,
      };
    } catch {
      // Si no es JSON válido (número plano), construir fallback completo
      const num = parseFloat(corte.totalDeclarado) || 0;
      decl = {
        bsEfectivo: '0.00', bsDebito: '0.00', bsPagoMovil: '0.00',
        usdEfectivo: '0.00', totalUsdEquiv: num.toFixed(2)
      };
    }

    const doc = new jsPDF();
    
    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("MUNEGON POS", 20, 20);
    
    doc.setFontSize(14);
    const tipoCorte = corte.tipo === 'Z' ? 'CIERRE DE DIA — CORTE Z' : 'CORTE DE TURNO — CORTE X';
    doc.text(tipoCorte, 20, 30);
    
    doc.setLineWidth(0.5);
    doc.line(20, 34, 190, 34);
    
    // Metadata (Formato de fecha solicitado: Jueves 6-11-26 y hora sin segundos)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    
    // parseLocalDate maneja correctamente UTC de Supabase y fechas sin zona de SQLite
    const dateObj = parseLocalDate(corte.creadoEn);
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaNombre = diasSemana[dateObj.getDay()];
    const dia = dateObj.getDate();
    const mes = dateObj.getMonth() + 1;
    const anio2Dig = dateObj.getFullYear().toString().slice(-2);
    const fechaFormateada = `${diaNombre} ${mes}-${dia}-${anio2Dig}`;
    
    // Formato 12h igual que el widget del reloj de la app (h:mmpm)
    let horasRaw = dateObj.getHours();
    const minutos = dateObj.getMinutes().toString().padStart(2, '0');
    const ampm = horasRaw >= 12 ? 'pm' : 'am';
    horasRaw = horasRaw % 12;
    horasRaw = horasRaw ? horasRaw : 12;
    const horaFormateada = `${horasRaw}:${minutos}${ampm}`;

    doc.text(`Fecha:        ${fechaFormateada}`, 20, 42);
    doc.text(`Hora:         ${horaFormateada}`, 20, 48);
    // Mostrar el Cajero que emitió el corte
    doc.text(`Cajero:       ${corte.nombreUsuario || corte.Usuario?.nombre || 'Desconocido'}`, 20, 54);
    
    const tasaStr = decl && decl.tasaCambio ? `${parseFloat(decl.tasaCambio).toFixed(2)} Bs/$` : 'No registrada';
    doc.text(`Tasa:         ${tasaStr}`, 20, 60);

    doc.text(`Transacciones: ${ventas.length}`, 20, 66);
    doc.line(20, 70, 190, 70);
    
    let y = 78;

    if (decl) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      const tituloTabla = corte.tipo === 'Z' ? 'VENTAS DEL DIA VS CONTEO FISICO' : 'VENTAS DEL TURNO VS CONTEO FISICO';
      doc.text(tituloTabla, 20, y);
      doc.line(20, y + 2, 190, y + 2);
      y += 8;
      
      // Encabezados de tabla
      doc.setFontSize(10);
      doc.text("Método", 20, y);
      doc.text("Sistema", 65, y);
      doc.text("Físico", 115, y);
      doc.text("Diferencia", 155, y);
      doc.line(20, y + 2, 190, y + 2);
      y += 8;
      
      doc.setFont("helvetica", "normal");
      
      const man_bs_efectivo = parseFloat(decl.bsEfectivo) || 0;
      const man_bs_debito = parseFloat(decl.bsDebito) || 0;
      const man_bs_pago_movil = parseFloat(decl.bsPagoMovil) || 0;
      const man_usd_efectivo = parseFloat(decl.usdEfectivo) || 0;

      const filas = [
        { label: "Efectivo Bs", sys: sys.bsEfectivo, man: man_bs_efectivo, unit: "Bs" },
        { label: "Débito Bs", sys: sys.bsDebito, man: man_bs_debito, unit: "Bs" },
        { label: "Pago Móvil Bs", sys: sys.bsPagoMovil, man: man_bs_pago_movil, unit: "Bs" },
        { label: "Efectivo USD", sys: sys.usdEfectivo, man: man_usd_efectivo, unit: "$" },
      ];
      
      for (const row of filas) {
        const diff = row.man - row.sys;
        const diffSign = diff >= 0 ? '+' : '';
        const fmtVal = (v: number) => row.unit === '$' ? `$ ${v.toFixed(2)}` : `${v.toFixed(2)} Bs`;
        
        doc.text(row.label, 20, y);
        doc.text(fmtVal(row.sys), 65, y);
        doc.text(fmtVal(row.man), 115, y);
        doc.text(`${diffSign}${fmtVal(diff)}`, 155, y);
        y += 6;
      }
      
      doc.line(20, y, 190, y);
      y += 8;
    }
    
    // Resumen financiero
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("RESUMEN GENERAL (EQUIVALENTE USD)", 20, y);
    doc.line(20, y + 2, 190, y + 2);
    y += 8;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    
    const sysTotalUsd = corte.totalCalculado;
    const manTotalUsd = decl ? decl.totalUsdEquiv : corte.totalDeclarado;
    const diffTotalUsd = parseFloat(corte.diferencia) || 0;
    const diffSign = diffTotalUsd >= 0 ? '+' : '';
    
    doc.text("Total Sistema:", 20, y);
    doc.text(`$ ${parseFloat(sysTotalUsd).toFixed(2)} USD`, 115, y);
    y += 6;
    
    doc.text("Total Declarado (Físico):", 20, y);
    doc.text(`$ ${parseFloat(manTotalUsd).toFixed(2)} USD`, 115, y);
    y += 6;
    
    doc.text("Diferencia:", 20, y);
    doc.text(`$ ${diffSign}${diffTotalUsd.toFixed(2)} USD`, 115, y);
    y += 8;
    
    // Efectivo en caja para el inicio del siguiente día (Solo para Reporte Z)
    if (corte.tipo === 'Z' && decl) {
      doc.setFont("helvetica", "bold");
      doc.text("EFECTIVO FÍSICO EN CAJA (PARA MAÑANA):", 20, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.text(`- Efectivo Bs:  ${parseFloat(decl.bsEfectivo).toFixed(2)} Bs`, 25, y);
      y += 6;
      doc.text(`- Efectivo USD: $ ${parseFloat(decl.usdEfectivo).toFixed(2)} USD`, 25, y);
      y += 10;
    }
    
    // Detalle de ventas por producto (agrupado y ordenado)
    if (lineas && lineas.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("DETALLE DE VENTAS POR PRODUCTO", 20, y);
      doc.line(20, y + 2, 190, y + 2);
      y += 8;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      
      lineas.forEach((l: any) => {
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
        const cant = l.cantidad;
        const precio = parseFloat(l.precioUnit) || 0;
        const subtotal = parseFloat(l.subtotal) || 0;
        doc.text(`${l.nombreProducto} x${cant} @ $${precio.toFixed(2)} = $${subtotal.toFixed(2)}`, 20, y);
        y += 6;
      });
    }
    
    const filename = `Corte_${corte.tipo}_${corte.id.substring(0, 8)}.pdf`;

    if (isTauri()) {
      // Tauri offline: guardar y abrir nativamente pasándole los bytes
      const pdfBytes = doc.output('arraybuffer');
      const ruta = await invokeTauri<string>('guardar_y_abrir_pdf', {
        filename,
        pdfBytes: Array.from(new Uint8Array(pdfBytes))
      });
      return ruta;
    } else {
      doc.save(filename);
      return filename;
    }
  },

  generar_pdf_corte_z: async (payload: any): Promise<string> => {
    if (isTauri()) {
      const corteId = await invokeTauri<string>('generar_pdf_corte_z', payload);
      return await api.generar_pdf_corte({ corteId });
    }
    
    // Web: calculamos el resumen localmente para determinar los totales del sistema
    const resumen = await api.resumen_ventas_dia(false);
    const tasa = parseFloat(payload.tasaCambio || '1') || 1;
    
    const totalBsSistema = (parseFloat(resumen.bsEfectivo) || 0)
      + (parseFloat(resumen.bsDebito) || 0)
      + (parseFloat(resumen.bsPagoMovil) || 0);
    const totalUsdSistema = parseFloat(resumen.usdEfectivo) || 0;
    const sysTotalUsdEquiv = (totalBsSistema / tasa) + totalUsdSistema;
    
    let decl: any = null;
    try { decl = JSON.parse(payload.totalDeclarado); } catch { decl = null; }
    const manTotalUsdEquiv = decl ? parseFloat(decl.totalUsdEquiv) || 0 : 0;
    const diferenciaUsd = manTotalUsdEquiv - sysTotalUsdEquiv;

    // Registrar el Corte Z vía Edge Function (incluye cierre de ventas del día)
    const range = getLocalDayRange();
    const corteId = await callEdge<string>('fn-cortes', {
      accion: 'registrar_z',
      usuarioId: payload.usuarioId,
      totalCalculado: sysTotalUsdEquiv.toFixed(2),
      totalDeclarado: payload.totalDeclarado,
      diferencia: diferenciaUsd.toFixed(2),
      rangeStart: range.start,
      rangeEnd: range.end,
    });

    // Generar y descargar el PDF en el cliente
    return await api.generar_pdf_corte({ corteId });
  }
};
