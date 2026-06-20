const fs = require('fs');

const filePath = String.raw`c:\Users\iraki\Desktop\Muñegon app carpeta\Muñegon App\src\lib\sync-listener.ts`;
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add fetching of clientes and deudas
const oldFetch = `      const [ventas, productos, logs, cortes] = await Promise.all([
        invoke<Record<string, unknown>[]>('obtener_ventas_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_productos_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_logs_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_cortes_pendientes'),
      ]);`;

const newFetch = `      const [ventas, productos, logs, cortes, clientes, deudas] = await Promise.all([
        invoke<Record<string, unknown>[]>('obtener_ventas_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_productos_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_logs_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_cortes_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_clientes_pendientes'),
        invoke<Record<string, unknown>[]>('obtener_deudas_pendientes'),
      ]);`;
content = content.replace(oldFetch, newFetch);

// 2. Add log printing for clientes and deudas
const oldLog = `console.log(\`[Sync] 📦 Pendientes: \${ventas.length} ventas, \${productos.length} productos, \${logs.length} logs, \${cortes.length} cortes\`);`;
const newLog = `console.log(\`[Sync] 📦 Pendientes: \${ventas.length} ventas, \${deudas.length} deudas, \${clientes.length} clientes, \${productos.length} productos, \${logs.length} logs, \${cortes.length} cortes\`);`;
content = content.replace(oldLog, newLog);

// 3. Add arrays to store the processed IDs
const oldArrays = `      const ventaIds: string[] = [];
      const productoIds: string[] = [];
      const logIds: string[] = [];
      const corteIds: string[] = [];`;
const newArrays = `      const ventaIds: string[] = [];
      const productoIds: string[] = [];
      const logIds: string[] = [];
      const corteIds: string[] = [];
      const clienteIds: string[] = [];
      const deudaIds: string[] = [];`;
content = content.replace(oldArrays, newArrays);

// 4. Update the logic to ignore stock update if esCobroDeuda === true
const oldVentaLogic = `        // Descontar stock solo para ventas NUEVAS (no duplicadas)
        const nuevasVentas = ventas.filter((v) => !existingVentaIds.has(v['id'] as string));
        const nuevasLineas = nuevasVentas.flatMap((v) => (v['lineas'] as any[] || []));`;
const newVentaLogic = `        // Descontar stock solo para ventas NUEVAS (no duplicadas) y que NO sean cobros de deuda
        const nuevasVentas = ventas.filter((v) => !existingVentaIds.has(v['id'] as string) && !(v as any).esCobroDeuda);
        const nuevasLineas = nuevasVentas.flatMap((v) => (v['lineas'] as any[] || []));`;
content = content.replace(oldVentaLogic, newVentaLogic);

// 5. Add processing logic for Clientes and Deudas before "4. Logs de auditoría"
const oldLogsLogicStr = `      // 4. Logs de auditoría`;
const newDeudaLogicStr = `      // 3.1. Clientes
      if (clientes.length > 0) {
        const clientesData = clientes.map((c) => ({ ...c, isSynced: true }));
        const { error } = await supabase.from('Cliente').upsert(clientesData, { onConflict: 'id' });
        if (error) throw new Error(\`Clientes: \${error.message}\`);
        clienteIds.push(...clientes.map((c) => c['id'] as string));
        totalSynced += clientes.length;
      }

      // 3.2. Deudas y sus Líneas
      if (deudas.length > 0) {
        const deudasData = deudas.map((d) => {
          const { lineas, ...dRest } = d;
          return { ...dRest, isSynced: true } as any;
        });
        const lineasDeudaData = deudas.flatMap((d) => (d['lineas'] as any[] || []));
        const deudaIdsSubir = deudasData.map((d: any) => d.id as string);

        // Verificar cuáles deudas ya existían y su estado en Supabase
        const { data: existingDeudas, error: checkErrD } = await supabase
          .from('Deuda').select('id, activo').in('id', deudaIdsSubir);
        if (checkErrD) throw new Error(\`Error verificando deudas: \${checkErrD.message}\`);
        const existingDeudasMap = new Map((existingDeudas || []).map((d) => [d.id, d.activo]));

        const { error: dErr } = await supabase.from('Deuda').upsert(deudasData, { onConflict: 'id' });
        if (dErr) throw new Error(\`Deudas: \${dErr.message}\`);

        if (lineasDeudaData.length > 0) {
          const { error: ldErr } = await supabase.from('LineaDeuda').upsert(lineasDeudaData, { onConflict: 'id' });
          if (ldErr) throw new Error(\`Lineas de deuda: \${ldErr.message}\`);
        }

        // --- MATEMATICA DE INVENTARIO PARA DEUDAS ---
        const stockUpdatesDeudas: Record<string, number> = {};

        for (const deuda of deudas) {
          const dId = deuda.id as string;
          const wasActiveInCloud = existingDeudasMap.get(dId);
          const isNowActive = deuda.activo as boolean;
          const isAnulada = deuda.anulada as boolean;

          const lineas = (deuda.lineas as any[]) || [];

          if (wasActiveInCloud === undefined && isNowActive) {
            // Es una deuda NUEVA (fiar). Hay que RESTAR stock.
            for (const linea of lineas) {
              const pid = linea.productoId;
              stockUpdatesDeudas[pid] = (stockUpdatesDeudas[pid] || 0) + (linea.cantidad as number); // Sumamos a la cantidad a restar
            }
          } else if (wasActiveInCloud === true && !isNowActive && isAnulada) {
            // Era activa, ahora es inactiva y está ANULADA. Hay que REPONER stock.
            // Para la reposición matemática usaremos un valor negativo en stockUpdatesDeudas, 
            // ya que al final se resta. Restar un negativo = sumar.
            for (const linea of lineas) {
              const pid = linea.productoId;
              stockUpdatesDeudas[pid] = (stockUpdatesDeudas[pid] || 0) - (linea.cantidad as number);
            }
          }
        }

        for (const [productoId, cantidadRestar] of Object.entries(stockUpdatesDeudas)) {
          if (cantidadRestar === 0) continue;
          const { data: p, error: pErr } = await supabase
            .from('Producto').select('stock').eq('id', productoId).single();
          if (pErr) { console.error(\`[Sync] Error stock deuda \${productoId}:\`, pErr.message); continue; }
          if (p) {
            const { error: uErr } = await supabase
              .from('Producto').update({ stock: p.stock - cantidadRestar }).eq('id', productoId);
            if (uErr) console.error(\`[Sync] Error update stock deuda \${productoId}:\`, uErr.message);
          }
        }

        deudaIds.push(...deudas.map((d) => d['id'] as string));
        totalSynced += deudas.length;
      }

      // 4. Logs de auditoría`;
