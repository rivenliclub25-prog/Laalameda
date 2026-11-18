# Costes y rentabilidad: diseño del módulo

Este documento es la especificación viva del **módulo de costes y rentabilidad** de La Alameda. Complementa a `CONTEXT.MD`, `POS.md`, `TICKETS.md` y `ENTORNOS.md`: léelos antes.

**Cómo se usa** (igual que `POS.md` y `ENTORNOS.md`):

- Las decisiones van en la sección 13 con estado 🟢 Decidida, 🟡 Pendiente o ⚪ Pospuesta.
- No se programa ninguna fase hasta que estén 🟢 las decisiones de las que depende.
- Cada fase: plan de archivos → aprobación → código → prueba en PRUEBAS → producción con aprobación (flujo de `ENTORNOS.md`).

Última actualización: 2026-11-19 (v4.6) · Estado: **R1 y R2 en producción** (2026-11-18). **R3 (resumen, margen de las promos y «Descargar Excel») programada en la rama `rentabilidad-r3` y ⏸️ EN PAUSA:** el usuario la consulta con el equipo y hace sus pruebas antes de seguir. **No se sube a `main`** hasta que el usuario lo diga, y **R4 no empieza** hasta entonces.

> **Datos reales fuera del repositorio (R-D13).** El repositorio es **público**. Los costes, márgenes y ventas reales del bar (la antigua sección 15) están en una página **privada** de Claude Docs: **«Rentabilidad: datos reales · La Alameda»** — https://claude.ai/artifact/UguZQzuyRZ2MNBojT7Cupr. Sus números son los casos de prueba de R2. El Excel de costes (`Costes.xlsx`) tampoco se sube nunca (`*.xlsx` está en `.gitignore`). En este documento solo hay ejemplos ilustrativos.

> **v4 cambió el enfoque.** El módulo no controla precios (sin margen mínimo, sin bloqueos, sin excepciones): **informa**. Cada producto muestra su margen real y una etiqueta, y todo se recalcula solo al cambiar un precio o un coste. El Excel se migra a Supabase y deja de ser la fuente de los datos. Lo anterior (v1–v3) queda en el historial.

> **Ubicación.** El repositorio no usa `docs/`: cada funcionalidad tiene su documento en la raíz (`POS.md`, `TICKETS.md`, `ENTORNOS.md`). Este va como **`RENTABILIDAD.md`** en la raíz.

---

## 1. La idea en una frase

**Cada producto del bar conoce su coste y enseña cuánto margen deja con su precio actual. Si cambia el precio en el panel o sube un ingrediente, el margen y su etiqueta se actualizan solos.**

El sistema **informa, no decide**: no impide guardar ningún precio. Las decisiones de precio las toma una persona con el dato delante.

---

## 2. Decisión de arquitectura: migrar el Excel a Supabase

**Decidido (R-D10, 18/11):** los costes y las recetas se migran a Supabase y se gestionan desde el panel. El Excel no se conecta.

| | Migrar a Supabase + panel (elegida) | Conectar Excel ↔ Supabase (descartada) |
|---|---|---|
| Precio de venta | Un solo sitio: la carta del TPV | Dos sitios que acaban sin coincidir (ya pasa: hay precios distintos entre el Excel y el TPV) |
| Margen al cambiar un precio | Al momento | Solo tras sincronizar; si el precio se cambia en el TPV, el Excel no se entera |
| Qué hay que montar | Tablas y pantallas, sin herramientas nuevas | Excel en OneDrive o Google Sheets, credenciales, proceso de sincronización, gestión de errores |
| Fragilidad | Baja | Alta: las fórmulas enlazan por nombre; corregir una errata rompe el enlace |
| Otros bares (TPV como producto) | Igual para cualquier local | Cada bar con su Excel distinto |

**Papel del Excel a partir de ahora:**

1. **Importación inicial:** carga los ingredientes («Materias Primas», R1) y las recetas («Coste_Unitario», R2) para no teclearlos.
2. **Actualizar precios de compra:** volver a importar «Materias Primas»; los cambios quedan en el histórico (ya en R1).
3. **Exportación:** botón «Descargar Excel» en el panel con ingredientes, recetas, costes y márgenes (R3).

**El Excel nunca vuelve a ser la fuente:** lo que vale es lo que hay en Supabase.

---

## 3. Qué hace y qué no hace

**Hace:**

1. Guarda cada **ingrediente** con su precio de compra sin IVA, formato y coste por unidad de consumo, con **histórico** de precios.
2. Guarda la **receta** de cada producto (ingredientes y cantidades) y calcula su **coste**.
3. Muestra el **margen real** de cada producto y su **etiqueta** (sección 5).
4. **Recalcula solo:** al cambiar el precio de un producto en el panel, o el precio de un ingrediente, o una receta.
5. Calcula el margen de las **promos** con el mismo criterio.
6. Un **panel de rentabilidad** con el resumen, los productos por etiqueta, lo que más dinero deja y lo que se ha movido.
7. Más adelante, el **margen real de lo vendido** (con el coste del día de cada venta).

