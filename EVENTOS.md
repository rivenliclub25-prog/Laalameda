# Eventos con precio cerrado: propuesta y decisiones

Este documento es la especificación viva de la **fase Eventos** de la web de La Alameda: registrar en el POS la venta de un evento negociado con un cliente (un barril, tantos tintos de verano, tantos montaditos…) por un **precio fijo acordado**, aunque lo acordado no esté en la carta. Complementa a `CONTEXT.MD`, `POS.md`, `TICKETS.md` y `ENTORNOS.md`: léelos antes.

**Cómo se usa este documento** (igual que `POS.md` y `ENTORNOS.md`):

- Las decisiones van en la sección **«Registro de decisiones»**. Cada una tiene un estado: 🟡 Pendiente, 🟢 Decidida o ⚪ Pospuesta.
- Al decidir algo se anota la decisión y la fecha. Si cambia la propuesta, se actualizan las secciones afectadas y se apunta en el **Historial**.
- No se programa ninguna fase hasta que estén 🟢 las decisiones de las que depende (ver «Fases»).
- Antes de escribir código, se propone el plan de archivos de la fase y se espera aprobación.

Última actualización: 2026-11-25 · Estado: **EV0 cerrada. EV1 (base de datos), EV2 (Panel → Eventos), EV3 (TPV → Eventos) y EV4 (cierres e informes) programadas** en la rama `eventos`, pendientes de probar en PRUEBAS. **Decisión del usuario (2026-11-25): se termina todo Eventos y se prueba y ajusta en PRUEBAS antes de mezclar nada a `main`**; después se publica todo junto (con la guía del camarero actualizada).

---

## 0. Para Claude Code: empieza aquí

1. Lee `CONTEXT.MD`, `POS.md`, `TICKETS.md`, `ENTORNOS.md` y este documento entero.
2. `git switch staging` → `git pull` → `git switch -c eventos` (ya creada el 2026-11-24).
3. La revisión del repositorio está en la sección 4b. Si algo cambia en el código, vuelve a comprobarlo.
4. Una fase cada vez: plan de archivos → aprobación → código → pausa para probar.

**Reglas que no se saltan** (de `ENTORNOS.md`):

- Producción es intocable. Se programa y se prueba contra **PRUEBAS** (`hrhhkzajweggpnupytms`).
- Nunca se pega SQL a mano. Cada cambio de base de datos es una migración **nueva** en `supabase/migrations/`, con permisos explícitos (`revoke all … from anon, authenticated;` y solo los `grant` necesarios).
- Las migraciones **añaden antes de quitar**: la web publicada tiene que seguir funcionando con la base de datos nueva.
- Flujo: rama `eventos` → PR a `staging` (migraciones a PRUEBAS + web de pruebas) → prueba del usuario → PR de `staging` a `main` → aprobación → producción.
- Una fase cada vez: **plan de archivos → aprobación → código → pausa para probar → actualizar este documento y `CONTEXT.MD`**.
- Textos en español y con el tono de la web. Misma estética, prioridad móvil y TPV táctil.

---

## 1. El problema

Hoy el TPV solo vende **productos de la carta** y **promos** (`POS.md`). Pero el bar cierra acuerdos a medida:

> *Cumpleaños de Laura, sábado 5 de diciembre, unas 25 personas. Acordado: 1 barril de Estrella (30 L), 20 tintos de verano y 40 montaditos variados. **Precio cerrado: 300 €.** Deja 100 € de señal.*

Problemas de hacerlo con lo que hay:

- El barril **no está en la carta**, y el precio cerrado **no es la suma** de los precios de carta.
- Meterlo como 40 montaditos + 20 tintos… a precio de carta da un total falso, y cobrar «300 €» en «Otro» no deja rastro de qué se vendió.
- No hay forma de registrar una **señal** cobrada días antes ni de saber cuánto queda por cobrar.
- En informes y cierres, ese dinero se mezcla con la venta normal y no se ve qué aportan los eventos.

**Objetivo:** que el bar pueda **apuntar el acuerdo**, **cobrarlo** (de una vez o por plazos) y **verlo en ventas, cierres e informes** como lo que es: un evento con precio cerrado.

---

## 2. Punto de partida: qué se reutiliza

