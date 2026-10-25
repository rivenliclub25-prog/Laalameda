# Contexto

Este proyecto es la web del bar **La Alameda** (Salamanca), una SPA en React generada con Bolt.new y desplegada en GitHub Pages en `https://rivenliclub25-prog.github.io/Laalameda/`.

Quiero añadir un **club de clientes** con autenticación mediante **Supabase**. El objetivo es guardar clientes registrados para que, más adelante, el bar pueda invitarlos por correo, WhatsApp u otros medios a ofertas, eventos y novedades. Es un sistema de fidelización.

No tengo experiencia previa con Supabase, así que necesito que me guíes paso a paso en la parte que tengo que hacer yo en el panel de Supabase.

# Antes de escribir código

1. Explora el proyecto y resúmeme:
   - El stack: Vite o CRA, TypeScript o JS, Tailwind u otro sistema de estilos.
   - Si ya usa router y cuál.
   - Cómo está configurado el `base` para GitHub Pages.
   - Cómo se despliega (GitHub Actions, rama `gh-pages`, etc.).
   - La paleta de colores, las tipografías y los componentes reutilizables (botones, tarjetas, inputs, header, footer).
   - Si ya existe alguna integración con Supabase (Bolt.new a veces la crea).
2. Propón un plan breve con los archivos que vas a crear y modificar, y espera a que lo apruebe.

# Qué hay que construir

## 1. Botón "Pertenecer al club"
- Un botón visible en la web actual, en el header o el menú y en un lugar destacado de la home, con el texto **"Pertenecer al club"**.
- Si el usuario ya tiene sesión, el botón debe cambiar a **"Mi perfil"**.

## 2. Página de acceso: login y registro
- Un texto de bienvenida que invite a unirse. Por ejemplo: *"Únete al club de La Alameda y recibe antes que nadie nuestras mejores ofertas, eventos y novedades."* Puedes mejorar el texto manteniendo el tono del bar.
- Pestañas o un conmutador entre **Iniciar sesión** y **Crear cuenta**.
- **Registro**: nombre, email y contraseña con confirmación.
  - Casilla obligatoria de aceptación de la política de privacidad, no premarcada.
  - Casilla opcional y separada para aceptar recibir comunicaciones comerciales.
- **Login**: email y contraseña, con enlace a "¿Has olvidado tu contraseña?".
- **Recuperación de contraseña**: la página que pide el email y la página para establecer la nueva contraseña al volver del enlace del correo.
- Un botón **"Continuar con Google"** ya maquetado, pero desactivado o marcado como "próximamente". La lógica de Google la haremos después. Deja el código preparado con `signInWithOAuth` para activarlo fácilmente.
- Mensajes de error y de éxito en español y comprensibles. Por ejemplo:
  - "Revisa tu correo para confirmar la cuenta."
  - "Email o contraseña incorrectos."
- Estados de carga en los botones.

## 3. Página de perfil (ruta protegida)
- Muestra y permite editar:
  - Nombre.
  - Teléfono (para futuras comunicaciones por WhatsApp).
  - Fecha de cumpleaños (opcional, para ofertas de cumpleaños).
- Preferencias de comunicación, con un consentimiento independiente para cada canal: email y WhatsApp.
- Botón **Cerrar sesión**.
- Botón **Borrar cuenta**, con un modal de confirmación.
  - Debe eliminar de verdad el usuario de `auth.users` y su perfil.
  - Como desde el frontend no se puede usar la `service_role`, implementa una función SQL `delete_user()` con `security definer` que borre únicamente al usuario `auth.uid()`, y llámala con `supabase.rpc`.
- Si no hay sesión, redirige a la página de acceso.

# Requisitos técnicos

