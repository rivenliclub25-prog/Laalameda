# POS del bar: propuesta y decisiones

Este documento es la especificación viva de la **fase POS** de la web de La Alameda: pedidos de socios desde la mesa, pedidos y ventas que registra el camarero, cobros y registro de ventas para el panel. Complementa a `CONTEXT.MD` y `TICKETS.md`: léelos antes.

**Cómo se usa este documento:**

- Las decisiones se gestionan en la sección **«Registro de decisiones»**. Cada una tiene un estado: 🟡 Pendiente, 🟢 Decidida o ⚪ Pospuesta.
- Al decidir algo se anota la decisión y la fecha. Si cambia la propuesta, se actualizan las secciones afectadas y se apunta en el **Historial** (al final).
- No se programa ninguna fase hasta que estén 🟢 las decisiones de las que depende (ver «Fases»).

Última actualización: 2026-10-28 · Estado: **P1 cerrada (P1a y P1b probadas). Siguiente: P2 (venta en barra)**, pendiente de aprobar su plan.

---

## 1. Punto de partida

### Fuentes de verdad

- **Base de datos:** los archivos `.sql` del repositorio (`schema.sql`, `admin.sql`, `tickets.sql`, `promos-clasico.sql`) describen la base de datos real de Supabase.
- **Carta y promos:** hoy están en `src/data/` (`site.ts`, `promos.ts`, `prices.generated.ts`). **Se migran a Supabase y a partir de ahí todo se gestiona desde Supabase y el panel.** El Excel ya no se usa.
- **Correo:** Supabase ya envía el correo de confirmación a los clientes. El registro de socios nuevos en el bar ya no está bloqueado (hay que actualizar el «Pendiente» de `CONTEXT.MD`).

### Arquitectura actual

SPA con Vite 5, React 18, TypeScript y Tailwind, router propio por hash, despliegue en GitHub Pages con Actions desde `main`. **No hay servidor propio**: la lógica sensible vive en Supabase (Postgres con RLS y RPC `security definer`). El POS sigue ese patrón: el navegador pide y la base de datos decide.

| Área | Estado |
|---|---|
| Club (auth, perfil, borrado, correo de confirmación) | Hecho y publicado |
| Roles (`role` admin, permiso `es_camarero`, `protect_role`) | Hecho |
| Tickets T1–T4 | Hecho y publicado el 2026-10-25 |
| Tickets T5 (bienvenida, cumpleaños) | Pendiente, independiente del POS |
| Carta y promos | En el código (`src/data/`). **Se migran a Supabase en P1** |
| Productos, mesas, cuentas, ventas en BD | No existe. Solo los huecos `sale_id` e `importe_descuento_centimos` en `tickets` |

### Qué precios se migran

Se migran **los precios que hoy ve el cliente en la web**, aunque alguno esté mal: se corregirán después desde el panel.

- Carta: los de `prices.generated.ts` (son los que se aplican al cargar; los escritos en `site.ts` están obsoletos y no se usan).
- Promos: los de `prices.generated.ts`, salvo las marcadas `fixedPrice` (El Clásico), que usan el de `promos.ts`.
- Precios que conviene revisar en el panel tras migrar: el Cañón (31 cl) cuesta 2 €, lo mismo que la Caña (25 cl).

### Qué se reutiliza

- **Seguridad y roles:** `AuthProvider` (`isAdmin`, `esCamarero`), `CamareroRoute`, `AdminRoute`, `is_admin()`, `is_camarero()`, códigos de error estables y su traducción (`ticketErrors.ts`).
- **Patrón atómico de `redeem_ticket`** (`update … where estado = … returning`) para cobrar sin duplicados.
- **Tiempo real con reconexión y sondeo de respaldo** (`subscribeMyTickets`).
- **Jornada del bar:** `_jornada_fecha`, `_cierre_jornada`, `app_settings`.
- **Registro de eventos:** `ticket_events` como modelo de `pos_events`.
- **Interfaz:** pestañas de `#/admin`, `PromosSection` (se amplía), `Switch`, `Modal`, `FormControls`, `feedback.ts`, lector `qr-scanner` de `CanjearPage`, `QRPage` y `qrcode.react`, barras de `StatsSection`, CSV seguro de `SociosSection`.

### Obsoleto: se eliminará más adelante

No se borra nada ahora. Cuando la carta y las promos lean de Supabase y estén publicadas y estables, se hace una fase de limpieza (**L**, ver «Fases»):