| Pieza existente | Cómo se usa en eventos |
|---|---|
| Cuentas (`orders`) y líneas (`order_items`) | El evento tiene **su propia cuenta**; el precio acordado son líneas de esa cuenta |
| «Cobrar por separado» (`pos_cobrar_parte`) | Cobrar la señal y el resto como **ventas separadas**, cada una con su justificante |
| Ventas inmutables, devoluciones del admin | Igual: lo cobrado no se toca; una señal devuelta es una devolución con motivo |
| Cierre de jornada (`_resumen_caja`) | La señal cuenta en la caja **del día en que se cobra** (EV-D13) |
| `pos_events` | Trazabilidad: crear, confirmar, cobrar, cancelar el evento |
| Justificante 80 mm | Muestra el evento, lo acordado y el plazo cobrado |
| Panel con pestañas, `Modal`, `Switch`, `FormControls`, CSV, `printArea()` | Pestaña nueva **Eventos** |
| Códigos de error estables + traducción (`ticketErrors.ts`) | Errores nuevos `EVENTO_…` |
| Productos con código numérico | El contenido del evento puede apuntar a un producto de la carta (para informes) |

**Lo que no se toca:** carta, promos, tickets, mesas y su lógica.

---

## 3. Propuesta

### Idea central

Un **evento** es un acuerdo con un cliente que tiene: nombre, fecha, contacto, nº aproximado de personas, **contenido acordado** (lo que entra) y **precio cerrado**. Al confirmarlo se le abre **una cuenta propia** en el POS. El precio acordado entra en esa cuenta como **una o varias líneas de tipo `evento`** (los plazos: señal y resto). Esas líneas se cobran con lo que ya existe.

```
 Panel → Eventos                     TPV → Eventos                      Ventas / Cierres / Informes
 ──────────────────                  ──────────────────                 ─────────────────────────────
 Crear el acuerdo         ──►        Cobrar la señal      ──►          Venta nº 120 · Evento · 100 €
  · contenido acordado               (venta con justificante)          (en el cierre de ese día)
  · precio cerrado 300 €
  · plazos: 100 € + 200 €            El día del evento:
 Confirmar                            · extras a precio de carta
  → se abre su cuenta                 · cobrar el resto      ──►       Venta nº 187 · Evento · 200 €
```

### Contenido acordado

Cada fila del contenido es **o** un producto de la carta (con cantidad) **o** un concepto libre (texto + cantidad), para lo que no está en carta: «Barril Estrella 30 L», «Tarta», «Decoración»… (EV-D2).

- El contenido es **informativo**: describe qué entra en el precio. **No lleva precio por fila.**
- Se copia al justificante y al detalle de la venta.
- Si apunta a un producto, los informes pueden contar unidades acordadas de ese producto (sin euros: el dinero es del evento).

### Plazos (señal y resto)

- Por defecto, **«Señal» + «Resto»**; se puede quitar la señal (pago único) o añadir más plazos (EV-D3).
- Al **confirmar**, la cuenta del evento recibe una línea `evento` por plazo: «Evento · Cumple Laura — señal» 100 € y «— resto» 200 €. La suma de los plazos **siempre** es el precio cerrado (lo comprueba la base de datos).
- Cada plazo se cobra con «Cobrar por separado» o con un botón directo «Cobrar señal / Cobrar resto». Cada cobro es **una venta** con su número, método de pago y justificante, **en la jornada del día del cobro** (EV-D13).
- Cuando todo está cobrado y no quedan extras pendientes, la cuenta se cierra sola (como ya pasa) y el evento pasa a **realizado**.
- **Los plazos no se anulan desde el TPV** (ni «Anular línea» ni «Cancelar cuenta»): solo cambian desde Panel → Eventos (EV-D15).

### Extras (lo que se pide fuera del acuerdo)

- Durante el evento, lo que no está en el acuerdo se añade **a la misma cuenta** como líneas normales a precio de carta (productos o promos), y se cobran con los mismos botones (EV-D4).
- En informes, los extras cuentan como venta normal de productos; el precio cerrado, como ingreso de eventos.

### Estados del evento

`borrador` → `confirmado` → `realizado`, o `cancelado`.

- **Borrador:** se puede editar todo; no hay cuenta.
- **Confirmado:** se abre su cuenta con los plazos. Cambios según EV-D8.
- **Realizado:** todo cobrado; solo lectura.
- **Cancelado:** los plazos y extras sin cobrar se anulan con motivo; lo cobrado se queda (o se devuelve desde Panel → Ventas, con motivo) (EV-D9).

### Quién hace qué

| | Admin | Camarero |
|---|---|---|
| Crear, editar, confirmar y cancelar eventos | ✔ | ✗ (EV-D5) |
| Ver los eventos del día y de los próximos días | ✔ | ✔ |
| Cobrar plazos y añadir extras | ✔ | ✔ |
| Devolver una señal cobrada | ✔ | |