**No hace (por ahora):**

- No hay margen mínimo obligatorio.
- No bloquea precios ni pide autorizaciones.
- No cambia precios solo.
- No gestiona stock, compras ni proveedores.

Si en el futuro se quiere un mínimo con bloqueo, se añade encima sin rehacer nada (R-P5).

---

## 4. Cómo se calcula el margen

**Precios de la carta con IVA; costes sin IVA. Para comparar se quita el IVA del precio** (R-D11). Los precios de compra del Excel son **sin IVA** (confirmado, R-D14).

```
coste_unitario_ingrediente = precio_compra_sin_iva / (cantidad_total_formato × rendimiento_pct/100)
coste_producto             = Σ (cantidad_receta × coste_unitario_ingrediente / (1 − merma_pct/100))

precio_sin_iva = precio_carta / (1 + iva_pct/100)
margen_pct     = (precio_sin_iva − coste_producto) / precio_sin_iva × 100
ganancia_€     = precio_sin_iva − coste_producto
```

- **IVA:** 10 % por defecto (servicio de bar, alcohol incluido), configurable por categoría y producto. Confirmar con la gestoría si hay noches o ventas con otro tipo (R-D4).
- **Por qué sin IVA:** el IVA no es del bar, se paga a Hacienda. Calcular con IVA infla el margen entre 3 y 6 puntos.
- **Rendimiento y merma:** opcionales (100 % y 0 % por defecto). El rendimiento es lo aprovechable de lo comprado (espuma del barril); la merma, lo que se pierde al servir.
- **Margen ≠ recargo:** «poner un 60 %» sobre el coste (2 € → 3,20 €) da un margen del 37,5 %, no del 60 %. El sistema solo habla de **margen sobre venta**.

---

## 5. La escala de etiquetas

**Decidida (R-D11, 18/11):** la escala del propio Excel («Precio_venta»), **una sola para toda la carta**, calculada **sin IVA**.

| Margen | Etiqueta | Color |
|---|---|---|
| Menos del 60 % | **Bajo** | Rojo vino |
| 60–70 % | **Bueno** | Ámbar |
| 70–80 % | **Muy bueno** | Verde |
| Más del 80 % | **Excelente** | Verde oscuro |
| Sin receta o con ingredientes sin precio | **Sin coste** | Gris |

- Los cortes (60, 70, 80) se guardan en ajustes y el admin los puede cambiar desde el panel (R2). Cambiarlos solo cambia las etiquetas, no los precios.
- **La etiqueta no es una orden.** Que la comida salga «Bajo» es un dato; si se acepta porque acompaña a la cerveza, es una decisión de negocio (R-D9), no un error del sistema.
- **Escala por familia** (cafés, copas, comida, como tiene el Excel): pospuesta (R-P2). Se puede añadir sin cambiar el resto.

---

## 6. Flujo de información

```
 Costes.xlsx ── importación (R1 ingredientes, R2 recetas) ──┐
                                                            ▼
                 INGREDIENTES  (precio sin IVA + histórico)
                                    │
                 RECETAS  (producto ↔ ingrediente, cantidad)
                                    │
                                    ▼
 CARTA (precio con IVA) ──►  COSTE · MARGEN · ETIQUETA   ◄── calculados al leer:
                                    │                         siempre al día
                     ┌──────────────┼───────────────┐
                     ▼              ▼               ▼
              Editor de precios  Editor de promos  Panel de rentabilidad
                                                        │
 VENTAS (TPV) ── coste copiado en cada venta (fase R4) ─┘ ► margen real de lo vendido
```

---

## 7. Modelo de datos

**Decidido (R-D12, 18/11):**

- **El coste no se guarda en `products`.** Esa tabla la lee cualquiera, incluso sin sesión, porque de ahí sale la carta pública: una columna de coste la vería cualquier visitante o socio.
- **El margen se calcula al leer, no se guarda.** Son unos 70 productos: calcularlo cada vez es instantáneo, siempre está al día y no hacen falta triggers de recálculo. Se guarda solo el **histórico** (precios de ingredientes y, en R2, cambios de precio de los productos).

Tablas nuevas (RLS solo admin, `revoke all` a `anon`/`authenticated` y permisos justos):