- `src/data/prices.generated.ts`, y los precios escritos en `site.ts` y `promos.ts`.
- Los datos de carta y promos de `site.ts` y `promos.ts`. Los sustituye la copia de respaldo generada desde Supabase (D11). Se quedan en el código los textos de la web que no son carta ni promos (D13).
- `scripts/sync-prices.mjs`, `scripts/publish-prices.ps1`, `Actualizar precios.bat` y las dependencias `fflate` y `fast-xml-parser`.
- `GUIA-EDICION.md`: «pulsa Publish», el flujo de Bolt y todo lo relativo al Excel y a editar carta y promos en el código.
- En `CONTEXT.MD` y `TICKETS.md`: las menciones al script de precios que hace push a `main` y a «las promos se pintan desde `promos.ts`».

---

## 2. Registro de decisiones

### Decididas

#### D1 — Facturación
- **Estado:** 🟢 Decidida (2026-10-28)
- **Decisión:** el POS **no emite tickets fiscales**. Todo se guarda internamente para la gestión del bar. El ticket fiscal, si hace falta, sigue fuera del sistema.
- **Consecuencia:** no aplica VERI\*FACTU al POS. Aun así, las ventas se diseñan inmutables (sin borrados; las correcciones son devoluciones).

#### D2 — Fuente de los precios
- **Estado:** 🟢 Decidida (2026-10-28)
- **Decisión:** se migran a Supabase los precios y las promos de `src/data/` y **a partir de ahí todo se gestiona desde Supabase y el panel**. El Excel deja de usarse.
- **Consecuencia:** el panel debe permitir editar productos, precios y promos (P1). Esto **sustituye** la decisión de `TICKETS.md` «las promos siguen pintándose desde `promos.ts`» y la de «sin precios en `promotions`»: era la migración ya prevista allí.

#### D3 — Cuenta por mesa
- **Estado:** 🟢 Decidida (2026-10-28)
- **Decisión:** cuenta por mesa, con cobro al final.

#### D4 — Quién pide desde la mesa
- **Estado:** 🟢 Decidida (2026-10-28)
- **Decisión:** solo los **socios del club** pueden pedir desde la web en la mesa. Si un cliente no quiere hacerse socio, **el camarero registra el pedido desde su panel** en la cuenta de esa mesa, sin cliente asociado (`user_id = null`). No se crean usuarios ficticios.

#### D5 — Pagos
- **Estado:** 🟢 Decidida (2026-10-28)
- **Decisión:** los pagos **no se conectan** al POS. Cuando el cliente ha pagado, el camarero **marca la cuenta como pagada**, y en ese momento se registra la venta.
- **Mesas:** se crean y se gestionan desde el panel (nombre y QR), así que no hace falta fijar ahora cuántas hay.
- **Queda abierto:** si al marcar «pagada» se apunta el método (ver D12).

#### D6 — Barra y cocina
- **Estado:** 🟢 Decidida (2026-10-28)
- **Decisión:**
  - **Se pide también en barra:** el camarero registra la venta en su panel aunque el cliente no sea del club.
  - **Hoy no hay cocina, pero la habrá:** se usan solo los estados mínimos y el modelo se deja preparado para añadir «en preparación» y «listo» sin rehacer nada.

#### D7 — Anular y devolver
- **Estado:** 🟢 Decidida (2026-10-28)
- **Decisión:** el camarero puede anular líneas no cobradas, con motivo. Solo el admin puede devolver una venta cobrada, con motivo. Todo queda en `pos_events`.

#### D8 — Rama de trabajo
- **Estado:** 🟢 Decidida (2026-10-28)
- **Decisión:** nueva rama **`pos`** creada desde `main` actualizado (`git pull`). Todo el POS se hace ahí.
- **Nota:** no se publica nada en `main` hasta después del 2026-11-01 (inauguración / Halloween del sábado 31).

#### D9 — Las promos en las ventas
- **Estado:** 🟢 Decidida (2026-10-28)
- **Decisión:** usar una promo es una **línea de la cuenta con un tipo**: `pack`, `obsequio` o `sorteo`. Su importe es el que tenga configurado la promo (puede ser 0).
- **Consecuencia:** la promo guarda su tipo y su precio en `promotions`. Ver la sección 5.

#### D10 — Revisión de precios
- **Estado:** 🟢 Decidida (2026-10-28)
- **Decisión:** se migran los precios tal y como están en `src/data/`. Los errores se corrigen después desde el panel.

#### D11 — Copia de respaldo de la carta
- **Estado:** 🟢 Decidida (2026-10-28)
- **Decisión:** la web **lleva una copia de la carta y las promos** para mostrarla si Supabase no responde.
- **Cómo se hará (detalle de P1):**
  - **Copia dentro de la web:** al desplegar, GitHub Actions lee la carta y las promos de Supabase (son públicas, basta la clave anon) y las guarda en el build como un archivo de respaldo. Si Supabase no responde en el build, se reutiliza la copia del despliegue anterior y el build no falla.
  - **Copia en el navegador:** cada vez que la web carga bien la carta, la guarda en el navegador. Si después Supabase no responde, se usa la más reciente de las dos copias.
  - Mientras se muestra una copia, un aviso discreto indica que los precios pueden no estar al día y se reintenta en segundo plano.
  - La copia solo sirve para **ver** la carta. Pedir desde la mesa y vender en el POS siempre necesitan Supabase, porque el precio lo pone la base de datos.