- Usa `@supabase/supabase-js`.
- Crea un cliente único en `src/lib/supabase`.
- Crea un `AuthProvider` con `getSession` y `onAuthStateChange`.
- Crea un componente de ruta protegida.
- **GitHub Pages**: las rutas deben funcionar al recargar la página. Usa `HashRouter`, salvo que el proyecto ya resuelva esto de otra forma. Respeta el `base: '/Laalameda/'`.
- Las variables de entorno van en `.env`:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - Añade `.env` a `.gitignore` y crea un `.env.example`.
- La clave `service_role` / secret **nunca** debe aparecer en el código.
- Las URLs de redirección (confirmación de email y reset de contraseña) deben funcionar tanto en `localhost` como en producción.
- Adapta el workflow de despliegue para que lea las variables de entorno desde los **GitHub Secrets** del repositorio.
- No rompas nada de la web actual.

# Base de datos

Genera un archivo `supabase/schema.sql` que yo pegaré en el SQL Editor. Debe incluir:

- La tabla `public.profiles` con estos campos:
  - `id`, referenciando a `auth.users` con `on delete cascade`.
  - `nombre`, `telefono` y `fecha_nacimiento`.
  - `acepta_email` y `acepta_whatsapp`, ambos booleanos.
  - `acepta_privacidad_at`, como timestamp del consentimiento.
  - `created_at` y `updated_at`.
- **RLS activado**, con políticas para que cada usuario solo pueda leer y actualizar su propio perfil.
- Un trigger que cree el perfil automáticamente al registrarse, usando los datos de `raw_user_meta_data`.
- La función `delete_user()` descrita arriba.

Comenta el SQL para que lo entienda.

# Diseño

- Mantén **exactamente** la estética de la web actual: los mismos colores, las mismas tipografías, el mismo estilo de botones, sombras, bordes, espaciados y animaciones.
- Reutiliza los componentes y tokens existentes en lugar de crear estilos nuevos.
- Las páginas nuevas deben parecer parte natural de la web y llevar el header y el footer actuales.
- Deben ser responsive, con prioridad para móvil, porque la mayoría de clientes entrarán desde el móvil.
- Tienen que ser accesibles: labels en los inputs, foco visible y buen contraste.

# Guía de Supabase paso a paso

Cuando el código esté listo, dame una guía numerada y detallada de lo que tengo que hacer yo, diciendo qué pulsar en cada pantalla:

1. Crear el proyecto en Supabase, en una región de la UE.
2. Obtener la URL y la clave pública, y ponerlas en `.env` y en los GitHub Secrets.
3. Ejecutar `schema.sql` en el SQL Editor.
4. En *Authentication → URL Configuration*, configurar la Site URL y las Redirect URLs para producción y para `localhost`.
5. Activar el proveedor Email y decidir si se requiere confirmación de email.
6. Personalizar en español las plantillas de los correos de confirmación y de recuperación.
7. Avisarme del límite de envío de correos del SMTP por defecto y explicarme cómo configurar un SMTP propio (por ejemplo Resend o Brevo) cuando vayamos a producción.
8. Probar en local el flujo completo:
   - Registro.
   - Confirmación.
   - Login.
   - Edición del perfil.
   - Recuperación de contraseña.
   - Cierre de sesión.
   - Borrado de cuenta.
9. Desplegar y repetir la prueba en GitHub Pages.

Por último, añade un apartado aparte, para hacerlo más adelante, sobre cómo activar **Google**: crear las credenciales OAuth en Google Cloud Console, la URI de redirección de Supabase, cómo activar el proveedor y qué cambiar en el código para habilitar el botón.

# Forma de trabajar

- Ve por fases y haz una pausa al final de cada una para que pueda probar.
- Las fases son: estructura y auth, después páginas y estilos, después perfil y borrado, y por último el despliegue.
- Si algo del proyecto no encaja con estas instrucciones, pregúntame antes de decidir.

---

# Estado actual (actualizado 2026-10-23)

**Proyecto de Supabase en uso: `hinebaxynlpjisteuaus`.** Es el de `.env` y el de los GitHub Secrets, y el de la web publicada (comprobado el 2026-10-23). El otro proyecto (`eisuyvozingpasbqvrdx`) no se usa: tenerlo mezclado con el bueno dio `401 Invalid API key`.