---

## 4. Modelo de datos (borrador; se concreta en el plan de EV1)

| Tabla | Para qué | Campos clave |
|---|---|---|
| `eventos` | El acuerdo | `id`, `nombre` («Cumple Laura»), `fecha` (jornada prevista), `hora_inicio` (opcional), `personas` (aprox.), `contacto_nombre`, `contacto_telefono`, `socio_id` (opcional, si es socio), `precio_centimos`, `estado`, `notas`, `order_id` (su cuenta, al confirmar), `created_by`, `created_at`, `updated_at`, `updated_by` |
| `evento_items` | Contenido acordado | `evento_id`, **o** `product_id` **o** `concepto` (exactamente uno), `cantidad`, `orden` |
| `evento_plazos` | Cómo se paga | `evento_id`, `nombre` («Señal», «Resto»), `importe_centimos`, `orden`, `order_item_id` (la línea que se crea al confirmar) |

**Cambios en lo que existe** (siempre añadiendo, nunca quitando):

- `orders.origen` admite `evento`, y `orders.evento_id` (FK). Una cuenta de evento no tiene mesa.
- `order_items.tipo_linea` admite `evento`, y `order_items.evento_plazo_id`. La regla «o `product_id` o `promo_id`» se amplía a «o producto, o promo, o plazo de evento».
- `pos_events` admite los tipos nuevos (`evento_creado`, `evento_confirmado`, `evento_cancelado`…).

**RPC previstas** (todas `security definer`, `search_path` fijo, códigos de error estables):

- `admin_guardar_evento(…)`: crea o edita un borrador (o un confirmado según EV-D8). Comprueba que los plazos suman el precio.
- `admin_confirmar_evento(id)`: abre la cuenta y crea las líneas de los plazos con el precio copiado. Idempotente.
- `admin_cancelar_evento(id, motivo)`: anula los plazos sin cobrar y los extras sin cobrar; cierra la cuenta.
- `pos_eventos(desde, hasta)`: eventos confirmados de esas fechas para el TPV (camareros y admins), con lo cobrado y lo pendiente.
- Se reutilizan `pos_anadir_lineas`, `pos_cobrar_parte`, `pos_cobrar_cuenta` y `admin_devolver_venta`, adaptando con `create or replace` (mismos parámetros) lo que haga falta (sección 4b).

**Reglas:**

- Dinero en céntimos y horas en `Europe/Madrid`, como siempre.
- El navegador **nunca** manda el precio de un plazo al cobrar: lo pone la base de datos al confirmar.
- RLS: solo camareros y admins leen eventos; nadie escribe directamente (todo por RPC). Los datos de contacto son personales: no salen en el CSV de ventas.

---

## 4b. Revisión del repositorio (2026-11-24)

**Lo que encaja:**

- `orders.origen` admite hoy `mesa` (mesas **y** puestos de barra, que se distinguen por `mesas.tipo`) y `barra` (Venta rápida). La regla `orders_mesa_check` («`origen = mesa` ⇔ tiene mesa») deja añadir `evento` sin mesa.
- `pos_anadir_lineas`, `pos_cobrar_parte`, `pos_cobrar_cuenta`, `pos_cancelar_cuenta` y `pos_anular_linea` solo exigen la cuenta abierta (`_pos_cuenta_abierta`): no dan por hecho que sea una mesa. Solo `pos_cambiar_mesa` exige `origen = mesa` (no aplica a eventos).
- `admin_informe` no agrupa por origen. Su comprobación «Cuadra» suma **todas** las líneas cobradas frente a lo cobrado, así que los plazos del evento entran solos y sigue cuadrando. Las tablas por producto y por promo ya excluyen las líneas que no son de producto o promo.
- `_resumen_caja` agrupa por método de pago, no por origen.
- En la web, `fetchCuentasAbiertas` (TPV → Mesas y Barra) solo carga `origen = mesa`: las cuentas de evento no aparecen ahí.
- `pos_events.tipo` ya se amplió una vez (`cuenta_impresa`, entrega C): se amplía igual.

**Lo que no encaja y se resuelve en EV1:**