- **Pendiente de concretar en el plan de P1:** si se añade un despliegue automático diario (gratis en GitHub Actions) para que la copia del build no se quede vieja tras cambiar precios en el panel.

#### D12 — Método de pago
- **Estado:** 🟢 Decidida (2026-10-28)
- **Decisión:** al marcar la cuenta como pagada, **el camarero indica el método de pago**: «Efectivo», «Tarjeta» u «Otro». No se conecta a nada; solo se guarda, para cuadrar la caja al cierre de la jornada.

#### D13 — Qué se migra a Supabase
- **Estado:** 🟢 Decidida (2026-10-28)
- **Decisión:**
  - **Se migra:** los **productos** de la carta (con sus categorías, descripción, recomendado y orden), sus **precios** y las **promos** (con sus franjas, textos, contenidos, horarios, precio, tipo, visibilidad y exclusivas).
  - **Se queda en la web (en el código):** todo lo demás: portada, historia, experiencia, galería, reseñas, terraza, datos de contacto y QR.

### Pospuestas

| Id | Tema | Por qué se pospone |
|---|---|---|
| P-1 | Pago dividido («pagar lo mío») | El modelo lo permite (cada línea guarda quién la pidió); no hace falta ahora |
| P-2 | Propinas | No pedido |
| P-3 | Inventario y agotados automáticos | El interruptor manual «disponible» basta al principio |
| P-4 | Cocina: estados «en preparación» y «listo», pantalla e impresión de comandas | Cuando haya cocina (D6) |
| P-5 | Modificadores estructurados (bravas/alioli, tipo de café) | Un campo de notas basta al principio |
| P-6 | Tickets T5 (bienvenida, cumpleaños) | Independiente del POS |
| P-7 | Copias de seguridad (plan de Supabase o exportación periódica) | Antes de la puesta en marcha (P7) |
| P-8 | Migrar a Supabase los demás textos de la web | Se quedan en el código (D13) |
| P-10 | Publicación automática diaria para renovar la copia de la carta | Descartada de momento (2026-10-28): basta la copia al publicar y la del navegador |
| P-9 | Más métodos de pago (por ejemplo, Bizum por separado) | Basta «Otro» de momento (D12) |

---

## 3. Flujo operativo

**Idea central:** se modela la **cuenta de la mesa** (D3), no el pedido suelto. Cada ronda añade líneas a la cuenta abierta.

### Socio en la mesa
1. Escanea el QR de la mesa (`#/mesa?m=<token>`) y ve la carta con precios y las promos disponibles.
2. Si no tiene sesión, inicia sesión o se registra y vuelve a la mesa (como el flujo actual de promos).
3. Añade productos o promos al carrito y envía la ronda.
4. La ronda se suma a la cuenta abierta de la mesa y el socio ve su estado en tiempo real.

### Cliente no socio
- Ve la carta pero no puede pedir desde la web; la página le invita a hacerse socio.
- Pide al camarero, que lo registra desde su panel en la cuenta de la mesa sin cliente asociado (D4).

### Camarero (`#/pos`)
- **Mesas:** lista de cuentas abiertas, con aviso sonoro cuando llega una ronda web.
  - Acepta la ronda web (control humano contra pedidos falsos) y la marca como servida.
  - Añade líneas a mano (para socios o no socios) y anula líneas con motivo.
  - Marca la cuenta como **pagada** cuando el cliente ha pagado (D5).
- **Barra:** venta rápida. Añade productos y marca pagada en una sola acción. Es una cuenta sin mesa.
- **Promos:** las añade como líneas; si la promo es de club, escanea o teclea el ticket del socio (sección 5).

### Admin (`#/admin`)
- **Carta y promos:** edita productos, precios, disponibilidad y promos (P1).
- **Mesas:** crea mesas, las renombra, las desactiva e imprime sus QR.
- **Ventas:** lista de ventas, devoluciones con motivo, cierre de jornada e informes.

### Ciclo de vida

- **Línea:** `pendiente` (enviada por el socio) → `aceptada` → `servida`, o `anulada`. Las líneas que añade el camarero nacen `aceptada`. Cuando haya cocina se añadirán `en_preparacion` y `lista` entre `aceptada` y `servida` (P-4).
- **Cuenta:** `abierta` → `pagada`, o `cancelada` si se cierra sin nada servido.
- **La venta nace solo al marcar la cuenta como pagada**, en la misma transacción. Una cuenta abierta nunca cuenta como ingreso.

---

## 4. Modelo de datos