| Tabla | Fase | Para qué | Campos clave |
|---|---|---|---|
| `insumos` | R1 ✅ | Ingredientes que se compran | `id` (el código, automático), `nombre` (único sin mayúsculas), `categoria`, `proveedor`, `formato` (texto), `cantidad_formato` (en unidad base), `unidad_base` (`ml`/`g`/`ud`), `rendimiento_pct` (100), `precio_compra_sin_iva`, **`coste_unitario` (columna calculada por la base de datos)**, `activo`, `updated_at`, `updated_by` |
| `insumo_precios` | R1 ✅ | Histórico de precios. Se rellena solo con un trigger. **Inmutable** | `insumo_id`, `precio_compra_sin_iva`, `cantidad_formato`, `rendimiento_pct`, `coste_unitario`, `vigente_desde`, `origen` (`importacion`/`manual`), `importacion_id`, `creado_por` |
| `costes_importaciones` | R1 ✅ | Registro de cada importación confirmada | `id`, `tipo` (`insumos`; `recetas` en R2), `nombre_archivo`, `filas` (jsonb), `informe` (jsonb), `creada_por`, `creada_at` |
| `recetas` | R2 ✅ | Producto ↔ ingrediente. Se escribe solo con funciones | `product_id`, `insumo_id`, `cantidad` (unidad base), `merma_pct` (0), `nota`. PK (`product_id`, `insumo_id`) |
| `costes_emparejamientos` | R2 ✅ | Qué producto de la carta es cada producto del Excel (para que la siguiente importación salga ya emparejada) | `nombre_excel` (minúsculas), `product_ids` (vacío = no está en la carta) |
| `producto_precios` | R2 ✅ | Histórico de precios de la carta (automático, inmutable; empieza con el precio actual) | `product_id`, `precio_centimos`, `desde`, `por` |

Cambios en tablas existentes (solo se añade, compatible con la web actual):

| Tabla | Cambio | Fase |
|---|---|---|
| `app_settings` | `iva_defecto_pct` (10), `escala_bueno_pct` (60), `escala_muy_bueno_pct` (70), `escala_excelente_pct` (80), con permisos de columna explícitos y cortes que tienen que ir de menor a mayor | R2 ✅ |
| `menu_categories`, `products` | `iva_pct` (nulo = el de la categoría o el general). No es un dato sensible | Pospuesto hasta R-D4 (R-D15) |

- **Dinero:** precios de venta en céntimos enteros (como en todo el POS); precio de compra `numeric(12,4)`; costes unitarios `numeric(12,6)` (un barril sale a fracciones de céntimo por ml).
- **Unidades:** cada ingrediente tiene una unidad base (`ml`, `g` o `ud`). El panel acepta ml, cl, l, g, kg y ud y lo convierte. No se convierten magnitudes distintas (gramos a unidades); al editar un ingrediente no se cambia su magnitud.

### Funciones (servidor)

- **R1 ✅** `admin_importar_insumos(archivo, filas, confirmar)`: con `confirmar = false` **previsualiza** sin escribir (nuevos, cambios de precio, sin cambios, errores por fila); con `true` aplica todo en una transacción, solo si no hay errores. Máximo 2.000 filas.
- **R1 ✅** Trigger del histórico: al crear un ingrediente o cambiar su precio, formato o rendimiento, añade una línea a `insumo_precios` (`importacion` o `manual`).
- **R2 ✅** `_coste_producto(product_id)` y `_margen_etiqueta(precio, coste)`: única fuente de cálculo (margen redondeado a 1 decimal antes de etiquetar, para que lo que se ve y la etiqueta coincidan). El panel repite el mismo cálculo solo para enseñarlo en directo (`calcularMargen()`), y está comprobado que da lo mismo en todos los productos.
- **R2 ✅** `rentabilidad_productos()`: cada producto con precio, coste, margen, ganancia por unidad, etiqueta, vendidos en 30 días y ganancia de esos 30 días (con el coste de hoy; el coste real de cada venta es R4).
- **R2 ✅** `admin_guardar_receta(producto, líneas)`: guarda la receta entera de una vez (`[]` = sin receta).
- **R2 ✅** `admin_importar_recetas(archivo, filas, emparejamientos, confirmar)`: previsualiza o aplica la hoja «Coste_Unitario». Al reimportar conserva la merma ya guardada de cada ingrediente.
- **R3 ✅** `_coste_promo(promo_id)`: coste de una promo con los productos que lleva (`promotion_items`); `null` si no lleva ninguno o alguno no tiene receta. `_etiqueta_de_margen(margen)`: la etiqueta de un margen ya calculado.
- **R3 ✅** `rentabilidad_promos()`: precio, precio normal (los productos sueltos), descuento real, aviso si el anunciado no cuadra (más de 2 puntos), coste, margen, etiqueta, qué productos no tienen receta, vendidas y ganancia en 30 días.
- **R3 ✅** `rentabilidad_resumen(desde, hasta)`: lo vendido en esas jornadas (como mucho 400 días) **con el coste de hoy**: totales (ventas sin IVA, coste, ganancia, margen medio ponderado y etiqueta, vendido sin coste, devoluciones aparte), por categoría (las promos son su propio grupo), por producto o promo, ingredientes que han cambiado de precio (con su % y cuántos productos usan) y cambios de precio en la carta.
- **R3** `rentabilidad_resumen(desde, hasta)`: resumen del panel (sección 9), con ventas del TPV.

---

## 8. Migración del Excel

### Lo que se importa

