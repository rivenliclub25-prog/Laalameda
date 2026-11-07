# Guía de edición de La Alameda

Este proyecto es código fuente editable. Puedes abrirlo en cualquier editor de código y cambiar los textos, precios, enlaces y estilos directamente.

## Dónde cambiar cada cosa

### Datos principales del bar

Archivo: `src/data/site.ts`

Aquí puedes cambiar:

- Nombre del bar
- Ciudad
- Dirección
- Teléfono
- WhatsApp
- Horario
- Enlace de Google Maps
- Instagram
- Categorías y productos de la carta
- Precios
- Reseñas
- Imágenes de las tarjetas de experiencia

### Portada

Archivo: `src/components/Hero.tsx`

Aquí se cambia:

- Texto principal de la portada
- Frase descriptiva
- Etiquetas como “Producto de cercanía”
- Botones de la portada

### Menú superior

Archivo: `src/data/site.ts`

Busca `navLinks` para cambiar los nombres y destinos del menú.

### Historia

Archivo: `src/components/Evolution.tsx`

Aquí se cambia el texto sobre la historia de La Alameda.

### Tarjetas de experiencia

Archivo: `src/data/site.ts`

Busca `experiencePillars` para cambiar los títulos, descripciones e imágenes de:

- Ambiente
- Gastronomía
- Terraza
- Tardeo y copas

### Carta, precios y promociones

Se editan en la web, en el **Panel del club** (`#/admin`), sin tocar el código:

- **Panel → Carta**: productos, precios, descripciones, categorías y «agotado».
- **Panel → Promos**: promociones, precios, horarios, contenidos y si están encendidas.

Los cambios se ven en la web al momento. El Excel de precios y `Actualizar precios.bat` **ya no se usan** (se retiraron el 2026-11-07, ver `ENTORNOS.md`).

### Terraza y eventos

Archivo: `src/components/Terraza.tsx`

Aquí se cambia el título, la descripción, la imagen y el texto del botón de la terraza.

### Galería y fundador

Archivo: `src/components/Gallery.tsx`

Aquí se cambia el texto de presentación del fundador y de la sección Galería.

### Reseñas

Archivo: `src/data/site.ts`

Busca `reviews` para cambiar los nombres, fechas y comentarios.

El botón “Reseñas en Google” usa este enlace de la ficha del local:

```text
https://maps.app.goo.gl/wENtQKSLx1kEcGnX7
```

Los clientes deben pulsar “Escribir una reseña” dentro de Google Maps.

### Ubicación y contacto

Archivo: `src/components/Location.tsx`

La dirección, teléfono, horario y enlaces se leen desde `src/data/site.ts`.

El botón “Cómo llegar” abre directamente Google Maps. No se usa un mapa incrustado porque Google puede rechazar la conexión dentro de la página.

### Reserva por WhatsApp

Archivo: `src/components/ReserveModal.tsx`

El número de WhatsApp se lee desde `src/data/site.ts`. El formulario genera automáticamente un mensaje con nombre, fecha y número de personas.

### Códigos QR

Archivo: `src/components/QRPage.tsx`

La página de QR se abre añadiendo `/#qr` al enlace público. Permite generar y descargar:

- QR de la página principal
- QR de la carta
- QR de reservas
- QR de reseñas
- QR de Instagram
- QR de Google Maps

Genera los QR después de publicar para que usen el enlace público definitivo.

### Colores, tipografías y botones

Archivo: `src/index.css`

Aquí se cambian los estilos generales, botones, animaciones y tarjeta de ubicación.

Archivo: `tailwind.config.js`

Aquí se encuentran los colores principales, tipografías, tamaños y animaciones del diseño.

### Título y descripción de Google

Archivo: `index.html`

Aquí puedes cambiar el título que aparece en la pestaña del navegador y la descripción para buscadores.

## Cómo editar sin romper la página

1. Cambia solo el texto entre comillas o los precios que necesites.
2. Mantén las comillas y las comas tal como están.
3. No borres las etiquetas `<` y `>` de los archivos `.tsx`.
4. Después de guardar, pulsa **Publish** para publicar los cambios.
5. Si el navegador muestra la versión anterior, recarga la página completamente.

La página de QR está disponible en:

```text
TU-ENLACE-PUBLICO/#qr
```