**Un único modelo para la mesa y la barra:** una venta de barra es una cuenta con `origen = 'barra'`, sin mesa ni socio, que se crea y se marca pagada en la misma RPC. La lógica de precios, cobro y registro existe una sola vez.

### Carta y promos (P1)

| Tabla | Para qué | Campos clave |
|---|---|---|
| `menu_categories` | Pestañas de la carta | `id` (`cafeteria`, `cervezas`…), `nombre`, `orden` |
| `products` | Productos de la carta | `id` (slug estable), `categoria_id`, `nombre`, `descripcion`, `precio_centimos`, `recomendado`, `activo` (sale en la carta), `disponible` (agotado hoy), `orden`, separadores de sección si hacen falta |
| `promo_segments` | Franjas de promos | `id` (`mananas`, `noche`…), `nombre`, `publico`, `orden` |
| `promotions` (ampliada) | Promos | Lo que ya tiene **más**: `tipo` (`pack`, `obsequio`, `sorteo`), `precio_centimos`, `descripcion`, `contenidos`, `personas`, `texto_horario`, `visible_hasta`, `exclusiva`, `orden` |
| `promotion_segments` | Promo ↔ franja | `promo_id`, `segment_id` |
| `promotion_items` | Contenido real de la promo | `promo_id`, `product_id`, `cantidad`. Sirve para calcular el precio normal y el descuento |

### Mesas, cuentas y ventas (P2–P3)

| Tabla | Para qué | Campos clave |
|---|---|---|
| `mesas` | Mesas y su QR | `id`, `nombre` («Terraza 3»), `token` aleatorio, `activa` |
| `orders` (la cuenta) | Lo que se debe | `origen` (`mesa`/`barra`), `mesa_id` (nulo en barra), `estado`, `abierta_por`, `jornada`, `client_request_id` único |
| `order_items` | Líneas | **o** `product_id` **o** `promo_id` (exactamente uno), copia del nombre y del precio unitario, `tipo_linea` (`producto`, `pack`, `obsequio`, `sorteo`), `cantidad`, `notas`, `pedido_por` (socio, nulo si no es socio), `añadida_por` (camarero, nulo si es web), `estado`, `ticket_id` (nulo), `descuento_centimos` |
| `sales` | Venta cobrada, inmutable | `order_id` **único**, `bruto`, `descuentos`, `total`, `metodo` (`efectivo`, `tarjeta`, `otro`; D12), `cobrado_por`, `cobrado_at`, `jornada` |
| `sale_refunds` | Devoluciones (solo admin) | `sale_id`, `importe`, `motivo`, `por`, `at` |
| `pos_events` | Trazabilidad | Como `ticket_events`: abrir, añadir, aceptar, servir, anular, pagar, devolver |

### Reglas

- Dinero en céntimos (enteros) y horas en `Europe/Madrid`, como en los tickets.
- El navegador **solo envía el `product_id` o `promo_id` y la cantidad**. El precio lo pone la base de datos al añadir la línea y queda copiado: si después cambia el precio en el panel, las cuentas y ventas no cambian.
- El total lo calcula la RPC que marca la cuenta como pagada.
- Sin duplicados: `client_request_id` único, `update … where estado = 'abierta' returning` y `unique(order_id)` en `sales`.
- Las ventas no se borran ni se editan; las correcciones son devoluciones.
- RLS:
  - Carta, promos y franjas: las lee cualquiera; solo los admins las cambian.
  - Cuentas: el socio solo lee las cuentas en las que tiene líneas suyas; los camareros y admins leen todas.
  - Nadie escribe directamente en cuentas, líneas ni ventas: todo por RPC con códigos de error estables.
- Los estados son `text` con `check`, para poder añadir los de cocina después (D6).
- Archivos SQL nuevos: `supabase/catalogo.sql` (P1) y `supabase/pos.sql` (P2 en adelante), comentados y con pruebas manuales como `tickets.sql`. Los existentes no se tocan salvo `create or replace` imprescindible.

---

## 5. Promos y tickets en las ventas

- **Cada promo tiene un tipo y un precio** (D9), configurables desde el panel:
  - `pack`: precio cerrado (por ejemplo, Pack Partido 9 €).
  - `obsequio`: normalmente 0 € (por ejemplo, Chupito disfrazado).
  - `sorteo`: normalmente 0 € (por ejemplo, Ronda gratis + sorteo).
- **Usar una promo es añadir una línea de ese tipo a la cuenta**, con el importe configurado.
- **Si la promo es de club (`solo_club = true`), la línea exige un ticket válido del socio:**
  - Desde la mesa: al enviar la ronda se usa el ticket disponible del socio o se crea.
  - Desde el POS: el camarero escanea o teclea el código del ticket (se reutiliza el lector de `#/canjear`).
  - Si no es de club (por ejemplo, un sorteo que registra el camarero para la mesa ganadora), no hace falta ticket.
