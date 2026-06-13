// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Comandos Tauri: Generación de PDF (Reportes)
// Usa printpdf para generar el PDF de un CorteCaja
// ══════════════════════════════════════════════════════════════

use printpdf::*;
use rusqlite::params;
use std::fs;
use std::io::BufWriter;
use std::path::PathBuf;
use uuid::Uuid;
use crate::db::open_db;

#[tauri::command]
pub fn generar_pdf_corte(corte_id: String) -> Result<String, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // Obtener los datos usando nuestra función unificada de consulta
    let data = obtener_datos_pdf_corte(corte_id.clone())?;
    let corte = data.corte;
    let ventas = data.ventas;
    let lineas = data.lineas;

    // Consultar fecha/hora local de SQLite para el formato solicitado
    let (w, d, m, y, h_raw, min_raw): (i32, i32, i32, i32, i32, i32) = conn
        .query_row(
            "SELECT CAST(strftime('%w', ?1, 'localtime') AS INTEGER),
                    CAST(strftime('%d', ?1, 'localtime') AS INTEGER),
                    CAST(strftime('%m', ?1, 'localtime') AS INTEGER),
                    CAST(strftime('%Y', ?1, 'localtime') AS INTEGER),
                    CAST(strftime('%H', ?1, 'localtime') AS INTEGER),
                    CAST(strftime('%M', ?1, 'localtime') AS INTEGER)",
            params![corte.creado_en],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        )
        .unwrap_or((0, 0, 0, 0, 0, 0));

    // Convertir a formato 12h (igual que el widget del reloj en la app)
    let ampm = if h_raw >= 12 { "pm" } else { "am" };
    let h_12 = { let h = h_raw % 12; if h == 0 { 12 } else { h } };
    let hora = format!("{}:{:02}{}", h_12, min_raw, ampm);

    // ── Construir PDF ─────────────────────────────────────────
    let filename = format!("Corte_{}_{}.pdf", corte.tipo, corte_id.chars().take(8).collect::<String>());
    let (doc, page1, layer1) = PdfDocument::new(
        format!("Corte {} — {}", corte.tipo, filename),
        Mm(210.0),
        Mm(297.0),
        "Capa 1",
    );

    let mut current_layer = doc.get_page(page1).get_layer(layer1);
    let font = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| e.to_string())?;
    let font_regular = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;

    let sep = "________________________________________________";

    // Encabezado
    let titulo_reporte = if corte.tipo == "Z" { "CIERRE DE DIA — CORTE Z" } else { "CORTE DE TURNO — CORTE X" };
    current_layer.use_text("MUNEGON POS", 22.0, Mm(20.0), Mm(277.0), &font);
    current_layer.use_text(titulo_reporte, 14.0, Mm(20.0), Mm(268.0), &font);
    current_layer.use_text(sep, 8.0, Mm(20.0), Mm(263.0), &font_regular);

    // Formatear Fecha: Jueves 6-11-26
    let dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    let dia_semana = dias[w as usize % 7];
    let y_short = y % 100;
    let fecha_formateada = format!("{} {}-{}-{}", dia_semana, m, d, y_short);

    current_layer.use_text(format!("Fecha:        {}", fecha_formateada), 10.0, Mm(20.0), Mm(256.0), &font_regular);
    current_layer.use_text(format!("Hora:         {}", hora), 10.0, Mm(20.0), Mm(249.0), &font_regular);
    
    let emisor_label = if corte.tipo == "Z" {
        format!("Emisor:       {} (ADMIN)", corte.nombre_usuario)
    } else {
        format!("Cajero:       {} (CAJERO)", corte.nombre_usuario)
    };
    current_layer.use_text(emisor_label, 10.0, Mm(20.0), Mm(242.0), &font_regular);
    current_layer.use_text(format!("Transacciones: {}", ventas.len()), 10.0, Mm(20.0), Mm(235.0), &font_regular);
    current_layer.use_text(sep, 8.0, Mm(20.0), Mm(230.0), &font_regular);

    // ── 1. Totales de Sistema ─────────────────────────────────
    let mut sys_bs_efectivo = 0.0;
    let mut sys_bs_debito = 0.0;
    let mut sys_bs_pago_movil = 0.0;
    let mut sys_usd_efectivo = 0.0;

    for v in &ventas {
        let total: f64 = v.total.parse().unwrap_or(0.0);
        let tasa: f64 = v.tasa_cambio.as_ref().and_then(|t| t.parse().ok()).unwrap_or(1.0);

        match v.forma_pago.as_str() {
            "USD_EFECTIVO" => sys_usd_efectivo += total,
            "BS_EFECTIVO" => sys_bs_efectivo += total * tasa,
            "BS_DEBITO" => sys_bs_debito += total * tasa,
            "BS_PAGO_MOVIL" => sys_bs_pago_movil += total * tasa,
            _ => {}
        }
    }

    // ── 2. Totales Declarados (Físico) ───────────────────────
    let decl: serde_json::Value = serde_json::from_str(&corte.total_declarado)
        .unwrap_or_else(|_| {
            let num = corte.total_declarado.parse::<f64>().unwrap_or(0.0);
            serde_json::json!({
                "bsEfectivo": "0", "bsDebito": "0", "bsPagoMovil": "0", "usdEfectivo": "0", "totalUsdEquiv": format!("{:.2}", num)
            })
        });

    let man_bs_efectivo = decl["bsEfectivo"].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
    let man_bs_debito = decl["bsDebito"].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
    let man_bs_pago_movil = decl["bsPagoMovil"].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
    let man_usd_efectivo = decl["usdEfectivo"].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
    let man_total_usd_equiv = decl["totalUsdEquiv"].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);

    // Tabla Comparativa
    let mut y_pos = 223.0_f32;
    let titulo_tabla = if corte.tipo == "Z" { "VENTAS DEL DIA VS CONTEO FISICO" } else { "VENTAS DEL TURNO VS CONTEO FISICO" };
    current_layer.use_text(titulo_tabla, 12.0, Mm(20.0), Mm(y_pos), &font);
    y_pos -= 5.0;
    current_layer.use_text(sep, 8.0, Mm(20.0), Mm(y_pos), &font_regular);
    y_pos -= 6.0;

    let cx = 20.0_f32;   // Metodo
    let cy = 80.0_f32;   // Sistema
    let cz = 130.0_f32;  // Fisico
    let cw = 175.0_f32;  // Dif

    current_layer.use_text("Metodo", 9.0, Mm(cx), Mm(y_pos), &font);
    current_layer.use_text("Sistema", 9.0, Mm(cy), Mm(y_pos), &font);
    current_layer.use_text("Fisico", 9.0, Mm(cz), Mm(y_pos), &font);
    current_layer.use_text("Dif.", 9.0, Mm(cw), Mm(y_pos), &font);
    y_pos -= 4.0;
    current_layer.use_text(sep, 8.0, Mm(20.0), Mm(y_pos), &font_regular);
    y_pos -= 6.0;

    // Fila 1: Efectivo Bs
    let dif_bs_efec = man_bs_efectivo - sys_bs_efectivo;
    let sign_bs_efec = if dif_bs_efec >= 0.0 { "+" } else { "" };
    current_layer.use_text("Efectivo Bs", 10.0, Mm(cx), Mm(y_pos), &font_regular);
    current_layer.use_text(format!("{:.2} Bs", sys_bs_efectivo), 10.0, Mm(cy), Mm(y_pos), &font_regular);
    current_layer.use_text(format!("{:.2} Bs", man_bs_efectivo), 10.0, Mm(cz), Mm(y_pos), &font);
    current_layer.use_text(format!("{}{:.2} Bs", sign_bs_efec, dif_bs_efec), 10.0, Mm(cw), Mm(y_pos), &font_regular);
    y_pos -= 9.0;

    // Fila 2: Débito Bs
    let dif_bs_deb = man_bs_debito - sys_bs_debito;
    let sign_bs_deb = if dif_bs_deb >= 0.0 { "+" } else { "" };
    current_layer.use_text("Debito Bs", 10.0, Mm(cx), Mm(y_pos), &font_regular);
    current_layer.use_text(format!("{:.2} Bs", sys_bs_debito), 10.0, Mm(cy), Mm(y_pos), &font_regular);
    current_layer.use_text(format!("{:.2} Bs", man_bs_debito), 10.0, Mm(cz), Mm(y_pos), &font);
    current_layer.use_text(format!("{}{:.2} Bs", sign_bs_deb, dif_bs_deb), 10.0, Mm(cw), Mm(y_pos), &font_regular);
    y_pos -= 9.0;

    // Fila 3: Pago Móvil Bs
    let dif_bs_pm = man_bs_pago_movil - sys_bs_pago_movil;
    let sign_bs_pm = if dif_bs_pm >= 0.0 { "+" } else { "" };
    current_layer.use_text("Pago Movil Bs", 10.0, Mm(cx), Mm(y_pos), &font_regular);
    current_layer.use_text(format!("{:.2} Bs", sys_bs_pago_movil), 10.0, Mm(cy), Mm(y_pos), &font_regular);
    current_layer.use_text(format!("{:.2} Bs", man_bs_pago_movil), 10.0, Mm(cz), Mm(y_pos), &font);
    current_layer.use_text(format!("{}{:.2} Bs", sign_bs_pm, dif_bs_pm), 10.0, Mm(cw), Mm(y_pos), &font_regular);
    
    y_pos -= 5.0;
    current_layer.use_text(sep, 8.0, Mm(20.0), Mm(y_pos), &font_regular);
    y_pos -= 8.0;

    // Fila 4: Efectivo USD
    let dif_usd_efec = man_usd_efectivo - sys_usd_efectivo;
    let sign_usd_efec = if dif_usd_efec >= 0.0 { "+" } else { "" };
    current_layer.use_text("Efectivo $", 10.0, Mm(cx), Mm(y_pos), &font_regular);
    current_layer.use_text(format!("$ {:.2}", sys_usd_efectivo), 10.0, Mm(cy), Mm(y_pos), &font_regular);
    current_layer.use_text(format!("$ {:.2}", man_usd_efectivo), 10.0, Mm(cz), Mm(y_pos), &font);
    current_layer.use_text(format!("{}{:.2}", sign_usd_efec, dif_usd_efec), 10.0, Mm(cw), Mm(y_pos), &font_regular);

    y_pos -= 5.0;
    current_layer.use_text(sep, 8.0, Mm(20.0), Mm(y_pos), &font_regular);
    y_pos -= 12.0;

    // Resumen financiero
    current_layer.use_text("RESUMEN GENERAL (EQUIVALENTE USD)", 12.0, Mm(20.0), Mm(y_pos), &font);
    y_pos -= 5.0;
    current_layer.use_text(sep, 8.0, Mm(20.0), Mm(y_pos), &font_regular);
    y_pos -= 8.0;

    let sys_total: f64 = corte.total_calculado.parse().unwrap_or(0.0);
    current_layer.use_text("Total del sistema:", 11.0, Mm(cx), Mm(y_pos), &font);
    current_layer.use_text(format!("$ {:.2} USD", sys_total), 11.0, Mm(130.0), Mm(y_pos), &font_regular);
    y_pos -= 8.0;

    current_layer.use_text("Total declarado (físico):", 11.0, Mm(cx), Mm(y_pos), &font);
    current_layer.use_text(format!("$ {:.2} USD", man_total_usd_equiv), 11.0, Mm(130.0), Mm(y_pos), &font_regular);
    y_pos -= 8.0;

    let diff_total: f64 = corte.diferencia.parse().unwrap_or(0.0);
    let diff_sign = if diff_total >= 0.0 { "+" } else { "" };
    current_layer.use_text("Diferencia:", 11.0, Mm(cx), Mm(y_pos), &font);
    current_layer.use_text(format!("$ {}{:.2} USD", diff_sign, diff_total), 11.0, Mm(130.0), Mm(y_pos), &font_regular);
    y_pos -= 8.0;

    // Efectivo en caja para mañana (Solo Corte Z)
    if corte.tipo == "Z" {
        y_pos -= 4.0;
        current_layer.use_text("EFECTIVO FÍSICO EN CAJA (inicio proximo dia):", 11.0, Mm(cx), Mm(y_pos), &font);
        y_pos -= 10.0;
        current_layer.use_text(format!("   Bs {:.2}", man_bs_efectivo), 12.0, Mm(cx + 5.0), Mm(y_pos), &font);
        y_pos -= 8.0;
        current_layer.use_text(format!("   $  {:.2} USD", man_usd_efectivo), 12.0, Mm(cx + 5.0), Mm(y_pos), &font);
        y_pos -= 8.0;
    }

    current_layer.use_text(sep, 8.0, Mm(20.0), Mm(y_pos), &font_regular);
    y_pos -= 10.0;

    // Detalle de ventas por producto
    if !lineas.is_empty() {
        current_layer.use_text("DETALLE DE VENTAS POR PRODUCTO", 12.0, Mm(cx), Mm(y_pos), &font);
        y_pos -= 5.0;
        current_layer.use_text(sep, 8.0, Mm(20.0), Mm(y_pos), &font_regular);
        y_pos -= 8.0;

        for l in &lineas {
            if y_pos < 30.0 {
                // Agregar página y continuar dibujando
                let (new_page, new_layer) = doc.add_page(Mm(210.0), Mm(297.0), "Capa Siguiente");
                current_layer = doc.get_page(new_page).get_layer(new_layer);
                y_pos = 270.0;
            }
            let subtotal = l.subtotal;
            let precio_unit: f64 = l.precio_unit.parse().unwrap_or(0.0);
            let line_text = format!("{} x{} @ ${:.2} = ${:.2}", l.nombre_producto, l.cantidad, precio_unit, subtotal);
            current_layer.use_text(line_text, 9.0, Mm(cx), Mm(y_pos), &font_regular);
            y_pos -= 6.0;
        }
    }

    // Pie de página
    current_layer.use_text("Documento generado por Munegon POS  |  Solo para uso interno", 7.5, Mm(cx), Mm(15.0), &font_regular);

    // ── Guardar archivo ───────────────────────────────────────
    let docs_dir = dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("C:/MunegonDB"))
        .join("MunegonPOS");

    fs::create_dir_all(&docs_dir).map_err(|e| e.to_string())?;

    let filepath = docs_dir.join(&filename);

    let file = fs::File::create(&filepath).map_err(|e| e.to_string())?;
    doc.save(&mut BufWriter::new(file)).map_err(|e| e.to_string())?;

    let path_str = filepath.to_string_lossy().to_string();

    // Abrir el PDF automáticamente con el visor del sistema
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(&path_str).spawn();

    Ok(path_str)
}

