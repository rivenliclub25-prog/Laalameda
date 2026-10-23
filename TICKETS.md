# Tickets del club: especificación

Este documento es la especificación de la **fase de tickets** de la web de La Alameda. Complementa a `CONTEXT.MD`: léelo antes, porque aquí se da por sabido todo lo que ya existe, que es el club, `profiles.role`, `is_admin()`, `admin.sql`, el router propio y `promos.ts`.

## Objetivo

Un socio obtiene un ticket para una promo de club. Lo enseña en el bar y un camarero lo canjea desde la web. Cada ticket se canjea **una sola vez**, y toda la validación se hace **en la base de datos**, nunca solo en la interfaz.

Fuera de esta fase quedan:

- La gestión completa de promos, productos y precios desde el panel.
- El inventario y las ventas.
- El TPV.

Aun así, el diseño deja preparados los huecos para esas fases.

## Decisiones tomadas (no cambiar sin hablarlo)

- **Las promos siguen pintándose desde `promos.ts`.** La base de datos tiene una tabla mínima `promotions` con el **mismo `id`** que usa `promos.ts`. El servidor solo valida contra esa tabla. Más adelante esta tabla crecerá hasta ser la fuente única.
- **Ser camarero es un permiso aparte del rol.** `role` sigue siendo `user` o `admin`, y se añade la columna `profiles.es_camarero boolean`. Así un camarero también es socio y puede tener sus propios tickets, y un admin puede ser camarero si se activa ese permiso.
- **Solo quien tiene `es_camarero = true` puede canjear.** El admin no canjea por ser admin.
- **Nadie puede canjear un ticket propio.**
- **Las promos son por persona:** un ticket cubre a un solo socio. Si dos socios comparten cuenta, cada uno enseña su ticket y se aplican dos descuentos. Un acompañante que no es socio no tiene descuento.
- **Un ticket disponible por socio y promo.** Para obtener otro, el anterior tiene que estar canjeado, caducado o anulado.
- **Caducidad:** el ticket caduca en el momento que llegue antes de estos dos:
  - Cuando termina la ventana activa de la promo.
  - Al cierre de la jornada del bar.

  A esa hora se suma un margen de cortesía. La hora de cierre y el margen se configuran en `app_settings`.
- **Desactivar una promo manualmente** (`activa = false`) invalida sus tickets disponibles. No se pueden canjear, y en «Mis tickets» aparecen como «Promo desactivada».
- **El ticket guarda una copia de las condiciones** (nombre y texto del descuento) en el momento de crearse. Si la promo cambia después, el historial no se altera.
- **Hueco para el futuro TPV:** columnas `sale_id` e `importe_descuento_centimos` en `tickets`, vacías por ahora.
- **Dinero en céntimos (enteros) y horas en `Europe/Madrid`.**
- **Borrar la cuenta no borra el historial de canjes.** Los tickets quedan anonimizados (`user_id = null`), y así se conservan las estadísticas sin datos personales.
- **Archivos SQL:** todo va en `supabase/tickets.sql`. No se tocan `schema.sql` ni `admin.sql`, salvo con `create or replace` desde `tickets.sql` cuando sea imprescindible (por ejemplo, `protect_role`).

## Base de datos (`supabase/tickets.sql`)

Comenta el SQL igual que en `schema.sql` y `admin.sql`. Al final, añade ejemplos para estas tareas:

- Dar y quitar el permiso de camarero.
- Activar y desactivar una promo.
- Listar los tickets de hoy.

### `app_settings`

Es una tabla clave/valor de una sola fila o, si resulta más sencillo, con columnas fijas. Guarda dos ajustes:

- `hora_cierre` (time, por defecto `03:00`). Indica cuándo termina la jornada. Si es de madrugada, la jornada pertenece al día anterior.
- `margen_cortesia_min` (int, por defecto `30`).

Permisos:

- Solo los admins pueden escribir.
- Las funciones la leen con `security definer`.

### `promotions` (tabla mínima)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | El mismo id que en `promos.ts`. |
| `nombre` | text | Para el panel y la copia que se guarda en el ticket. |
| `descuento_texto` | text | Por ejemplo, «2x1 en cañas». |
| `solo_club` | bool | `true` si requiere ticket. |
| `activa` | bool | Interruptor manual. Por defecto `false`. |
| `inicio`, `fin` | timestamptz, nulos | Periodo o evento concreto. Si es nulo, no hay límite. |
| `dias_semana` | int[], nulo | ISO (1 = lunes). Si es nulo, vale todos los días. |
| `hora_inicio`, `hora_fin` | time, nulos | Franja horaria. Debe admitir franjas que cruzan la medianoche, como 22:00–02:00. |
| `max_usos` | int, nulo | Usos por socio. Si es nulo, no hay límite. |
| `ventana_usos` | text | Puede ser `total`, `dia`, `semana` o `mes`. |
| `created_at`, `updated_at` | timestamptz | |