- **El ticket se canjea al aceptar la línea.** `redeem_ticket` se refactoriza en una función interna compartida: límites, caducidad, canje único y «nadie canjea un ticket propio» siguen existiendo una sola vez.
- Se rellenan `tickets.order_item_id` (nuevo) y `tickets.sale_id` (con FK al pagar).
- **Descuento calculado por el servidor:** precio normal del contenido (`promotion_items`) menos el precio de la promo. Se guarda en la línea y en `tickets.importe_descuento_centimos`. Si la promo no tiene contenido definido, el descuento queda vacío.
- Se mantienen todas las reglas de `TICKETS.md`: activar o desactivar promos, límites por ventana, canje único y solo camareros canjean.

---

## 6. Arquitectura y costes

- Se mantiene todo: frontend estático en Pages, y Supabase para auth, BD, RPC y Realtime. Sin servidor nuevo ni dependencias de pago.
- **Copias de seguridad:** con datos de ventas importan. Revisar qué incluye el plan gratuito de Supabase frente a Pro (unos 25 $/mes) o hacer exportaciones periódicas (P-7).
- **Conexión:** el POS depende de la red y de Supabase; la carta tiene copia de respaldo (D11). Comprobar la wifi del bar antes de P7.

---

## 7. Fases

| Fase | Contenido | Depende de | Hecha cuando… |
|---|---|---|---|
| **P0** Decisiones | Este documento | — | ✅ Hecha (2026-10-28) |
| **P1** Carta y promos en Supabase | `catalogo.sql` (tablas, RLS y migración de productos, precios y promos de `src/data/`); la web lee la carta y las promos de Supabase, con copia de respaldo en el build y en el navegador; el panel edita productos, precios, disponibilidad y promos | D2, D8, D11, D13 | La web se ve igual que antes; cambiar un precio en el panel se ve en la web; sin Supabase la carta se ve con aviso; pasan las pruebas SQL de RLS |
| **P2** Venta en barra | `pos.sql` (cuentas, líneas, ventas, eventos); `#/pos` con venta rápida; marcar pagada con método de pago; pestaña «Ventas» en el panel | P1, D12 | Doble toque = 1 venta; un no camarero da error; un precio manipulado en el navegador se ignora |
| **P3** Cuentas de mesa | Mesas en el panel con QR; abrir y añadir a la cuenta desde el POS (socio o no socio); servir; anular línea; marcar pagada; devolución (admin) | P2 | Cancelaciones y devoluciones no suman ingresos; todo queda en `pos_events` |
| **P4** Pedido del socio desde la mesa | `#/mesa`, carrito, envío de ronda, aviso en tiempo real al POS, aceptar | P3 | Una ronda llega al POS en menos de 5 s; un socio no ve cuentas ajenas; un no socio no puede pedir |
| **P5** Promos y tickets en las ventas | Líneas de promo con tipo, ticket obligatorio en las de club, canje compartido, descuento calculado | P3 (P4 para la mesa) | El mismo ticket no se aplica dos veces; los límites se respetan |
| **P6** Panel | Cierre de jornada, informes por producto, camarero y socio, CSV | P2+ | Los totales cuadran con ventas menos devoluciones |
| **P7** Puesta en marcha | Pruebas en móvil, tablet y PC; una jornada piloto | Todo, P-7 | Una noche real sin descuadres |
| **L** Limpieza | Eliminar lo obsoleto (sección 1) | P1 publicada y estable | El build no usa nada de `src/data/` para carta ni promos |

**Primera tarea:** P1. Todo lo demás depende de que la base de datos conozca los productos, las promos y sus precios con un identificador estable.

**Forma de trabajar** (como en `TICKETS.md`):
- Al empezar cada fase, `git pull` y mezclar `main` en `pos`.
- Proponer el plan de archivos de la fase y esperar aprobación antes de escribir código.
- Pausa al final de cada fase para probar.
- Actualizar este documento y la sección «Estado actual» de `CONTEXT.MD`.

---

## 8. Plan de P1: carta y promos en Supabase

**Estado:** 🟢 Aprobado (2026-10-28). Revisado contra el código de `main` (`35d85f0`).

### Qué usa hoy la carta y las promos

- `src/data/site.ts`: 9 pestañas de carta, 67 productos y 4 separadores de sección en Copas (Ginebras, Rones, Whisky, Otros). El resto de `site.ts` (contacto, reseñas, experiencia…) **no se toca** (D13).
- `src/data/promos.ts`: 7 franjas y 15 promos (13 originales y 2 de El Clásico). Solo 3 promos indican qué productos de la carta llevan (`regularProducts`), que es lo que pinta la etiqueta «En promo» en la carta.
- `src/data/prices.generated.ts`: los precios que se aplican de verdad.
- Lo leen `MenuSection.tsx`, `PromotionsSection.tsx` y `ClubPage.tsx` (`findPromotion`).
- La tabla `promotions` ya existe (de `tickets.sql`) con interruptor, horario y límites. **Los horarios de la base de datos coinciden con los de `promos.ts`**, así que no hay conflicto al unificarlos.