1. **Jornada de la venta.** `_pos_crear_venta_lineas` apunta la venta en la jornada **de la cuenta** (`p_order.jornada`). Una cuenta de evento abierta días antes metería la señal en la caja de ese día (quizá ya cerrada). → **EV-D13:** en cuentas de evento, la venta va a la jornada del cobro.
2. **Cierre de jornada.** `pos_cerrar_jornada` se niega con cualquier cuenta abierta de esa jornada o anteriores (`MESAS_ABIERTAS`). Un evento confirmado con antelación bloquearía el cierre cada noche. → **EV-D14:** las cuentas de evento no bloquean el cierre (ni salen en «mesas abiertas» de `pos_estado_jornada`).
3. **Regla de las líneas.** `order_items_producto_o_promo` es «o producto o promo». Se sustituye por «exactamente uno de producto, promo o plazo». Hay código que da por hecho que «si no es producto, es promo»: `rentabilidad_resumen` (metería los plazos en «Promos»), y en la web `TIPOS_PROMO` (justificante, cuenta impresa, CSV) y `lugarDeVenta` / CSV (la venta saldría como «Venta rápida»). Todo se adapta.
4. **Anular plazos.** `pos_anular_linea` y `pos_cancelar_cuenta` permiten anular cualquier línea. → **EV-D15:** se niegan con los plazos y con la cuenta de un evento (eso va por `admin_cancelar_evento`).
5. **Rentabilidad** (no estaba en el documento): los plazos no tienen coste y saldrán como «sin coste» en el Resumen, en un grupo «Eventos». → **EV-D16:** el margen del evento (con las recetas de lo acordado) se pospone.
6. **Pruebas:** E-D16 de `ENTORNOS.md` es «no hay pruebas de PGlite en el repositorio». Como en las fases anteriores, se prueba en local fuera del repositorio y después en PRUEBAS; cada migración lleva además su bloque comentado de pruebas manuales.

---

## 5. Registro de decisiones

### Decididas (2026-11-24, con las recomendaciones de Claude)

| Id | Decisión |
|---|---|
| EV-D1 | **Modelo A:** tablas propias (`eventos`, `evento_items`, `evento_plazos`) y líneas de tipo `evento` en una cuenta propia. No se reutilizan las promos. |
| EV-D2 | **Fuera de carta: concepto libre** (texto), o un producto de la carta cuando exista. Si algo se repite mucho, se crea después como producto normal. |
| EV-D3 | **Plazos libres con «Señal» + «Resto» por defecto**; se puede quitar la señal o añadir plazos. La señal entra en la caja del día en que se cobra. |
| EV-D4 | **Extras en la misma cuenta del evento**, a precio de carta (productos y promos), con los mismos botones de cobro. |
| EV-D5 | **Solo los admins** crean, editan, confirman y cancelan eventos. Los camareros los ven y los cobran. |
| EV-D6 | **Pestaña nueva «Eventos» en el TPV** (Mesas · Barra · Venta rápida · Eventos): los de hoy primero y un apartado «Próximos» (para cobrar señales). |
| EV-D7 | ❌ **Descartada (2026-11-25, decisión del usuario):** contador de lo consumido del pack (EV5). No se hace. |
| EV-D8 | **Cambiar un confirmado:** sin nada cobrado, todo (los plazos se rehacen); con algo cobrado, el contenido y lo pendiente, no lo cobrado (si el precio baja de lo cobrado, devolución). Cada cambio queda en `pos_events`. |
| EV-D9 | **Cancelar con señal cobrada:** se anula lo pendiente y la señal se queda; si se devuelve, desde Panel → Ventas (con motivo). |
| EV-D10 | **Datos del cliente:** nombre y teléfono de contacto opcionales y, si es socio, enlace (`socio_id`). No se crean usuarios. Solo los ven camareros y admins; si se borra la cuenta del socio, el enlace queda vacío. |
| EV-D11 | **Informes y cierres:** fila «Eventos» en el cierre (por método); tabla por evento (precio, cobrado, pendiente, extras) y origen «Evento» en ventas y CSV; lo acordado no suma euros a los productos (opcional: unidades acordadas). |
| EV-D12 | **Hoja para el cliente, sencilla** (`printArea()`), en EV2, con «No es una factura». |
| EV-D13 | **Los cobros de un evento van a la jornada del día del cobro** (no a la de la cuenta). Solo para cuentas de evento; las mesas no cambian. |
| EV-D14 | **Las cuentas de evento no bloquean el cierre de jornada** ni salen en «mesas abiertas». |
| EV-D15 | **Los plazos no se anulan desde el TPV** («Anular línea» y «Cancelar cuenta» se niegan): solo cambian desde Panel → Eventos. |
| EV-D16 | ⚪ **Pospuesta:** margen del evento (coste de lo acordado con las recetas de Rentabilidad). Mientras, los plazos salen como «sin coste» en el grupo «Eventos». |