- **Función `promo_activa(p_id text, p_at timestamptz default now())`:** devuelve un boolean. Comprueba `activa`, `inicio`/`fin`, `dias_semana` y la franja horaria, todo en `Europe/Madrid`.
- **RLS:** cualquiera, incluso sin sesión, puede leer las promos. Solo los admins pueden modificarlas.
- **Semilla:** genera los `insert` a partir de los ids de `promos.ts` que hoy usan «Activar con el club». Crea todas las promos con `activa = false`, para que el bar las encienda.

### `profiles.es_camarero`

- Es una columna nueva, `boolean not null default false`.
- No se añade a los permisos de columna del usuario. Hay que ampliar `protect_role` (con `create or replace`) para que también la proteja.
- **RPC `admin_set_camarero(p_user uuid, p_valor bool)`:** solo la pueden usar los admins.

### `tickets`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `codigo` | text unique | Formato `ALA-XXXX`, sin caracteres confusos (0/O, 1/I/L). Se genera en la base de datos con aleatoriedad criptográfica y se reintenta si hay colisión. |
| `user_id` | uuid, nulo | Referencia a `auth.users`, `on delete set null`. |
| `promo_id` | text | Referencia a `promotions`. |
| `promo_nombre`, `promo_descuento` | text | Copia de las condiciones al crear el ticket. |
| `estado` | text | Puede ser `disponible`, `canjeado`, `caducado` o `anulado`. |
| `created_at`, `expires_at` | timestamptz | |
| `canjeado_at`, `canjeado_por` | | `canjeado_por` es el camarero. |
| `anulado_at`, `anulado_por`, `motivo_anulacion` | | |
| `importe_descuento_centimos` | int, nulo | Opcional al canjear. |
| `sale_id` | uuid, nulo | Para el futuro TPV. Sin FK todavía. |

Índices:

- Índice único parcial sobre `(user_id, promo_id)` con `where estado = 'disponible'`, para impedir dos tickets disponibles de la misma promo.
- Índice sobre `codigo`.

Seguridad:

- **RLS:** el socio solo lee sus propios tickets. Nadie inserta, actualiza ni borra directamente; todo pasa por RPC.
- **Realtime:** añade `tickets` a la publicación `supabase_realtime`, para que «Mis tickets» vea el canje al instante.

### `ticket_events` (registro)

- **Campos:** `id`, `ticket_id`, `tipo` (`creado`, `canjeado`, `caducado`, `anulado`, `reabierto`), `actor` (uuid), `at`, `detalle` (jsonb).
- Solo la leen los admins y solo escriben en ella las RPC.

### RPC (todas `security definer`, con `search_path` fijo)

1. **`create_ticket(p_promo_id)`:**
   - Exige sesión.
   - Antes de nada, marca como `caducado` los tickets del socio que ya han expirado.
   - Comprueba que la promo existe, es `solo_club` y está activa (`promo_activa`).
   - Comprueba que no supera `max_usos` en su `ventana_usos`.
   - Comprueba que no tiene ya un ticket disponible de esa promo.
   - Calcula `expires_at` según la regla de caducidad.
   - Copia las condiciones, registra el evento y devuelve el ticket.
2. **`lookup_ticket(p_codigo)`:**
   - Solo camareros.
   - Devuelve el estado, la promo, el nombre de pila del socio, la caducidad y el motivo si no es válido.
   - No modifica nada.
3. **`redeem_ticket(p_codigo, p_importe_centimos default null)`:**
   - Solo camareros.
   - Hace un único `update … where estado = 'disponible' and expires_at > now() and user_id <> auth.uid() and promo activa … returning`. Así es atómico: si dos camareros lo intentan a la vez, solo uno lo consigue.
   - Si no actualiza ninguna fila, devuelve el motivo concreto: ya canjeado, caducado, anulado, promo desactivada, es tuyo o no existe.
4. **`admin_void_ticket(p_id, p_motivo)`:** solo admins. Anula un ticket disponible.
5. **`admin_reopen_ticket(p_id, p_motivo)`:**
   - Solo admins.
   - Deshace un canje hecho por error: vuelve a `disponible` si aún no ha caducado.
   - Queda registrado en `ticket_events`.
6. **`admin_ticket_stats(p_desde, p_hasta)`:** para cada promo, tickets generados, canjeados, caducados y anulados, y canjes por hora.

