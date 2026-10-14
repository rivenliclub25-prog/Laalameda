export const siteConfig = {
  name: 'La Alameda',
  city: 'Salamanca',
  address: 'Paseo de Carmelitas, 57, 37002 Salamanca',
  phoneDisplay: '682 469 060',
  whatsapp: '34682469060',
  hours: 'Lunes a domingo · 09:30 — 03:00',
  mapsUrl: 'https://maps.app.goo.gl/wENtQKSLx1kEcGnX7',
  mapsEmbed:
    'https://maps.google.com/maps?q=Paseo%20de%20Carmelitas%2C%2057%2C%2037002%20Salamanca&t=&z=16&ie=UTF8&iwloc=B&output=embed',
  instagram: 'https://www.instagram.com/laalameda_bar',
} as const;

export const publicBaseUrl = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export function publicAssetUrl(path: string): string {
  return `${publicBaseUrl}${path.replace(/^\/+/, '')}`;
}

const publicImages = publicAssetUrl('images/');

export const navLinks = [
  { label: 'Promos', href: '#promos' },
  { label: 'Experiencia', href: '#experiencia' },
  { label: 'Carta', href: '#carta' },
  { label: 'Terraza', href: '#terraza' },
  { label: 'Quiénes somos', href: '#quienes-somos' },
  { label: 'Ubicación', href: '#ubicacion' },
] as const;

export type MenuCategory =
  | 'promos'
  | 'cafeteria'
  | 'pinchos'
  | 'montaditos'
  | 'cervezas'
  | 'copas'
  | 'vinos'
  | 'refrescos';

export interface MenuItem {
  name?: string;
  desc?: string;
  price?: string;
  pending?: boolean;
  recommended?: boolean;
  sectionHeader?: string;
  sectionSub?: string;
}

export interface MenuTab {
  id: MenuCategory;
  label: string;
  items: MenuItem[];
}

export const menuTabs: MenuTab[] = [
  {
    id: 'promos',
    label: 'Promos',
    items: [],
  },
  {
    id: 'cafeteria',
    label: 'Cafetería',
    items: [
      { name: 'Solo', desc: 'Café de especialidad, 100% origen colombiano', price: '1,90€' },
      { name: 'Con leche', desc: 'Café de especialidad, 100% origen colombiano', price: '1,80€' },
      { name: 'Cortado', desc: 'Espresso con leche', price: '1,90€' },
      { name: 'Irish Coffee', desc: 'Café con nata', price: '3,90€', recommended: true },
    ],
  },
  {
    id: 'pinchos',
    label: 'Pinchos',
    items: [
      { name: 'Patatas', desc: 'Bravas / alioli', price: '3€' },
      { name: 'Jeta', price: '2€' },
      { name: 'Tortilla de patatas', price: '3€' },
      { name: 'Mini burguer', price: '1,70€' },
      { name: 'Perritos', price: '2,40€' },
      { name: 'Croquetas de jamón', desc: '1 unidad', price: '2,80€' },
    ],
  },
  {
    id: 'montaditos',
    label: 'Montaditos',
    items: [
      { name: 'Lomo y queso', price: '2€' },
      { name: 'Bacon y queso', price: '2€' },
      { name: 'Lomo y pimiento', price: '2€' },
      { name: 'Pan unidad', price: '0,40€' },
    ],
  },
  {
    id: 'cervezas',
    label: 'Cervezas',
    items: [
      { name: 'Caña', desc: 'Estrella, 25cl', price: '2€' },
      { name: 'Caña 1906', price: '2€' },
      { name: 'Cañón', desc: 'Estrella, 31cl', price: '2,90€' },
      { name: 'Cañón 1906', price: '2,90€' },
      { name: 'Botellín', desc: 'Estrella, 25cl', price: '2€' },
      { name: 'Tercio', desc: 'Estrella — también sin alcohol y sin gluten', price: '2,90€' },
      { name: 'Premium IPA', desc: 'Baskeland', price: '3,40€', recommended: true },
      { name: 'Radler', desc: 'Blemon', price: '2,80€' },
    ],
  },
  {
    id: 'copas',
    label: 'Copas',
    items: [
      { sectionHeader: 'Ginebras', sectionSub: 'solas o con tónica/refresco' },
      { name: "Seagram's", price: '6,60€' },
      { name: 'Beefeater', price: '6,90€' },
      { name: 'Bombay', price: '6,60€' },
      { name: 'Puerto de Indias', price: '7€' },
      { name: 'Tanqueray', price: '6,90€' },
      { name: 'Larios', price: '6,50€' },
      { name: "Hendrick's", price: '7,70€', recommended: true },
      { sectionHeader: 'Rones', sectionSub: 'solos o con tónica/refresco' },
      { name: 'Barceló', price: '7€' },
      { name: 'Brugal', price: '6,70€' },
      { name: 'Cacique', price: '6,60€' },
      { name: 'Bacardi Carta Blanca', price: '6,70€' },
      { name: 'Arehucas', price: '6,60€' },
      { name: 'Capitán Morgan', price: '6,90€' },
      { sectionHeader: 'Whisky', sectionSub: 'solo o con tónica/refresco' },
      { name: 'White Label', price: '6,50€' },
      { name: 'Red Label', price: '6,90€' },
      { name: 'DYC', price: '6,50€' },
      { name: "Ballantine's", price: '6,60€' },
      { name: 'Cutty Sark', price: '6,90€' },
      { name: 'JB', price: '6,90€' },
      { name: 'DYC 8 años', price: '8€' },
      { name: 'Black Label', price: '8,70€' },
      { name: 'Gentleman Jack', price: '8,80€' },
      { name: 'Glenfiddich', price: '10,60€' },
      { sectionHeader: 'Otros' },
      { name: "Bailey's", desc: 'Solo / con hielo', price: '4,40€' },
      { name: 'Chupito licor de café', price: '1,90€' },
      { name: 'Licor de hierbas', price: '1,90€' },
    ],
  },
  {
    id: 'vinos',
    label: 'Vinos',
    items: [
      { name: 'Godello', desc: 'Blanco', price: '3,90€' },
      { name: 'Verdejo', desc: 'Blanco', price: '2,90€' },
      { name: 'Ribera', desc: 'Tinto', price: '3,90€' },
      { name: 'Toro', desc: 'Tinto', price: '3,30€' },
      { name: 'Rioja', desc: 'Tinto', price: '2,80€' },
      { name: 'Tinto de verano', price: '3,40€' },
      { name: 'Vermut Izaguirre', desc: 'Blanco o Rosso', price: '2,40€' },
    ],
  },
  {
    id: 'refrescos',
    label: 'Refrescos',
    items: [
      { name: 'Coca-Cola', price: '2,40€' },
      { name: 'Coca-Cola Zero', price: '2,40€' },
      { name: 'Coca-Cola Zero Zero', price: '2,40€' },
      { name: 'Fanta Naranja', price: '2,40€' },
      { name: 'Fanta Limón', price: '2,40€' },
      { name: 'Fuze Limón', price: '2€' },
      { name: 'Tónica', price: '2,20€' },
      { name: 'Aquarius', price: '2,20€' },
      { name: 'Aquarius Naranja', price: '2,20€' },
      { name: 'Agua', price: '1,60€' },
      { name: 'Zumo', desc: 'Piña, naranja o melocotón', price: '1,80€' },
    ],
  },
];

