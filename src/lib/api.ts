import { createClient } from '@supabase/supabase-js';
import SHA256 from 'crypto-js/sha256';
import { jsPDF } from 'jspdf';

// Tipos base (basados en Prisma/Rust)
export interface Producto {
  id: string;
  sku: string;
  nombre: string;
  descripcion: string | null;
  precioUSD: string;
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
  producto_id: string;
  cantidad: number;
  precio_unit: string;
  subtotal: string;
}

// Cliente de Supabase
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Detección de entorno: Si Tauri está inyectado, estamos en Escritorio
// Nota: en Tauri v2 puede ser __TAURI__, __TAURI_INTERNALS__ o __TAURI_IPC__
export const isTauri = () => typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window);

// Wrapper genérico para comandos
// Intentamos cargar dinámicamente @tauri-apps/api/core para no romper la web.
async function invokeTauri<T>(cmd: string, args: any = {}): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<T>(cmd, args);
}

// ──────────────────────────────────────────────────────────────
// API 
// ──────────────────────────────────────────────────────────────

export const api = {
  // ── USUARIOS ──
  listar_usuarios: async (): Promise<Usuario[]> => {
    if (isTauri()) return invokeTauri<Usuario[]>('listar_usuarios');
    const { data, error } = await supabase.from('Usuario').select('id, nombre, rol, activo').eq('activo', true).order('nombre');
    if (error) throw new Error(error.message);
    return data;
  },

  verificar_pin: async (usuario_id: string, pin: string): Promise<boolean> => {
    if (isTauri()) return invokeTauri<boolean>('verificar_pin', { usuarioId: usuario_id, pin });
    const hash_ingresado = SHA256(pin).toString();
    const { data, error } = await supabase.from('Usuario').select('pin').eq('id', usuario_id).eq('activo', true).single();
    if (error || !data) return false;
    return data.pin === hash_ingresado;
  },

  // ── PRODUCTOS ──
  listar_productos: async (): Promise<Producto[]> => {
    if (isTauri()) return invokeTauri<Producto[]>('listar_productos');
    const { data, error } = await supabase.from('Producto').select('*').eq('activo', true).gt('stock', 0).order('nombre');
    if (error) throw new Error(error.message);
    return data;
  },

  listar_productos_admin: async (): Promise<Producto[]> => {
    if (isTauri()) return invokeTauri<Producto[]>('listar_productos_admin');
    const { data, error } = await supabase.from('Producto').select('*').order('nombre');
    if (error) throw new Error(error.message);
    return data;
  },

  crear_producto: async (payload: any): Promise<void> => {
    if (isTauri()) return invokeTauri<void>('crear_producto', payload);
    const supabasePayload = { ...payload, precioUSD: payload.precioUsd, isSynced: true };
    delete supabasePayload.precioUsd;
    const { error } = await supabase.from('Producto').insert([supabasePayload]);
    if (error) throw new Error(error.message);
  },

  actualizar_producto: async (payload: any): Promise<void> => {
    if (isTauri()) return invokeTauri<void>('actualizar_producto', payload);
    const supabasePayload = { ...payload };
    if (supabasePayload.precioUsd !== undefined) {
      supabasePayload.precioUSD = supabasePayload.precioUsd;
      delete supabasePayload.precioUsd;
    }
    const { error } = await supabase.from('Producto').update(supabasePayload).eq('id', payload.id);
    if (error) throw new Error(error.message);
  },

  // ── CONFIGURACIÓN ──
  obtener_configuracion: async (): Promise<ConfigApp> => {
    if (isTauri()) return invokeTauri<ConfigApp>('obtener_configuracion');
    const { data, error } = await supabase.from('Configuracion').select('clave, valor');
    if (error) throw new Error(error.message);
    const config: any = { tasa_cambio_bsd: '1.00', iva_porcentaje: '16' };
    data?.forEach(d => config[d.clave] = d.valor);
    return config as ConfigApp;
  },

  actualizar_configuracion: async (clave: string, valor: string): Promise<void> => {
    if (isTauri()) return invokeTauri<void>('actualizar_configuracion', { clave, valor });
    const { error } = await supabase.from('Configuracion').upsert({ clave, valor });
    if (error) throw new Error(error.message);
  },

  // ── VENTAS ──
  crear_venta: async (payload: any): Promise<string> => {
    if (isTauri()) return invokeTauri<string>('crear_venta', payload);
    
    // Web: Inserción manual en Supabase
    const { lineas, ...ventaData } = payload;
    const ventaId = crypto.randomUUID();
    
    // Insertar Venta
    const { error: vErr } = await supabase.from('Venta').insert([{
      ...ventaData,
      id: ventaId,
      isSynced: true
    }]);
    if (vErr) throw new Error(vErr.message);

    // Insertar Lineas
    if (lineas && lineas.length > 0) {
      const lineasInsert = lineas.map((l: any) => ({
        id: crypto.randomUUID(),
        ventaId: ventaId,
        productoId: l.producto_id || l.productoId,
        cantidad: l.cantidad,
        precioUnit: l.precio_unit || l.precioUnit,
        subtotal: l.subtotal
      }));
      const { error: lErr } = await supabase.from('LineaVenta').insert(lineasInsert);
      if (lErr) throw new Error(lErr.message);

      // Actualizar stock de cada producto
      for (const linea of lineasInsert) {
        // Obtenemos stock actual (por seguridad, aunque deberia hacerse via RPC en produccion)
        const { data: p } = await supabase.from('Producto').select('stock').eq('id', linea.productoId).single();
        if (p) {
          await supabase.from('Producto').update({ stock: p.stock - linea.cantidad }).eq('id', linea.productoId);
        }
      }
    }
    return ventaId;
  },

  resumen_ventas_dia: async (): Promise<ResumenDia> => {
    if (isTauri()) return invokeTauri<ResumenDia>('resumen_ventas_dia');
    
    // Web: calculamos el resumen sumando las ventas de hoy (UTC local aproximado)
    const hoy = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('Venta').select('total, formaPago, tasaCambio').gte('creadoEn', hoy);
    if (error) throw new Error(error.message);

    const resumen = { bs_efectivo: 0, bs_debito: 0, bs_pago_movil: 0, usd_efectivo: 0 };
    data?.forEach(v => {
      const totalNum = parseFloat(v.total);
      if (v.formaPago === 'USD_EFECTIVO') {
        resumen.usd_efectivo += totalNum;
      } else {
        const tasa = parseFloat(v.tasaCambio || '1');
        const totalBs = totalNum * tasa;
        if (v.formaPago === 'BS_EFECTIVO') resumen.bs_efectivo += totalBs;
        if (v.formaPago === 'BS_DEBITO') resumen.bs_debito += totalBs;
        if (v.formaPago === 'BS_PAGO_MOVIL') resumen.bs_pago_movil += totalBs;
      }
    });

    return {
      bsEfectivo: resumen.bs_efectivo.toFixed(2),
      bsDebito: resumen.bs_debito.toFixed(2),
      bsPagoMovil: resumen.bs_pago_movil.toFixed(2),
      usdEfectivo: resumen.usd_efectivo.toFixed(2)
    };
  },

  // ── CORTES DE CAJA ──
  registrar_corte_caja: async (payload: any): Promise<string> => {
    if (isTauri()) return invokeTauri<string>('registrar_corte_caja', payload);
    const id = crypto.randomUUID();
    const { error } = await supabase.from('CorteCaja').insert([{ ...payload, id, isSynced: true }]);
    if (error) throw new Error(error.message);
    return id;
  },

  listar_cortes_caja: async (): Promise<CorteCajaInfo[]> => {
    if (isTauri()) return invokeTauri<CorteCajaInfo[]>('listar_cortes_caja');
    const { data, error } = await supabase.from('CorteCaja')
      .select('*, Usuario(nombre)')
      .order('creadoEn', { ascending: false });
    
    if (error) throw new Error(error.message);
    
    return data.map((d: any) => ({
      id: d.id,
      tipo: d.tipo,
      usuarioId: d.usuarioId,
      nombreUsuario: d.Usuario?.nombre || 'Desconocido',
      totalCalculado: d.totalCalculado,
      totalDeclarado: d.totalDeclarado,
      diferencia: d.diferencia,
      creadoEn: d.creadoEn
    }));
  },

  generar_pdf_corte: async (payload: { corteId: string }): Promise<string> => {
    if (isTauri()) return invokeTauri<string>('generar_pdf_corte', payload);
    
    // Web: Generación de PDF en cliente con jsPDF
    // 1. Obtener datos del Corte
    const { data: corte, error: cErr } = await supabase
      .from('CorteCaja')
      .select('*, Usuario(nombre)')
      .eq('id', payload.corteId)
      .single();
      
    if (cErr || !corte) throw new Error(`Corte no encontrado: ${cErr?.message || 'Error desconocido'}`);
    
    // 2. Obtener ventas del corte (para sumatorias del sistema)
    const { data: ventas, error: vErr } = await supabase
      .from('Venta')
      .select('total, formaPago, tasaCambio')
      .eq('corteCajaId', payload.corteId);
      
    if (vErr) console.warn('[Corte PDF] Error cargando ventas:', vErr.message);

    // 3. Obtener líneas de venta asociadas a este corte
    const { data: lineas, error: lErr } = await supabase
      .from('LineaVenta')
      .select('cantidad, precioUnit, subtotal, Producto(nombre), Venta!inner(corteCajaId)')
      .eq('Venta.corteCajaId', payload.corteId);

    if (lErr) console.warn('[Corte PDF] Error cargando líneas de venta:', lErr.message);

    // Calcular sistema y desglose
    const sys = { bsEfectivo: 0, bsDebito: 0, bsPagoMovil: 0, usdEfectivo: 0 };
    ventas?.forEach((v) => {
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
      decl = JSON.parse(corte.totalDeclarado);
    } catch {
      decl = null;
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
    
    // Metadata
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const fecha = new Date(corte.creadoEn).toLocaleString('es-VE');
    doc.text(`Fecha:        ${fecha}`, 20, 42);
    doc.text(`Cajero:       ${corte.Usuario?.nombre || 'Desconocido'}`, 20, 48);
    doc.text(`Transacciones: ${ventas?.length || 0}`, 20, 54);
    doc.line(20, 58, 190, 58);
    
    let y = 66;

    if (corte.tipo === 'Z' && decl) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("VENTAS DEL DIA VS CONTEO FISICO", 20, y);
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
    
    // Detalle de ventas
    if (lineas && lineas.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("DETALLE DE VENTAS POR PRODUCTO", 20, y);
      doc.line(20, y + 2, 190, y + 2);
      y += 8;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      
      const prodMap: Record<string, { cant: number; precio: number; subtotal: number }> = {};
      lineas.forEach((l: any) => {
        const nombre = l.Producto?.nombre || 'Producto Desconocido';
        const cant = l.cantidad || 0;
        const precio = parseFloat(l.precioUnit) || 0;
        const sub = parseFloat(l.subtotal) || 0;
        
        if (!prodMap[nombre]) {
          prodMap[nombre] = { cant: 0, precio, subtotal: 0 };
        }
        prodMap[nombre].cant += cant;
        prodMap[nombre].subtotal += sub;
      });
      
      Object.keys(prodMap).sort().forEach((name) => {
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
        const item = prodMap[name];
        doc.text(`${name} x${item.cant} @ $${item.precio.toFixed(2)} = $${item.subtotal.toFixed(2)}`, 20, y);
        y += 6;
      });
    }
    
    const filename = `Corte_${corte.tipo}_${corte.id.substring(0, 8)}.pdf`;
    doc.save(filename);
    return filename;
  },

  generar_pdf_corte_z: async (payload: any): Promise<string> => {
    if (isTauri()) return invokeTauri<string>('generar_pdf_corte_z', payload);
    
    // Web: Registrar el Corte Z en Supabase
    const id = crypto.randomUUID();
    
    const resumen = await api.resumen_ventas_dia();
    const tasa = parseFloat(payload.tasaCambio || '1') || 1;
    
    const totalBsSistema = (parseFloat(resumen.bsEfectivo) || 0) + (parseFloat(resumen.bsDebito) || 0) + (parseFloat(resumen.bsPagoMovil) || 0);
    const totalUsdSistema = (parseFloat(resumen.usdEfectivo) || 0);
    
    const sysTotalUsdEquiv = (totalBsSistema / tasa) + totalUsdSistema;
    
    let decl: any = null;
    try {
      decl = JSON.parse(payload.totalDeclarado);
    } catch {
      decl = null;
    }
    const manTotalUsdEquiv = decl ? parseFloat(decl.totalUsdEquiv) || 0 : 0;
    const diferenciaUsd = manTotalUsdEquiv - sysTotalUsdEquiv;

    const { error: cErr } = await supabase.from('CorteCaja').insert([{
      id,
      tipo: 'Z',
      usuarioId: payload.usuarioId,
      totalCalculado: sysTotalUsdEquiv.toFixed(2),
      totalDeclarado: payload.totalDeclarado,
      diferencia: diferenciaUsd.toFixed(2),
      isSynced: true
    }]);
    if (cErr) throw new Error(cErr.message);
    
    // Cerrar las ventas del dia
    const hoy = new Date().toISOString().split('T')[0];
    const { error: vErr } = await supabase.from('Venta')
      .update({ corteCajaId: id })
      .gte('creadoEn', hoy)
      .is('corteCajaId', null);
      
    if (vErr) console.warn('[Corte Z Web] Error cerrando ventas:', vErr.message);

    // Generar y descargar el PDF en cliente
    return await api.generar_pdf_corte({ corteId: id });
  }
};