### Pendientes

*(ninguna)*

### Pospuestas

| Id | Tema | Por qué |
|---|---|---|
| EV-P1 | Calendario o vista mensual de eventos | Con una lista por fechas basta al principio |
| EV-P2 | Reservar mesas o zonas para el evento | Las mesas no se bloquean; el evento tiene su propia cuenta |
| EV-P3 | Que el cliente pida o pague el evento desde la web | No pedido |
| EV-P4 | Factura para empresas | Fuera del sistema (D1 de `POS.md`) |
| EV-P5 | Plantillas de eventos («Pack cumpleaños 25 pax») | Útil si se repiten; se puede añadir «Duplicar evento» más adelante |
| EV-D7 | Contador del pack | Descartada (2026-11-25) |
| EV-D16 | Margen del evento | Ver arriba |

---

## 6. Fases

| Fase | Contenido | Depende de | Hecha cuando… |
|---|---|---|---|
| **EV0** Decisiones | Este documento + revisión del repositorio | — | ✅ 2026-11-24 |
| **EV1** 🟡 Base de datos | Migración(es) con `eventos`, `evento_items`, `evento_plazos`, ampliación de `orders`, `order_items` y `pos_events`, RPC y permisos; adaptación de cobros (jornada, EV-D13), cierre (EV-D14), anulaciones (EV-D15), Resumen de Rentabilidad y los textos de la web que dan por hecho «producto o promo» | EV-D1, D2, D3, D4, D8, D9, D13, D14, D15 | En PRUEBAS: un evento confirmado se cobra en dos plazos (dos ventas, cada una en la jornada de su cobro), los plazos suman el precio, un precio manipulado en el navegador se ignora, un socio no ve eventos, cancelar conserva lo cobrado, el cierre no se bloquea por el evento, el informe sigue cuadrando |
| **EV2** Panel → Eventos | Lista (próximos, pasados, cancelados), crear/editar con contenido y plazos, confirmar, cancelar, detalle con pagos y registro, hoja para el cliente | EV1, EV-D5, D10, D12 | El admin crea y confirma un evento desde el móvil y el portátil |
| **EV3** TPV → Eventos | Pestaña Eventos, cobrar señal/resto con justificante, añadir extras, ver contenido acordado | EV1, EV-D6 | Un camarero cobra la señal un día y el resto otro, con justificantes correctos |
| **EV4** 🟡 Informes y cierres | Fila «Eventos» en el cierre, tabla por evento, origen «Evento» en ventas y CSV | EV1, EV-D11 | Cierres e informes cuadran con eventos, extras y devoluciones |
| ~~**EV5**~~ ❌ Descartada | Contador de consumo del pack (el usuario lo deja fuera el 2026-11-25) | EV-D7 | — |

Cada fase recorre el flujo de `ENTORNOS.md`: rama → PR a `staging` → **prueba del usuario en la web de pruebas** → PR a `main` → aprobación. EV1 puede ir sola a producción (no cambia nada visible) o junto con EV2 y EV3: se decide al cerrar EV1.

**Cómo se comprueba:**

- Migraciones probadas en local (fuera del repositorio) y aplicadas en PRUEBAS. Al final de cada migración, un bloque comentado de pruebas manuales como en los `.sql` antiguos.
- `npm run typecheck`, `npm run lint` y `npm run build` sin errores; «Comprobaciones» en verde en el PR.
- Prueba en la web de pruebas con los usuarios de prueba (admin y camarero), en móvil y en el TPV.
- La guía del camarero (Claude Docs) se actualiza al publicar EV3.

---

## 6b. Estado de EV1 (2026-11-24): 🟡 programada, pendiente de aplicar en PRUEBAS