export const experiencePillars = [
  {
    title: 'Ambiente Para Todos',
    desc: 'Ver partidos, charlar y pasar un buen rato — aquí hay sitio para todas las edades.',
    placeholder: 'Ambiente acogedor',
    image: `${publicImages}WhatsApp_Image_2026-10-04_at_3.02.07_AM.jpeg`,
  },
  {
    title: 'Gastronomía',
    desc: 'Patatas, croquetas, montaditos y producto para compartir sin complicaciones.',
    placeholder: 'Producto para compartir',
    image:
      'https://images.pexels.com/photos/5914365/pexels-photo-5914365.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    title: 'Terraza Salmantina',
    desc: 'Vistas y ambiente al aire libre en el corazón de la ciudad.',
    placeholder: 'Terraza salmantina',
    image:
      'https://images.pexels.com/photos/18346996/pexels-photo-18346996.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    title: 'Tardeo y Copas',
    desc: 'Música en vivo, gin-tonics y planes para alargar la tarde.',
    placeholder: 'Copas al caer la tarde',
    image: `${publicImages}WhatsApp_Image_2026-10-04_at_3.02.07_AM.jpeg`,
  },
];

export const galleryItems = [
  { label: 'FOTO 1', span: 'large' },
  { label: 'FOTO 2', span: 'small' },
  { label: 'FOTO 3', span: 'small' },
  { label: 'FOTO 4', span: 'wide' },
  { label: 'FOTO 5', span: 'small' },
];

export const reviews = [
  {
    name: 'Inés García Camarasa',
    time: 'Hace 8 meses',
    quote: 'El camarero siempre manteniendo la amabilidad y la calma aunque el bar esté hasta el tope. ¡Volveré!',
  },
  {
    name: 'El Dani S',
    time: 'Hace 8 meses',
    quote: 'Bar muy recomendable para estar con los amigos por el espacio, la comida y sobre todo el servicio, siendo lo más destacable de todo el establecimiento. 100% recomendable.',
  },
  {
    name: 'Carmen Diego Diez',
    time: 'Hace 6 meses',
    quote: 'El camarero muy agradable, buen servicio y la comida rica y barata.',
  },
] as const;

export const reviewLinks = [
  {
    label: 'Reseñas en Google',
    href: siteConfig.mapsUrl,
    color: 'vino' as const,
    icon: 'google',
    pending: false,
  },
  {
    label: 'Ver en TripAdvisor',
    href: '#',
    color: 'tripadvisor' as const,
    icon: 'tripadvisor',
    pending: true,
  },
  {
    label: 'Ver mapa',
    href: siteConfig.mapsUrl,
    color: 'vino' as const,
    icon: 'map',
    pending: false,
  },
];
