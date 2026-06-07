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

struct CorteDatos {
    tipo: String,
    nombre_usuario: String,
    total_calculado: String,
    total_declarado: String,
    diferencia: String,
    creado_en: String,
}

struct LineaVentaRow {
    nombre_producto: String,
    cantidad: i64,
    precio_unit: String,
    subtotal: String,
}

#[tauri::command]
pub fn generar_pdf_corte(corte_id: String) -> Result<String, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // Consultar datos del corte
    let corte = conn
        .query_row(
            "SELECT c.tipo, u.nombre, c.totalCalculado, c.totalDeclarado, c.diferencia, c.creadoEn
             FROM CorteCaja c JOIN Usuario u ON c.usuarioId = u.id
             WHERE c.id = ?1",
            params![corte_id],
            |row| {
                Ok(CorteDatos {
                    tipo: row.get(0)?,
                    nombre_usuario: row.get(1)?,
                    total_calculado: row.get(2)?,
                    total_declarado: row.get(3)?,
                    diferencia: row.get(4)?,
                    creado_en: row.get(5)?,
                })
            },
        )
        .map_err(|e| format!("Corte no encontrado: {e}"))?;

    // Consultar ventas del corte (si hay asignadas)
    let mut stmt = conn
        .prepare(
            "SELECT p.nombre, lv.cantidad, lv.precioUnit, lv.subtotal
             FROM LineaVenta lv
             JOIN Venta v ON lv.ventaId = v.id
             JOIN Producto p ON lv.productoId = p.id
             JOIN CorteCaja c ON v.corteCajaId = c.id
             WHERE c.id = ?1
             ORDER BY p.nombre ASC",
        )
        .map_err(|e| e.to_string())?;

    let lineas: Vec<LineaVentaRow> = stmt
        .query_map(params![corte_id], |row| {
            Ok(LineaVentaRow {
                nombre_producto: row.get(0)?,
                cantidad: row.get(1)?,
                precio_unit: row.get(2)?,
                subtotal: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // ── Construir PDF ─────────────────────────────────────────
    let (doc, page1, layer1) = PdfDocument::new(
        format!("Corte {} — {}", corte.tipo, corte.creado_en),
        Mm(210.0),
        Mm(297.0),
        "Capa 1",
    );

    let current_layer = doc.get_page(page1).get_layer(layer1);
    let font = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| e.to_string())?;
    let font_regular = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;

    // Encabezado
    current_layer.use_text("MUÑEGON POS", 20.0, Mm(20.0), Mm(277.0), &font);
    current_layer.use_text(
        format!("Corte de Caja Tipo {}", corte.tipo),
        14.0,
        Mm(20.0),
        Mm(268.0),
        &font,
    );
    current_layer.use_text(
        format!("Fecha: {}", corte.creado_en),
        10.0,
        Mm(20.0),
        Mm(260.0),
        &font_regular,
    );
    current_layer.use_text(
        format!("Cajero: {}", corte.nombre_usuario),
        10.0,
        Mm(20.0),
        Mm(254.0),
        &font_regular,
    );

    // Línea separadora
    current_layer.use_text(
        "────────────────────────────────────────────",
        9.0,
        Mm(20.0),
        Mm(248.0),
        &font_regular,
    );

    // Resumen financiero
    let mut y = 240.0_f32;
    let items = vec![
        ("Total del sistema:", &corte.total_calculado),
        ("Total declarado (físico):", &corte.total_declarado),
        ("Diferencia:", &corte.diferencia),
    ];
    for (label, valor) in &items {
        current_layer.use_text(label.to_string(), 11.0, Mm(20.0), Mm(y), &font);
        current_layer.use_text(
            format!("$ {}", valor),
            11.0,
            Mm(130.0),
            Mm(y),
            &font_regular,
        );
        y -= 8.0;
    }

    // Detalle de ventas (si hay)
    if !lineas.is_empty() {
        y -= 6.0_f32;
        current_layer.use_text(
            "────────────────────────────────────────────",
            9.0,
            Mm(20.0),
            Mm(y),
            &font_regular,
        );
        y -= 8.0_f32;
        current_layer.use_text("DETALLE DE VENTAS", 11.0, Mm(20.0), Mm(y), &font);
        y -= 8.0_f32;

        for l in &lineas {
            if y < 30.0_f32 {
                break; // Evitar salir de la página (para un MVP es suficiente)
            }
            let linea_texto = format!(
                "{} x{} @ ${} = ${}",
                l.nombre_producto, l.cantidad, l.precio_unit, l.subtotal
            );
            current_layer.use_text(linea_texto, 9.0, Mm(20.0), Mm(y), &font_regular);
            y -= 6.0_f32;
        }
    }

    // ── Guardar archivo ───────────────────────────────────────
    let docs_dir = dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("C:/MunegonDB"))
        .join("MunegonPOS");

    fs::create_dir_all(&docs_dir).map_err(|e| e.to_string())?;

    let filename = format!("Corte_{}_{}.pdf", corte.tipo, corte_id.chars().take(8).collect::<String>());
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
/// - Registra el Corte Z en CorteCaja
/// - Asigna corteCajaId a todas las ventas del día (cierre)
/// - Devuelve la ruta del PDF generado
#[tauri::command]
pub fn generar_pdf_corte_z(
    usuario_id: String,
    efectivo_bs_caja: String,   // efectivo Bs que queda en caja (inicio del día siguiente)
) -> Result<String, String> {
    let conn = open_db().map_err(|e| e.to_string())?;

    // ── 1. Datos del usuario ──────────────────────────────────
    let nombre_usuario: String = conn
        .query_row(
            "SELECT nombre FROM Usuario WHERE id = ?1",
            params![usuario_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Usuario no encontrado: {e}"))?;

    // ── 2. Fecha y hora actuales (desde SQLite localtime) ─────
    let fecha_str: String = conn
        .query_row(
            "SELECT strftime('%d/%m/%Y', 'now', 'localtime')",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "—".to_string());

    let hora_str: String = conn
        .query_row(
            "SELECT strftime('%H:%M', 'now', 'localtime')",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "—".to_string());

    // ── 3. Totales del día por forma de pago ─────────────────
    // Bs: total(USD) × tasaCambio (snapshot por fila)
    let consulta_bs = |forma: &str| -> f64 {
        conn.query_row(
            "SELECT COALESCE(
                SUM(CAST(total AS REAL) * COALESCE(CAST(tasaCambio AS REAL), 1.0)),
                0.0
             )
             FROM Venta
             WHERE formaPago = ?1
               AND date(creadoEn) = date('now', 'localtime')",
            params![forma],
            |row| row.get::<_, f64>(0),
        )
        .unwrap_or(0.0)
    };

    let bs_efectivo  = consulta_bs("BS_EFECTIVO");
    let bs_debito    = consulta_bs("BS_DEBITO");
    let bs_pago_movil = consulta_bs("BS_PAGO_MOVIL");
    let total_bs     = bs_efectivo + bs_debito + bs_pago_movil;

    // USD: suma directa
    let usd_efectivo: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(CAST(total AS REAL)), 0.0)
             FROM Venta
             WHERE formaPago = 'USD_EFECTIVO'
               AND date(creadoEn) = date('now', 'localtime')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0.0);

    // Número de transacciones
    let num_ventas: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM Venta WHERE date(creadoEn) = date('now', 'localtime')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let efectivo_num = efectivo_bs_caja.parse::<f64>().unwrap_or(0.0);

    // ── 4. Registrar Corte Z en la BD ────────────────────────
    let corte_id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO CorteCaja (id, tipo, usuarioId, totalCalculado, totalDeclarado, diferencia, isSynced, creadoEn)
         VALUES (?1, 'Z', ?2, ?3, ?4, '0.00', 0, datetime('now', 'localtime'))",
        params![
            corte_id,
            usuario_id,
            format!("{:.2}", total_bs),
            format!("{:.2}", efectivo_num),
        ],
    )
    .map_err(|e| e.to_string())?;

    // ── 5. Cerrar el día: asignar corteCajaId a ventas del día
    conn.execute(
        "UPDATE Venta SET corteCajaId = ?1
         WHERE date(creadoEn) = date('now', 'localtime')
           AND corteCajaId IS NULL",
        params![corte_id],
    )
    .map_err(|e| e.to_string())?;

    // ── 6. Construir el PDF ───────────────────────────────────
    let titulo_doc = format!("Corte Z — {}", fecha_str);
    let (doc, page1, layer1) = PdfDocument::new(&titulo_doc, Mm(210.0), Mm(297.0), "Capa 1");

    let layer    = doc.get_page(page1).get_layer(layer1);
    let negrita  = doc.add_builtin_font(BuiltinFont::HelveticaBold).map_err(|e| e.to_string())?;
    let regular  = doc.add_builtin_font(BuiltinFont::Helvetica).map_err(|e| e.to_string())?;

    // Helpers de formato
    let fmt_bs  = |n: f64| format!("{:.2}", n);
    let fmt_usd = |n: f64| format!("{:.2}", n);
    let sep     = "________________________________________________";

    // ── Encabezado ──
    layer.use_text("MUNEGON POS",                  22.0, Mm(20.0), Mm(277.0), &negrita);
    layer.use_text("CIERRE DE DIA — CORTE Z",      14.0, Mm(20.0), Mm(268.0), &negrita);
    layer.use_text(sep,                              8.0, Mm(20.0), Mm(263.0), &regular);

    layer.use_text(&format!("Fecha:        {}", fecha_str),      10.0, Mm(20.0), Mm(256.0), &regular);
    layer.use_text(&format!("Hora:         {}", hora_str),       10.0, Mm(20.0), Mm(249.0), &regular);
    layer.use_text(&format!("Emisor:       {} (ADMIN)", nombre_usuario), 10.0, Mm(20.0), Mm(242.0), &regular);
    layer.use_text(&format!("Transacciones: {}", num_ventas),    10.0, Mm(20.0), Mm(235.0), &regular);
    layer.use_text(sep,                              8.0, Mm(20.0), Mm(230.0), &regular);

    // ── Título de sección: Ventas por método de pago ──
    layer.use_text("VENTAS DEL DIA POR METODO DE PAGO",  12.0, Mm(20.0), Mm(223.0), &negrita);
    layer.use_text(sep,                                    8.0, Mm(20.0), Mm(218.0), &regular);

    // ── Encabezados de tabla ──
    let cx = 20.0_f32;   // columna 1: método
    let cy = 120.0_f32;  // columna 2: monto
    layer.use_text("Metodo de Pago",   9.0, Mm(cx),  Mm(212.0), &negrita);
    layer.use_text("Total del Sistema",9.0, Mm(cy),  Mm(212.0), &negrita);
    layer.use_text(sep,                8.0, Mm(20.0), Mm(208.0), &regular);

    // ── Filas: métodos Bs ──
    let mut y = 202.0_f32;
    let row = 9.0_f32;

    layer.use_text("Efectivo Bs",   10.0, Mm(cx), Mm(y), &regular);
    layer.use_text(&format!("Bs {}", fmt_bs(bs_efectivo)),   10.0, Mm(cy), Mm(y), &negrita);
    y -= row;

    layer.use_text("Debito Bs",     10.0, Mm(cx), Mm(y), &regular);
    layer.use_text(&format!("Bs {}", fmt_bs(bs_debito)),     10.0, Mm(cy), Mm(y), &negrita);
    y -= row;

    layer.use_text("Pago Movil Bs", 10.0, Mm(cx), Mm(y), &regular);
    layer.use_text(&format!("Bs {}", fmt_bs(bs_pago_movil)), 10.0, Mm(cy), Mm(y), &negrita);
    y -= 5.0;

    // ── Subtotal Bs ──
    layer.use_text(sep, 8.0, Mm(20.0), Mm(y), &regular);
    y -= 8.0;
    layer.use_text("SUBTOTAL Bs",   11.0, Mm(cx), Mm(y), &negrita);
    layer.use_text(&format!("Bs {}", fmt_bs(total_bs)),      11.0, Mm(cy), Mm(y), &negrita);
    y -= 5.0;

    // ── Separador antes del USD ──
    layer.use_text(sep, 8.0, Mm(20.0), Mm(y), &regular);
    y -= 8.0;

    // ── Fila USD ──
    layer.use_text("Efectivo $ (USD)", 10.0, Mm(cx), Mm(y), &regular);
    layer.use_text(&format!("$ {}", fmt_usd(usd_efectivo)),  10.0, Mm(cy), Mm(y), &negrita);
    y -= 5.0;

    layer.use_text(sep, 8.0, Mm(20.0), Mm(y), &regular);
    y -= 12.0;

    // ── Ventas totales brutas ──
    layer.use_text("VENTAS TOTALES BRUTAS DEL DIA:", 12.0, Mm(cx), Mm(y), &negrita);
    y -= 10.0;
    layer.use_text(&format!("   Bs {}", fmt_bs(total_bs)),   12.0, Mm(cx + 5.0), Mm(y), &negrita);
    y -= 8.0;
    layer.use_text(&format!("   $ {}  USD", fmt_usd(usd_efectivo)), 12.0, Mm(cx + 5.0), Mm(y), &negrita);
    y -= 6.0;

    layer.use_text(sep, 8.0, Mm(20.0), Mm(y), &regular);
    y -= 12.0;

    // ── Efectivo en caja (inicio del día siguiente) ──
    layer.use_text("EFECTIVO Bs EN CAJA (inicio proximo dia):", 11.0, Mm(cx), Mm(y), &negrita);
    y -= 10.0;
    layer.use_text(&format!("   Bs {}", fmt_bs(efectivo_num)), 14.0, Mm(cx + 5.0), Mm(y), &negrita);
    y -= 8.0;

    layer.use_text(sep, 8.0, Mm(20.0), Mm(y), &regular);
    y -= 10.0;

    // ── Pie de página ──
    layer.use_text("Documento generado por Munegon POS  |  Solo para uso interno", 7.5, Mm(cx), Mm(y), &regular);

    // ── 7. Guardar PDF ────────────────────────────────────────
    let docs_dir = dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("C:/MunegonDB"))
        .join("MunegonPOS");

    fs::create_dir_all(&docs_dir).map_err(|e| e.to_string())?;

    let filename = format!(
        "CorteZ_{}_{}.pdf",
        fecha_str.replace('/', "-"),
        corte_id.chars().take(8).collect::<String>()
    );
    let filepath = docs_dir.join(&filename);

    let file = fs::File::create(&filepath).map_err(|e| e.to_string())?;
    doc.save(&mut BufWriter::new(file)).map_err(|e| e.to_string())?;

    let path_str = filepath.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(&path_str).spawn();

    Ok(path_str)
}