### P1 se divide en dos partes, con pausa entre ellas

- **P1a — Base de datos, migración y web leyendo de Supabase.** Sin cambios visibles: la web debe verse exactamente igual.
- **P1b — Edición desde el panel.** Pestaña «Carta» y editor de promos ampliado.

### P1a — Archivos

**Nuevos:**

- **`supabase/catalogo.sql`** (lo ejecutas tú en el SQL Editor, como `tickets.sql`):
  - Tablas nuevas: `menu_categories`, `menu_sections` (los separadores de Copas), `products`, `promo_segments` (franjas), `promotion_segments` (promo ↔ franja) y `promotion_items` (qué productos lleva una promo).
  - **`promotions` se amplía** con: `publicada` (si se ve en la web), `tipo` (`pack`, `obsequio`, `sorteo`), `precio_centimos`, `descuento_pct` (la etiqueta «-29 %» actual), `descripcion`, `contenidos`, `personas`, `texto_horario`, `mensaje_reserva` (WhatsApp), `visible_hasta`, `exclusiva` y `orden`. No se toca nada de lo que ya tiene.
  - `products` y `promotions` guardan `updated_at` y `updated_by` (quién cambió un precio y cuándo).
  - RLS: cualquiera lee; solo los admins escriben.
  - Función **`catalogo()`**: devuelve toda la carta y las promos publicadas en **una sola petición**. La usan la web y la copia de respaldo, así las dos tienen siempre la misma forma.
  - **Migración de datos** con los productos, precios y promos de `src/data/` (los precios de `prices.generated.ts`; El Clásico con los de `promos.ts`). Se puede ejecutar varias veces: **nunca pisa lo que el bar haya cambiado** en el panel (interruptor, horarios, límites ni precios ya migrados).
  - Bloque comentado de pruebas manuales (un socio no puede cambiar precios, sin sesión se lee la carta, etc.).
- **`scripts/catalog-snapshot.mjs`**: genera la copia de respaldo `public/catalogo.json` llamando a `catalogo()` con la clave pública.
  - Si Supabase no responde, descarga la copia de la web publicada; si tampoco, deja la que haya. **Nunca hace fallar la publicación.**
- **`public/catalogo.json`**: la primera copia, generada después de ejecutar `catalogo.sql`.
- **`src/lib/catalog.ts`**:
  - Tipos de la carta y las promos (sustituyen a los de `site.ts` y `promos.ts` para estos datos).
  - Hook **`useCatalog()`**: pide `catalogo()` a Supabase; si falla, usa la copia más reciente entre la del navegador y `catalogo.json`, avisa y reintenta en segundo plano. Cuando carga bien, guarda la copia en el navegador.
  - Las funciones de `promos.ts` trasladadas: visibilidad, exclusivas, «Promos de hoy», formato de precios, `findPromotion`. **Los horarios se calculan en hora de Madrid**, no en la del móvil como ahora.

**Modificados:**

- `MenuSection.tsx`, `PromotionsSection.tsx` y `ClubPage.tsx`: leen de `useCatalog()` en lugar de `src/data/`. Mientras carga, el mismo esqueleto visual que la web; si se usa la copia, el aviso con el componente `Notice` que ya existe.
- `.github/workflows/deploy.yml`: un paso «Generar copia de la carta» antes del build. **Sin publicación automática diaria** (decidido): la copia de la web se renueva en cada publicación y la del navegador cada vez que la carta carga bien.
- `package.json`: script `catalog-snapshot`.
- `CONTEXT.MD` («Estado actual») y este documento.

**No se tocan en P1:** `src/data/` (se borra en la fase **L**), los scripts del Excel, los tickets y su SQL.

### P1b — Archivos

- **Nuevos:**
  - `src/components/admin/CartaSection.tsx`: pestaña **«Carta»** del panel (`#/admin?seccion=carta`). Categorías y separadores (crear, renombrar, ordenar, ocultar) y productos por categoría con precio en €, disponible hoy, sale en la carta, recomendado, orden (subir y bajar), editar y crear productos.
  - `src/lib/adminCatalog.ts`: lecturas y escrituras del panel.
- **Modificados:**
  - `src/components/admin/PromosSection.tsx`: gestión de franjas (crear, renombrar, ordenar, ocultar) y el editor actual se amplía con publicada, tipo, precio, descuento %, textos, contenidos, personas, franjas, «visible hasta», exclusiva y los productos que lleva. Se añade **«Nueva promo»**.
  - `AdminPage.tsx`: la pestaña nueva.