Ramas:
- **`main`: la web publicada en GitHub Pages.** El 2026-10-25 se avanzó a `tickets` (T1–T4 y El Clásico), así que la web real ya tiene los tickets. El push lo hace el usuario, porque la terminal de Claude no tiene credenciales de GitHub.
- **`tickets`: rama de trabajo de los tickets (ver `TICKETS.md`).** Las ampliaciones de tickets se siguen haciendo aquí. Al empezar cada fase hay que mezclar `main` en `tickets`, porque el script de precios hace push a `main`.
- **Tras publicar:** las 13 promos originales están **apagadas** (los socios ven «Disponible próximamente») hasta que el bar las encienda en **Panel → Promos**. Las de El Clásico se encienden con `supabase/promos-clasico.sql`.
- `club-clientes` y `admin-dashboard`: ramas históricas, ya incluidas en `main`. No tienen push.
- `main` también recibe los commits automáticos del script de precios (`Actualizar precios.bat` → `scripts/publish-prices.ps1`), que exige estar en `main` y hace push él mismo. Antes de trabajar, ejecuta `git pull`.

## Club de clientes: hecho y probado
- **Fase 1 — estructura y auth** (commit `e325b3d`): cliente en `src/lib/supabase.ts`, `AuthProvider`, `ProtectedRoute`, router propio, `supabase/schema.sql`, `.env.example`.
- **Fase 2 — páginas y estilos** (commit `409cccb`): `#/club` (login/registro), `#/recuperar`, `#/nueva-contrasena`, `#/privacidad`, botón del header y sección "Hazte del club" en la home.
- **Fix** (commit `0473baa`): la URL de Supabase se normaliza al dominio (el `.env` tenía `/rest/v1/` y daba 404). En `npm run dev` los errores muestran el detalle técnico entre corchetes.
- **Fase 3 — perfil y borrado** (commit `a4c067c`): `#/perfil` con datos, consentimientos email/WhatsApp, cerrar sesión y borrar cuenta (`rpc('delete_user')`).
- Supabase: proyecto creado, `schema.sql` ejecutado, `.env` local configurado, Site URL y Redirect URLs de localhost puestas. Registro, confirmación y login probados OK.

## Rol de admin y panel de socios: hecho y probado (rama `admin-dashboard`)
- **Fase A — base de datos y rol** (commit `dd4d7bf`): `supabase/admin.sql`, **ya ejecutado** en Supabase. Incluye:
  - Columna `role` (`user`/`admin`) y trigger `protect_role`.
  - `handle_new_user` forzando `role = 'user'`.
  - `is_admin()` y la política "los admins leen todos los perfiles".
  - RPC `admin_list_users()`.
  - En el frontend: `AuthProvider` expone `isAdmin` y `roleLoading`, `AdminRoute` protege la ruta y se añade `#/admin` al router.
  - Pruebas OK: un admin ve la lista; una cuenta normal es redirigida y la RPC le da `42501`; cambiarse el rol desde la consola da `permission denied`.
- **Fase B — dashboard** (commit `6d470ae`): `#/admin` en solo lectura.
  - Contadores, buscador (sin tildes; el teléfono por cifras) y filtros (acepta email, acepta WhatsApp, cumpleaños este mes).
  - Orden por alta, tabla en escritorio y tarjetas en móvil.
  - Exportar CSV de lo filtrado, con el aviso de contactar solo por el canal aceptado.
  - Enlace "Panel" (solo admins) en el header, el menú móvil y Mi perfil.
- **Promos con el club** (commit `a978704`):
  - Sin sesión, "Activar con el club" lleva a `#/club?modo=login&promo=<id>` y, al iniciar sesión, vuelve a la tarjeta de esa promo.
  - Con sesión, abre WhatsApp con el nombre y el email del socio.
  - Los enlaces `#promo-<id>` abren la franja correcta y resaltan la tarjeta. Esto arregla también los de "Promos de hoy" y la carta.