- **Migración `20261124120000_eventos.sql`:**
  - **Tablas** `eventos`, `evento_items` (producto o concepto, con cantidad) y `evento_plazos` (con `anulado` para los plazos quitados tras confirmar). RLS: solo leen camareros y admins; nadie escribe directamente.
  - **Ampliaciones:** `orders.origen` admite `evento` y `orders.evento_id` (regla «es de evento ⇔ tiene evento»); `order_items.tipo_linea` admite `evento` y `order_items.evento_plazo_id`; la regla «o producto o promo» pasa a «exactamente uno de producto, promo o plazo» (`order_items_una_fuente`, añadida antes de quitar la vieja); `pos_events` admite `evento_creado`, `evento_editado`, `evento_confirmado`, `evento_cancelado` y `evento_realizado`.
  - **Funciones nuevas:** `admin_guardar_evento(id, datos)` (crea o edita; los plazos suman el precio; EV-D8 en confirmados: los plazos cobrados no se tocan, los pendientes se cambian, se quitan —su línea se anula— o se añaden; el precio no baja de lo cobrado), `admin_confirmar_evento(id)` (abre la cuenta con una línea «Evento · nombre — plazo» por plazo, con el importe copiado; idempotente), `admin_cancelar_evento(id, motivo)` (anula lo pendiente, conserva lo cobrado) y `pos_eventos(desde, hasta)` (para el TPV: contenido, plazos cobrados o pendientes, cobrado, pendiente y extras).
  - **Disparador:** cuando la cuenta de un evento queda pagada (por cualquier camino), el evento pasa a **realizado** y se apunta.
  - **Adaptadas** (mismos parámetros): `_pos_crear_venta_lineas` (EV-D13: jornada del cobro en cuentas de evento), `pos_cerrar_jornada` y `pos_estado_jornada` (EV-D14), `pos_anular_linea` y `pos_cancelar_cuenta` (EV-D15: `EVENTO_DESDE_PANEL`), `rentabilidad_resumen` (grupo «Eventos», sin coste).
  - Las líneas de plazo nacen **servidas** (no hay nada que servir: no salen como «por servir»).
- **Web (sin pantallas nuevas):** `TipoLinea` admite `evento` («Evento»); el lugar de la venta y el CSV dicen «Evento» en vez de «Venta rápida»; mensajes `EVENTO_…` en `ticketErrors.ts`.
- **Comprobado en local (PGlite, fuera del repositorio):** 48 pruebas, con los criterios de EV1: dos plazos cobrados = dos ventas, **cada una en la jornada de su cobro** (la de una mesa sigue en la de su cuenta); los plazos suman el precio; cobrar no acepta importes; confirmar dos veces no duplica; socio no ve eventos, camarero no los crea; el cierre no se bloquea por el evento (una mesa abierta sí); camarero no anula plazos ni cancela la cuenta del evento; extras a precio de carta; editar con señal cobrada (EV-D8); cobrarlo todo → realizado; **el informe sigue cuadrando**; Rentabilidad agrupa «Eventos»; cancelar con señal cobrada la conserva. Además, las pruebas de R3b (33) y de la cuenta impresa (15) siguen pasando con esta migración encima.
- **Prueba en PRUEBAS:** al mezclar en `staging` la migración se aplica sola. Como no hay pantallas, basta comprobar que el TPV (mesas, barra, venta rápida, cobrar por separado, imprimir cuenta, cierre) y el panel (ventas, informes, rentabilidad) siguen igual. El final de la migración trae un bloque comentado con pruebas manuales para el SQL Editor de PRUEBAS.

## 6c. Estado de EV2 (2026-11-24): 🟡 programada, pendiente de probar en PRUEBAS

- **Panel → pestaña «Eventos»** (entre Ventas y Estadísticas, `EventosSection.tsx`): lista en tarjetas con filtros **Próximos / Pasados / Cancelados** y buscador (nombre o contacto). Cada tarjeta: nombre, fecha y hora, personas, estado, precio, pendiente de los plazos y chips de plazos (✓ si cobrado). Un evento pasado con algo pendiente sigue en «Próximos» hasta que se cobra.
- **Crear y editar** (`eventos/EventoEditor.tsx`): datos (nombre, fecha, hora, personas, contacto, teléfono, socio opcional buscando entre los socios, notas); **«Qué incluye»** con filas «De la carta» (productos agrupados por categoría) o «Concepto» libre, con cantidad, subir/bajar/quitar; **precio cerrado y plazos**: por defecto Señal + Resto, atajos «Pago único», «Señal + resto», «+ Plazo» y «Ajustar el último a lo que falta»; la suma se ve en vivo («Faltan X €» / «Cuadra ✓») y no deja guardar si no cuadra. En un evento confirmado, los plazos cobrados salen bloqueados (EV-D8) y se envían con su `id`. Botones «Guardar borrador» y «Guardar y confirmar».
- **Detalle** (`eventos/EventoDetalle.tsx`): datos, contenido, plazos (cobrado con nº de venta y método, o pendiente), **extras** de su cuenta (lo añadido desde el TPV), **cobros** con su justificante y **registro** (creado, cambiado, confirmado, cobros, extras, cancelado…, con quién). Acciones: Editar, Confirmar (con aviso: abre su cuenta en el TPV), Cancelar evento (pide motivo; avisa de que lo cobrado se queda y las devoluciones van por Ventas) y **Hoja para el cliente**.
- **Hoja para el cliente** (`eventos/HojaEvento.tsx`, EV-D12): acuerdo imprimible (`printArea()`) con datos del bar, evento, lo que incluye, precio cerrado, plazos pagados o pendientes, notas y «Este documento no es una factura». Botón **«Copiar para WhatsApp»**: copia el acuerdo en texto (no envía nada).
- **Web:** `src/lib/eventos.ts` (lecturas y llamadas a `admin_guardar_evento`, `admin_confirmar_evento`, `admin_cancelar_evento`) y `fetchVentasDeCuenta` en `pos.ts`. Sin migraciones nuevas.
- **Prueba en PRUEBAS:** crear «Cumple Laura», 300 € con señal 100 + resto 200; comprobar que no guarda si los plazos no suman; confirmar; abrir la hoja, imprimir y copiar para WhatsApp; editar (cambiar el resto); cancelar otro evento con motivo. Cobrar los plazos llega en EV3 (desde el TPV); mientras tanto la cuenta del evento existe pero el TPV aún no tiene la pestaña.