Los errores deben devolver códigos estables (por ejemplo `TICKET_YA_CANJEADO`, `PROMO_INACTIVA` o `LIMITE_USOS`). Así el frontend puede traducirlos a mensajes en español.

### Pruebas SQL

Incluye un bloque comentado con pruebas manuales, como en la fase A de admin. Estos casos deben dar error:

- Canjear dos veces.
- Canjear sin ser camarero.
- Canjear un ticket propio.
- Crear un ticket de una promo inactiva.
- Superar el límite de usos.
- Cambiarse `es_camarero` desde la consola.

## Frontend

### Socio

- Las promos de club cambian «Activar con el club» por **«Obtener ticket»**:
  - **Sin sesión:** el flujo actual `#/club?modo=login&promo=<id>`.
  - **Con sesión:** llama a `create_ticket` y lleva al ticket.
  - **Si la promo no está activa:** el botón aparece desactivado con el texto «Disponible próximamente» o «No disponible ahora».
- El estado de cada promo se obtiene consultando `promotions` con una sola petición. Si un id de `promos.ts` no está en `promotions`, el botón aparece como no disponible y en `npm run dev` se muestra un aviso en la consola.
- **`#/mis-tickets`** (ruta protegida, enlazada desde el header y desde Mi perfil):
  - **Disponibles:** QR grande, código `ALA-XXXX` legible y cuenta atrás hasta la caducidad.
  - **Historial:** canjeados, caducados y anulados, con su fecha.
  - Se suscribe a Realtime: cuando el camarero canjea, el ticket pasa a «Canjeado» con una confirmación visual.
- El QR codifica la URL `https://rivenliclub25-prog.github.io/Laalameda/#/canjear?c=ALA-XXXX`, construida con la base actual para que funcione también en localhost. Así el camarero puede leerlo incluso con la cámara nativa del móvil.

### Camarero

- **`#/canjear`** (ruta protegida por `es_camarero`, con un componente análogo a `AdminRoute`):
  - Lector QR con la cámara (usa una librería ligera, como `html5-qrcode` o similar; propón cuál) y un campo para teclear el código.
  - Si llega `?c=` en la URL, se hace el `lookup` automáticamente.
  - El resultado se muestra a pantalla completa: **verde** si es válido (promo, nombre de pila y botón «Canjear») y **rojo** si no lo es (el motivo en una frase). Va acompañado de un sonido corto y de vibración, si el dispositivo la permite.
  - Campo opcional para el importe descontado.
  - Botones grandes, pensados para el móvil y para usarlos deprisa.
- Enlace «Canjear» en el header y en el menú móvil, solo para camareros.

### Admin (`#/admin`, sección nueva «Tickets y promos»)

- **Promos:** lista de `promotions` con interruptor de activa/inactiva y edición de fechas, días, franja y límites.
- **Camareros:** marcar o desmarcar `es_camarero` en la lista de socios (`admin_set_camarero`).
- **Tickets:** buscar por código o socio, anular y reabrir con motivo, y ver el registro de eventos.
- **Estadísticas:** las de `admin_ticket_stats`.

`isAdmin` y `esCamarero` en el frontend solo muestran u ocultan elementos. La seguridad real está en RLS y en las RPC.

## Fases

Haz una pausa al final de cada fase para que pueda probar, y actualiza la sección «Estado actual» de `CONTEXT.MD`.

- **T1 — Base de datos:** `supabase/tickets.sql` completo, semilla de promos y pruebas SQL. Yo lo ejecuto en Supabase. No hay cambios visibles en la web.
- **T2 — Socio:** `AuthProvider` expone `esCamarero`, botón «Obtener ticket», `#/mis-tickets` con QR y Realtime, y mensajes de error en español.
- **T3 — Camarero:** `#/canjear` con lector QR, código manual, `CamareroRoute` y enlace en el header.
- **T4 — Admin:** sección de promos, camareros, tickets y estadísticas.
- **T5 (opcional, después):** tickets automáticos de bienvenida al registrarse y de cumpleaños.

## Diseño

Las mismas reglas que en el club: la estética exacta de la web actual, reutilizar componentes y tokens, prioridad para el móvil, accesibilidad y textos en español con el tono del bar.

## Forma de trabajar

- Trabaja en la rama `tickets`, creada a partir de `main` actualizado (`git pull`). Todo lo relacionado con tickets, incluidas las ampliaciones futuras, se hace en esa rama.
- El script de precios sigue haciendo push a `main`. Para evitar conflictos grandes en `promos.ts` como los de la fase 4, mezcla `main` en `tickets` al empezar cada fase.
- Antes de escribir código, propón el plan de archivos de la fase y espera a que lo apruebe.
- Si algo del proyecto no encaja con esta especificación, pregunta antes de decidir.
