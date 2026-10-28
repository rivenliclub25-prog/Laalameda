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

- **En local**: copia `.env.example` como `.env` y rellénalo. El archivo `.env` no se sube a git.
- **En GitHub Pages**: en **Settings → Secrets and variables → Actions** crea los secretos `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. El workflow los usa al compilar.

Si faltan, la web funciona igual y el club aparece como "disponible muy pronto". La clave `service_role` no debe ponerse nunca ni en el código ni en los secretos.

La base de datos se crea ejecutando en el SQL Editor de Supabase, en este orden, `supabase/schema.sql`, `supabase/admin.sql`, `supabase/tickets.sql` y `supabase/google-auth.sql`. Los archivos de promos especiales (como `supabase/promos-clasico.sql`) se ejecutan después, cuando toca. Para hacer admin a alguien, cambia su `role` a `admin` en **Table Editor → profiles**. Las promos se encienden y los camareros se marcan desde el **Panel del club** (`#/admin`).

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