- **Categorías, separadores y franjas también se editan desde el panel** (decidido): crear, renombrar, ordenar y ocultar. Van en la pestaña «Carta» (categorías y separadores) y en «Promos» (franjas).

### Cómo se comprueba

- El SQL se prueba antes en PGlite, como `tickets.sql`, incluidas varias ejecuciones seguidas.
- `npm run typecheck`, `npm run lint` y `npm run build` sin errores.
- **P1a:** la web local con Supabase se ve igual que la publicada (carta, precios, «Promos de hoy», «En promo», botones de ticket); con Supabase desconectado se ve la copia con el aviso.
- **P1b:** cambiar un precio o apagar un producto en el panel se ve en la web al recargar; un socio normal no puede cambiar nada (`permission denied`).

### Orden de puesta en marcha

1. Rama `pos` desde `main` actualizado.
2. Tú ejecutas `catalogo.sql` en Supabase. No cambia nada visible: la web publicada sigue leyendo `src/data/`.
3. Se genera `public/catalogo.json` y se prueba P1a en local.
4. **No se publica en `main` antes del 2026-11-02** (inauguración y Halloween el sábado 31).
5. Las promos de Halloween se migran igualmente; con `visible_hasta` pasado, no se ven.

### Estado de P1a (2026-10-28): ✅ cerrada

- Rama `pos` creada desde `main` (`35d85f0`). Código en la rama; **nada publicado** (no antes del 2026-11-02).
- Hecho según el plan: `supabase/catalogo.sql`, `scripts/catalog-snapshot.mjs`, `public/catalogo.json`, `src/lib/catalog.ts`; `MenuSection`, `PromotionsSection` y `ClubPage` leen del catálogo; paso «Generar copia de la carta» en `deploy.yml`; script `catalog-snapshot` en `package.json`.
- **Decisiones al implementar** (aprobadas el 2026-10-28):
  - **Tipos:** todas las promos `pack`, salvo «Ronda gratis + sorteo» (`sorteo`) y «Chupito disfrazado» (`obsequio`, con su precio de 1 €).
  - **Sin sesión solo se lee lo publicado:** promos con `publicada`. Se aplica igual a productos (`activo`), categorías, separadores y franjas (`visible`), que se añaden para poder ocultarlos en P1b.
    - Se sustituye la política «Todos ven las promos» de `tickets.sql`.
    - `promos_estado()` solo devuelve promos sin publicar a los admins.
  - **Primera carga:** si el navegador tiene copia, se pinta al instante y sin aviso; el aviso solo sale si Supabase falla.
  - **«Promos de hoy»** se calcula con el horario de la base de datos (el mismo de `promo_activa()`), en hora de Madrid.
  - **Migración de datos una sola vez**, con la marca `p1a-carta-y-promos` en `catalogo_migraciones`. Volver a ejecutar el archivo recrea tablas, funciones y permisos, pero no toca datos (tampoco vuelve a crear lo que se haya borrado).
  - **La pestaña «Promos» de la carta** sigue en el código: es una vista, no una categoría.
- **Verificación:**
  - 26 pruebas de SQL en PGlite (lectura pública, permisos de socio y admin, segunda ejecución sin pisar cambios, tickets funcionando).
  - Comparación automática entre `src/data` y `catalogo()`: **todo idéntico** (pestañas, 67 productos con precios formateados, separadores, 15 promos, 7 franjas, «En promo», y visibilidad y «Promos de hoy» en 344 momentos de dos semanas).
  - typecheck, lint y build sin errores.
- **Cierre (2026-10-28):**
  - `catalogo.sql` ejecutado en Supabase.
  - `public/catalogo.json` regenerado desde Supabase: mismos datos que en PGlite; solo cambia que las fechas vienen en UTC.
  - El usuario probó en local: se ve igual que la web publicada y la copia de respaldo funciona.
  - Arreglo menor: al elegir la copia más reciente, `catalog.ts` compara fechas reales, no texto.

### Estado de P1b (2026-10-28): ✅ cerrada

- **Decisiones del usuario al aprobar P1b:**
  - **Los productos se identifican con un código numérico que se incrementa solo** (1, 2, 3…). El resto con las recomendaciones:
  - Agotado: etiqueta «Agotado» en la carta, que se quita a mano.
  - Sin botón de borrar: las cosas se ocultan.
  - Las promos nuevas nacen sin publicar y apagadas.
  - El texto del ticket (`descuento_texto`) se actualiza solo con los contenidos.
  - Categorías, franjas y promos nuevas siguen con identificador de texto, creado a partir del nombre.
