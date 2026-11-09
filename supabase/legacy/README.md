# SQL antiguo (solo historia)

Estos son los archivos `.sql` que se pegaron **a mano** en el SQL Editor de producción hasta noviembre de 2026. **Ya no se ejecutan:** desde la fase E1 de `ENTORNOS.md`, la estructura de la base de datos vive en `supabase/migrations/`, empezando por la migración base que se copió de producción.

Se conservan para saber de dónde viene cada tabla y cada función. Para cambiar la base de datos, se crea una migración nueva en `supabase/migrations/` (sección 4 de `ENTORNOS.md`), nunca se edita ni se vuelve a pegar ninguno de estos.

## Orden en que se aplicaron en producción

| # | Archivo | Qué añadió |
|---|---|---|
| 1 | `schema.sql` | Perfiles del club, alta automática al registrarse, borrar la propia cuenta |
| 2 | `admin.sql` | Rol de admin, protección del rol, lista de socios para el panel |
| 3 | `tickets.sql` | Promos, ajustes de la jornada, tickets del club, camareros y canje |
| 4 | `google-auth.sql` | Aceptar la privacidad tras entrar con Google |
| 5 | `catalogo.sql` | Carta y promos en Supabase (productos, franjas, `catalogo()`) |
| 6 | `catalogo-codigos.sql` | Códigos numéricos de producto |
| 7 | `pos.sql` | TPV: cuentas, líneas, ventas y registro de eventos (P2) |
| 8 | `pos-mesas.sql` | Mesas con QR, cuentas de mesa y devoluciones (P3) |
| 9 | `pos-pedidos.sql` | Pedidos de los socios desde la mesa (P4) |
| 10 | `pos-promos.sql` | Promos y tickets en las ventas (P5) |
| 11 | `pos-pedir-sin-qr.sql` | Pedir eligiendo la mesa (P6a) |
| 12 | `pos-informes.sql` | Cierre de jornada e informes (P6b) |

Aparte:

- `promos-clasico.sql`: promos especiales de El Clásico, ejecutado cuando tocó (octubre de 2026).
- `pos-limpieza-pruebas.sql`: borró las ventas de prueba **una sola vez** (2026-11-02), antes de vender de verdad. **Está bloqueado** y no debe ejecutarse nunca más (E-D2 y E-D13).

`google-auth.sql` se ejecutó el 2026-10-28, antes que los del POS en producción, aunque en la rama `pos` se escribió después.