- Cuenta del usuario: ya es admin. Hay una cuenta de prueba normal creada desde *Authentication → Add user*.

## Fase 4 — despliegue: hecho (2026-10-19)
- Se ha mezclado `main` (sincronización de precios desde Excel) en `admin-dashboard`, con conflictos en `promos.ts` y `PromotionsSection.tsx` resueltos conservando las dos partes (commit `790eec8`). Después se ha subido a `main`.
- `.github/workflows/deploy.yml` pasa al build los secretos `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como variables de entorno.
- El usuario ha creado en GitHub los dos secretos (**Settings → Secrets and variables → Actions**).
- En Supabase (**Authentication → URL Configuration**):
  - Site URL: `https://rivenliclub25-prog.github.io/Laalameda/`.
  - Redirect URLs: `https://rivenliclub25-prog.github.io/Laalameda/**` y `http://localhost:5173/**`.
- `README.md` documenta cómo configurar el club (`.env`, Secrets y orden de los SQL).
- **Pendiente de confirmar:** repetir en la web publicada el flujo completo (registro, confirmación, login, perfil, recuperación, cierre de sesión, borrado, panel y promos).

## Tickets del club (rama `tickets`, especificación en `TICKETS.md`)
- **T1 — base de datos: hecha. Falta ejecutar `supabase/tickets.sql` en Supabase.**
  - **Qué contiene:**
    - `app_settings` (`hora_cierre` 03:00, margen de 30 min).
    - `promotions`, con la semilla de las 13 promos de `promos.ts`: todas `solo_club = true`, `activa = false`, `max_usos = 1` y `ventana_usos = 'dia'`, sin precios.
    - `profiles.es_camarero`.
    - `tickets` (incluida en Realtime) y `ticket_events`.
    - RPC: `create_ticket`, `lookup_ticket`, `redeem_ticket`, `admin_void_ticket`, `admin_reopen_ticket`, `admin_ticket_stats`, `admin_set_camarero`, `promos_estado` y `promo_activa`.
    - `admin_list_users` ahora devuelve también `es_camarero`.
  - **Verificación:** el archivo se ha ejecutado dos veces en un PostgreSQL en memoria (PGlite) con una simulación de Supabase, y han pasado 34 pruebas: las de `TICKETS.md`, las del admin, la caducidad y las franjas que cruzan la medianoche. Falta confirmarlo en Supabase.
- `tickets.sql` **ya ejecutado** en Supabase, y las pruebas manuales pasan (confirmado por el usuario el 2026-10-23).
- **T2 — socio: hecha, pendiente de que el usuario la pruebe.**
  - `AuthProvider` expone `esCamarero`. Lo lee junto con `role` en la misma consulta (`select('*')`, para que no falle si falta alguna columna).
  - `src/lib/tickets.ts`: tipos, `createTicket`, `fetchMyTickets`, `subscribeMyTickets` (Realtime filtrado por `user_id`), el hook `usePromoStates` (una llamada a `promos_estado()`, refrescada cada 5 minutos y al volver a la pestaña), `ticketQrUrl` y `ticketDisplayState`.
  - `src/lib/ticketErrors.ts` traduce los códigos de error a español.
  - **Botón "Obtener ticket"** en las tarjetas de promo. Sustituye a "Activar con el club" y desaparece el WhatsApp de activación.
    - Sin sesión: lleva a iniciar sesión y luego vuelve a la tarjeta.
    - Con sesión: crea el ticket y lleva a `#/mis-tickets?t=<id>`.
    - Si la promo está apagada: «Disponible próximamente». Si está encendida pero fuera de horario: «No disponible ahora».
    - Si ya hay un ticket disponible de esa promo: lleva a ese ticket.
    - Si un id de `promos.ts` no está en `promotions`: el botón sale como no disponible, con un aviso en la consola en desarrollo.
  - **`#/mis-tickets`** (protegida):
    - Disponibles: QR grande, código, contenido, cuenta atrás, y «Promo desactivada» si el bar la apaga.
    - Historial con fechas.
    - Confirmación a pantalla completa y vibración cuando el camarero canjea (Realtime). Se recarga al volver a la pestaña.
  - **Probado por el usuario: el canje en tiempo real funciona.**
  - **Header** (corrección tras T2, porque con el enlace «Panel» se rompía en escritorio): con sesión, las opciones de la cuenta van en un único desplegable **«Mi cuenta ▾»** (Mi perfil, Mis tickets, Panel del club si es admin, Cerrar sesión). En el móvil van en la sección «Tu cuenta» del menú ☰.
    - Las dos salen de la misma lista, `useAccountLinks()` en `Navbar.tsx`. **Las opciones nuevas (p. ej. «Canjear» en T3) se añaden solo ahí.**
  - «Mis tickets» también está enlazado desde Mi perfil.
  - El QR apunta a `#/canjear?c=…`, que aún no existe (llega en T3).
