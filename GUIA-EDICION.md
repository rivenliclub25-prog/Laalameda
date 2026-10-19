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

### Carta y precios

Los precios públicos de carta y promociones se generan desde la copia privada del Excel. El archivo original contiene costos, márgenes y utilidades: **no lo subas al repositorio público**.

Para actualizar la web después de editar el Excel:

1. Guarda y cierra el Excel.
2. En la carpeta del proyecto, haz doble clic en `Actualizar precios.bat` y elige el Excel actualizado en la ventana.
3. Confirma la publicación cuando el programa te pregunte. Se subirá solo el archivo generado con precios públicos y GitHub publicará la web automáticamente.

También puedes generarlo desde una terminal:

```sh
npm.cmd run sync-prices -- "C:\ruta\privada\Promos_La_Alameda_v2.xlsx"
```

El programa lee solo los nombres y precios de `Productos`, y el estado, nombre, precio normal y precio de promo de `Promos`. No copia costos, márgenes ni utilidades. El resultado público se guarda en `src/data/prices.generated.ts`. Guardar el Excel privado, por sí solo, no puede cambiar la web: hay que ejecutar `Actualizar precios.bat` después de cada edición y confirmar la publicación. No subas el `.xlsx` original; está excluido de Git.

El script utiliza las filas de productos existentes y las promociones marcadas `Aprobado`. Mantén sus nombres para que las encuentre. `Pack Partido` de la web se vincula a `Pack Partido (2 personas)` de la hoja `Promos`, para conservar el precio acordado de 9 €. El `DYC 8 años` de la carta no aparece en el Excel actual, así que conserva su precio de 8 € hasta que se añada a la hoja `Productos`.

Los nombres, descripciones, horarios, contenidos y segmentos de la carta y de las promociones siguen editándose en `src/data/site.ts` y `src/data/promos.ts`; el Excel solo aporta los precios y descuentos públicos.

### Promociones

Archivo: `src/data/promos.ts`

Aquí se mantienen los nombres, contenidos, segmentos y horarios de las promociones. Los precios y descuentos publicados se toman del Excel. Las promociones compartidas entre segmentos se declaran una sola vez y se asignan con `segmentIds`. Las promociones del 31 de octubre tienen una fecha de caducidad para dejar de mostrarse después del evento.

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
