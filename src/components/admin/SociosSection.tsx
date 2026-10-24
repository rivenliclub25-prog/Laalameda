import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  Cake,
  Check,
  Download,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  ScanLine,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Notice, Switch, focusRing } from '@/components/club/FormControls';
import {
  computeStats,
  defaultFilters,
  downloadCsv,
  filterUsers,
  formatBirthday,
  formatDate,
  isBirthdayThisMonth,
  setCamarero,
  type AdminFilters,
  type AdminUser,
} from '@/lib/admin';

interface SociosSectionProps {
  users: AdminUser[];
  setUsers: Dispatch<SetStateAction<AdminUser[]>>;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}

/** Pestaña "Socios" del panel: contadores, buscador, filtros, CSV y permiso de camarero. */
export function SociosSection({ users, setUsers, loading, error, onReload }: SociosSectionProps) {
  const [filters, setFilters] = useState<AdminFilters>(defaultFilters);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const stats = useMemo(() => computeStats(users), [users]);
  const visible = useMemo(() => filterUsers(users, filters), [users, filters]);
  const hasFilters =
    filters.search.trim() !== '' ||
    filters.aceptaEmail ||
    filters.aceptaWhatsapp ||
    filters.cumpleEsteMes ||
    filters.camareros;

  // El cambio se ve al momento; si la base de datos lo rechaza, se deshace y se explica.
  const toggleCamarero = async (user: AdminUser) => {
    const valor = !user.es_camarero;
    setPendingId(user.id);
    setToggleError(null);
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, es_camarero: valor } : u)));
    const { error: rpcError } = await setCamarero(user.id, valor);
    if (rpcError) {
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, es_camarero: !valor } : u)));
      setToggleError(`${user.nombre || user.email}: ${rpcError}`);
    }
    setPendingId(null);
  };

  const setFilter = <K extends keyof AdminFilters>(key: K, value: AdminFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          className={`btn-outline-vino disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Actualizar
        </button>
      </div>

      {/* Contadores (siempre sobre el total de socios, no sobre el filtro) */}
        <section aria-label="Resumen" className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard icon={Users} label="Socios" value={stats.total} loading={loading} />
          <StatCard icon={Mail} label="Aceptan email" value={stats.email} loading={loading} />
          <StatCard icon={MessageCircle} label="Aceptan WhatsApp" value={stats.whatsapp} loading={loading} />
          <StatCard icon={UserPlus} label="Altas últimos 30 días" value={stats.ultimos30} loading={loading} />
        </section>

        {/* Buscador, filtros y exportación */}
        <section aria-label="Buscar y filtrar" className="mt-8 rounded-r-lg border border-piedra/50 bg-white/80 p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="flex-1">
              <label htmlFor="admin-search" className="mb-1 block text-xs font-semibold text-carbon/80">
                Buscar por nombre, email o teléfono
              </label>
              <div className="relative">
                <Search
                  size={17}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-carbon/45"
                  aria-hidden="true"
                />
                <input
                  id="admin-search"
                  type="search"
                  value={filters.search}
                  onChange={(e) => setFilter('search', e.target.value)}
                  placeholder="Ej.: María, @gmail, 612…"
                  className="w-full rounded-r-sm border border-carbon/25 bg-white py-2.5 pl-9 pr-3 font-primary text-base text-carbon outline-none transition-colors placeholder:text-carbon/40 focus:border-vino focus:ring-1 focus:ring-vino/30 sm:text-sm"
                />
              </div>
            </div>
            <div>
              <label htmlFor="admin-sort" className="mb-1 block text-xs font-semibold text-carbon/80">
                Ordenar por alta
              </label>
              <select
                id="admin-sort"
                value={filters.sort}
                onChange={(e) => setFilter('sort', e.target.value as AdminFilters['sort'])}
                className="w-full rounded-r-sm border border-carbon/25 bg-white px-3 py-2.5 font-primary text-base text-carbon outline-none transition-colors focus:border-vino focus:ring-1 focus:ring-vino/30 sm:text-sm lg:w-auto"
              >
                <option value="recientes">Más recientes primero</option>
                <option value="antiguos">Más antiguos primero</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtros">
            <FilterChip active={filters.aceptaEmail} onClick={() => setFilter('aceptaEmail', !filters.aceptaEmail)}>
              <Mail size={14} aria-hidden="true" /> Acepta email
            </FilterChip>
            <FilterChip
              active={filters.aceptaWhatsapp}
              onClick={() => setFilter('aceptaWhatsapp', !filters.aceptaWhatsapp)}
            >
              <MessageCircle size={14} aria-hidden="true" /> Acepta WhatsApp
            </FilterChip>
            <FilterChip
              active={filters.cumpleEsteMes}
              onClick={() => setFilter('cumpleEsteMes', !filters.cumpleEsteMes)}
            >
              <Cake size={14} aria-hidden="true" /> Cumpleaños este mes
            </FilterChip>
            <FilterChip active={filters.camareros} onClick={() => setFilter('camareros', !filters.camareros)}>
              <ScanLine size={14} aria-hidden="true" /> Camareros
            </FilterChip>
            {hasFilters && (
              <button
                type="button"
                onClick={() => setFilters({ ...defaultFilters, sort: filters.sort })}
                className={`rounded-r-sm px-2 py-1.5 text-xs font-semibold text-vino hover:underline ${focusRing}`}
              >
                Quitar filtros
              </button>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-carbon/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-carbon/70" aria-live="polite">
              {loading ? 'Cargando…' : `Mostrando ${visible.length} de ${users.length} socios`}
            </p>
            <button
              type="button"
              onClick={() => downloadCsv(visible, filters)}
              disabled={loading || visible.length === 0}
              className={`btn-vino disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-vino ${focusRing}`}
            >
              <Download size={16} aria-hidden="true" /> Exportar CSV ({visible.length})
            </button>
          </div>
          <div className="mt-4">
            <Notice kind="info">
              <strong>Antes de contactar:</strong> escribe solo por el canal que cada persona ha aceptado: email a quien
              tenga <em>Acepta email</em> y WhatsApp a quien tenga <em>Acepta WhatsApp</em>. Para una campaña, aplica
              primero el filtro del canal y exporta después. Trata el archivo con cuidado: contiene datos personales.
            </Notice>
          </div>
        </section>

        {/* Resultados */}
        <section aria-label="Socios" className="mt-6">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16 text-carbon/60" role="status">
              <Loader2 size={30} className="animate-spin text-vino" aria-hidden="true" />
              Cargando socios…
            </div>
          ) : error ? (
            <div className="space-y-4">
              <Notice kind="error">{error}</Notice>
              <button type="button" onClick={onReload} className={`btn-outline-vino ${focusRing}`}>
                <RefreshCw size={16} aria-hidden="true" /> Reintentar
              </button>
            </div>
          ) : users.length === 0 ? (
            <EmptyState title="Todavía no hay socios" text="Cuando alguien se una al club, aparecerá aquí." />
          ) : visible.length === 0 ? (
            <EmptyState
              title="Ningún socio coincide"
              text="Prueba con otra búsqueda o quita algún filtro."
              action={
                <button
                  type="button"
                  onClick={() => setFilters({ ...defaultFilters, sort: filters.sort })}
                  className={`btn-outline-vino mt-4 ${focusRing}`}
                >
                  Quitar filtros
                </button>
              }
            />
          ) : (
            <>
              {toggleError && (
                <div className="mb-4">
                  <Notice kind="error">{toggleError}</Notice>
                </div>
              )}
              <UserTable users={visible} pendingId={pendingId} onToggleCamarero={toggleCamarero} />
              <UserCards users={visible} pendingId={pendingId} onToggleCamarero={toggleCamarero} />
            </>
          )}
        </section>
    </>
  );
}

interface CamareroToggleProps {
  pendingId: string | null;
  onToggleCamarero: (user: AdminUser) => void;
}

function CamareroSwitch({ user, pendingId, onToggleCamarero }: CamareroToggleProps & { user: AdminUser }) {
  return (
    <Switch
      checked={user.es_camarero === true}
      onChange={() => onToggleCamarero(user)}
      disabled={pendingId === user.id}
      label={`Camarero: ${user.nombre || user.email}`}
    />
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-r-md bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-carbon/60">
        <Icon size={15} className="shrink-0 text-vino" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="mt-2 font-display text-[2.2rem] font-semibold leading-none text-vino sm:text-[2.6rem]">
        {loading ? <span className="text-carbon/25">—</span> : value}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${focusRing} ${
        active ? 'border-vino bg-vino text-white shadow-sm' : 'border-carbon/25 bg-white text-carbon/75 hover:border-vino hover:text-vino'
      }`}
    >
      {active && <Check size={13} aria-hidden="true" />}
      {children}
    </button>
  );
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="rounded-r-lg border border-dashed border-piedra/70 bg-white/50 px-6 py-14 text-center">
      <Users size={30} className="mx-auto text-piedra" aria-hidden="true" />
      <h2 className="mt-3 font-display text-2xl font-semibold text-vino">{title}</h2>
      <p className="mt-1 text-sm text-carbon/70">{text}</p>
      {action}
    </div>
  );
}

