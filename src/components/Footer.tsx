import { siteConfig } from '@/data/site';

function InstagramIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 3c.5 2.4 2 4 4.5 4.2V10c-1.7 0-3.2-.5-4.5-1.4v6.7A5.7 5.7 0 1 1 10.3 9.6v2.6a3.1 3.1 0 1 0 2.6 3V3H16z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="9" height="16" viewBox="0 0 12 22" fill="currentColor">
      <path d="M11 1H8.5C6 1 4.5 2.5 4.5 5v2.5H2V11h2.5v10H8V11h2.7L11 7.5H8V5.3c0-.7.3-1.3 1.3-1.3H11V1z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="bg-carbon py-12 text-center text-marfil">
      <div className="mx-auto max-w-container px-6">
        <div className="font-display text-xl font-semibold tracking-wide opacity-100">
          {siteConfig.name.toUpperCase()}
        </div>
        <div className="mt-4 flex justify-center gap-3.5">
          <a
            href={siteConfig.instagram}
            target="_blank"
            rel="noopener"
            aria-label="Instagram"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-marfil/40"
          >
            <InstagramIcon />
          </a>
          <a
            href="#"
            target="_blank"
            rel="noopener"
            aria-label="TikTok"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-marfil/40"
          >
            <TikTokIcon />
          </a>
          <a
            href="#"
            target="_blank"
            rel="noopener"
            aria-label="Facebook"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-marfil/40"
          >
            <FacebookIcon />
          </a>
        </div>
        <div className="mt-4 text-sm opacity-70">
          {siteConfig.city} — © {new Date().getFullYear()}
        </div>
        <a
          href="#qr"
          className="mt-3 inline-block text-[0.7rem] uppercase tracking-wider text-marfil/40 transition-colors hover:text-piedra"
        >
          Códigos QR para mesas
        </a>
      </div>
    </footer>
  );
}