- **T3 — camarero: hecha, pendiente de que el usuario la pruebe** (con un puerto HTTPS de GitHub, porque la cámara exige https).
  - **`#/canjear`** (`CanjearPage.tsx`), protegida por `CamareroRoute`:
    - Sin sesión: lleva a `#/club?modo=login&volver=canjear&c=…` y, al entrar, vuelve con el mismo código.
    - Con sesión pero sin ser camarero: va a Mi perfil con el aviso «Este código lo canjea el personal del bar…».
  - **Lector QR:** `qr-scanner@1.4.2` (MIT, última versión de 2022, estable). Se carga con `import()` solo al pulsar «Abrir cámara», en su propio archivo (unos 16 KB comprimidos con el worker). Usa la cámara trasera y se para mientras se muestra un resultado.
  - **Código a mano:** prefijo `ALA-` fijo y 4 caracteres. `parseScannedCode()` acepta la URL del QR, `ALA-XXXX`, `alaxxxx` o `xxxx`.
  - **Con `?c=` en la URL:** comprueba el ticket automáticamente y quita el parámetro de la URL.
  - **Resultado a pantalla completa:**
    - Verde `#2f6b3f` si es válido: promo, contenido, nombre de pila, hora de caducidad, importe opcional en € (se guarda en céntimos) y botones CANJEAR / Cancelar.
    - Rojo vino si no lo es: el motivo en una frase, más detalle como «Canjeado a las 21:14».
    - Tras canjear, «¡Canjeado!» y vuelve solo al escáner a los 3 s.
  - **Sonido y vibración** (`src/lib/feedback.ts`, con Web Audio, sin archivos). El interruptor 🔊/🔇 se recuerda en `localStorage`.
  - **Enlaces:** «Canjear tickets» en `useAccountLinks()` (menú Mi cuenta y menú móvil) y una franja «Eres del personal del bar» en Mi perfil.
  - **Probado por el usuario en el móvil** (puerto HTTPS de GitHub): lee el QR y canjea. Arreglos posteriores:
    - **La cámara no se veía** (aunque leía): el `<video>` se ocultaba con `visibility: hidden` y `qr-scanner` lo deja entonces a tamaño 0 para siempre (para evitar un fallo de Safari). Ahora el vídeo nunca se oculta y se tapa con un panel cuando la cámara está apagada. **No ocultar nunca ese `<video>` con `display` ni `visibility`.**
    - **El socio no veía el canje sin recargar:**
      - `subscribeMyTickets` se reconecta sola si el canal falla o se cierra.
      - Mis tickets comprueba además el estado cada 5 s, mientras haya un ticket por usar y la pantalla esté visible.
      - La celebración «¡Canjeado!» sale una sola vez, venga del tiempo real o de la comprobación.
      - En `npm run dev`, la consola muestra el estado de la conexión (`[club] Tiempo real (Mis tickets): …`).
  - **El usuario confirmó que la cámara y la sincronización ya funcionan** (2026-10-24).
