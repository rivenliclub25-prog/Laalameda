import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { ChevronDown, LayoutDashboard, LogOut, Menu, Ticket as TicketIcon, UserRound, X } from 'lucide-react';
import { navLinks, siteConfig } from '@/data/site';
import { useAuth } from '@/auth/AuthContext';
import { signOut } from '@/lib/auth';
import { navigate, routeHref } from '@/lib/router';

const focusDark =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-piedra focus-visible:ring-offset-2 focus-visible:ring-offset-carbon';

interface AccountLink {
  href: string;
  label: string;
  icon: typeof UserRound;
}

/**
 * Opciones de la cuenta según los permisos. Es la única lista: la usan el menú "Mi cuenta" de
 * escritorio y la sección "Tu cuenta" del menú móvil. Para añadir una opción, basta con hacerlo aquí.
 */
function useAccountLinks(): AccountLink[] {
  const { session, isAdmin } = useAuth();
  if (!session) return [];
  const links: AccountLink[] = [
    { href: routeHref('/perfil'), label: 'Mi perfil', icon: UserRound },
    { href: routeHref('/mis-tickets'), label: 'Mis tickets', icon: TicketIcon },
  ];
  if (isAdmin) links.push({ href: routeHref('/admin'), label: 'Panel del club', icon: LayoutDashboard });
  return links;
}

async function handleSignOut() {
  const { error } = await signOut();
  if (!error) navigate('/');
}

/** Escritorio: botón "Mi cuenta" con un desplegable. */
function AccountMenu({ links }: { links: AccountLink[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
    };
  }, [open]);

  // Se cierra al salir con el tabulador.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
  };

  return (
    <div className="relative" onBlur={onBlur} onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="account-menu"
        className={`btn-gold ${focusDark}`}
      >
        <UserRound size={16} aria-hidden="true" /> Mi cuenta
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          id="account-menu"
          className="animate-slide-down absolute right-0 mt-2 w-56 overflow-hidden rounded-r-md border border-marfil/10 bg-carbon py-1.5 shadow-lg shadow-black/30"
        >
          <ul>
            {links.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <a
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-marfil/90 transition-colors hover:bg-marfil/10 hover:text-piedra focus-visible:bg-marfil/10 focus-visible:text-piedra focus-visible:outline-none"
                >
                  <Icon size={16} aria-hidden="true" /> {label}
                </a>
              </li>
            ))}
          </ul>
          <div className="my-1.5 border-t border-marfil/10" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              handleSignOut();
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-marfil/70 transition-colors hover:bg-marfil/10 hover:text-piedra focus-visible:bg-marfil/10 focus-visible:text-piedra focus-visible:outline-none"
          >
            <LogOut size={16} aria-hidden="true" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNav = () => setOpen(false);

  const { session } = useAuth();
  const accountLinks = useAccountLinks();
  const clubHref = routeHref(session ? '/perfil' : '/club');
  const clubLabel = session ? 'Mi perfil' : 'Pertenecer al club';

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-carbon/95 backdrop-blur-md shadow-lg shadow-black/20'
          : 'bg-carbon/80 backdrop-blur-sm'
      }`}
      style={{ top: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="mx-auto flex max-w-container items-center justify-between px-4 py-3 sm:px-6 lg:px-12">
        <a href="#top" className="font-display text-lg font-semibold tracking-wide text-marfil sm:text-xl">
          {siteConfig.name.toUpperCase()}
        </a>

        <ul className="hidden items-center gap-6 lg:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm font-medium text-marfil/85 transition-colors hover:text-piedra"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          {session ? (
            <AccountMenu links={accountLinks} />
          ) : (
            <a href={routeHref('/club')} className={`btn-gold ${focusDark}`}>
              Pertenecer al club
            </a>
          )}
          <a
            href={`https://wa.me/${siteConfig.whatsapp}`}
            target="_blank"
            rel="noopener"
            className="btn-vino"
          >
            Reservar
          </a>
        </div>

        <div className="flex items-center gap-1.5 lg:hidden">
          <a href={clubHref} onClick={handleNav} className={`btn-gold px-3 py-2 text-xs ${focusDark}`}>
            {session && <UserRound size={14} aria-hidden="true" />}
            {clubLabel}
          </a>
          <button
            className={`flex items-center justify-center rounded-r-sm p-2 text-marfil ${focusDark}`}
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="animate-slide-down max-h-[calc(100dvh-64px)] overflow-y-auto border-t border-marfil/10 bg-carbon/98 px-4 pb-6 pt-2 backdrop-blur-md lg:hidden">
          {accountLinks.length > 0 && (
            <div className="mb-2 border-b border-marfil/10 pb-2">
              <p className="px-3 pb-1 pt-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-marfil/45">
                Tu cuenta
              </p>
              <ul className="flex flex-col gap-1">
                {accountLinks.map(({ href, label, icon: Icon }) => (
                  <li key={href}>
                    <a
                      href={href}
                      onClick={handleNav}
                      className="flex items-center gap-2 rounded-r-sm px-3 py-3 text-sm font-semibold text-piedra transition-colors hover:bg-marfil/10"
                    >
                      <Icon size={16} aria-hidden="true" /> {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={handleNav}
                  className="block rounded-r-sm px-3 py-3 text-sm font-medium text-marfil/90 transition-colors hover:bg-marfil/10 hover:text-piedra"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href={`https://wa.me/${siteConfig.whatsapp}`}
            target="_blank"
            rel="noopener"
            onClick={handleNav}
            className="btn-vino mt-4 w-full"
          >
            Reservar por WhatsApp
          </a>
          {session && (
            <button
              type="button"
              onClick={() => {
                handleNav();
                handleSignOut();
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-r-sm px-3 py-3 text-sm font-medium text-marfil/60 transition-colors hover:bg-marfil/10 hover:text-piedra"
            >
              <LogOut size={16} aria-hidden="true" /> Cerrar sesión
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
