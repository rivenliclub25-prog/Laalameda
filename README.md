# La Alameda

Web de La Alameda, construida con React, TypeScript y Vite.

## Publicar gratis con GitHub Pages

El despliegue está configurado en `.github/workflows/deploy.yml`. Cada cambio que se suba a la rama `main` se compilará y publicará automáticamente.

1. Crea un repositorio en GitHub para este proyecto.
2. Añade los archivos de esta carpeta al repositorio y súbelos a la rama `main`. No subas `node_modules`.
3. En el repositorio, abre **Settings → Pages** y selecciona **GitHub Actions** como fuente de publicación.
4. Abre **Actions** y espera a que termine correctamente el flujo **Deploy to GitHub Pages**. La URL pública aparece en el despliegue o en **Settings → Pages**.

La compilación ajusta la ruta base del repositorio para que también funcionen las imágenes y los enlaces de la página de QR.

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

Después de publicar, abre `https://TU-USUARIO.github.io/TU-REPOSITORIO/#qr`. Selecciona el destino y descarga el código SVG o imprímelo. Así los QR apuntan a la web pública y no a una vista previa local.