- **T4 — admin: hecha, pendiente de que el usuario la pruebe.** No necesita SQL nuevo: usa las tablas y RPC de `tickets.sql`. Los permisos de admin se comprobaron con PGlite.
  - **`#/admin` con pestañas** (`?seccion=socios|promos|tickets|estadisticas`, se mantiene al recargar y se navega con las flechas del teclado). `AdminPage.tsx` es solo la página con las pestañas; cada pestaña está en `src/components/admin/`.
  - **Socios** (`SociosSection.tsx`, el panel anterior trasladado): interruptor **Camarero** por socio (`admin_set_camarero`, el cambio se ve al momento y se deshace si falla), filtro «Camareros» y columna en el CSV.
  - **Promos** (`PromosSection.tsx`):
    - Tarjeta **«Ajustes de la jornada»** (hora de cierre y margen, `app_settings`).
    - Lista de promos con el interruptor Activa/Apagada y la etiqueta «Disponible ahora» o «Fuera de horario».
    - **Editor** (días, franja con el aviso de «cruza la medianoche», periodo y límite de usos).
  - **Tickets** (`TicketsSection.tsx`):
    - Búsqueda por código o por nombre o email del socio. El nombre se cruza en el navegador con la lista de socios, porque `tickets.user_id` apunta a `auth.users` y no se puede unir directamente.
    - Filtro por estado. Sin búsqueda, los 50 más recientes.
    - **Detalle** con el registro de eventos y las acciones **Anular** y **Deshacer canje**, con motivo obligatorio.
  - **Estadísticas** (`StatsSection.tsx`):
    - Periodo: jornada de hoy, 7 días, 30 días o fechas a medida.
    - Contadores y % de canje, y tabla por promo con totales.
    - **Gráfico de canjes por hora** en orden de jornada (8:00 → 7:00), en barras HTML sin librería, con tooltip, etiqueta del pico y vista en tabla.
    - El color de las barras es `#A3283A`, un tono del vino de la marca validado con la guía de dataviz; el `#6E1423` no pasaba la banda de luminosidad.
  - **Componentes compartidos nuevos:** `Switch` (en `FormControls.tsx`) y `Modal.tsx`.
- **Decisiones de T4:**
  - **(a) El texto del horario de la tarjeta de la web sigue saliendo de `promos.ts`.** Editar días o franja en el panel cambia cuándo se puede pedir y canjear el ticket, pero no ese texto. El editor lo avisa. Se resolverá al migrar las promos a Supabase.
  - **Los ajustes de la jornada se editan desde el panel.**
  - **Las fechas y horas del panel usan la hora del navegador**, que se supone en Madrid.
  - **El total de euros descontados no está en las estadísticas**: haría falta un cambio de SQL. Pendiente si se quiere.
- **T4 probada por el usuario: todo funciona** (2026-10-25).
- **Promos de El Clásico** (25 de octubre de 2026, solo esa jornada):
  - Nueva franja **«⚽ El Clásico»**, la primera de la lista. Se abre por defecto mientras tenga promos visibles y, al acabar, vuelve sola a otra franja.
  - **Precios definitivos (cambio obligatorio del usuario antes de publicar): 4 cañones Estrella a 9 € y 4 tercios Estrella a 10 €, sin etiqueta de descuento.** Primero fueron 7 € y 8,50 € con −13 % y −15 %. Con la carta de la web (cañón 2 €, tercio 2,50 €) esos porcentajes ya no eran ciertos, así que se quitaron.
  - **1 ticket por socio y promo**, válido toda la jornada hasta el cierre (03:00 del lunes; el ticket caduca a las 03:30 con el margen).
  - **Precio fijo:** campo nuevo `fixedPrice: true` en `promos.ts`, para promos cuyo precio no viene del Excel. Sin esa marca, una promo sin precio en `prices.generated.ts` sigue dando error a propósito. El script de precios no las toca.
  - **Visibilidad:** campo nuevo `visibleUntil` (ISO) en `promos.ts`, para que la tarjeta se vea hasta las 03:00 y no solo hasta medianoche.
  - **Exclusivas:** campo nuevo `exclusive: true` en `promos.ts`. Mientras haya alguna promo exclusiva visible, **el resto se ocultan en toda la web**: «Promos de hoy», las pestañas de franjas, la pestaña Promos de la carta y las etiquetas «En promo». Lo calcula `isPromotionVisible()`. A las 03:00 todo vuelve a la normalidad solo.
  - **Horario en `promos.ts`:** domingo de 03:00 a lunes 03:00 (cruza la medianoche), para que «Promos de hoy» las siga mostrando después de las 00:00.
  - **Base de datos:** `supabase/promos-clasico.sql` crea las dos filas en `promotions`, ya encendidas, con `fin = 2026-10-26 03:00 Europe/Madrid`. Se puede ejecutar varias veces. Verificado con PGlite, incluido el cambio al horario de invierno de ese mismo día.
