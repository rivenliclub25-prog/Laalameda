import { siteConfig, type MenuCategory } from '@/data/site';

export type PromoSegmentId = 'mananas' | 'tarde' | 'noche' | 'fin-de-semana' | 'universitarios' | '31-octubre';

export interface PromoSegment {
  id: PromoSegmentId;
  label: string;
  audience: string;
}

export interface PromoProduct {
  category: Exclude<MenuCategory, 'promos'>;
  name: string;
  quantity: number;
}

interface PromoSchedule {
  days: number[];
  startMinutes: number;
  endMinutes: number;
}

export interface Promotion {
  id: string;
  title: string;
  segmentIds: PromoSegmentId[];
  description?: string;
  contents: string[];
  priceCents?: number;
  discount?: number;
  people?: number;
  regularProducts?: PromoProduct[];
  schedule: PromoSchedule;
  scheduleLabel: string;
  reserveMessage?: string;
  expiresOn?: string;
}

export const promoSegments: PromoSegment[] = [
  { id: 'mananas', label: '☕ Mañanas', audience: 'Vecinos y trabajadores' },
  { id: 'tarde', label: '🍺 Tarde', audience: 'Parejas y compañeros' },
  { id: 'noche', label: '🌙 Noche', audience: 'Grupos' },
  { id: 'fin-de-semana', label: '🥂 Fin de semana', audience: 'Planes de sábado y domingo' },
  { id: 'universitarios', label: '🎓 Universitarios', audience: 'Estudiantes' },
  { id: '31-octubre', label: '🎃 31 de octubre', audience: 'Especial de inauguración' },
];

const weekdays = [1, 2, 3, 4, 5];
const nights = [0, 1, 2, 3, 4, 5, 6];
const weekend = [0, 6];

export const promotions: Promotion[] = [
  {
    id: 'desayuno-salmantino',
    title: 'Desayuno Salmantino',
    segmentIds: ['mananas'],
    contents: ['Café con leche, cortado o solo', 'Pincho de tortilla'],
    priceCents: 350,
    discount: 22,
    schedule: { days: [1, 2, 3, 4], startMinutes: 8 * 60, endMinutes: 12 * 60 },
    scheduleLabel: 'L-J · 8:00-12:00',
  },
  {
    id: 'desayuno-fuerte',
    title: 'Desayuno Fuerte',
    segmentIds: ['mananas'],
    contents: ['Café con leche', 'Montadito de lomo y queso o de bacon y queso'],
    priceCents: 400,
    discount: 13,
    schedule: { days: [1, 2, 3, 4], startMinutes: 8 * 60, endMinutes: 12 * 60 },
    scheduleLabel: 'L-J · 8:00-12:00',
  },
  {
    id: 'dos-canas-y-bravas',
    title: 'Dos cañas y bravas',
    segmentIds: ['tarde'],
    contents: ['2 cañas Estrella', 'Patatas bravas'],
    priceCents: 500,
    discount: 25,
    regularProducts: [
      { category: 'cervezas', name: 'Caña', quantity: 2 },
      { category: 'pinchos', name: 'Patatas', quantity: 1 },
    ],
    schedule: { days: weekdays, startMinutes: 16 * 60, endMinutes: 20 * 60 },
    scheduleLabel: 'L-V · 16:00-20:00',
  },
  {
    id: 'pack-partido',
    title: 'Pack Partido',
    segmentIds: ['noche'],
    description: 'Pack para 2',
    contents: ['2 cañones Estrella', 'Patatas bravas', 'Pincho de tortilla'],
    priceCents: 900,
    discount: 18,
    people: 2,
    schedule: { days: nights, startMinutes: 20 * 60, endMinutes: 3 * 60 },
    scheduleLabel: 'Cada noche · 20:00-3:00',
    reserveMessage: 'Hola, quiero reservar para 2 con el Pack Partido',
  },
  {
    id: 'previa-alameda',
    title: 'Previa Alameda',
    segmentIds: ['noche', 'universitarios'],
    description: 'Pack para 4',
    contents: ['4 cañones Estrella', 'Patatas bravas'],
    priceCents: 1100,
    discount: 11,
    people: 4,
    schedule: { days: nights, startMinutes: 20 * 60, endMinutes: 3 * 60 },
    scheduleLabel: 'Cada noche · 20:00-3:00',
    reserveMessage: 'Hola, quiero reservar para 4 con la Previa Alameda',
  },
  {
    id: 'vermut-alameda',
    title: 'Vermut Alameda',
    segmentIds: ['fin-de-semana'],
    contents: ['2 vermuts Izaguirre', 'Patatas bravas', 'Jeta'],
    priceCents: 750,
    discount: 32,
    schedule: { days: weekend, startMinutes: 0, endMinutes: 24 * 60 },
    scheduleLabel: 'S-D · fin de semana',
  },
  {
    id: 'picoteo-para-4',
    title: 'Picoteo para 4',
    segmentIds: ['fin-de-semana', 'universitarios'],
    description: 'Para compartir entre 4',
    contents: ['4 cañones Estrella', 'Patatas bravas', 'Pincho de tortilla', 'Croquetas de jamón'],
    priceCents: 1700,
    discount: 14,
    people: 4,
    schedule: { days: weekend, startMinutes: 0, endMinutes: 24 * 60 },
    scheduleLabel: 'S-D · fin de semana',
    reserveMessage: 'Hola, quiero reservar para 4 con el Picoteo para 4',
  },
  {
    id: 'cubo-5-botellines',
    title: 'Cubo 5 Botellines',
    segmentIds: ['fin-de-semana'],
    contents: ['5 botellines Estrella Galicia'],
    priceCents: 900,
    discount: 10,
    regularProducts: [{ category: 'cervezas', name: 'Botellín', quantity: 5 }],
    schedule: { days: weekend, startMinutes: 0, endMinutes: 24 * 60 },
    scheduleLabel: 'S-D · fin de semana',
  },
  {
    id: 'mesa-universitaria',
    title: 'Mesa Universitaria',
    segmentIds: ['universitarios'],
    description: 'Martes · de 18:00 a 21:00',
    contents: ['10 botellines Estrella'],
    priceCents: 1800,
    discount: 10,
    schedule: { days: [2], startMinutes: 18 * 60, endMinutes: 21 * 60 },
    scheduleLabel: 'Martes · 18:00-21:00',
  },
  {
    id: 'aperitivo-inauguracion',
    title: 'Aperitivo de inauguración',
    segmentIds: ['31-octubre'],
    contents: ['Vermut Izaguirre', 'Patatas bravas'],
    discount: 17,
    schedule: { days: [6], startMinutes: 0, endMinutes: 24 * 60 },
    scheduleLabel: '31 de octubre',
    expiresOn: '2026-10-31',
  },
  {
    id: 'chupito-disfrazado',
    title: 'Chupito disfrazado',
    segmentIds: ['31-octubre'],
    contents: ['Chupito de licor de café', 'Uno por persona si vienes disfrazado'],
    discount: 48,
    schedule: { days: [6], startMinutes: 0, endMinutes: 24 * 60 },
    scheduleLabel: '31 de octubre',
    expiresOn: '2026-10-31',
  },
  {
    id: 'ronda-4-halloween',
    title: 'Ronda de 4 · Halloween',
    segmentIds: ['31-octubre'],
    contents: ['4 cañas Estrella', 'Patatas bravas', 'Pincho de tortilla'],
    discount: 10,
    schedule: { days: [6], startMinutes: 0, endMinutes: 24 * 60 },
    scheduleLabel: '31 de octubre',
    expiresOn: '2026-10-31',
  },
  {
    id: 'ronda-gratis-sorteo',
    title: 'Ronda gratis + sorteo',
    segmentIds: ['31-octubre'],
    contents: ['Ronda de 4 cañas gratis para la mesa ganadora del sorteo'],
    priceCents: 0,
    description: 'Participa en el sorteo de inauguración',
    schedule: { days: [6], startMinutes: 0, endMinutes: 24 * 60 },
    scheduleLabel: '31 de octubre',
    expiresOn: '2026-10-31',
  },
];

