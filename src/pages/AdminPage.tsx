import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { BarChart3, BookOpen, Megaphone, Receipt, Ticket as TicketIcon, Users } from 'lucide-react';
import { PageShell } from '@/components/club/PageShell';
import { focusRing } from '@/components/club/FormControls';
import { SociosSection } from '@/components/admin/SociosSection';
import { PromosSection } from '@/components/admin/PromosSection';
import { CartaSection } from '@/components/admin/CartaSection';
import { VentasSection } from '@/components/admin/VentasSection';
import { TicketsSection } from '@/components/admin/TicketsSection';
import { StatsSection } from '@/components/admin/StatsSection';
import { fetchAdminUsers, type AdminUser } from '@/lib/admin';
import { getHashParams } from '@/lib/router';

type Seccion = 'socios' | 'carta' | 'promos' | 'tickets' | 'ventas' | 'estadisticas';

const TABS: { id: Seccion; label: string; icon: typeof Users }[] = [
  { id: 'socios', label: 'Socios', icon: Users },
  { id: 'carta', label: 'Carta', icon: BookOpen },
  { id: 'promos', label: 'Promos', icon: Megaphone },
  { id: 'tickets', label: 'Tickets', icon: TicketIcon },
  { id: 'ventas', label: 'Ventas', icon: Receipt },
  { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
];

function seccionFromUrl(): Seccion {
  const value = getHashParams().get('seccion');
  return TABS.some((t) => t.id === value) ? (value as Seccion) : 'socios';
}

/** Panel del club (#/admin?seccion=…): socios, promos, tickets y estadísticas. Solo admins (AdminRoute). */
export function AdminPage() {
  const [seccion, setSeccion] = useState<Seccion>(seccionFromUrl);
  const tabRefs = useRef<Record<Seccion, HTMLButtonElement | null>>({
    socios: null,
    carta: null,
    promos: null,
    tickets: null,
    ventas: null,
    estadisticas: null,
  });

  // Los socios se cargan una vez y los comparten las pestañas (Tickets los usa para poner nombres).
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUsersError(null);
    const result = await fetchAdminUsers();
    setUsers(result.users);
    setUsersError(result.error);
    setLoadingUsers(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    const onHash = () => setSeccion(seccionFromUrl());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const select = (id: Seccion) => {
    setSeccion(id);
    // Se guarda en la URL (para recargar en la misma pestaña) sin mover la página.
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/admin?seccion=${id}`);
  };

  // Flechas izquierda/derecha para moverse entre pestañas (patrón de pestañas accesibles).
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((t) => t.id === seccion);
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length].id;
    select(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-container">
        <header className="animate-fade-up" style={{ opacity: 0 }}>
          <div className="eyebrow text-vino">Club La Alameda · Administración</div>
          <h1 className="mt-3 font-display text-[2.4rem] font-semibold leading-[1.05] text-vino sm:text-[3rem]">
            Panel del club
          </h1>
          <div className="divider-gold ml-0 mt-5" />
        </header>

        <div
          role="tablist"
          aria-label="Secciones del panel"
          className="no-scrollbar -mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-carbon/15 px-4 sm:mx-0 sm:px-0"
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = seccion === id;
            return (
              <button
                key={id}
                ref={(el) => {
                  tabRefs.current[id] = el;
                }}
                id={`tab-admin-${id}`}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls={`panel-admin-${id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => select(id)}
                onKeyDown={onTabKey}
                className={`-mb-px inline-flex shrink-0 items-center gap-2 rounded-t-r-sm border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${focusRing} ${
                  active ? 'border-vino text-vino' : 'border-transparent text-carbon/60 hover:text-vino'
                }`}
              >
                <Icon size={16} aria-hidden="true" /> {label}
              </button>
            );
          })}
        </div>

        <div id={`panel-admin-${seccion}`} role="tabpanel" aria-labelledby={`tab-admin-${seccion}`} className="mt-6">
          {seccion === 'socios' && (
            <SociosSection
              users={users}
              setUsers={setUsers}
              loading={loadingUsers}
              error={usersError}
              onReload={loadUsers}
            />
          )}
          {seccion === 'carta' && <CartaSection />}
          {seccion === 'promos' && <PromosSection />}
          {seccion === 'tickets' && <TicketsSection users={users} />}
          {seccion === 'ventas' && <VentasSection users={users} />}
          {seccion === 'estadisticas' && <StatsSection />}
        </div>
      </div>
    </PageShell>
  );
}
