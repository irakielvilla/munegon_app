// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — AuthGuard (Preact)
// Verifica sesión al montar. Si no hay sesión → redirige al login.
// Uso: <AuthGuard rol="ADMIN"> ... </AuthGuard>
// ══════════════════════════════════════════════════════════════

import { type ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { requireAuth, type Session } from '@lib/auth';

interface Props {
  rol?: 'ADMIN' | 'CAJERO';
  children: ComponentChildren;
}

export default function AuthGuard({ rol, children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    try {
      const s = requireAuth(rol);
      setSession(s);
    } catch {
      // requireAuth ya redirige, no hacer nada
    } finally {
      setChecking(false);
    }
  }, []);

  if (checking) {
    return (
      <div class="auth-checking">
        <div class="spinner" />
      </div>
    );
  }

  if (!session) return null;

  return <>{children}</>;
}
