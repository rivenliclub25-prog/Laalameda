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

# Estado actual (actualizado 2026-10-19)

Ramas:
- **`main`: desplegada en GitHub Pages con todo el club y el panel de admin (fase 4).** A partir de ahora se trabaja desde `main`, o desde ramas nuevas creadas a partir de ella.
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