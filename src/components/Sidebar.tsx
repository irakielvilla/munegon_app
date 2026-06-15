// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Sidebar de Navegación (Preact)
// Plegable/desplegable con persistencia en localStorage.
// Se adapta al rol: CAJERO solo ve Caja.
// ══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'preact/hooks';
import { getSession, destroySession } from '@lib/auth';

// ── Tipos ─────────────────────────────────────────────────────

interface NavItem {
  href: string;
  icon: string;
  label: string;
  soloAdmin?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/caja',       icon: '🖥',  label: 'Caja' },
  { href: '/comandas',   icon: '📋',  label: 'Comandas' },
  { href: '/inventario', icon: '📦',  label: 'Inventario' },
  { href: '/reportes',   icon: '📊',  label: 'Reportes',   soloAdmin: true },
  { href: '/administracion', icon: '⚙️',  label: 'Administración', soloAdmin: true },
];

const STORAGE_KEY = 'sidebar_collapsed';

// ── Helpers ───────────────────────────────────────────────────

function leerColapsado(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
  catch { return false; }
}

function guardarColapsado(v: boolean) {
  try { localStorage.setItem(STORAGE_KEY, String(v)); }
  catch { /* silencioso */ }
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE
// ══════════════════════════════════════════════════════════════

export default function Sidebar() {
  const session = getSession();
  const esAdmin = session?.rol === 'ADMIN';
  const rutaActual = typeof window !== 'undefined' ? window.location.pathname : '';

  const [colapsado, setColapsado] = useState<boolean>(() => leerColapsado());

  // Sincronizar con localStorage cuando cambia
  useEffect(() => {
    guardarColapsado(colapsado);
  }, [colapsado]);

  const toggle = () => setColapsado((c) => !c);

  const navItems = NAV_ITEMS.filter((item) => !item.soloAdmin || esAdmin);

  if (!session) return null;

  return (
    <aside class={`sidebar ${colapsado ? 'sidebar--colapsado' : 'sidebar--expandido'}`}>

      {/* ── Cabecera del sidebar ── */}
      <div class="sidebar-header">
        {!colapsado && (
          <span class="sidebar-logo">
            Muñegon <span class="sidebar-pos">POS</span>
          </span>
        )}
        <button
          id="sidebar-toggle"
          class="sidebar-toggle"
          onClick={toggle}
          title={colapsado ? 'Expandir menú' : 'Colapsar menú'}
          aria-label={colapsado ? 'Expandir menú' : 'Colapsar menú'}
        >
          {colapsado ? '▶' : '◀'}
        </button>
      </div>

      {/* ── Navegación ── */}
      <nav class="sidebar-nav" aria-label="Navegación principal">
        {navItems.map((item) => {
          const activo = rutaActual === item.href || rutaActual.startsWith(item.href + '/');
          return (
            <a
              key={item.href}
              href={item.href}
              class={`sidebar-link ${activo ? 'sidebar-link--activo' : ''}`}
              title={colapsado ? item.label : undefined}
              aria-label={item.label}
              aria-current={activo ? 'page' : undefined}
            >
              <span class="sidebar-icon" aria-hidden="true">{item.icon}</span>
              {!colapsado && <span class="sidebar-label">{item.label}</span>}
            </a>
          );
        })}
      </nav>

      {/* ── Footer: usuario + logout ── */}
      <div class="sidebar-footer">
        <div class={`sidebar-user ${colapsado ? 'sidebar-user--mini' : ''}`} title={colapsado ? `${session.nombre} (${session.rol})` : undefined}>
          <span class="sidebar-user-icon" aria-hidden="true">
            {esAdmin ? '👑' : '🧑‍💼'}
          </span>
          {!colapsado && (
            <div class="sidebar-user-info">
              <span class="sidebar-user-name">{session.nombre}</span>
              <span class={`sidebar-rol-badge rol-${session.rol.toLowerCase()}`}>
                {session.rol}
              </span>
            </div>
          )}
        </div>

        <button
          id="sidebar-logout"
          class="sidebar-logout"
          onClick={destroySession}
          title={colapsado ? 'Cerrar sesión' : undefined}
          aria-label="Cerrar sesión"
        >
          <span class="sidebar-icon" aria-hidden="true">🔒</span>
          {!colapsado && <span class="sidebar-label">Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}
