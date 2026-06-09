import { createClient } from '@supabase/supabase-js';
import SHA256 from 'crypto-js/sha256';

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
  tipo: string;
  usuario_id: string;
  nombre_usuario: string;
  total_calculado: string;
  total_declarado: string;
  diferencia: string;
  creado_en: string;
}

export interface Usuario {
  id: string;
  nombre: string;
  rol: string;
  activo: boolean;
}

export interface ResumenDia {
  bs_efectivo: string;
  bs_debito: string;
  bs_pago_movil: string;
  usd_efectivo: string;
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
        ...l,
        id: crypto.randomUUID(),
        ventaId: ventaId
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
      bs_efectivo: resumen.bs_efectivo.toFixed(2),
      bs_debito: resumen.bs_debito.toFixed(2),
      bs_pago_movil: resumen.bs_pago_movil.toFixed(2),
      usd_efectivo: resumen.usd_efectivo.toFixed(2)
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
      ...d,
      nombre_usuario: d.Usuario?.nombre || 'Desconocido',
      creado_en: d.creadoEn,
      usuario_id: d.usuarioId,
      total_calculado: d.totalCalculado,
      total_declarado: d.totalDeclarado
    }));
  },

  generar_pdf_corte: async (payload: { corteId: string }): Promise<string> => {
    if (isTauri()) return invokeTauri<string>('generar_pdf_corte', payload);
    // Web: Lanzamos un prompt informando que el PDF nativo no está disponible
    alert("En la versión Web, los PDFs nativos no están disponibles aún. Se puede visualizar en el listado.");
    return "";
  },

  generar_pdf_corte_z: async (payload: any): Promise<string> => {
    if (isTauri()) return invokeTauri<string>('generar_pdf_corte_z', payload);
    // Web: Crear el registro Z en Supabase
    const id = crypto.randomUUID();
    const total_bs = (await api.resumen_ventas_dia()).bs_efectivo; // Simplificado web
    
    await supabase.from('CorteCaja').insert([{
      id,
      tipo: 'Z',
      usuarioId: payload.usuarioId,
      totalCalculado: total_bs,
      totalDeclarado: payload.totalDeclarado,
      diferencia: '0.00',
      isSynced: true
    }]);
    
    // Cerrar las ventas del dia
    const hoy = new Date().toISOString().split('T')[0];
    await supabase.from('Venta').update({ corteCajaId: id }).gte('creadoEn', hoy).is('corteCajaId', null);

    alert("Corte Z generado en servidor. Visualización de PDF próximamente en Web.");
    return "";
  }
};
