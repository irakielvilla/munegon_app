/**
 * Utilidades para conversiones de moneda y formato.
 * Centraliza la lógica matemática para evitar errores de precisión de JavaScript
 * y facilita el testing y mantenimiento.
 */

/**
 * Convierte un monto en USD a Bolívares usando la tasa de cambio actual.
 * Devuelve un string con 4 decimales para almacenar en base de datos.
 */
export function usdABs(montoUsd: string | number, tasa: number): string {
  const num = typeof montoUsd === 'string' ? parseFloat(montoUsd) : montoUsd;
  if (!num || isNaN(num) || tasa <= 0) return '0.0000';
  return (num * tasa).toFixed(4);
}

/**
 * Convierte un monto en Bolívares a USD usando la tasa de cambio actual.
 * Devuelve un string con 4 decimales para almacenar en base de datos.
 */
export function bsAUsd(montoBs: string | number, tasa: number): string {
  const num = typeof montoBs === 'string' ? parseFloat(montoBs) : montoBs;
  if (!num || isNaN(num) || tasa <= 0) return '0.0000';
  return (num / tasa).toFixed(4);
}

/**
 * Formatea un monto numérico o string para visualización en UI (2 decimales).
 * Ejemplo: 15.5034 -> "15.50"
 */
export function formatMoneda(monto: string | number): string {
  const num = typeof monto === 'string' ? parseFloat(monto) : monto;
  if (!num || isNaN(num)) return '0.00';
  return num.toFixed(2);
}

/**
 * Normaliza un valor de input (string) a un formato válido con 4 decimales.
 * Útil antes de guardar en la DB.
 */
export function parsePrecioDB(monto: string | number): string {
  const num = typeof monto === 'string' ? parseFloat(monto) : monto;
  if (!num || isNaN(num)) return '0.0000';
  return num.toFixed(4);
}