| Hoja | Se importa como | Fase | Notas |
|---|---|---|---|
| Materias Primas | `insumos` | R1 ✅ | Materia Prima → nombre; Tamaño → cantidad del formato; U/medida → unidad base (`gr`/`Kg` → `g`, `ml`/`L`/`cl` → `ml`, `Und` → `ud`); Precio Compra → precio sin IVA; Cat → categoría |
| Coste_Unitario | `recetas` | R2 | Producto + Materia Prima + Cantidad a usar, con emparejamiento de productos |
| Precio_venta, Punto Equilibrio, Balance | No se importan | — | Los precios mandan en la carta del TPV; los costes fijos son de otro análisis |

### Cómo funciona (R1)

1. Panel → **Rentabilidad → Importar Excel** → se elige `Costes.xlsx`. El navegador lee la hoja «Materias Primas» (busca la fila de títulos por su nombre, no por posición); el archivo no se sube a ningún sitio.
2. El servidor devuelve la **previsualización**: ingredientes nuevos con su coste por unidad, los que cambian de precio (antes → después), los que no cambian y los **errores con su número de fila** (nombre vacío o repetido, cantidad, unidad o precio no válidos, unidad distinta de la guardada).
3. **Confirmar importación** aplica todo en una transacción. Con un solo error no se aplica nada.
4. **Reimportar** sirve para actualizar precios de compra: los ingredientes se reconocen por su nombre (sin mayúsculas ni espacios de más) y los cambios quedan en el histórico.

### Importación de recetas y emparejamiento (R2 ✅)

Los nombres del Excel y de la carta no coinciden («Caña_Estrella» → Caña, «Barcelo» → Barceló, «Refresco» → Coca-Cola) y hay casos con trampa («Tercio» en el Excel es la 0,0 Tostada, que no está en la carta). Panel → **Rentabilidad → Importar Excel → 2. Recetas**:

1. **Emparejar** (`src/lib/emparejar.ts`): primero lo confirmado en una importación anterior; luego una lista de equivalencias de este Excel; luego el mismo nombre (sin mayúsculas, acentos ni signos); si no, el más parecido, **en amarillo**. Con el Excel real: 66 emparejados solos y solo «Tercio» en amarillo. Una receta puede servir para varios productos de la carta.
2. **Dosis:** botón «Copas: pasar el destilado de 60 a 75 ml» (las 9 copas que el Excel tiene a 60 ml) y lista para corregir cualquier cantidad.
3. **Resultado:** por producto, si la receta es nueva, cambia o sigue igual, con coste, precio y **margen y etiqueta que saldrán**, más los errores (ingrediente que no existe, medida que no encaja con el ingrediente, producto sin emparejar o asignado dos veces). Con un error no se aplica nada.
4. La **Jarra** (450 ml de barril) no está en el Excel: se crea en Rentabilidad → Productos → Jarra → + Ingrediente.

### Correcciones al importar las recetas (ya confirmadas)

- **Copas: 75 ml** de destilado en todas (el Excel usa 60 ml en seis).
- **Chupitos: 60 ml.**
- **Jarra: 450 ml** de barril Estrella (receta nueva, el Excel no la tiene).
- Pendiente de confirmar: vino 150 o 160 ml, Baileys 75 o 90 ml.

### Leer el `.xlsx` en el navegador (R-D5, decidida)

**Lector propio, sin librerías** (`src/lib/xlsx.ts`): un `.xlsx` es un ZIP con XML dentro y el navegador ya sabe abrir ambos (`DecompressionStream` y `DOMParser`, en Chrome, Edge, Safari y Firefox actuales). `read-excel-file` se descartó: su versión actual trae cuatro dependencias, dos poco conocidas. Solo lee valores (ni fórmulas ni formatos). Comprobado con el `Costes.xlsx` real: lee los 67 ingredientes igual que la referencia.

---

## 9. Panel

### Pestaña «Rentabilidad» (`#/admin?seccion=rentabilidad`)

1. **Ingredientes (R1 ✅):** lista buscable (nombre, proveedor o código) y por categoría, con formato, precio de compra, coste por unidad, fecha y variación del último cambio. Crear, editar (coste en directo e histórico de precios del ingrediente) y dar de baja (no se borra).
2. **Importar Excel (R1 ✅):** sección 8.
2b. **Descargar Excel (R3 ✅):** en Resumen y en Productos. Un `.xlsx` generado en el navegador **sin librerías** (`src/lib/xlsxEscribir.ts`: ZIP sin comprimir + XML, números de verdad, títulos en negrita y fijos, formatos € y %), con las hojas Resumen y Vendido por producto (si se descarga desde Resumen, del periodo elegido), Productos, Promos, Ingredientes y Recetas.
3. **Productos (R2 ✅, la primera sub-pestaña):** contadores por etiqueta (pulsables para filtrar), búsqueda, categoría, orden (carta, menor margen, más ganancia) y «ver también los que no salen en la carta». Cada producto: precio, coste, margen y etiqueta, ganancia por unidad, vendidos y ganancia de 30 días. Al tocarlo se abre su **receta** (`RecetaModal`): ingredientes por categoría, cantidad en ml/cl/l, g/kg o ud, merma, coste y margen en directo.
4. **Resumen (R3 ✅, la primera sub-pestaña):** periodo (7 días, 30 días, este mes o fechas); cifras de ventas sin IVA, ganancia, margen medio con etiqueta y vendido sin coste; **barras por categoría** (parte de la venta, una sola serie en el vino de la marca validado) con su margen y ganancia; lo que más dinero deja y lo que menos margen tiene de lo que se vende; ingredientes que han cambiado de precio y cambios de precio en la carta.
4b. **Promos (R3 ✅):** cada promo con precio, precio normal, descuento real frente al anunciado (con aviso), coste, margen y etiqueta; las que no llevan productos o tienen alguno sin receta lo dicen.
5. **Ajustes (R2 ✅):** IVA de la carta y cortes de la escala, con la escala de ejemplo en directo.