- **T5 (opcional):** pendiente.
- **Antes de publicar `tickets` en `main`:** en cuanto se publique, todos los botones de promo saldrán como «Disponible próximamente» hasta que el bar encienda las promos en `promotions`. Hay que encender las que correspondan antes o justo después de publicar.

### Decisiones de tickets (no cambiar sin hablarlo)
- **Packs** (Pack Partido, Previa, Picoteo para 4, Ronda de 4): **un ticket cubre el pack entero**, y lo pide el socio que hace el pedido. La regla "una promo por persona" se aplica al resto.
- **Promos de club:** las 13 empiezan **apagadas**. El bar enciende las que quiera con `activa`.
- **Límite inicial: 1 uso por socio y jornada.** Se cambia por promo (`max_usos`, `ventana_usos`) sin tocar la lógica.
  - La jornada respeta `hora_cierre`: la 01:30 del sábado cuenta como el viernes.
  - La semana va de lunes a domingo y el mes es el natural, todo en hora de Madrid.
  - Cuentan los tickets canjeados y el disponible.
- **`descuento_texto` sin precios** (solo el contenido). Los precios siguen en el Excel y en `promos.ts`; se migrarán a Supabase más adelante.
- **`protect_role` (ampliado en `tickets.sql`)** protege `role` y `es_camarero`.
  - Bloquea los cambios que llegan **directamente desde la API** (roles `anon`/`authenticated`).
  - Los permite desde el SQL Editor y el Table Editor, y desde las RPC `security definer` que comprueban por dentro que quien llama es admin (`admin_set_camarero`).
  - Antes se basaba en `auth.uid()`, pero eso habría bloqueado a `admin_set_camarero`.
- **Códigos de error estables** en el mensaje de la excepción: `PROMO_INACTIVA`, `PROMO_FUERA_DE_HORARIO`, `LIMITE_USOS`, `TICKET_YA_CANJEADO`, `TICKET_PROPIO`, `NO_ES_CAMARERO`… La lista completa está en la sección 8 de `tickets.sql`.
  - `lookup_ticket` no lanza error si el ticket no vale: devuelve `valido = false` y el `motivo`.
- **`redeem_ticket` comprueba el interruptor `activa`, no la franja horaria.** La franja ya está reflejada en `expires_at`, así el margen de cortesía sirve de verdad.
- **Caducidad:** lo primero que llegue entre el fin de la franja, el `fin` de la promo y el cierre de la jornada, más el margen.
  - Las promos sin franja (todo el día) caducan al cierre de la jornada.
  - Los tickets caducados se marcan al pedir uno nuevo. En la web hay que mostrar como caducado cualquier ticket con `expires_at` pasado.
- **Códigos `ALA-XXXX`:** 31 caracteres posibles (sin 0/O/1/I/L), generados con `gen_random_bytes` sin sesgo, y con reintento si hay colisión.
- **Lector QR (T3):** propuesta `qr-scanner` (Nimiq, licencia MIT). Para generar el QR, `qrcode.react`, que ya está instalado.

