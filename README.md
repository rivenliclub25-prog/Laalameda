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

La base de datos se crea ejecutando en el SQL Editor de Supabase, en este orden, `supabase/schema.sql` y `supabase/admin.sql`. Para hacer admin a alguien, cambia su `role` a `admin` en **Table Editor → profiles**.

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