content = content.replace(oldLogsLogicStr, newDeudaLogicStr);


// 6. Pull updates
const oldPullVentas = `      const { data: pullVentas, error: vErr } = await supabase.from('Venta').select('*');
      if (vErr) console.error('[Sync] Error pull ventas:', vErr.message);

      const { data: pullLineas, error: lErr } = await supabase.from('LineaVenta').select('*');
      if (lErr) console.error('[Sync] Error pull lineas:', lErr.message);`;
const newPullVentas = `      const { data: pullVentas, error: vErr } = await supabase.from('Venta').select('*');
      if (vErr) console.error('[Sync] Error pull ventas:', vErr.message);

      const { data: pullLineas, error: lErr } = await supabase.from('LineaVenta').select('*');
      if (lErr) console.error('[Sync] Error pull lineas:', lErr.message);

      const { data: pullClientes, error: clErr } = await supabase.from('Cliente').select('*');
      if (clErr) console.error('[Sync] Error pull clientes:', clErr.message);

      const { data: pullDeudas, error: deErr } = await supabase.from('Deuda').select('*');
      if (deErr) console.error('[Sync] Error pull deudas:', deErr.message);

      const { data: pullLineasDeuda, error: ldErr } = await supabase.from('LineaDeuda').select('*');
      if (ldErr) console.error('[Sync] Error pull lineas de deuda:', ldErr.message);`;
content = content.replace(oldPullVentas, newPullVentas);

// 7. Invoke guardar_datos_pull
const oldInvokeGuardar = `      await invoke('guardar_datos_pull', {
        payload: {
          usuarios: pullUsuarios || [],
          productos: pullProductos || [],
          cortes: pullCortes || [],
          ventas: pullVentas || [],
          lineas: pullLineas || [],
          configuracion: pullConfig || [],
        },
      });`;
const newInvokeGuardar = `      await invoke('guardar_datos_pull', {
        payload: {
          usuarios: pullUsuarios || [],
          productos: pullProductos || [],
          cortes: pullCortes || [],
          ventas: pullVentas || [],
          lineas: pullLineas || [],
          configuracion: pullConfig || [],
          clientes: pullClientes || [],
          deudas: pullDeudas || [],
          lineas_deuda: pullLineasDeuda || [],
        },
      });`;
content = content.replace(oldInvokeGuardar, newInvokeGuardar);

// 8. Invoke marcar_sincronizados
const oldInvokeMarcar = `        await invoke('marcar_sincronizados', { ventaIds, productoIds, logIds, corteIds });`;
const newInvokeMarcar = `        await invoke('marcar_sincronizados', { ventaIds, productoIds, logIds, corteIds, clienteIds, deudaIds });`;
content = content.replace(oldInvokeMarcar, newInvokeMarcar);

fs.writeFileSync(filePath, content, 'utf-8');
console.log("Updated sync-listener.ts successfully.");