- **`supabase/catalogo-codigos.sql`** (nuevo, una sola vez, con la marca `p1b-codigos-productos`):
  - Numera los 67 productos del 1 al 67 en el orden de la carta (1 = Solo, 67 = Zumo) y actualiza a la vez `promotion_items`.
  - El código pasa a ser `products.id` (`generated by default as identity`): los productos nuevos reciben el siguiente número.
  - Va después de `catalogo.sql`, que se puede seguir ejecutando sin problemas.
- **Panel:**
  - Pestaña **«Carta»** (`CartaSection.tsx`): categorías y separadores (crear, renombrar, ordenar, ocultar) y productos (precio en la propia fila, «En carta», «Disponible», recomendado, orden, editar, crear con código automático).
  - **«Promos»** ampliada: gestión de franjas, orden y estado «Publicada» en la lista, «Nueva promo», y editor con todo lo que se ve en la web (publicada, tipo, precio, descuento %, textos, contenidos, personas, horario mostrado, WhatsApp, franjas, visible hasta, exclusiva y productos que lleva), además del horario y los límites de los tickets.
  - Lecturas y escrituras en `src/lib/adminCatalog.ts`.
- **Web:** etiqueta «AGOTADO» y precio tachado en la carta cuando un producto no está disponible. `catalog.ts` admite códigos numéricos.
- **Verificación:**
  - PGlite: 6 pruebas de la conversión a códigos y 25 de las escrituras del panel (admin sí, socio no; lo publicado u oculto se refleja en `catalogo()`).
  - La comparación con `src/data` sigue idéntica con los códigos numéricos.
  - typecheck, lint y build sin errores.
- **Cierre (2026-10-28):**
  - `catalogo-codigos.sql` ejecutado en Supabase; productos del 1 al 67.
  - `public/catalogo.json` regenerado con los códigos.
  - El usuario probó el panel: todo correcto.
  - **Mejora pedida al cerrar:** con un menú o ventana abierta, el fondo ya no se desliza (`src/lib/useScrollLock.ts`). Se aplica al menú móvil, `Modal`, reservar, borrar cuenta, la pantalla de resultado de canjear y «¡Canjeado!».

### Respuestas al plan (2026-10-28)

1. P1 se divide en **P1a y P1b**, con pausa para probar entre ellas.
2. **No hay publicación automática diaria.** Solo la copia de respaldo (al publicar y en el navegador).
3. **Categorías, separadores, franjas y demás datos de la carta se editan desde el panel** (P1b).
4. El **descuento %** de las promos se migra tal cual y se edita a mano en el panel. No se calcula solo. (Es distinto del importe descontado que se guardará en cada venta en P5, que sí calcula el servidor.)

---

## Historial

- **2026-10-28** — Creado el documento con la auditoría, la propuesta y las decisiones D1–D10 abiertas.
- **2026-10-28** — Decididas D1–D10. Cambios principales:
  - La carta y las promos pasan a Supabase y se gestionan desde el panel; el Excel deja de usarse (sustituye a dos decisiones de `TICKETS.md`).
  - Los `.sql` del repo se confirman como la base de datos real.
  - El correo de confirmación ya funciona: deja de bloquear P4.
  - Solo socios piden desde la mesa; el camarero registra los pedidos de no socios.
  - Los pagos no se conectan: el camarero marca la cuenta como pagada.
  - Las promos son líneas con tipo (`pack`, `obsequio`, `sorteo`) y precio propio.
  - P1 se amplía a «carta y promos en Supabase» con edición en el panel; se añade la fase de limpieza **L**.
  - Nuevas decisiones pendientes: D11 (carta sin conexión), D12 (método de pago) y D13 (qué se migra).
- **2026-10-28** — Decididas D11–D13. **P0 cerrada.**
  - D11: la web lleva una copia de la carta y las promos (generada desde Supabase al desplegar, más la última guardada en el navegador) para cuando Supabase no responda.
  - D12: el camarero indica el método de pago (efectivo, tarjeta u otro) al marcar la cuenta como pagada.
  - D13: se migran productos, precios y promos; el resto de la web se queda en el código.
- **2026-10-28** — Propuesto el plan de P1 (sección 8), dividido en P1a (base de datos, migración y web leyendo de Supabase) y P1b (edición desde el panel).
- **2026-10-28** — Plan de P1 aprobado: sin publicación diaria; categorías, separadores y franjas editables desde el panel; descuento % manual. Empieza P1a.
- **2026-10-28** — P1a implementada en la rama `pos` y verificada en PGlite.
- **2026-10-28** — P1a cerrada: `catalogo.sql` ejecutado en Supabase, copia regenerada y prueba del usuario correcta.
- **2026-10-28** — P1b aprobada con un cambio: los productos usan un código numérico incremental (`catalogo-codigos.sql`). P1b implementada en `pos`.
- **2026-10-28** — P1b cerrada tras la prueba del usuario. Arreglo: el fondo no se desliza con menús o ventanas abiertos. **P1 completa.**