/** Etiqueta de consentimiento: con icono y texto, para que no dependa solo del color. */
function ConsentBadge({ accepted, channel }: { accepted: boolean; channel: 'email' | 'whatsapp' }) {
  const Icon = channel === 'email' ? Mail : MessageCircle;
  const name = channel === 'email' ? 'Email' : 'WhatsApp';
  return accepted ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-vino bg-vino/10 px-2 py-0.5 text-[0.7rem] font-semibold text-vino">
      <Icon size={12} aria-hidden="true" /> {name} <Check size={12} aria-hidden="true" />
      <span className="sr-only">: aceptado</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-carbon/20 px-2 py-0.5 text-[0.7rem] font-medium text-carbon/45">
      <Icon size={12} aria-hidden="true" /> <span className="line-through">{name}</span>{' '}
      <X size={12} aria-hidden="true" />
      <span className="sr-only">: no aceptado</span>
    </span>
  );
}

function ConfirmedBadge({ confirmedAt }: { confirmedAt: string | null }) {
  return confirmedAt ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[0.7rem] font-semibold text-[#1f4a2b]">
      <Check size={12} aria-hidden="true" /> Email confirmado
    </span>
  ) : (
    <span className="pend-badge">Sin confirmar</span>
  );
}

function NameCell({ user }: { user: AdminUser }) {
  return (
    <>
      <span className="font-semibold text-carbon">{user.nombre || <span className="italic text-carbon/45">Sin nombre</span>}</span>
      {user.role === 'admin' && (
        <span className="recommend-badge ml-2 gap-1 align-middle">
          <ShieldCheck size={11} aria-hidden="true" /> Admin
        </span>
      )}
    </>
  );
}