## 6d. Estado de EV3 (2026-11-24): 🟡 programada, pendiente de probar en PRUEBAS

- **TPV → cuarta pestaña «Eventos»** (`#/pos?modo=eventos`, `EventosPanel.tsx`), solo eventos confirmados o realizados, en tres apartados: **Hoy** (destacados), **Próximos (60 días)** y **Con cobros pendientes de días anteriores** (últimos 30 días, solo si queda algo). Cada tarjeta: nombre, hora o fecha, personas, chips de plazos (✓ cobrado), pendiente y extras sin cobrar. Tiempo real como Mesas (más respaldo cada 10 s).
- **Cuenta del evento = la pantalla de cuenta de las mesas** (`CuentaView`, ahora exportada, con la prop `evento`):
  - Arriba, los datos del evento (`DatosEventoTPV`): fecha, hora, personas, contacto, socio, **lo que incluye el precio cerrado** y notas.
  - **Un botón por plazo pendiente** («Cobrar Señal · 100 €»): abre el cobro por separado con ese plazo ya marcado; solo falta elegir el método. Es una venta con su número y justificante.
  - Lo de siempre: «Añadir extra» (a precio de carta), servir, anular extras, «Cobrar por separado», «Cobrar todo lo pendiente» e «Imprimir cuenta».
  - No salen «Cambiar de mesa», «Cancelar cuenta» ni «Anular» en los plazos (EV-D15); las líneas de plazo llevan la etiqueta «Plazo».
  - Al cobrar lo último, la cuenta se cierra sola y el evento pasa a **realizado**; la pantalla se queda hasta cerrar el justificante.
- **Web:** `fetchCuentaAbierta(orderId)` en `pos.ts` (misma forma que las cuentas de mesa; `CuentaMesa.mesa_id` admite null), `fetchEventosTPV` y `fechaISO` en `eventos.ts` (usa `pos_eventos` de EV1). `PagoSeparadoModal` admite título propio y empezar con todo marcado. **Sin migraciones nuevas.**
- **Prueba en PRUEBAS:** con «Cumple Laura» confirmado, un camarero cobra la señal en efectivo (venta y justificante; en el panel sale cobrada). Se añaden 2 cañas como extra; se cobra el resto con tarjeta y luego los extras → evento realizado. El cierre de jornada no se bloquea por el evento. **Repasar una mesa normal completa** (abrir, añadir, cobrar por separado, imprimir cuenta, cobrar), porque la pantalla de cuenta es compartida.

## 6e. Estado de EV4 (2026-11-25): 🟡 programada, pendiente de probar en PRUEBAS

- **Migración `20261125120000_eventos_informes.sql`** (solo funciones, mismos parámetros):
  - `_resumen_caja` añade `eventos`: ventas, cobrado, devuelto y neto de cuentas de evento, **por método**, y el reparto **plazos / extras**. Es una parte de lo cobrado (ya incluida): **no cambia el neto ni el efectivo esperado**. La usan el cierre, el estado de la jornada y el informe; los cierres nuevos la guardan en su `resumen` (los anteriores no la tienen y no muestran la fila).
  - `admin_informe` añade `por_evento`: cada evento con cobros en el periodo (precio, cobrado en el periodo con plazos y extras, cobrado en total, devuelto, pendiente y estado).
  - Los plazos no se suman a ningún producto; los extras sí (son productos). La comprobación «cuadra» no cambia.
