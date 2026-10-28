import { useEffect, useRef, useState } from 'react';
import { X, MessageCircle } from 'lucide-react';
import { siteConfig } from '@/data/site';
import { useScrollLock } from '@/lib/useScrollLock';

interface ReserveModalProps {
  open: boolean;
  onClose: () => void;
}

export function ReserveModal({ open, onClose }: ReserveModalProps) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [people, setPeople] = useState('2');
  const nameRef = useRef<HTMLInputElement>(null);
  useScrollLock(open);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => nameRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim() || '—';
    const d = date || '—';
    const p = people || '—';
    const text = encodeURIComponent(
      `Hola, quiero reservar mesa en La Alameda. Nombre: ${n}. Fecha: ${d}. Personas: ${p}`
    );
    window.open(`https://wa.me/${siteConfig.whatsapp}?text=${text}`, '_blank');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-carbon/70 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="animate-scale-in relative w-full max-w-[420px] rounded-r-lg bg-marfil p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-lg text-carbon/60 transition-colors hover:bg-carbon/10 hover:text-carbon"
        >
          <X size={20} />
        </button>

        <h3 className="mb-1 font-display text-[1.8rem] font-semibold text-vino">
          Reservar mesa
        </h3>
        <div className="divider-gold ml-0 mb-6" />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-carbon/80">Nombre</label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full rounded-r-sm border border-carbon/25 px-3 py-2.5 font-primary text-sm outline-none transition-colors focus:border-vino focus:ring-1 focus:ring-vino/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-carbon/80">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-r-sm border border-carbon/25 px-3 py-2.5 font-primary text-sm outline-none transition-colors focus:border-vino focus:ring-1 focus:ring-vino/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-carbon/80">Nº de personas</label>
            <input
              type="number"
              min={1}
              value={people}
              onChange={(e) => setPeople(e.target.value)}
              className="w-full rounded-r-sm border border-carbon/25 px-3 py-2.5 font-primary text-sm outline-none transition-colors focus:border-vino focus:ring-1 focus:ring-vino/30"
            />
          </div>
          <button type="submit" className="btn-vino w-full">
            <MessageCircle size={16} /> Enviar por WhatsApp
          </button>
        </form>
      </div>
    </div>
  );
}
