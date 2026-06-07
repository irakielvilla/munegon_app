// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Auth Utilities
// Gestión de sesión via sessionStorage (muere al cerrar la app)
// ══════════════════════════════════════════════════════════════

export interface Session {
  usuarioId: string;
  nombre: string;
  rol: 'ADMIN' | 'CAJERO';
}

const SESSION_KEY = 'munegon_session';

/** Lee la sesión activa. Retorna null si no existe o está corrompida. */
export function getSession(): Session | null {
  if (typeof window === 'undefined') return null; // guard SSR
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.usuarioId || !parsed.rol) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Guarda una sesión nueva (llamado tras login exitoso). */
export function saveSession(session: Session): void {
  if (typeof window === 'undefined') return; // guard SSR
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/** Destruye la sesión y redirige al login. */
export function destroySession(): void {
  if (typeof window === 'undefined') return; // guard SSR
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = '/';
}

/** Verifica si el usuario tiene el rol requerido. */
export function hasRole(rol: 'ADMIN' | 'CAJERO'): boolean {
  const session = getSession();
  if (!session) return false;
  if (rol === 'CAJERO') return true; // ADMIN también puede hacer todo lo del cajero
  return session.rol === 'ADMIN';
}

/**
 * Guard: si no hay sesión activa, redirige inmediatamente al login.
 * Llamar al inicio de cada página protegida (client:only).
 */
export function requireAuth(rolRequerido?: 'ADMIN' | 'CAJERO'): Session {
  // Durante el pre-render estático de Astro (Node.js), window no existe.
  // En ese contexto no hay sesión — el guard real corre en el cliente.
  if (typeof window === 'undefined') throw new Error('SSR context — no auth');
  const session = getSession();
  if (!session) {
    window.location.href = '/';
    throw new Error('No autenticado');
  }
  if (rolRequerido && !hasRole(rolRequerido)) {
    window.location.href = '/caja';
    throw new Error('Permisos insuficientes');
  }
  return session;
}