const clubSignupUrl = (promotion: Promotion) => {
  const message = encodeURIComponent(
    `Hola, quiero darme de alta en el club de La Alameda y activar la promo ${promotion.title}.`
  );
  return `https://wa.me/${siteConfig.whatsapp}?text=${message}`;
};

export function isPromotionActive(promotion: Promotion, now: Date): boolean {
  if (!isPromotionVisible(promotion, now)) return false;

  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  const { days, startMinutes, endMinutes } = promotion.schedule;
  const previousDay = (now.getDay() + 6) % 7;

  if (endMinutes <= startMinutes) {
    return (
      (days.includes(now.getDay()) && minuteOfDay >= startMinutes) ||
      (days.includes(previousDay) && minuteOfDay < endMinutes)
    );
  }

  return days.includes(now.getDay()) && minuteOfDay >= startMinutes && minuteOfDay < endMinutes;
}

export function formatPromoPrice(priceCents: number): string {
  return `${(priceCents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} €`;
}

export function formatPromotionPrice(promotion: Promotion): string | null {
  if (promotion.priceCents === undefined) return null;
  if (promotion.priceCents === 0) return 'Gratis';
  if (!promotion.people) return formatPromoPrice(promotion.priceCents);
  const perPerson = Math.round(promotion.priceCents / promotion.people);
  return `${formatPromoPrice(perPerson)} por persona · ${formatPromoPrice(promotion.priceCents)} total`;
}

export function clubSignupHref(promotion: Promotion): string {
  return clubSignupUrl(promotion);
}

export function reservationHref(promotion: Promotion): string | null {
  if (!promotion.reserveMessage) return null;
  const message = encodeURIComponent(promotion.reserveMessage);
  return `https://wa.me/${siteConfig.whatsapp}?text=${message}`;
}

export function isPromotionVisible(promotion: Promotion, now: Date): boolean {
  return !promotion.expiresOn || localDate(now) <= promotion.expiresOn;
}

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
