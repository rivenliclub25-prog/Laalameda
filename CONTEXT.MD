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

# Estado actual (actualizado 2026-10-18)

Rama de trabajo: `club-clientes` (aún sin merge a `main`, sin push).

## Hecho y probado
- **Fase 1 — estructura y auth** (commit `e325b3d`): cliente en `src/lib/supabase.ts`, `AuthProvider`, `ProtectedRoute`, router propio, `supabase/schema.sql`, `.env.example`.
- **Fase 2 — páginas y estilos** (commit `409cccb`): `#/club` (login/registro), `#/recuperar`, `#/nueva-contrasena`, `#/privacidad`, botón del header y sección "Hazte del club" en la home.
- **Fix** (commit `0473baa`): la URL de Supabase se normaliza al dominio (el `.env` tenía `/rest/v1/` y daba 404). En `npm run dev` los errores muestran el detalle técnico entre corchetes.
- **Fase 3 — perfil y borrado** (commit `a4c067c`): `#/perfil` con datos, consentimientos email/WhatsApp, cerrar sesión y borrar cuenta (`rpc('delete_user')`).
- Supabase: proyecto creado, `schema.sql` ejecutado, `.env` local configurado, Site URL y Redirect URLs de localhost puestas. Registro, confirmación y login probados OK.

## Decisiones tomadas (no cambiar sin hablarlo)
- **Router**: no se usa `HashRouter` porque rompería las anclas de la home (`#carta`, `#promos`…). Router propio en `src/lib/router.ts`: páginas con `#/ruta`, anclas sin barra. `#qr` se mantiene.
- **Flujo de auth implícito** (no PKCE): los enlaces del correo funcionan aunque se abran en otro navegador (habitual en móvil). `AuthProvider` lee el `type` del enlace (`signup` → perfil, `recovery` → nueva contraseña).
- Contraseña mínima de 8 caracteres en la UI.
- Política de privacidad con texto base: faltan titular, NIF y email (marcados "PENDIENTE").
- Google: botón maquetado como "Próximamente". Se activa poniendo `googleEnabled = true` en `src/lib/auth.ts`.

## Pendiente
- **Fase 4 — despliegue** (aplazada por decisión del usuario): leer `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` desde los GitHub Secrets en `.github/workflows/deploy.yml`, añadir las URLs de producción en Supabase, merge a `main` y probar en GitHub Pages.
- Guía completa de Supabase paso a paso (puntos 1–9 de arriba) + apartado de Google.
- Probar la fase 3 entera si no se ha hecho (guardar perfil, cerrar sesión, borrar cuenta).
- SMTP propio (Resend/Brevo) antes de abrir el club al público.
- Completar los datos de la política de privacidad.