### Cambios en lo que ya existe

- **Carta → editar producto (R2 ✅):** bajo el precio aparece en directo «Coste · Margen · Ganancia · **Etiqueta**» (o «Sin receta…»). No bloquea nada.
- **Carta → lista (R2 ✅):** un punto de color con la etiqueta de cada producto (el texto sale al pasar por encima y para lectores de pantalla). Se recalcula al cambiar el precio en la fila.
- **Promos → editor (R3 ✅):** bajo «Productos de la carta que lleva», en directo: precio normal, descuento real, coste, ganancia y etiqueta (o «lo que cuesta regalarla» en obsequios y sorteos), qué productos no tienen receta y aviso si el «−X %» anunciado no cuadra. No bloquea nada.

Móvil primero, reutilizando `Modal`, `Switch`, `FormControls` y las barras de `StatsSection`.

---

## 10. Promos

Con el mismo cálculo, informativo (R3 ✅):

```
precio_normal  = Σ precio_carta × cantidad        (de promotion_items)
coste_promo    = Σ coste_producto × cantidad
margen_promo   = (precio_promo_sin_iva − coste_promo) / precio_promo_sin_iva
descuento_real = 1 − precio_promo / precio_normal
```

- Las promos sin contenido definido en `promotion_items` (12 de 15 hoy) salen como **Sin coste** hasta completarlas.
- Si el descuento anunciado (la etiqueta «−29 %») no coincide con el real por más de 2 puntos, aviso (evita promos anunciadas como oferta que salen más caras que la carta).
- Obsequios y sorteos (precio 0): se muestra su **coste** en lugar del margen.

---

## 11. Roles y permisos

**Decidido (R-D1, cambiada el 18/11):** **solo el admin** edita precios, ingredientes y recetas. No se crea el permiso de encargado.

| Acción | Socio | Camarero | Admin |
|---|---|---|---|
| Ver costes, márgenes y panel de rentabilidad | ✗ | ✗ | ✓ |
| Editar precios de la carta y promos | ✗ | ✗ | ✓ |
| Editar ingredientes y recetas, importar y exportar | ✗ | ✗ | ✓ |
| Cambiar IVA y cortes de la escala | ✗ | ✗ | ✓ |

- **Se reutiliza lo que ya existe:** `is_admin()`, `AdminRoute` y las políticas actuales de `products`, `promotions` y `promotion_items`, que ya son solo de admin para escribir. No hay que tocar `profiles` ni `protect_role`.
- **Los camareros, socios y la web pública no ven costes:** nada de costes en tablas que ellos leen (`products`, `order_items`). Cuando se copie el coste en las ventas (R4), irá en una tabla aparte solo para el admin (R-D7).
- Si más adelante hace falta alguien que edite sin ser admin, se añade un permiso de encargado sin rehacer nada (R-P6).

---

## 12. Plan por fases

| Fase | Contenido | Hecha cuando… |
|---|---|---|
| **R0** Decisiones | Este documento aprobado | ✅ R-D1, R-D5, R-D10 a R-D14 decididas (18/11) |
| **R1** ✅ Ingredientes e importación | `insumos`, `insumo_precios`, `costes_importaciones`; importación de «Materias Primas»; pestaña Ingredientes | Los 67 ingredientes cargados con su coste; un camarero o un socio no ven nada |
| **R2** ✅ Recetas y margen | `recetas` + importación de «Coste_Unitario» con emparejamiento, ajustes, `producto_precios`, `rentabilidad_productos()`; pestañas Productos y Ajustes; margen en directo en Carta | Cambiar un precio o un ingrediente cambia el margen al momento; los números de la página privada salen idénticos |
| **R3** Panel y promos | `rentabilidad_resumen()`, `rentabilidad_promos()`, Resumen, Promos, exportar a Excel, margen en el editor de promos | El resumen cuadra con un cálculo a mano |
| **R4** Margen real de lo vendido | Coste copiado en cada venta (tabla aparte), margen real en Ventas e Informes | El margen real de una semana cuadra con un cálculo a mano |
| **R5** Futuro | Escala por familia, compras y stock, subrecetas, mínimo con bloqueo si se pide, varios locales | — |

