# La Alameda

Web de La Alameda, construida con React, TypeScript y Vite.

## Publicación en GitHub Pages

El proyecto ya está en el repositorio `rivenliclub25-prog/Laalameda`. El despliegue está configurado en `.github/workflows/deploy.yml`, pero GitHub Pages debe habilitarse una vez en la configuración del repositorio:

1. Abre **Settings → Pages** en el repositorio.
2. En **Build and deployment → Source**, selecciona **GitHub Actions**.
3. En **Actions**, vuelve a ejecutar el flujo fallido **Deploy to GitHub Pages**, o sube un nuevo cambio a `main`.
4. Cuando termine correctamente, la web estará en `https://rivenliclub25-prog.github.io/Laalameda/`.

La compilación ajusta la ruta base del repositorio para que también funcionen las imágenes y los enlaces de la página de QR. GitHub Pages ofrece alojamiento estático. Los datos del club de clientes se guardan en Supabase.

## Club de clientes (Supabase)

El club (registro, perfil y panel de administración en `#/admin`) usa Supabase. Necesita dos variables con la URL del proyecto y la clave pública *anon*:

- **En local**: copia `.env.example` como `.env` y rellénalo con el Supabase de **PRUEBAS**. El archivo `.env` no se sube a git. Si pones la URL de producción, la web no arranca (es a propósito, `ENTORNOS.md`).
- **En GitHub Pages**: en **Settings → Secrets and variables → Actions** están los secretos `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` de PRODUCCIÓN. El workflow los usa al compilar con `VITE_APP_ENV=produccion`.

Si faltan, la web funciona igual y el club aparece como "disponible muy pronto". La clave `service_role` no debe ponerse nunca ni en el código ni en los secretos.

**La estructura de la base de datos está en `supabase/migrations/`** y se aplica con la CLI de Supabase desde GitHub (`ENTORNOS.md`, fase E1). **Nunca se pega SQL a mano en producción.** Los `.sql` que se usaban antes están en `supabase/legacy/` solo como historia (con el orden en que se aplicaron). Para hacer admin a alguien, cambia su `role` a `admin` en **Table Editor → profiles**. Las promos se encienden y los camareros se marcan desde el **Panel del club** (`#/admin`).

### Inicio de sesión con Google

Ya está configurado (2026-10-28). Si hubiera que rehacerlo:

1. **Google Cloud Console** (proyecto «La Alameda»):
   - Pantalla de consentimiento: app externa «La Alameda», **publicada** («En producción»), sin logo (con logo Google pide verificación).
   - Dominios autorizados: `supabase.co` y `rivenliclub25-prog.github.io`. Permisos: `email`, `profile` y `openid`.
   - Cliente OAuth de tipo **Aplicación web**. Orígenes: `https://rivenliclub25-prog.github.io` y `http://localhost:5173`. URI de redirección: `https://<proyecto>.supabase.co/auth/v1/callback`.
2. **Supabase → Authentication → Providers → Google**: activarlo y pegar el Client ID y el Client Secret. **El secreto solo va ahí**: nunca en el código, `.env` ni GitHub.
3. **Supabase → Authentication → URL Configuration**: las Redirect URLs de la web y de `localhost` (las mismas que para los correos).
4. Ejecutar `supabase/google-auth.sql`.

Quien entra con Google por primera vez ve «Un último paso» (aceptar la privacidad y elegir si quiere emails). Si el email ya tenía cuenta con contraseña, Supabase la une y entra en la misma. El botón se apaga con `googleEnabled = false` en `src/lib/auth.ts`.

## Entornos y copias de seguridad

- **`ENTORNOS.md`** (empieza por su «Guía rápida para el equipo»): separación de PRUEBAS y PRODUCCIÓN. Desde la fase E2, el `.env` local apunta siempre a PRUEBAS (`hrhhkzajweggpnupytms`): lo que hagas en local no toca los datos reales. Arriba sale la franja «LOCAL · base de datos de PRUEBAS».
- **`COPIAS.md`**: copias de seguridad nocturnas de producción, cómo comprobarlas y cómo restaurarlas (solo en PRUEBAS).

## Empezar a trabajar desde otro ordenador

Guía para un colaborador nuevo. Antes de nada, lee `CONTEXT.MD` (estado del proyecto y forma de trabajar) y, según la tarea, `POS.md` o `TICKETS.md`.

### 1. Lo que necesitas

- **Git** y **Node.js 20 o superior** (versión LTS).
- **Acceso al repositorio**: el dueño te invita en GitHub (**Settings → Collaborators**) y aceptas la invitación que llega por correo.
- **La clave anon del Supabase de PRUEBAS** (`VITE_SUPABASE_ANON_KEY`): pídesela al dueño **por privado**. La URL ya viene en `.env.example`. Nunca se usan en local las claves de producción, ni la clave `service_role` / secret.

### 2. Descargar y arrancar el proyecto

```sh
git clone https://github.com/rivenliclub25-prog/Laalameda.git
cd Laalameda
npm ci
```

Crea el archivo `.env` a partir del ejemplo (en Windows con PowerShell: `Copy-Item .env.example .env`; en Mac o Linux: `cp .env.example .env`) y pega la clave anon de PRUEBAS. **El archivo `.env` no se sube nunca a git** (está en `.gitignore`).

```sh
npm run dev
```

Abre `http://localhost:5173`. Para probar el club o el TPV, regístrate con tu email y pide al dueño que te dé el rol de **admin** o el permiso de **camarero** (Panel → Socios).

### 3. Forma de trabajar

1. **Cada vez que empieces**, trae lo último:

   ```sh
   git switch main
   git pull
   ```

2. **Cada tarea en su propia rama**, creada desde `main`:

   ```sh
   git switch -c nombre-de-la-tarea
   ```

3. **Antes de subir**, comprueba que todo compila:

   ```sh
   npm run typecheck
   npm run lint
   npm run build
   ```

4. **Guarda y sube tu rama**:

   ```sh
   git add -A
   git commit -m "Qué has cambiado"
   git push -u origin nombre-de-la-tarea
   ```

5. **Publicar = mezclar en `main`**. Cada push a `main` publica la web real automáticamente, así que se hace solo cuando la tarea está probada y **avisando al dueño**.

**Importante:**

- **La base de datos es la real** (no hay una de pruebas): lo que hagas en local (ventas en el TPV, socios, tickets) queda en la de verdad. Prueba con cuidado y borra lo que crees.
- **Cambios en la base de datos**: siempre en un archivo `.sql` **nuevo** dentro de `supabase/` (los ya ejecutados no se modifican), y avisando al dueño, que es quien lo ejecuta en Supabase.
- **La carta y los precios se editan en el Panel → Carta y Panel → Promos.** El antiguo Excel de precios y su script se retiraron (`ENTORNOS.md`, E0).
- Si los dos tocáis la misma rama, haced `git pull` antes de empezar y antes de subir.

## Desarrollar localmente

```sh
npm ci
npm run dev
```

Validar y compilar:

```sh
npm run typecheck
npm run lint
npm run build
```

## Códigos QR

Después de publicar, abre `https://rivenliclub25-prog.github.io/Laalameda/#qr`. Selecciona el destino y descarga el código SVG o imprímelo. Así los QR apuntan a la web pública y no a una vista previa local.