## Cómo asignar o quitar un admin
- La persona se registra antes en la web como cualquier cliente.
- **Table Editor → profiles →** celda `role` → `admin` → Save.
- O bien, en el SQL Editor, el `update` de ejemplo que hay al final de `supabase/admin.sql`, que trae también cómo quitar el rol y cómo listar los admins.
- Funciona desde el panel de Supabase porque ahí no hay sesión de usuario (`auth.uid()` es nulo). Desde la web es imposible.

## Decisiones tomadas (no cambiar sin hablarlo)
- **Router**: no se usa `HashRouter` porque rompería las anclas de la home (`#carta`, `#promos`…). Router propio en `src/lib/router.ts`: páginas con `#/ruta`, anclas sin barra. `#qr` se mantiene.
- **Flujo de auth implícito** (no PKCE): los enlaces del correo funcionan aunque se abran en otro navegador (habitual en móvil). `AuthProvider` lee el `type` del enlace (`signup` → perfil, `recovery` → nueva contraseña).
- Contraseña mínima de 8 caracteres en la UI.
- Política de privacidad con texto base: faltan titular, NIF y email (marcados "PENDIENTE").
- Google: botón maquetado como "Próximamente". Se activa poniendo `googleEnabled = true` en `src/lib/auth.ts`.
- **Rol de admin en `public.profiles.role`**, no en `app_metadata`: así no hace falta la `service_role`. `schema.sql` no se modifica; los cambios de base de datos nuevos van en archivos aparte, como `admin.sql`.
- **Doble protección del rol**:
  - El permiso de columnas de `schema.sql` no incluye `role`, así que el error que se ve en la web es `permission denied`.
  - Además está el trigger `protect_role` por si algún día se amplían esos permisos.
- **`isAdmin` en el frontend solo muestra u oculta cosas.** La seguridad real está en RLS y en la comprobación dentro de `admin_list_users()`.
- **Las políticas usan `is_admin()`** (`security definer`) para evitar la recursión de RLS.
- **Los admins solo leen.** No pueden editar ni borrar a otros usuarios todavía.
- **`window.supabase` existe solo en `npm run dev`**, para hacer pruebas desde la consola. Comprobado que no está en el build de producción.
- **CSV**: separado por `;` y en UTF-8 con BOM, para Excel en español. Se protege contra la inyección de fórmulas. Excel puede mostrar los teléfonos sin `+`, aunque el dato del CSV es correcto.
- **Los contadores del panel** se calculan sobre todos los socios (los admins incluidos), no sobre lo filtrado.
- **Al volver del login, no se abre WhatsApp automáticamente** (el navegador lo bloquearía). Se vuelve a la tarjeta de la promo para que la persona pulse otra vez.

## Pendiente
- **Probar en producción** el flujo completo en `https://rivenliclub25-prog.github.io/Laalameda/`, sobre todo los enlaces de los correos.
- **Mejoras opcionales del panel** (no pedidas todavía):
  - Que un admin pueda cambiar roles desde la web con una RPC `admin_set_role` (habría que adaptar `protect_role`).
  - Editar o borrar socios.
  - Paginación si hay muchos socios.
  - Teléfonos con `+` en Excel.
- **Mejoras opcionales de las promos**:
  - Que el enlace de confirmación del registro devuelva a la promo, no a Mi perfil.
  - Que el mensaje de WhatsApp use el nombre del perfil y no el del registro.
- Guía completa de Supabase paso a paso (puntos 1–9 de arriba) + apartado de Google.
- Probar la fase 3 entera si no se ha hecho (guardar perfil, cerrar sesión, borrar cuenta).
- **SMTP propio (Resend/Brevo), urgente ahora que la web está publicada.** El correo por defecto de Supabase solo envía a los miembros del equipo y tiene un límite de pocos correos por hora, así que los clientes reales no recibirán el correo de confirmación hasta configurarlo. Alternativa temporal: desactivar "Confirm email" en Supabase.
- Completar los datos de la política de privacidad.