function BirthdayCell({ user }: { user: AdminUser }) {
  const thisMonth = isBirthdayThisMonth(user);
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${thisMonth ? 'font-semibold text-vino' : ''}`}>
      {thisMonth && (
        <>
          <Cake size={14} aria-hidden="true" />
          <span className="sr-only">Cumple este mes:</span>
        </>
      )}
      {formatBirthday(user.fecha_nacimiento)}
    </span>
  );
}

/** Escritorio y tablet: tabla. */
function UserTable({ users, ...toggle }: { users: AdminUser[] } & CamareroToggleProps) {
  return (
    <div className="hidden overflow-x-auto rounded-r-lg border border-piedra/50 bg-white shadow-sm md:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Socios del club</caption>
        <thead className="bg-piedra-suave/70 text-xs uppercase tracking-wider text-carbon/70">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">Socio</th>
            <th scope="col" className="px-4 py-3 font-semibold">Teléfono</th>
            <th scope="col" className="px-4 py-3 font-semibold">Cumpleaños</th>
            <th scope="col" className="px-4 py-3 font-semibold">Comunicaciones</th>
            <th scope="col" className="px-4 py-3 font-semibold">Alta</th>
            <th scope="col" className="px-4 py-3 font-semibold">Camarero</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-carbon/10">
          {users.map((user) => (
            <tr key={user.id} className="transition-colors hover:bg-marfil">
              <td className="px-4 py-3 align-top">
                <NameCell user={user} />
                <div className="mt-0.5 break-all text-xs text-carbon/65">{user.email}</div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 align-top text-carbon/80">{user.telefono || '—'}</td>
              <td className="px-4 py-3 align-top text-carbon/80">
                <BirthdayCell user={user} />
              </td>
              <td className="px-4 py-3 align-top">
                <div className="flex flex-wrap gap-1.5">
                  <ConsentBadge accepted={user.acepta_email} channel="email" />
                  <ConsentBadge accepted={user.acepta_whatsapp} channel="whatsapp" />
                </div>
              </td>
              <td className="px-4 py-3 align-top">
                <div className="whitespace-nowrap text-carbon/80">{formatDate(user.created_at)}</div>
                <div className="mt-1">
                  <ConfirmedBadge confirmedAt={user.email_confirmed_at} />
                </div>
              </td>
              <td className="px-4 py-3 align-top">
                <CamareroSwitch user={user} {...toggle} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Móvil: tarjetas apiladas. */
function UserCards({ users, ...toggle }: { users: AdminUser[] } & CamareroToggleProps) {
  return (
    <ul className="space-y-3 md:hidden">
      {users.map((user) => (
        <li key={user.id} className="rounded-r-md border border-piedra/40 bg-white p-4 shadow-sm">
          <div>
            <NameCell user={user} />
          </div>
          <div className="mt-0.5 break-all text-sm text-carbon/70">{user.email}</div>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-xs font-semibold text-carbon/55">Teléfono</dt>
              <dd className="text-carbon/85">{user.telefono || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-carbon/55">Cumpleaños</dt>
              <dd className="text-carbon/85">
                <BirthdayCell user={user} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-carbon/55">Alta</dt>
              <dd className="text-carbon/85">{formatDate(user.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-carbon/55">Cuenta</dt>
              <dd>
                <ConfirmedBadge confirmedAt={user.email_confirmed_at} />
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-carbon/10 pt-3">
            <ConsentBadge accepted={user.acepta_email} channel="email" />
            <ConsentBadge accepted={user.acepta_whatsapp} channel="whatsapp" />
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-carbon/10 pt-3 text-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold text-carbon/75">
              <ScanLine size={15} aria-hidden="true" /> Camarero
            </span>
            <CamareroSwitch user={user} {...toggle} />
          </div>
        </li>
      ))}
    </ul>
  );
}
