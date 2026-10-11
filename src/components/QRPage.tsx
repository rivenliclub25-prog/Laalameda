import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, ArrowLeft, Download, QrCode, FileDown } from 'lucide-react';
import { siteConfig } from '@/data/site';

type QRType = 'home' | 'menu' | 'reserve' | 'reviews' | 'instagram' | 'maps';

interface QRConfig {
  id: QRType;
  label: string;
  description: string;
  url: string;
}

const siteBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString();

const qrConfigs: QRConfig[] = [
  {
    id: 'home',
    label: 'Página principal',
    description: 'Lleva a la página principal de La Alameda.',
    url: `${siteBaseUrl}#top`,
  },
  {
    id: 'menu',
    label: 'Ver la carta',
    description: 'Lleva directamente al menú completo del bar.',
    url: `${siteBaseUrl}#carta`,
  },
  {
    id: 'reserve',
    label: 'Reservar mesa',
    description: 'Abre el formulario de reserva por WhatsApp.',
    url: `${siteBaseUrl}#ubicacion`,
  },
  {
    id: 'reviews',
    label: 'Deja tu reseña',
    description: 'Invita a los clientes a valorar su experiencia.',
    url: `${siteBaseUrl}#resenas`,
  },
  {
    id: 'instagram',
    label: 'Síguenos en Instagram',
    description: 'Lleva al perfil de Instagram del bar.',
    url: siteConfig.instagram,
  },
  {
    id: 'maps',
    label: 'Cómo llegar',
    description: 'Abre Google Maps con la ubicación del bar.',
    url: siteConfig.mapsUrl,
  },
];