- **R4 es la de más riesgo:** toca las funciones de cobro del TPV, que funcionan en producción. Va en su propio PR y se prueba a fondo en PRUEBAS.
- **R1 + R2 ya dan lo que se pide:** cada producto con su margen y su etiqueta, actualizados solos.
- **Aviso de dirección:** este módulo no vende más. Las decisiones de precio urgentes (comida, vinos) se toman ya con el análisis de la página privada; el desarrollo no debe quitar horas al sprint comercial.

### Estado de R1 (2026-11-18): ✅ en producción (junto con R2)

- **Rama:** `rentabilidad-r1` (desde `staging`).
- **Migración `20261118120000_costes_insumos.sql`:** tablas `insumos` (con `coste_unitario` calculado), `insumo_precios` (histórico automático e inmutable) y `costes_importaciones`; RLS solo admin; `admin_importar_insumos()`; permisos explícitos (solo las columnas editables; el coste y el código no se pueden fijar a mano; no se puede borrar).
- **Panel:** `src/lib/xlsx.ts` (lector propio), `src/lib/costes.ts`, `RentabilidadSection.tsx` y `rentabilidad/` (`IngredientesView`, `IngredienteModal`, `ImportarView`); pestaña en `AdminPage.tsx`; mensajes nuevos en `ticketErrors.ts`; `*.xlsx` en `.gitignore`.
- **Comprobado en local (PGlite, fuera del repositorio):** 34 pruebas, entre ellas: el coste por unidad de los 67 ingredientes coincide con la columna «Costo por» del Excel; camarero, socio y sin sesión no ven nada; previsualizar no escribe; con un error no se aplica nada; el histórico se crea solo y no se puede tocar; reimportar con un precio cambiado añade una línea. El lector del Excel, probado con el archivo real, lee las 67 filas igual que la referencia.
- **Prueba del usuario en la web de pruebas:** entrar como admin → Panel → Rentabilidad → Importar Excel → `Costes.xlsx` → revisar la previsualización (67 nuevos, 0 errores) → confirmar → revisar la lista, editar un precio y ver su histórico. Con `camarero@prueba.test` la pestaña no existe y las tablas no devuelven nada. **Hecho: todo bien** (PR #17 a `staging`).

### Estado de R2 (2026-11-18): ✅ en producción

- **Publicación:** rama `rentabilidad-r2` → PR #18 a `staging` (probado por el usuario en la web de pruebas) → PR #19 a `main` → despliegue aprobado: se aplicaron `20261118120000_costes_insumos` y `20261118180000_costes_recetas`. El usuario confirma que todo salió sin errores.

- **Rama:** `rentabilidad-r2` (desde `staging`, que ya tiene R1).
- **Migración `20261118180000_costes_recetas.sql`:** ajustes (IVA y escala), `recetas`, `costes_emparejamientos`, `producto_precios` (trigger en `products` + precio inicial), `_coste_producto`, `_margen_etiqueta`, `rentabilidad_productos`, `admin_guardar_receta`, `admin_importar_recetas`; RLS solo admin y permisos explícitos. **Nada en `products`** salvo el trigger del histórico.
- **Panel:** `src/lib/rentabilidad.ts`, `src/lib/emparejar.ts`; `rentabilidad/` `ProductosView`, `RecetaModal`, `AjustesView`, `ImportarRecetas`, `Etiqueta`; `ImportarView` con «1. Ingredientes / 2. Recetas»; `RentabilidadSection` con Productos · Ingredientes · Importar Excel · Ajustes; `CartaSection` con el punto de color y el margen en directo; mensajes nuevos en `ticketErrors.ts`.
- **Comprobado en local (PGlite + el Excel real, fuera del repositorio):** 38 pruebas. Entre ellas: con las dosis corregidas y los precios de la página privada, **los 35 márgenes y etiquetas comprobados salen idénticos**, y también los costes comprobados (los números, solo en la página privada); el cálculo en directo del panel da lo mismo que el servidor en todos los productos; la Jarra creada a mano sale con el margen y la etiqueta de la página privada; subir el barril o el precio cambia el margen al momento; reimportar igual no cambia nada y conserva la merma; errores de importación; camarero, socio y sin sesión no ven nada; `products` sigue sin columnas de coste.
- **Prueba del usuario en la web de pruebas:** Importar Excel → **2. Recetas** → `Costes.xlsx` → revisar «Tercio» (dejar «No está en la carta») → pulsar «Copas: pasar el destilado de 60 a 75 ml» → «Actualizar previsualización» (0 errores) → confirmar. Después: **Productos** → crear la receta de la **Jarra** (450 ml de barril) → comparar márgenes y etiquetas con la página privada (con los precios que tenga PRUEBAS) → cambiar un precio en **Carta** y ver el margen en directo y el punto de color.

### Estado de R3 (2026-11-19): ⏸️ programada y en pausa

- **En pausa (decisión del usuario, 2026-11-19):** antes de seguir, el usuario lo consulta con el equipo y hace sus pruebas. El código está terminado en la rama `rentabilidad-r3` (sin mezclar en `main`). **No se sube a `main`** hasta que el usuario lo indique; **R4 no se empieza** hasta entonces. Al retomar: preguntar el resultado de la consulta y de las pruebas, aplicar los cambios que pida el equipo en la misma rama y seguir el flujo (PR a `staging` → prueba → PR a `main` → aprobar).

- **Rama:** `rentabilidad-r3` (desde `staging`).
- **Migración `20261119100000_costes_resumen.sql`:** solo funciones (`_etiqueta_de_margen`, `_coste_promo`, `rentabilidad_promos`, `rentabilidad_resumen`), solo admin y permisos explícitos. Sin tablas nuevas.
- **Panel:** `ResumenView`, `PromosView`, `src/lib/xlsxEscribir.ts`, `src/lib/exportarRentabilidad.ts`; `rentabilidad.ts` (`calcularPromo`, `fetchResumen`…); `RentabilidadSection` con Resumen · Productos · Promos · Ingredientes · Importar Excel · Ajustes; botón Excel en Productos; margen en directo en el editor de `PromosSection`.
- **Comprobado en local (PGlite + el Excel real, fuera del repositorio):** 30 pruebas. Ventas inventadas con el resultado calculado a mano (totales, margen ponderado y etiqueta, vendido sin coste, por categoría, promos como grupo, por producto); promo completa (precio normal, descuento real, coste, aviso), incompleta (dice qué falta) y obsequio (lo que cuesta); el editor de Promos calcula igual que el servidor en todas las promos; devoluciones aparte; ingrediente que sube (+10 %) y cambio de precio en la carta; la importación inicial no cuenta como subida; periodo al revés rechazado; permisos. El Excel generado es un ZIP válido (comprobado con otro lector) y nuestro lector lo vuelve a leer con sus 6 hojas y los números como números.
- **Prueba del usuario en la web de pruebas:** Rentabilidad → **Resumen** (cambiar el periodo y revisar las cifras y las barras) → **Descargar Excel** y abrirlo → **Promos** → en Panel → Promos editar una promo, añadirle sus productos y ver el margen en directo → volver a Rentabilidad → Promos. En producción: comparar el Resumen del 3 al 15/11 con la tabla «Lo vendido» de la página privada (cambiará algo si los costes o precios han cambiado desde entonces: el resumen usa el coste de hoy).

---

## 13. Decisiones

### Decididas

| Id | Decisión | Fecha |
|---|---|---|
| R-D1 | **Solo el admin** edita precios, ingredientes y recetas (cambiada el 18/11; antes, encargado y admin) | 2026-11-18 |
| R-D5 | **Lector de Excel propio, sin librerías** (`DecompressionStream` + `DOMParser`). `read-excel-file` descartada por sus dependencias | 2026-11-18 |
| R-D10 | **Migrar a Supabase y gestionar desde el panel.** El Excel solo se usa para importar (ingredientes, recetas, actualizaciones de precios) y exportar | 2026-11-18 |
| R-D11 | **Sin margen mínimo ni bloqueos.** Escala informativa del Excel (< 60 Bajo · 60–70 Bueno · 70–80 Muy bueno · > 80 Excelente), una sola para toda la carta, **calculada sin IVA** | 2026-11-18 |
| R-D12 | **El coste no se guarda en `products`** (la lee cualquiera) y **el margen se calcula al leer**, sin caché ni triggers de recálculo. Solo se guarda el histórico | 2026-11-18 |
| R-D13 | **Los datos reales no van al repositorio** (es público): página privada de Claude Docs; el Excel nunca se sube (`.gitignore`); las pruebas con números reales, en local | 2026-11-18 |
| R-D14 | Los precios de compra del Excel son **sin IVA** (confirmado por el usuario) | 2026-11-18 |
| R-D15 | En R2, **IVA solo general** (10 %, en Ajustes). El IVA por categoría o producto se añade cuando la gestoría confirme si hay otro tipo (R-D4) | 2026-11-18 |
| R-D16 | **R1 y R2 van juntas a producción**: en producción se importan ingredientes y recetas en una sola sesión | 2026-11-18 |
| R-D17 | El resumen calcula lo vendido **con el coste de hoy**; el coste del día de cada venta llega con R4. Se indica en la pantalla | 2026-11-19 |
| R-D18 | Las **devoluciones** se muestran aparte (son por importe de la venta, no por producto) y no se restan del margen | 2026-11-19 |
| R-D19 | Las ventas de **promos** cuentan como grupo «Promos» si tienen coste; si no, van a «sin coste» | 2026-11-19 |
| R-D20 | **Excel propio sin librerías** (`xlsxEscribir.ts`) en vez de CSV sueltos | 2026-11-19 |
| ~~R-D2~~ | ~~Margen mínimo 55 % con bloqueo~~ — **sustituida por R-D11** | 2026-11-15 |

### Pendientes

| Id | Decisión | Recomendación |
|---|---|---|
| R-D4 | IVA: 10 % general; ¿alguna categoría o noche distinta? | 10 % por defecto, configurable; confirmar con la gestoría |
| R-D6 | Varios locales: `local_id` | Más adelante, en todo el esquema a la vez |
| R-D7 | Coste en ventas: tabla aparte o columna en `order_items` | Tabla aparte (los camareros leen `order_items`) |
| R-D9 | Comida con margen bajo: bajar coste, aceptarla o retirarla | Pedir coste de tortilla hecha en el bar y precio a otro proveedor; mientras, se acepta y se revisa el 15/12 |

### Pospuestas

| Id | Tema |
|---|---|
| R-P1 | Subrecetas (masa de tortilla repartida en raciones) |
| R-P2 | Escala por familia (cafés, copas, comida…) |
| R-P3 | Sincronización automática con un Excel en la nube (descartada por R-D10) |
| R-P4 | Compras, albaranes y stock |
| R-P5 | Margen mínimo con bloqueo y excepciones (diseño de la v3, recuperable) |
| R-P6 | Permiso de encargado (editar sin ser admin) |

### Información que falta (no bloquea R1)

1. **Productos sin coste:** Nestie, Colacao, Ración, Té, Agua con gas, DYC 8 años y Copa de bienvenida.
2. **Dosis:** vino (150 o 160 ml) y Baileys (75 o 90 ml).
3. **Mermas** del barril y de la cocina (si no se conocen, se dejan en 0 y se miden).
4. **Revisar en el Excel:** el precio de la patata (¿bravas preparadas?) y el del pan por media unidad. Algunas categorías del Excel están cambiadas (p. ej. Coca Cola en «Copas_Ginebra»): se corrigen en el panel tras importar.

---

## 14. Seguridad

- **Todo el cálculo en el servidor.** El navegador nunca envía un coste ni un margen (`coste_unitario` es una columna calculada que nadie puede escribir).
- **Costes solo para el admin** (RLS con `is_admin()`), nunca en tablas que leen la web, los socios o los camareros.
- **Histórico inmutable** de precios de ingredientes, como `sales` y `cierres_jornada`.
- **Permisos explícitos en cada migración** (`revoke all … from anon, authenticated` y `grant` justos, por columna), regla de `ENTORNOS.md`.
- **Importación con límites:** máximo 2.000 filas; el servidor valida cada dato aunque el navegador ya lo haya hecho; el archivo no se sube ni se guarda, solo sus filas (en `costes_importaciones`).
- **Datos reales fuera del repositorio público** (R-D13).
- La web pública, la carta y el TPV no cambian de comportamiento.

---

## Historial

- **2026-11-15 (v1)** — Diseño inicial con margen mínimo, bloqueo y excepciones.
- **2026-11-15 (v2)** — Margen mínimo 55 %. Revisado `Costes.xlsx`.
- **2026-11-15 (v3)** — Editan encargado y admin. Dosis confirmadas (jarra 450 ml, copas 75 ml, chupitos 60 ml) y precios del TPV.
- **2026-11-18 (v4)** — Cambio de enfoque: sistema **informativo**, sin margen mínimo ni bloqueos (R-D11, sustituye a R-D2). Escala del Excel calculada sin IVA. El Excel se **migra a Supabase** y se gestiona desde el panel (R-D10). Fases simplificadas a R1–R5.
- **2026-11-18 (v4.1)** — R-D1 cambiada: **solo el admin** edita precios, ingredientes y recetas. Se quita el permiso de encargado (pospuesto como R-P6).
- **2026-11-18 (v4.2)** — Revisión de Claude Code contra el código, aprobada por el usuario: R-D12 (coste fuera de `products`, margen calculado al leer), R-D13 (datos reales en una página privada de Claude Docs; la sección 15 sale del repositorio), R-D14 (precios de compra sin IVA), R-D5 (lector propio). Ajustes e importación de recetas pasan a R2. **R0 cerrada; R1 programada** en `rentabilidad-r1`.
- **2026-11-18 (v4.3)** — R1 probada en PRUEBAS por el usuario (PR #17). Plan de R2 aprobado con R-D15 (IVA solo general) y R-D16 (R1 y R2 juntas a producción). **R2 programada** en `rentabilidad-r2`.
- **2026-11-18 (v4.4)** — R2 probada en PRUEBAS. **R1 y R2 publicadas en producción** (PR #18 y #19, con aprobación). Siguiente: R3.
- **2026-11-19 (v4.5)** — Plan de R3 aprobado con R-D17 a R-D20. **R3 programada** en `rentabilidad-r3`.
- **2026-11-19 (v4.6)** — **R3 en pausa** a petición del usuario: la consulta con el equipo y hace pruebas antes de seguir. No se sube a `main` y R4 no empieza hasta que lo diga.
