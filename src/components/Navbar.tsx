import { useEffect, useState } from 'react';
import { LayoutDashboard, Menu, Ticket as TicketIcon, UserRound, X } from 'lucide-react';
import { navLinks, siteConfig } from '@/data/site';
import { useAuth } from '@/auth/AuthContext';
import { routeHref } from '@/lib/router';

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

  const { session, isAdmin } = useAuth();
  const clubHref = routeHref(session ? '/perfil' : '/club');
  const clubLabel = session ? 'Mi perfil' : 'Pertenecer al club';
  const clubFocus =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-piedra focus-visible:ring-offset-2 focus-visible:ring-offset-carbon';

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
          {session && (
            <a
              href={routeHref('/mis-tickets')}
              title="Mis tickets"
              className={`inline-flex items-center gap-1.5 rounded-r-sm text-sm font-medium text-marfil/85 transition-colors hover:text-piedra ${clubFocus}`}
            >
              <TicketIcon size={17} aria-hidden="true" />
              {/* En pantallas medianas solo el icono, para que quepa todo el header. */}
              <span className="sr-only xl:not-sr-only">Mis tickets</span>
            </a>
          )}
          {isAdmin && (
            <a
              href={routeHref('/admin')}
              className={`inline-flex items-center gap-1.5 rounded-r-sm text-sm font-medium text-piedra transition-colors hover:text-piedra-suave ${clubFocus}`}
            >
              <LayoutDashboard size={16} aria-hidden="true" /> Panel
            </a>
          )}
          <a href={clubHref} className={`btn-gold ${clubFocus}`}>
            {session && <UserRound size={16} aria-hidden="true" />}
            {clubLabel}
          </a>
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
          <a href={clubHref} onClick={handleNav} className={`btn-gold px-3 py-2 text-xs ${clubFocus}`}>
            {session && <UserRound size={14} aria-hidden="true" />}
            {clubLabel}
          </a>
          <button
            className={`flex items-center justify-center rounded-r-sm p-2 text-marfil ${clubFocus}`}
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="animate-slide-down border-t border-marfil/10 bg-carbon/98 px-4 pb-6 pt-2 backdrop-blur-md lg:hidden">
          <ul className="flex flex-col gap-1">
            {session && (
              <li>
                <a
                  href={routeHref('/mis-tickets')}
                  onClick={handleNav}
                  className="flex items-center gap-2 rounded-r-sm px-3 py-3 text-sm font-semibold text-piedra transition-colors hover:bg-marfil/10"
                >
                  <TicketIcon size={16} aria-hidden="true" /> Mis tickets
                </a>
              </li>
            )}
            {isAdmin && (
              <li>
                <a
                  href={routeHref('/admin')}
                  onClick={handleNav}
                  className="flex items-center gap-2 rounded-r-sm px-3 py-3 text-sm font-semibold text-piedra transition-colors hover:bg-marfil/10"
                >
                  <LayoutDashboard size={16} aria-hidden="true" /> Panel del club
                </a>
              </li>
            )}
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
        </div>
      )}
    </nav>
  );
}