export function QRPage() {
  const [selected, setSelected] = useState<QRType>('menu');
  const [copied, setCopied] = useState(false);

  const activeConfig = qrConfigs.find((c) => c.id === selected)!;

  useEffect(() => {
    document.title = `Códigos QR — ${siteConfig.name}`;
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(activeConfig.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const svg = document.getElementById('active-qr');
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `la-alameda-qr-${activeConfig.id}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-marfil">
      {/* Top bar — hidden on print */}
      <div className="no-print border-b border-carbon/10 bg-carbon px-6 py-4 text-marfil">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-4">
          <a
            href="#top"
            className="flex items-center gap-2 text-sm font-medium text-marfil/80 transition-colors hover:text-piedra"
          >
            <ArrowLeft size={18} /> Volver a la web
          </a>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 rounded-r-sm border border-marfil/30 px-3 py-2 text-xs font-semibold text-marfil transition-colors hover:bg-marfil/10"
            >
              {copied ? '¡Copiado!' : 'Copiar enlace'}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-r-sm bg-piedra px-4 py-2 text-xs font-semibold text-carbon transition-colors hover:bg-piedra/80"
            >
              <Printer size={15} /> Imprimir
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[900px] px-6 py-10">
        {/* Header */}
        <div className="no-print mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-r-lg bg-vino text-marfil">
            <QrCode size={28} />
          </div>
          <h1 className="font-display text-[2rem] font-semibold text-vino sm:text-[2.5rem]">
            Códigos QR para las mesas
          </h1>
          <p className="mt-3 max-w-[520px] mx-auto text-sm leading-relaxed opacity-70">
            Elige qué quieres que vean tus clientes al escanear, imprime el código y pégalo en las
            mesas. Cada código lleva a una sección distinta de la web.
          </p>
          <div className="divider-gold mt-6" />
        </div>

        {/* Selector — hidden on print */}
        <div className="no-print mb-10">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-carbon/50">
            Elige el tipo de código QR
          </div>
          <div className="flex flex-wrap gap-2.5">
            {qrConfigs.map((config) => (
              <button
                key={config.id}
                onClick={() => setSelected(config.id)}
                className={`rounded-r-md border px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  selected === config.id
                    ? 'border-vino bg-vino text-white shadow-sm'
                    : 'border-carbon/20 bg-white text-carbon hover:border-vino hover:text-vino'
                }`}
              >
                {config.label}
              </button>
            ))}
          </div>
        </div>

        {/* Printable QR card */}
        <div
          id="print-card"
          className="mx-auto max-w-[440px] overflow-hidden rounded-r-lg border border-carbon/10 bg-white shadow-md"
        >
          <div className="bg-vino px-6 py-5 text-center text-marfil">
            <div className="font-display text-[1.6rem] font-semibold leading-tight">
              {siteConfig.name.toUpperCase()}
            </div>
            <div className="mt-1 text-[0.7rem] uppercase tracking-wider opacity-80">
              {siteConfig.city}
            </div>
          </div>

          <div className="flex flex-col items-center px-6 py-8">
            <div className="rounded-r-md bg-white p-4">
              <QRCodeSVG
                id="active-qr"
                value={activeConfig.url}
                size={220}
                level="M"
                marginSize={1}
                fgColor="#1B1815"
                bgColor="#ffffff"
              />
            </div>

            <div className="mt-6 text-center">
              <div className="font-display text-[1.4rem] font-semibold text-vino">
                {activeConfig.label}
              </div>
              <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-carbon/70">
                {activeConfig.description}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full bg-piedra-suave px-4 py-2 text-xs font-semibold text-carbon/80">
                <span className="h-2 w-2 rounded-full bg-vino" />
                Escanea con la cámara del móvil
              </div>
              <button onClick={handleDownload} className="btn-gold-vino px-3 py-2 text-xs">
                <FileDown size={14} /> Descargar QR
              </button>
            </div>
          </div>

          <div className="border-t border-carbon/10 bg-marfil px-6 py-3 text-center">
            <div className="text-[0.7rem] text-carbon/50">{activeConfig.url}</div>
          </div>
        </div>

        {/* Info section — hidden on print */}
        <div className="no-print mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-r-md border border-carbon/10 bg-white p-5">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-r-sm bg-vino/10 text-vino">
              <Printer size={18} />
            </div>
            <h3 className="font-display text-base font-semibold text-carbon">1. Imprime</h3>
            <p className="mt-1 text-xs leading-relaxed opacity-70">
              Pulsa «Imprimir» y usa una hoja A4. Recorta el cartel y plástifícalo para que aguante
              el uso en la mesa.
            </p>
          </div>
          <div className="rounded-r-md border border-carbon/10 bg-white p-5">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-r-sm bg-vino/10 text-vino">
              <QrCode size={18} />
            </div>
            <h3 className="font-display text-base font-semibold text-carbon">2. Pega en las mesas</h3>
            <p className="mt-1 text-xs leading-relaxed opacity-70">
              Coloca un código en cada mesa o en un soporte. Los clientes escanean con el móvil sin
              descargar nada.
            </p>
          </div>
          <div className="rounded-r-md border border-carbon/10 bg-white p-5">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-r-sm bg-vino/10 text-vino">
              <Download size={18} />
            </div>
            <h3 className="font-display text-base font-semibold text-carbon">3. Comparte online</h3>
            <p className="mt-1 text-xs leading-relaxed opacity-70">
              Copia el enlace del código y publícalo en Instagram, TikTok o wherever quieras. También
              sirve para meterlo en tus redes.
            </p>
          </div>
        </div>

        {/* All QRs grid for printing multiple at once — hidden on screen, shown on print */}
        <div className="print-only">
          <div className="grid grid-cols-2 gap-6">
            {qrConfigs.map((config) => (
              <div
                key={config.id}
                className="break-inside-avoid overflow-hidden rounded-r-lg border border-carbon/20"
              >
                <div className="bg-vino px-4 py-3 text-center text-marfil">
                  <div className="font-display text-lg font-semibold">
                    {siteConfig.name.toUpperCase()}
                  </div>
                </div>
                <div className="flex flex-col items-center bg-white px-4 py-6">
                  <QRCodeSVG
                    value={config.url}
                    size={160}
                    level="M"
                    marginSize={1}
                    fgColor="#1B1815"
                    bgColor="#ffffff"
                  />
                  <div className="mt-3 font-display text-base font-semibold text-vino">
                    {config.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