// ══════════════════════════════════════════════════════════════
// CORTE Z — Cierre de Día con PDF
// ══════════════════════════════════════════════════════════════

/// Genera el PDF del Corte Z (cierre de día).
/// - Calcula los totales del día por forma de pago
/// - Compara con lo declarado manualmente (total_declarado JSON)
/// - Registra el Corte Z en CorteCaja
/// - Asigna corteCajaId a todas las ventas del día (cierre)
/// - Devuelve la ruta del PDF generado
#[tauri::command]
pub fn generar_pdf_corte_z(
    usuario_id: String,
    total_declarado: String,
    tasa_cambio: String,
) -> Result<String, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // ── 1. Totales del día (SISTEMA) ─────────────────────────
    let consulta_bs = |forma: &str| -> f64 {
        conn.query_row(
            "SELECT COALESCE(
                SUM(CAST(total AS REAL) * COALESCE(CAST(tasaCambio AS REAL), 1.0)),
                0.0
             )
             FROM Venta
             WHERE formaPago = ?1
               AND date(creadoEn, 'localtime') = date('now', 'localtime')",
            params![forma],
            |row| row.get::<_, f64>(0),
        )
        .unwrap_or(0.0)
    };

    let sys_bs_efectivo  = consulta_bs("BS_EFECTIVO");
    let sys_bs_debito    = consulta_bs("BS_DEBITO");
    let sys_bs_pago_movil = consulta_bs("BS_PAGO_MOVIL");
    let sys_total_bs     = sys_bs_efectivo + sys_bs_debito + sys_bs_pago_movil;

    let sys_usd_efectivo: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(CAST(total AS REAL)), 0.0)
             FROM Venta
             WHERE formaPago = 'USD_EFECTIVO'
               AND date(creadoEn, 'localtime') = date('now', 'localtime')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0.0);

    // ── 2. Totales Declarados (FÍSICO) ───────────────────────
    let decl: serde_json::Value = serde_json::from_str(&total_declarado)
        .unwrap_or_else(|_| serde_json::json!({
            "totalUsdEquiv": "0"
        }));

    let man_total_usd_equiv = decl["totalUsdEquiv"].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);

    let tasa_num = tasa_cambio.parse::<f64>().unwrap_or(1.0);
    let sys_total_usd_equiv = (sys_total_bs / tasa_num) + sys_usd_efectivo;
    let diferencia_usd = man_total_usd_equiv - sys_total_usd_equiv;

    // ── 5. Registrar Corte Z en BD ───────────────────────────
    let corte_id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO CorteCaja (id, tipo, usuarioId, totalCalculado, totalDeclarado, diferencia, isSynced, creadoEn)
         VALUES (?1, 'Z', ?2, ?3, ?4, ?5, 0, datetime('now'))",
        params![
            corte_id,
            usuario_id,
            format!("{:.2}", sys_total_usd_equiv),
            total_declarado,
            format!("{:.2}", diferencia_usd),
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE Venta SET corteCajaId = ?1, isSynced = 0
         WHERE date(creadoEn, 'localtime') = date('now', 'localtime')
           AND corteCajaId IS NULL",
        params![corte_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(corte_id)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CortePdfDatos {
    corte: CorteInfo,
    ventas: Vec<VentaInfo>,
    lineas: Vec<LineaGroupedInfo>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CorteInfo {
    id: String,
    tipo: String,
    usuario_id: String,
    nombre_usuario: String,
    total_calculado: String,
    total_declarado: String,
    diferencia: String,
    creado_en: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VentaInfo {
    total: String,
    forma_pago: String,
    tasa_cambio: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LineaGroupedInfo {
    nombre_producto: String,
    cantidad: i64,
    precio_unit: String,
    subtotal: f64,
}

#[tauri::command]
pub fn obtener_datos_pdf_corte(corte_id: String) -> Result<CortePdfDatos, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // 1. Query corte
    let corte = conn
        .query_row(
            "SELECT c.tipo, c.usuarioId, u.nombre, c.totalCalculado, c.totalDeclarado, c.diferencia, c.creadoEn
             FROM CorteCaja c JOIN Usuario u ON c.usuarioId = u.id
             WHERE c.id = ?1",
            params![corte_id],
            |row| {
                Ok(CorteInfo {
                    id: corte_id.clone(),
                    tipo: row.get(0)?,
                    usuario_id: row.get(1)?,
                    nombre_usuario: row.get(2)?,
                    total_calculado: row.get(3)?,
                    total_declarado: row.get(4)?,
                    diferencia: row.get(5)?,
                    creado_en: row.get(6)?,
                })
            },
        )
        .map_err(|e| format!("Corte no encontrado: {e}"))?;

    // 2. Query sales
    let mut sales_stmt = if corte.tipo == "Z" {
        conn.prepare(
            "SELECT total, formaPago, tasaCambio FROM Venta
             WHERE date(creadoEn, 'localtime') = date(?1, 'localtime')",
        )
    } else {
        conn.prepare(
            "SELECT total, formaPago, tasaCambio FROM Venta
             WHERE corteCajaId = ?1",
        )
    }.map_err(|e| e.to_string())?;

    let param_val = if corte.tipo == "Z" {
        corte.creado_en.clone()
    } else {
        corte_id.clone()
    };

    let sales_rows = sales_stmt
        .query_map(params![param_val], |row| {
            Ok(VentaInfo {
                total: row.get(0)?,
                forma_pago: row.get(1)?,
                tasa_cambio: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut ventas = Vec::new();
    for r in sales_rows {
        ventas.push(r.map_err(|e| e.to_string())?);
    }

    // 3. Query grouped lines
    let mut lines_stmt = if corte.tipo == "Z" {
        conn.prepare(
            "SELECT p.nombre, SUM(lv.cantidad), lv.precioUnit, SUM(CAST(lv.subtotal AS REAL))
             FROM LineaVenta lv
             JOIN Venta v ON lv.ventaId = v.id
             JOIN Producto p ON lv.productoId = p.id
             WHERE date(v.creadoEn, 'localtime') = date(?1, 'localtime')
             GROUP BY p.nombre, lv.precioUnit
             ORDER BY p.nombre ASC",
        )
    } else {
        conn.prepare(
            "SELECT p.nombre, SUM(lv.cantidad), lv.precioUnit, SUM(CAST(lv.subtotal AS REAL))
             FROM LineaVenta lv
             JOIN Venta v ON lv.ventaId = v.id
             JOIN Producto p ON lv.productoId = p.id
             WHERE v.corteCajaId = ?1
             GROUP BY p.nombre, lv.precioUnit
             ORDER BY p.nombre ASC",
        )
    }.map_err(|e| e.to_string())?;

    let lines_rows = lines_stmt
        .query_map(params![param_val], |row| {
            Ok(LineaGroupedInfo {
                nombre_producto: row.get(0)?,
                cantidad: row.get(1)?,
                precio_unit: row.get(2)?,
                subtotal: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut lineas = Vec::new();
    for r in lines_rows {
        lineas.push(r.map_err(|e| e.to_string())?);
    }

    Ok(CortePdfDatos { corte, ventas, lineas })
}

#[tauri::command]
pub fn guardar_y_abrir_pdf(filename: String, pdf_bytes: Vec<u8>) -> Result<String, String> {
    let docs_dir = dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("C:/MunegonDB"))
        .join("MunegonPOS");

    fs::create_dir_all(&docs_dir).map_err(|e| e.to_string())?;

    let filepath = docs_dir.join(&filename);
    fs::write(&filepath, pdf_bytes).map_err(|e| e.to_string())?;

    let path_str = filepath.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(&path_str).spawn();

    Ok(path_str)
}