- **Web:**
  - Hoja de cierre (TPV y Panel → Cierres): fila **«De ello, eventos (incluido arriba)»** con el detalle por método y plazos / extras.
  - Informes: casilla **«De ello, eventos»** y tabla **«Por evento»** con su CSV.
  - Ventas, últimas ventas del TPV y justificante: origen **«Evento · nombre»** (la venta lee el nombre del evento con `orders.evento_id`).
  - CSV de ventas: columna **«Evento»**. CSV de cierres: columna **«De ello, eventos neto (€)»**.
- **No se hace** (recomendación aprobada): sumar unidades de lo acordado a productos; tocar Rentabilidad (EV-D16 sigue pospuesta).
- **Comprobado en local (PGlite):** 22 pruebas (señal cobrada otro día, resto con tarjeta, extras en efectivo y devolución; caja de eventos por método, plazos / extras, efectivo esperado sin cambios, informe cuadra, productos sin plazos, «Por evento» = caja de eventos, periodo de varios días, estado de la jornada y cierre guardado, permisos). Las pruebas de EV1 (48), R3b (33) y cuenta impresa (15) siguen pasando con EV4 encima.
- **Prueba en PRUEBAS:** con un evento cobrado (señal y resto, algún extra), mirar la hoja de cierre (fila de eventos y efectivo esperado igual que la suma de métodos), Panel → Ventas → Informes (casilla y tabla «Por evento», CSV) y la lista de Ventas («Evento · Cumple Laura»).

## 7. Forma de trabajar

- Rama **`eventos`** creada desde `staging` actualizado (`git pull`). Si una fase se alarga, se puede dividir en ramas `eventos-ev1`, `eventos-ev2`…
- Antes de cada fase: plan de archivos y espera a la aprobación.
- Si algo del proyecto no encaja con este documento, **preguntar antes de decidir**.
- Al cerrar cada fase: actualizar este documento (estado e historial) y la sección «Estado actual» de `CONTEXT.MD`.

---

## Historial

- **2026-11-23** — Creado el documento: problema, propuesta (evento con cuenta propia, contenido acordado, plazos y extras), modelo de datos en borrador, decisiones EV-D1 a EV-D12 abiertas con recomendación y fases EV0–EV5.
- **2026-11-24** — Revisión del repositorio (sección 4b): encajan las cuentas, los cobros y el informe; no encajan la jornada de la venta, el bloqueo del cierre, la regla «producto o promo» y la anulación de líneas. Añadidas EV-D13 a EV-D16. **Todas las decisiones aprobadas con las recomendaciones de Claude (EV-D7 y EV-D16 pospuestas). EV0 cerrada.** Rama `eventos` creada desde `staging` (con `main` traído para no perder los documentos de la entrega C).
- **2026-11-24** — Plan de EV1 aprobado. **EV1 programada** en `eventos`: migración `20261124120000_eventos.sql` (tablas, ampliaciones, funciones, disparador y adaptaciones EV-D13/14/15) y retoques de seguridad en la web. 48 pruebas en local. Pendiente de aplicar en PRUEBAS; se publicará con EV2 y EV3.
- **2026-11-24** — Plan de EV2 aprobado (con «Copiar para WhatsApp»). **EV2 programada** en `eventos`: pestaña «Eventos» del panel con lista, editor de contenido y plazos, detalle con cobros y registro, confirmar, cancelar y hoja para el cliente. Pendiente de probar en PRUEBAS.
- **2026-11-24** — Plan de EV3 aprobado con las recomendaciones (reutilizar la pantalla de cuenta, 60 días adelante y pendientes de 30 atrás, botón por plazo). **EV3 programada** en `eventos`: pestaña «Eventos» del TPV y cuenta del evento con cobro por plazo y extras. Sin migraciones. Pendiente de probar en PRUEBAS.
- **2026-11-25** — El usuario decide terminar todo Eventos y probarlo en PRUEBAS antes de mezclar a `main`. Plan de EV4 aprobado con las recomendaciones. **EV4 programada** en `eventos`: migración `20261125120000_eventos_informes.sql`, fila de eventos en el cierre, casilla y tabla «Por evento» en Informes, «Evento · nombre» en Ventas y CSV. 22 pruebas en local. Pendiente de probar en PRUEBAS.
- **2026-11-25** — **EV5 descartada** por el usuario (EV-D7, contador del pack, queda fuera). Eventos queda completo con EV1–EV4; falta probar y ajustar en PRUEBAS y publicar todo junto en `main`.
