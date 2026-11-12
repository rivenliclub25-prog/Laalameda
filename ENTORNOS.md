# Entornos: pruebas separadas de producción

Este documento es la propuesta para **separar las pruebas de los datos reales** de La Alameda. Complementa a `CONTEXT.MD`, `TICKETS.md` y `POS.md`: léelos antes.

**Cómo se usa este documento** (igual que `POS.md`):

- Las decisiones van en la sección **«Registro de decisiones»**. Cada una tiene un estado: 🟡 Pendiente, 🟢 Decidida o ⚪ Pospuesta.
- No se programa ninguna fase hasta que estén 🟢 las decisiones de las que depende.
- Antes de escribir código, se propone el plan de archivos de la fase y se espera aprobación.

Última actualización: 2026-11-12 · Estado: **E0 a E5 cerradas. E6 pospuesta** (a petición del usuario, 2026-11-10): ver «E6 — Documentar» para retomarla. El flujo ya se ha usado dos veces de punta a punta (permisos de `profiles` y mejoras del TPV).

---

## Guía rápida para el equipo (léela primero)

> Resumen de cómo trabajamos desde noviembre de 2026. El resto del documento cuenta el porqué y el plan completo; esto es lo que hace falta saber para trabajar.

### La idea

**Los datos del bar (ventas, caja, socios, tickets) son reales y no se tocan nunca para probar.** Por eso hay dos bases de datos:

| | Supabase | Para qué | Quién la usa |
|---|---|---|---|
| **PRODUCCIÓN** | `hinebaxynlpjisteuaus` | El bar de verdad | Solo la web publicada (`…github.io/Laalameda/`) |
| **PRUEBAS** | `hrhhkzajweggpnupytms` | Probar con datos inventados | Tu ordenador y, desde E3, la web de pruebas |

```
   TU ORDENADOR  ──────────►  PRUEBAS            (datos inventados, se pueden romper)
   npm run dev                hrhhkzajweggpnupytms

   WEB REAL      ──────────►  PRODUCCIÓN         (datos reales, intocable)
   rama main                  hinebaxynlpjisteuaus
```

Las dos tienen **la misma estructura** (tablas, funciones, permisos). Solo cambian los datos.

### Ramas

| Rama | Qué es | Quién escribe |
|---|---|---|
| `main` | La web real. Cada cambio aquí se publica (tras aprobarlo) | **Protegida:** solo por PR con las comprobaciones en verde |
| `staging` | Lo que se está probando: se publica solo en la web de pruebas (y sus migraciones van a PRUEBAS) | Por PR desde las ramas de trabajo |
| Ramas de trabajo (`miguel`, `e3-…`) | Una por tarea, creada desde `staging` | Cada uno la suya |

### El primer día

1. Trae lo último: `git switch main` y `git pull`.
2. Instala: `npm ci`.
3. Crea el `.env` a partir de `.env.example` (`Copy-Item .env.example .env`) y pega la **clave anon de PRUEBAS** (pídela por privado). Debe quedar:
   ```
   VITE_APP_ENV=local
   VITE_SUPABASE_URL=https://hrhhkzajweggpnupytms.supabase.co
   VITE_SUPABASE_ANON_KEY=<clave anon de PRUEBAS>
   ```
4. `npm run dev` → `http://localhost:5173`. Arriba tiene que salir la pastilla **«LOCAL · base de datos de PRUEBAS»** y la pestaña dice **«[LOCAL]»**.
5. Entra con un **usuario de prueba** (abajo) o crea una cuenta tuya (en PRUEBAS entra al momento, sin correo de confirmación).

### Usuarios y datos de PRUEBAS

| Usuario | Correo | Qué puede hacer |
|---|---|---|
| Admin | `admin@prueba.test` | Panel completo y TPV |
| Camarero | `camarero@prueba.test` | TPV y canjear tickets |
| Socio 1 / Socio 2 | `socio1@prueba.test`, `socio2@prueba.test` | Club, tickets y pedir desde la mesa |

La contraseña de todos es la misma: pídesela al dueño (está en el secreto `PRUEBAS_USUARIOS_CLAVE`). Si en la web pone otros correos (`…+admin@…`), es porque Supabase no aceptó los `@prueba.test`.

**Carta, mesas y «dejarlo como nuevo»:** GitHub → **Actions → Datos de PRUEBAS → Run workflow**:

- `copiar-carta`: trae la carta pública de la web real (productos, precios y promos, que quedan encendidas). Repetirlo la pone al día.
- `crear-usuarios`: crea los cuatro usuarios de arriba (si ya existen, solo repasa sus roles).
- `reiniciar`: borra ventas, cuentas, cierres y tickets de prueba, vuelve a la venta nº 1 y deja las mesas 1–4. No toca la carta ni los usuarios.

### El día a día

```
rama de trabajo ──PR──► staging ─────────────────────► main ──[aprobación]──► PRODUCCIÓN
                   │        │                            │                     1. migraciones
             comprobaciones  1. migraciones a PRUEBAS     comprobaciones        2. web real
                            2. web de pruebas            + qué cambiaría
                                                         en producción
```

1. `git switch staging` → `git pull` → `git switch -c nombre-de-la-tarea`.
2. Programa y prueba en local (todo va a PRUEBAS: puedes vender, cobrar o borrar sin miedo).
3. Antes de subir: `npm run typecheck`, `npm run lint` y `npm run build`.
4. `git push -u origin nombre-de-la-tarea` y abre un **PR a `staging`**. GitHub comprueba que compila y revisa las migraciones («Comprobaciones»).
5. **Al mezclarlo en `staging`**, GitHub aplica las migraciones nuevas a PRUEBAS y publica la web de pruebas (`…github.io/Laalameda-pruebas/`, 1–2 minutos). Pruébalo ahí: móvil, tablet, TPV.
6. **Para publicarlo:** PR de **`staging` a `main`**. En su resumen («Qué cambiaría en producción») se ve qué migraciones se aplicarían en producción.
7. **Al mezclarlo en `main`**, la publicación **espera la aprobación** de un revisor (Actions → «Deploy to GitHub Pages» → *Review deployments* → *Approve*). Después aplica las migraciones a producción, publica la web real y pone `staging` al día con `main`.

**`main` está protegida:** solo entra por PR con las comprobaciones en verde. Nadie puede subir directo.

### Cambios en la base de datos

- **Nunca se pega SQL a mano**, ni en producción ni en PRUEBAS.
- Cada cambio es un archivo **nuevo** en `supabase/migrations/` con fecha delante (`20261115100000_stock.sql`). Los ya aplicados no se editan; si algo falla, otra migración que lo arregle.
- **Permisos explícitos:** Supabase da por defecto todos los permisos a `anon` y `authenticated` sobre todo lo nuevo. Cada migración los quita (`revoke all … from anon, authenticated;`) y da solo los necesarios.
- **Se aplican solas:** a PRUEBAS al mezclar en `staging`, y a producción al mezclar en `main` y aprobarlo. Si una migración falla, no se publica la web. (Para probar una migración en PRUEBAS antes de mezclar: **Actions → Estructura de la base de datos** → tu rama → `aplicar-pruebas`.)
- **Cada lunes** el workflow «Vigilar producción» comprueba que producción y PRUEBAS siguen iguales; si alguien tocó algo a mano, falla y avisa.
- Los `.sql` antiguos están en `supabase/legacy/`, solo como historia.

### Lo que te protege

- **Si en local pones la URL de producción, la web no arranca** (ni `npm run dev` ni `npm run build`) y explica por qué. La web real solo se construye con la de producción.
- Lo guardado en el navegador (carrito, carta…) va separado por entorno.
- `main` publica la web real: por eso solo entra por PR.
- La clave `service_role` / secret no se usa nunca, en ningún sitio.

### Herramientas en GitHub (Actions)

| Workflow | Qué hace | Cuándo |
|---|---|---|
| **Copia de seguridad** | Copia cifrada de producción en el repositorio privado `Laalameda-copias` (últimas 30) | Cada noche, solo (`COPIAS.md`) |
| **Estructura de la base de datos** | `leer-produccion`, `aplicar-pruebas`, `comparar` y `marcar-produccion` | A mano |
| **Comprobaciones** | Typecheck, lint, build y revisión de migraciones; en los PR a `main`, qué cambiaría en producción | En cada PR a `staging` o `main` |
| **Deploy to GitHub Pages** | Espera aprobación, migra producción, publica la web real y pone `staging` al día | Al mezclar en `main` |
| **Vigilar producción** | Compara producción con PRUEBAS y avisa si alguien tocó algo a mano | Cada lunes, solo |
| **Publicar web de pruebas** | Construye con PRUEBAS y publica en `Laalameda-pruebas` | En cada push a `staging`, o a mano desde `staging` |
| **Datos de PRUEBAS** | `copiar-carta`, `crear-usuarios` y `reiniciar` (solo PRUEBAS) | A mano |

### Si algo falla

| Ves | Qué pasa |
|---|---|
| «🔒 … es la base de datos de PRODUCCIÓN» al arrancar | Tu `.env` apunta a producción. Pon la de PRUEBAS |
| La carta vacía en local o en la web de pruebas | Falta copiarla: **Actions → Datos de PRUEBAS → `copiar-carta`** |
| Errores de conexión con PRUEBAS | El plan gratuito pausa el proyecto tras 7 días sin uso: panel de Supabase → proyecto de pruebas → *Restore* |
| No sale la pastilla «LOCAL» | No estás en la versión nueva: `git pull` en `main` |

### Lo que falta

| Fase | Qué trae |
|---|---|
| ~~E3~~ | ✅ Web de pruebas en `…github.io/Laalameda-pruebas/`, publicada sola desde `staging` |
| ~~E4~~ | ✅ Datos y usuarios de prueba, y el botón «Reiniciar pruebas» |
| ~~E5~~ | ✅ Paso a producción automático con aprobación, y `main` protegida |
| **E6** | Guía final y ensayo de restaurar una copia |

---

## Para Claude Code: empieza aquí

### Antes de nada

1. Lee `CONTEXT.MD`, `POS.md` y `TICKETS.md`, y este documento entero.
2. `git checkout main && git pull`.
3. Revisa en el repositorio lo que este documento da por supuesto y **avisa si algo no encaja** antes de proponer nada (forma de trabajar de `POS.md`). La primera revisión ya está hecha: ver «Resultado de la revisión» justo debajo. En cada fase, vuelve a comprobar lo que esa fase toque.

### Reglas que no se saltan nunca

- **Producción es intocable** (E-D2). No ejecutes contra `hinebaxynlpjisteuaus` nada que escriba: ni SQL, ni `db push`, ni `migration repair`, ni scripts. La única escritura prevista en todo el plan es el `migration repair` de E1, y **la hace el usuario** (o un workflow) tras aprobarlo de forma explícita.
- **No tienes las claves de producción** y no las pidas. Para leer la estructura de producción (E1), el usuario ejecuta el comando que le des, o se hace desde un workflow.
- **El `.env` local apunta a PRUEBAS** desde que existe (E1). Si en algún momento ves la URL de producción en el `.env` local, para y avisa. **Hasta E1 el `.env` local apunta a producción:** no se prueba en local nada que escriba datos.
- **No hagas `git push` a `main`.** Cada fase se prepara en una rama y el usuario la mezcla en `main` con un PR. Desde E5, `main` solo recibe PR.
- **No borres los `.sql` actuales:** se mueven a `supabase/legacy/` en E1.
- Una fase cada vez: **plan de archivos → aprobación → código → pausa para que el usuario pruebe → actualizar este documento y `CONTEXT.MD`.**
- Textos de cara al usuario en español y con el tono de la web, como en el resto del proyecto.

### Resultado de la revisión (2026-11-07)

**Encaja:**

- `src/lib/supabase.ts` crea un solo cliente con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`: la guarda de E2 va ahí.
- `.github/workflows/deploy.yml` construye con esos dos secretos del repositorio y llama a `catalog-snapshot` con los mismos.
- No hay Edge Functions: toda la lógica son RPC.
- `catalog-snapshot` es el único script que habla con Supabase, y solo lee.

**No encaja con lo que suponía este documento (ya corregido abajo):**

| Lo que se suponía | Lo que hay | Consecuencia |
|---|---|---|
| `vite.config.ts` tiene `base: '/Laalameda/'` fijo | No lo tiene: la ruta base la pone `deploy.yml` con `--base` (de `configure-pages`) | En E2 no hay que quitar nada: cada workflow pasa su `--base` |
| Las pruebas de PGlite están en el repositorio | Vivían en una carpeta temporal fuera del repositorio. **Se han perdido** las de tickets, catálogo, códigos, P2, P3 y P4; quedan las de P5, P6a, P6b, Google y la limpieza | No se recuperan: la base de datos se prueba aplicando las migraciones en PRUEBAS (E-D16, cambiada el 2026-11-08) |
| `prices.generated.ts`, `fflate` y `fast-xml-parser` se pueden quitar juntos | `src/data/site.ts` aún importa `prices.generated.ts`; `fflate` y `fast-xml-parser` solo los usa `sync-prices.mjs` | Las dependencias se van en E0; `prices.generated.ts`, en la fase L de `POS.md` (E-D14) |
| `deploy.yml` puede usar el entorno `production` | Usa el entorno `github-pages` (el que exige GitHub Pages) | En E5, la aprobación va en un paso aparte con el entorno `production`, antes de publicar |

**Riesgos nuevos:**

- **Ya hubo un push directo a `main`** desde otro ordenador (`28a7de8`, 2026-11-06: quita Bolt de las meta etiquetas). Cada push a `main` publica la web real. Ver E-D17.
- **«Conservar 30 días» no se consigue borrando archivos en git:** el historial guarda todas las copias para siempre (datos personales que no desaparecen y un repositorio que crece sin parar). Ver E-D12.
- **Los secretos de la copia no pueden ir en el entorno `production`:** con revisores (E5), la copia nocturna se quedaría esperando una aprobación. Ver E-D15.
- **GitHub desactiva los workflows programados de un repositorio público tras 60 días sin actividad.** Si no se sube nada en dos meses, las copias se paran sin avisar. Se documenta en `COPIAS.md` cómo comprobarlo y reactivarlo.
- **`supabase/pos-limpieza-pruebas.sql` sigue en el repositorio** y borraría la caja real si se ejecutara (va contra E-D2). Ver E-D13.

### Primer mensaje que espera el usuario

El resumen de la revisión de arriba (qué encaja y qué no) y **el plan de archivos de E0** (sección 9). Nada de código todavía. *(Hecho el 2026-11-07.)*

---

## 0. Puntos de partida (no negociables)

- **No hay presupuesto.** La solución de partida tiene que ser gratis. Los planes de pago se comparan en la sección 7, solo para el futuro.
- **Lo que hay en producción es real** (ventas, cierres, tickets y socios desde la puesta en marcha). **No se puede volver a ejecutar `pos-limpieza-pruebas.sql`** ni ningún script que borre o modifique datos de producción.
- Nada de este plan escribe datos en producción. Las únicas operaciones sobre producción son **de lectura** (copiar la estructura y la carta pública), salvo lo indicado expresamente en la fase E1.

---

## 1. Diagnóstico: cómo funciona hoy

```
  Tu ordenador ──────────────┐
  (npm run dev)              │
                             ▼
                   Supabase PRODUCCIÓN  ◄──── Web publicada (GitHub Pages)
                   hinebaxynlpjisteuaus
                   (datos reales del bar)
```

- **Un solo Supabase para todo.** El `.env` local y los GitHub Secrets apuntan al mismo proyecto. Cualquier prueba en local escribe en la caja real.
- **El esquema se cambia pegando `.sql` a mano** en el SQL Editor de producción, en un orden que solo está documentado en `CONTEXT.MD` y `README.md`. No hay ensayo previo en un Supabase real (PGlite ayuda mucho, pero no es Supabase).
- **Las pruebas de PGlite no están en el repositorio** y parte se han perdido (ver «Resultado de la revisión»).
- **Sin copias de seguridad.** El plan gratuito de Supabase no hace copias automáticas.
- **El script de precios hace push directo a `main`.** Está obsoleto (la carta se edita en el panel desde P1) y salta cualquier control.
- **Cualquiera con acceso puede hacer push a `main`**, y eso publica la web real.
- **Configuración solo en el panel de Supabase:** Site URL, Redirect URLs, plantillas de correo, SMTP y Google.
- **Había un proyecto viejo** (`eisuyvozingpasbqvrdx`) sin uso, que causó un `401 Invalid API key` por confusión. **Ya está borrado** (2026-11-07, E-D3).
- **No hay Edge Functions:** toda la lógica está en RPC `security definer`. Eso simplifica mucho la separación.

---

## 2. La opción gratuita, explicada

### La idea en una frase

**Dos Supabase en la nube, los dos gratis: uno de PRUEBAS y otro de PRODUCCIÓN (el de siempre).** Y dos webs, las dos en GitHub Pages: la de pruebas y la de verdad. Tu ordenador solo conoce el de pruebas.

### Qué permite el plan gratuito de Supabase

- **2 proyectos activos por cuenta.** Justo los que necesitamos: pruebas y producción. El proyecto viejo ya está borrado, así que la segunda plaza está libre para PRUEBAS.
- **500 MB de base de datos, 50.000 usuarios al mes y 5 GB de tráfico** por proyecto. Para un bar sobra.
- **Pausa tras 7 días sin actividad.** No borra datos; se reanuda desde el panel con un botón.
  - **Pruebas:** si se pausa, no pasa nada. Se reanuda cuando se vaya a probar.
  - **Producción:** con el bar abierto, hay actividad todos los días. Si el bar cierra más de una semana (vacaciones), la copia de seguridad diaria (ver abajo) también genera actividad. Aun así, conviene comprobarlo tras un cierre largo.
- **Sin copias automáticas.** Se suplen gratis con GitHub Actions (ver «Copias de seguridad»).

### Las tres piezas

| Pieza | Dónde | Coste | Para qué |
|---|---|---|---|
| **Tu ordenador** | `npm run dev` | 0 € | Programar. **Siempre conectado a PRUEBAS**, nunca a producción |
| **PRUEBAS** | Supabase `la-alameda-pruebas` + web `…github.io/Laalameda-pruebas/` | 0 € | Probar con datos inventados, también desde el móvil, la tablet o el TPV del bar |
| **PRODUCCIÓN** | Supabase `hinebaxynlpjisteuaus` + web `…github.io/Laalameda/` | 0 € | El bar de verdad. Solo recibe cambios ya probados y con tu aprobación |

**Opcional, también gratis:** Supabase en tu propio ordenador con Docker (`supabase start`). Es lo más cómodo para borrar y empezar de cero en segundos, pero no es imprescindible. **Decidido (E-D4): de momento no se usa; se programa contra PRUEBAS** (pospuesto como E-P4).

### Copias de seguridad gratis

- Un workflow de GitHub Actions programado (cada noche, después del cierre) hace un volcado de la base de datos de producción.
- **El volcado contiene datos personales y de caja**, así que:
  - Se **cifra** con una contraseña que solo está en los GitHub Secrets (y guardada por el usuario fuera de GitHub).
  - Se guarda en un **repositorio privado** aparte (`Laalameda-copias`, gratis), nunca en el repositorio público ni como artifact del público.
  - Se conservan los últimos **30 días**. Para que las antiguas desaparezcan de verdad, la rama de copias se rehace cada noche solo con esas 30 (E-D12).
- **Restaurar** es un procedimiento manual documentado en `COPIAS.md` (descifrar y cargar). Se ensaya una vez **en PRUEBAS**, nunca en producción.
- Es solo lectura sobre producción.
- **Ojo:** GitHub desactiva los workflows programados de un repositorio público tras 60 días sin actividad. `COPIAS.md` explica cómo comprobarlo.

---

## 3. El flujo de trabajo, fácil

### Versión corta: tres casillas

```
   ① TU ORDENADOR        ②  PRUEBAS                 ③  PRODUCCIÓN
   ──────────────        ─────────────────          ─────────────────
   Programas.      ──►   Pruebas en el móvil,  ──►  El bar real.
   Usa PRUEBAS.          tablet y TPV, con          Solo entra lo que
                         datos inventados.          ya funcionó en ②
                                                    y tú apruebas.
   rama de trabajo       rama  staging              rama  main
```

**Regla de oro:** las flechas solo van hacia la derecha. Nada salta de ① a ③. Y los datos reales nunca viajan hacia la izquierda.

### Versión paso a paso

1. **Programar.** En tu rama de trabajo (`pos`, `tickets`, `miguel`…). La web local está conectada a PRUEBAS. Si hay que cambiar la base de datos, se crea un archivo nuevo de migración (sección 4), no se pega SQL a mano.
2. **Subir a pruebas.** Se mezcla la rama en `staging`. GitHub hace solo:
   - aplica las migraciones nuevas al Supabase de PRUEBAS;
   - publica la web de pruebas (con una franja «ENTORNO DE PRUEBAS» bien visible).
3. **Probar.** En la web de pruebas, con los usuarios de prueba (admin, camarero, socios). Se puede vender, cobrar, anular, devolver y cerrar jornada sin miedo. Si los datos se ensucian, botón «Reiniciar pruebas».
4. **Pedir el paso a producción.** Se abre un PR de `staging` a `main`. GitHub comprueba que todo compila y pasan las pruebas, y **enseña qué cambiará en la base de datos real** sin cambiar nada todavía.
5. **Aprobar.** Al mezclar en `main`, GitHub **se para y espera tu aprobación** (un botón en GitHub). Sin tu aprobación, no toca producción.
6. **Publicar.** Tras aprobar, GitHub aplica las migraciones a PRODUCCIÓN y publica la web real. Los datos del bar no se tocan: solo se añade estructura nueva.

### Quién hace cada cosa

| Paso | Tú | GitHub (automático) |
|---|---|---|
| Programar | ✔ (con Claude) | |
| Aplicar cambios de base de datos en PRUEBAS | | ✔ |
| Publicar web de pruebas | | ✔ |
| Probar | ✔ | |
| Comprobar y enseñar qué cambiará en producción | | ✔ |
| **Aprobar el paso a producción** | ✔ | |
| Aplicar cambios en PRODUCCIÓN y publicar | | ✔ |
| Copia de seguridad nocturna | | ✔ |

---

## 3b. Cómo funciona la web de pruebas

### Qué es

Una **copia exacta de la web**, con la misma carta, el mismo panel, el mismo TPV, `#/mesa`, `#/canjear`, etc., pero conectada al Supabase de PRUEBAS. Vive en otra dirección:

| | Dirección | Base de datos |
|---|---|---|
| Web real | `https://rivenliclub25-prog.github.io/Laalameda/` | PRODUCCIÓN |
| Web de pruebas | `https://rivenliclub25-prog.github.io/Laalameda-pruebas/` | PRUEBAS |

Se abre en cualquier móvil, tablet o en el portátil del TPV, con **https** (la cámara para leer QR funciona, sin necesidad de puertos de Codespaces).

### Cómo se publica (todo automático)

```
  push a la rama staging
          │
          ▼
  GitHub Actions (en el repositorio Laalameda)
    1. Aplica las migraciones nuevas al Supabase de PRUEBAS
    2. Construye la web con las claves de PRUEBAS
       y la dirección /Laalameda-pruebas/
    3. Copia la web construida al repositorio Laalameda-pruebas
          │
          ▼
  GitHub Pages de Laalameda-pruebas la publica (1–2 minutos)
```

- **Repositorio `Laalameda-pruebas`:** vacío, público (GitHub Pages gratis exige repositorio público) y **solo contiene la web ya construida**. No hay código fuente que mantener ni secretos: la clave anon de Supabase ya es pública en cualquier web que la use.
- **Permiso para copiar:** una «deploy key» (clave de despliegue) que solo permite escribir en `Laalameda-pruebas`. Se guarda como secreto en el entorno `pruebas` del repositorio principal.
- **La web real no se toca:** publicar pruebas nunca vuelve a publicar `Laalameda`, y al revés.
- **La dirección base** (`/Laalameda/` o `/Laalameda-pruebas/`) ya la pone cada workflow con `--base` al construir; `vite.config.ts` no la fija.

### Cómo se distingue de la real

- **Franja fija arriba «ENTORNO DE PRUEBAS · los datos no son reales»**, en todas las pantallas, también en el TPV a pantalla completa.
- Título de la pestaña con «[PRUEBAS]».
- `noindex`: Google no la muestra.
- **Los QR que genera** (mesas, tickets, `#/qr`) apuntan a la web de pruebas, porque se construyen con la dirección actual. **Nunca imprimir QR de mesas desde la web de pruebas.**

### Cómo se usa

- **Entrar:** con los usuarios de prueba (admin, camarero, socio1, socio2). También se puede crear cuenta, sin confirmación de email (E-D9).
- **Probar:** vender en barra, abrir mesas, pedir desde `#/mesa`, canjear tickets, anular, devolver, cerrar jornada, ver informes. Todo va a PRUEBAS.
- **Si los datos se ensucian:** GitHub → Actions → «Reiniciar pruebas» → *Run workflow*.
- **Si la web de pruebas da error de conexión:** probablemente el Supabase de PRUEBAS se ha pausado por llevar 7 días sin uso. Panel de Supabase → proyecto de pruebas → *Restore*. Tarda unos minutos.

### Cosas a tener en cuenta

- **Mismo dominio que la web real** (`rivenliclub25-prog.github.io`). El navegador comparte el almacenamiento entre las dos, así que la copia de la carta, el carrito o la mesa recordada se guardan con el nombre del entorno delante (sección 5, punto 7). Las sesiones de Supabase ya van separadas.
- **Supabase de PRUEBAS → Authentication → URL Configuration:** Site URL `https://rivenliclub25-prog.github.io/Laalameda-pruebas/` y Redirect URLs de esa dirección y de `http://localhost:5173/**`.
- **Google en pruebas:** se añade la dirección de vuelta del Supabase de PRUEBAS al mismo cliente de Google Cloud. Opcional: se puede dejar Google sin activar en pruebas.

---

## 3c. Llevar una funcionalidad nueva de PRUEBAS a PRODUCCIÓN

### La idea clave

**A producción no se copia la base de datos de pruebas: se repiten los mismos pasos.** Una funcionalidad nueva tiene tres partes, y cada una viaja de una forma:

| Parte | Ejemplo (inventario) | Cómo llega a producción |
|---|---|---|
| **Código de la web** | Pantalla de stock en el panel | Git: PR de `staging` a `main` |
| **Estructura de la base de datos** | Tabla `stock`, función `ajustar_stock()`, permisos | El **mismo archivo de migración** que ya se aplicó en PRUEBAS se aplica en PRODUCCIÓN |
| **Datos** | Las existencias de prueba que metiste para probar | **No viajan.** Se quedan en PRUEBAS |

Por eso la regla es: **todo lo que la funcionalidad necesita tiene que estar en el código o en una migración.** Lo que se haga a mano en el panel de Supabase de PRUEBAS no llega nunca a producción.

### Paso a paso con un ejemplo: inventario

1. **Programar** (en una rama de trabajo, por ejemplo `inventario`, o directamente en `staging`):
   - El código de la pantalla.
   - Una migración nueva: `supabase/migrations/20261115100000_inventario.sql` con la tabla, las funciones y los permisos.
2. **Llevarlo a PRUEBAS:** push a `staging`. GitHub aplica `…_inventario.sql` al Supabase de PRUEBAS y publica la web de pruebas.
3. **Probar** en la web de pruebas. Si algo falla:
   - Error en la pantalla → se corrige el código.
   - Error en la base de datos → **se añade otra migración** que lo corrige (`…_inventario_arreglo.sql`). Las migraciones ya aplicadas no se editan.
   - Se vuelve al paso 2 hasta que todo funcione.
4. **Pedir el paso:** PR de `staging` a `main`. GitHub comprueba que compila y pasan las pruebas, y muestra **qué migraciones se aplicarían en producción**: en el ejemplo, `…_inventario.sql` y `…_inventario_arreglo.sql`. Exactamente las mismas, en el mismo orden, que ya funcionaron en PRUEBAS.
5. **Mezclar y aprobar:** al mezclar en `main`, GitHub espera la aprobación de un colaborador.
6. **Publicar:** GitHub aplica esas migraciones en PRODUCCIÓN y después publica la web. Los datos reales del bar siguen intactos: solo aparece la tabla nueva, vacía.
7. **Preparar los datos reales** (si hacen falta): por ejemplo, el bar mete sus existencias reales desde el panel. Si son datos de partida que siempre deben existir (una categoría nueva, un ajuste por defecto), van dentro de la migración, no a mano.

Supabase apunta en cada proyecto qué migraciones ya tiene, así que cada una se aplica **una sola vez** en cada sitio, aunque se publique muchas veces.

### Qué NO se lleva solo (y cómo se lleva)

| Cambio | Cómo llega a producción |
|---|---|
| Datos editados en el panel de PRUEBAS (carta, promos, mesas) | No llegan. Se repiten en el panel de producción, o en una migración si son imprescindibles |
| SQL pegado a mano en el SQL Editor de PRUEBAS | No llega. **Hay que pasarlo a una migración** antes del PR. El aviso semanal de diferencias ayuda a detectarlo |
| Ajustes del panel de Supabase (Auth, correos, Google) | Se apuntan en la lista de comprobación de `ENTORNOS.md` y se repiten en producción al publicar |
| Secretos nuevos (por ejemplo, una clave de un servicio externo) | Se añaden al entorno `production` de GitHub (y a Supabase si es de una Edge Function) |
| Edge Functions (si algún día hay) | Igual que las migraciones: se despliegan solas en PRUEBAS y, tras la aprobación, en PRODUCCIÓN |

### Si algo sale mal en producción

- **La migración falla:** cada migración se aplica entera o no se aplica. El workflow se para y **la web nueva no se publica**, así que el bar sigue con la versión anterior funcionando. Se corrige en PRUEBAS y se repite el proceso.
- **La web nueva tiene un fallo:** se corrige en `staging` y se vuelve a pasar. Para algo urgente, un PR de `staging` a `main` con solo el arreglo.
- **Un cambio de datos salió mal:** se arregla con otra migración. En el peor caso, la copia de seguridad nocturna (E-D7).
- **Nunca se deshace a mano en producción.** Siempre hacia delante: arreglo en PRUEBAS → aprobación → producción.

### Para que el paso sea seguro

- Las migraciones **añaden** antes de **quitar** (sección 4). Así la web vieja sigue funcionando durante el minuto en que la base de datos ya es nueva y la web aún no.
- `staging` y `main` no se separan mucho: mejor pasar a producción funcionalidades pequeñas y a menudo que muchas juntas.
- Después de cada paso a producción, `main` se mezcla en `staging` para que las dos ramas sigan iguales.

---

## 4. Cambios de base de datos: migraciones

### Qué cambia

- **Hoy:** archivos `.sql` sueltos que se pegan a mano, en orden, en producción. El orden real está en `README.md`: `schema`, `admin`, `tickets`, `google-auth`, `catalogo`, `catalogo-codigos`, `pos`, `pos-mesas`, `pos-pedidos`, `pos-promos`, `pos-pedir-sin-qr` y `pos-informes`; después, `promos-clasico` cuando tocó, y una sola vez `pos-limpieza-pruebas` (2026-11-02, antes de vender de verdad).
- **Propuesta:** la **CLI de Supabase** con la carpeta `supabase/migrations/`. Cada cambio es un archivo nuevo con fecha (`20261110120000_stock.sql`). Supabase apunta en cada proyecto qué archivos ya ha aplicado, así que nunca se aplica uno dos veces ni se salta uno.
- Los `.sql` actuales se mueven a `supabase/legacy/` como historia. No se borran.

### Cómo se arranca sin tocar los datos reales (fase E1)

1. Se **copia la estructura** actual de producción (tablas, funciones, políticas, permisos, Realtime), **sin datos**. Es solo lectura.
2. Esa copia es la **migración base**. Se aplica en PRUEBAS y se compara con producción hasta que sean idénticas.
3. Se le dice a producción «esta migración base ya la tienes» (`supabase migration repair`). **Esto no ejecuta nada sobre tus tablas**: solo crea la tabla de control de Supabase (`supabase_migrations.schema_migrations`) con una fila. Es lo único que se escribe en producción en todo el plan, y se hace con tu aprobación.

### Reglas para las migraciones nuevas

- **Siempre compatibles con la versión anterior de la web:** primero se añade (columna, tabla, función nueva), y solo en una migración posterior se quita lo viejo. Así no se rompe nada entre que se migra la base de datos y se publica la web.
- **Nada de borrar ni reescribir datos reales** en una migración sin una decisión explícita en este documento.
- **Permisos explícitos en cada migración.** Supabase da por defecto **todos** los permisos a `anon` y `authenticated` sobre cada tabla, función o secuencia nueva de `public`. Cada migración que cree algo tiene que quitarlos y dar solo los necesarios (`revoke all … from anon, authenticated;` y luego los `grant` justos), como hacían los `.sql` antiguos. Lo descubrió `comparar` el 2026-11-09 (ver E1b).
- **Nunca se cambia el esquema a mano en el panel de producción.** Un workflow semanal compara producción con las migraciones y avisa si alguien lo ha hecho.
- **Cada migración se prueba aplicándola primero en el Supabase de PRUEBAS** (un Supabase real). Las pruebas de PGlite no se mantienen (E-D16, cambiada el 2026-11-08).

### Edge Functions

Hoy no hay. Si llegan, irán en `supabase/functions/` y se desplegarán en los mismos pasos que las migraciones (primero PRUEBAS, después PRODUCCIÓN con aprobación). Sus secretos se guardan por entorno.

---

## 5. Seguridad: que sea imposible equivocarse de base de datos

1. **Las claves de producción salen de tu ordenador.** Tu `.env` local apunta a PRUEBAS. Las de producción solo están en GitHub, en el entorno `production`.
2. **Guarda en el código** (`src/lib/supabase.ts`):
   - Variable nueva `VITE_APP_ENV` = `local`, `pruebas` o `produccion`.
   - El identificador de producción (`hinebaxynlpjisteuaus`, que es público) se escribe en el código.
   - Si el entorno **no** es producción y la URL es la de producción → la web no arranca y explica por qué.
   - Si el entorno **es** producción y la URL no es la de producción → el build falla.
3. **GitHub Environments** (gratis en repositorios públicos):
   - `pruebas`: sus propias claves, despliegue automático desde `staging`.
   - `production`: sus propias claves, **solo desde `main` y con la aprobación de un colaborador del repositorio** (E-D10).
     - *Settings → Environments → production → Required reviewers*: se añaden por nombre los colaboradores que pueden aprobar (hasta 6). Tu cuenta incluida.
     - Se deja **permitido aprobar tus propios cambios** (no se marca «Prevent self-review»): si no, cuando trabajes solo nadie podría aprobar.
     - *Deployment branches*: solo `main`.
   - Los secretos de las **copias de seguridad** no van aquí (E-D15).
4. **`main` protegida:** los cambios entran solo por PR. Requiere retirar antes el script de precios (que hace push directo). Hasta entonces, nadie hace push directo a `main` (E-D17).
5. **La CLI de tu ordenador solo se enlaza con PRUEBAS.** La contraseña de la base de datos de producción solo la tiene GitHub.
6. **Franja visible «ENTORNO DE PRUEBAS»** en toda la web de pruebas, y `noindex` para que Google no la indexe.
7. **Datos del navegador separados por entorno.** Las dos webs están en el mismo dominio (`rivenliclub25-prog.github.io`), así que se pisarían. Claves que hay hoy (en producción se mantienen los nombres actuales; en los demás entornos llevan el entorno delante):

   | Clave | Dónde | Qué guarda |
   |---|---|---|
   | `alameda-catalogo-v1` | localStorage | Copia de la carta |
   | `alameda-canjear-sonido` | localStorage | Sonido del canje y del TPV |
   | `alameda-mesa-carrito-<mesa>` | sessionStorage | Carrito de `#/mesa` |
   | `alameda-mesa-elegida` | sessionStorage | Mesa recordada de `#/pedir` |
   | `alameda-google-login` | sessionStorage | Marca de vuelta de Google |

   Las sesiones de Supabase no tienen ese problema: su clave ya incluye el identificador del proyecto.
8. **`catalog-snapshot`** lee del Supabase de su propio entorno.

---

## 6. Datos de prueba (sin datos personales reales)

- **`supabase/seed.sql`:** carta, promos, franjas, mesas 1–4 y ajustes de la jornada.
- **Usuarios de prueba** con correos inventados: `admin@prueba…`, `camarero@prueba…`, `socio1@prueba…`, `socio2@prueba…`. Se crean con un script.
- **Ventas ficticias opcionales** de varios días, para probar cierres e informes.
- **«Reiniciar pruebas»:** workflow que se lanza a mano en GitHub. Vacía ventas, cuentas, tickets y cierres **de PRUEBAS** y vuelve a cargar los datos de prueba. Lleva la misma guarda: se niega a ejecutarse contra producción.
- **«Copiar carta a pruebas»:** lee la carta pública de producción (con la misma llamada que usa la web, solo lectura) y la escribe en PRUEBAS. **Solo en ese sentido, y nunca socios, ventas ni tickets.**
- **Correos en PRUEBAS:** sin confirmación de email (E-D9). Los correos de recuperación de contraseña usan el SMTP por defecto de Supabase, muy limitado pero suficiente para alguna prueba suelta.
- **Google en PRUEBAS:** se añade la dirección de vuelta del proyecto de pruebas al mismo cliente de Google Cloud, y se activa el proveedor en el proyecto de pruebas.

---

## 7. Comparativa de planes (para el futuro)

Precios consultados el 2026-11-07, en dólares. **Comprobar en https://supabase.com/pricing antes de decidir:** cambian.

### Supabase

| Opción | Coste aproximado | Qué da | Qué no da | Cuándo tiene sentido |
|---|---|---|---|---|
| **Gratis (propuesta actual)** | 0 $ | 2 proyectos activos, 500 MB, 50.000 usuarios/mes, 5 GB de tráfico | Copias automáticas (se suplen con Actions), sin pausa garantizada tras 7 días sin uso, soporte | Ahora |
| **Pro solo para producción** (pruebas en una organización gratis aparte) | 25 $/mes | Copias diarias con 7 días de retención, sin pausa, 8 GB, 100.000 usuarios/mes, soporte por email. Incluye 10 $ de cómputo, que cubre un proyecto Micro | Restaurar a un minuto exacto (es un extra) | Cuando haya presupuesto. **Es la primera mejora recomendada** |
| **Pro con pruebas en la misma organización** | ~35 $/mes | Lo mismo, con todo en un sitio | | Si molesta tener dos organizaciones. El segundo proyecto paga su propio cómputo (~10 $/mes) |
| **Pro + Branching** | 25 $/mes + ~0,01344 $/h por rama abierta (~0,32 $/día) | Una base de datos temporal por cada PR, creada desde las migraciones y `seed.sql` | No copia datos de producción. El cómputo de las ramas no lo cubre el crédito | Si un día trabajan varias personas a la vez en cambios distintos |
| **Team** | 599 $/mes | Certificaciones (SOC 2…), SSO, copias de 14 días | | No aplica a un bar |

### Web de pruebas

| Opción | Coste | Pros | Contras |
|---|---|---|---|
| **Segundo repositorio con GitHub Pages (propuesta)** | 0 $ | Todo en GitHub, despliegues independientes | Mismo dominio que la web real (se resuelve con la guarda 7) |
| Subcarpeta en el mismo Pages | 0 $ | Sin repositorio nuevo | Cada publicación de pruebas vuelve a publicar la real y al revés. **Descartada** |
| Cloudflare Pages / Netlify | Gratis con límites | Dominio propio de pruebas y una vista previa por cada PR | Herramienta nueva que aprender |

### Copias de seguridad

| Opción | Coste | Notas |
|---|---|---|
| **Volcado nocturno cifrado con Actions a un repo privado (propuesta)** | 0 $ | Hay que ensayar la restauración una vez en PRUEBAS |
| Copias diarias de Supabase Pro | Incluidas en Pro | Restauración desde el panel con un botón |
| Restauración a un minuto exacto (PITR) | Extra sobre Pro (consultar precio) | Solo si un día se necesita no perder ni una venta |

---

## 8. Registro de decisiones

### Decididas

#### E-D1 — Presupuesto
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** no hay presupuesto. Todo se hace con planes gratuitos. Los planes de pago quedan comparados en la sección 7.

#### E-D2 — Producción es intocable
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** los datos de producción son reales. No se ejecutan scripts de limpieza ni nada que borre o modifique datos de producción.

#### E-D11 — Opción elegida
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** la **opción gratuita** de la sección 2: **dos proyectos de Supabase en la nube, los dos en el plan gratuito**:
  - **PRODUCCIÓN:** el actual, `hinebaxynlpjisteuaus`, con los datos reales del bar.
  - **PRUEBAS:** un proyecto nuevo, solo con datos inventados.
- **Consecuencias:**
  - Ocupan las dos plazas gratuitas de la cuenta. El proyecto viejo (`eisuyvozingpasbqvrdx`) ya está borrado (E-D3).
  - Las copias de seguridad de producción se hacen con GitHub Actions (E-D7), porque el plan gratuito no las incluye.
  - El flujo es el de la sección 3: tu ordenador → PRUEBAS → PRODUCCIÓN, con aprobación antes de producción.

#### E-D4 — Dónde se programa
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** en local, la web se conecta al Supabase de **PRUEBAS** en la nube. No se usa Supabase local con Docker por ahora (E-P4).
- **Consecuencia:** las pruebas de desarrollo y las de validación comparten la base de datos de PRUEBAS. Si se ensucia, se usa «Reiniciar pruebas» (sección 6).

#### E-D3 — Proyecto viejo
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** el usuario ya ha borrado `eisuyvozingpasbqvrdx` (fue un error crearlo). El proyecto nuevo se llamará `la-alameda-pruebas`.

#### E-D6 — Rama de pruebas
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** la rama se llama **`staging`**. Lo que entra en `staging` se publica en PRUEBAS; lo que entra en `main`, en PRODUCCIÓN (con aprobación). **Creada el 2026-11-07 desde `main` (`28a7de8`).**

#### E-D8 — Script de precios
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** se **retira** en E0: `Actualizar precios.bat`, `scripts/publish-prices.ps1`, `scripts/sync-prices.mjs` y su script de `package.json`. La carta y los precios se editan solo en el panel. Así se puede proteger `main`. Lo que queda (`prices.generated.ts`), ver E-D14.

#### E-D9 — Correos en PRUEBAS
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** PRUEBAS es sobre todo para el POS, así que **sin confirmación de email**: las cuentas nuevas entran al momento. Se desactiva en el Supabase de PRUEBAS (*Authentication → Sign In / Providers → Email → Confirm email*). Producción no cambia.

#### E-D10 — Quién aprueba el paso a producción
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** lo aprueban los **colaboradores del repositorio** que se añadan como revisores del entorno `production`. La cuenta del usuario tiene acceso. Se permite aprobar los propios cambios (sección 5, punto 3).

#### E-D5 — Web de pruebas
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** segundo repositorio público **`Laalameda-pruebas`** con GitHub Pages, publicado automáticamente desde la rama `staging` del repositorio principal (sección 3b). Dirección: `https://rivenliclub25-prog.github.io/Laalameda-pruebas/`.

#### E-D7 — Copias de seguridad
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** volcado nocturno de producción con GitHub Actions, **cifrado** y guardado en un repositorio **privado** `Laalameda-copias`. Se conservan **30 días** (E-D12). Restauración documentada en `COPIAS.md` y ensayada solo en PRUEBAS.
- **Cómo se hace** (resuelto en la revisión de E0):
  - **Conexión:** el plan gratuito da la conexión directa a la base de datos solo por IPv6, y los runners de GitHub no tienen IPv6. Se usa la cadena del **pooler en modo sesión** (Supabase → *Connect* → *Session pooler*).
  - **Volcado:** con la CLI de Supabase (`supabase db dump`), que usa por dentro la versión de Postgres del proyecto. Tres archivos: roles, estructura y datos.
  - **Cifrado:** `gpg --symmetric` con AES-256, que viene instalado en los runners y funciona sin que nadie escriba nada. La contraseña está en un secreto. **Si se pierde la contraseña, las copias no sirven:** el usuario la guarda también fuera de GitHub.
  - **Hora:** cada día a las **05:00 UTC** (06:00 en Madrid en invierno, 07:00 en verano), después del cierre (`hora_cierre` 03:00). Los cron de GitHub pueden retrasarse unos minutos.
  - **Rama por defecto:** los workflows programados solo se ejecutan desde `main`: el de copias tiene que estar en `main` para funcionar.
  - **60 días sin actividad:** GitHub desactiva los workflows programados de un repositorio público sin actividad durante 60 días. `COPIAS.md` explica cómo comprobarlo y reactivarlo.

#### E-D12 — Cómo se conservan solo 30 días de copias
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** cada noche, la rama de `Laalameda-copias` se **rehace desde cero** con solo las últimas 30 copias (un único commit y *force push*, solo en ese repositorio). Así las copias antiguas desaparecen de verdad, también del historial.
- **Por qué:** en git, borrar un archivo no lo borra del historial: las copias con datos personales se quedarían para siempre y el repositorio crecería sin parar.

#### E-D13 — Bloqueo de `pos-limpieza-pruebas.sql`
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** se le añade al principio un bloqueo que lo hace fallar al instante si alguien lo pega en el SQL Editor. Se usó una sola vez (2026-11-02) y no debe repetirse (E-D2). En E1 se mueve a `supabase/legacy/` con el resto.

#### E-D14 — Restos del Excel
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** en E0 se quitan `fflate` y `fast-xml-parser` (solo los usaba `sync-prices.mjs`). `src/data/prices.generated.ts` se queda hasta la fase L de `POS.md`, porque `src/data/site.ts` todavía lo importa.

#### E-D15 — Dónde van los secretos de las copias
- **Estado:** 🟢 Decidida (2026-11-07)
- **Decisión:** como **secretos del repositorio** (`BACKUP_DB_URL`, `BACKUP_PASSPHRASE`, `COPIAS_DEPLOY_KEY`), no en el entorno `production`. Si estuvieran en `production`, cuando ese entorno pida aprobación (E5), la copia nocturna se quedaría esperando a que alguien la aprobara.

#### E-D16 — Pruebas de PGlite
- **Estado:** 🟢 Decidida (2026-11-07) · **cambiada el 2026-11-08**
- **Decisión (2026-11-08):** **no se recuperan ni se reescriben** las pruebas de PGlite: el usuario no lo ve necesario. La comprobación de la base de datos pasa a ser **aplicar las migraciones en el Supabase de PRUEBAS** (un Supabase real) y probar allí. El CI de E5 se queda en typecheck, lint, build, comprobación de entorno y las migraciones pendientes.
- *Decisión anterior (2026-11-07, sustituida):* traerlas al repositorio en E1 y reescribir las perdidas.

### Pendientes

#### E-D20 — Paso a producción (E5)
- **Estado:** 🟢 Decidida (2026-11-10), con las recomendaciones de Claude.
- **Decisiones:**
  - Se pide aprobación en **cada** publicación de la web real, aunque no haya migraciones.
  - Las migraciones de producción usan la misma conexión de las copias (`BACKUP_DB_URL`): un secreto aparte tendría el mismo valor; lo que protege es la aprobación.
  - Qué cambiaría en producción se muestra en el **resumen** del PR (sin comentarios, sin más permisos).
  - Al publicar, `staging` se pone al día con `main` automáticamente (si no tiene cambios propios).
  - Primer cambio real: quitar a `anon`/`authenticated` los permisos sobrantes de `profiles` (`TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN`). **Va en un PR aparte, después de E5**, para que recorra el camino completo (si fuera en el PR de E5 llegaría a producción sin pasar por PRUEBAS).

#### E-D18 — Cómo se trabaja con las bases de datos en E1
- **Estado:** 🟢 Decidida (2026-11-08)
- **Decisión:** las operaciones con bases de datos de E1 las hace un **workflow manual** de GitHub (`.github/workflows/estructura.yml`), no un ordenador: leer la estructura de producción necesita Docker y la contraseña de producción (solo está en GitHub), y `supabase link` exigiría un token personal que también da acceso a producción.
- **Consecuencia:** E1 se divide en **E1a** (solo el workflow, porque GitHub solo deja lanzar a mano workflows que ya están en `main`) y **E1b** (lo demás).
- **Secretos:** `BACKUP_DB_URL` (del repositorio, ya existe) para leer producción; `PRUEBAS_DB_URL` en el entorno `pruebas` (sin revisores) para PRUEBAS.

#### E-D19 — Secretos de producción hasta E5
- **Estado:** 🟢 Decidida (2026-11-09)
- **Decisión:** los secretos de la web real (`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` de producción) **se quedan como secretos del repositorio**. No se mueven al entorno `production`, como decía la sección 5. **Confirmado en E5 (2026-11-10):** la construcción no puede usar a la vez el entorno `production` y el de GitHub Pages, y esas claves ya son públicas en la web; lo que protege producción es la aprobación del entorno `production` antes de migrar y publicar.
- **Por qué:** `deploy.yml` usa el entorno `github-pages` (obligatorio para GitHub Pages); moverlos ahora rompería la publicación de la web real. En E5 se reorganiza junto con la aprobación.
- Los de PRUEBAS sí van en el entorno `pruebas`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `PRUEBAS_DEPLOY_KEY` y `PRUEBAS_DB_URL`.

#### E-D17 — Push directo a `main` hasta E5
- **Estado:** 🟢 Resuelta en E5 (2026-11-10): `main` protegida (solo por PR con las comprobaciones en verde), activada por el usuario.
- **Propuesta:** hasta que `main` esté protegida (E5), **nadie hace push directo a `main`**: cada uno trabaja en su rama (`miguel`, `miguel2`, `e0-preparar`…) y entra en `main` con un PR que mezcla el usuario. Hay que avisar al compañero.
- **Por qué:** el 2026-11-06 hubo un push directo a `main` desde otro ordenador (`28a7de8`), y cada push a `main` publica la web real.

### Pospuestas

| Id | Tema | Por qué |
|---|---|---|
| E-P1 | Supabase Pro para producción | Sin presupuesto (E-D1). Primera mejora cuando lo haya |
| E-P2 | Branching (una base de datos por PR) | De pago y no hace falta con una sola persona programando |
| E-P3 | Dominio propio | No pedido |
| E-P4 | Supabase local con Docker | Se programa contra PRUEBAS (E-D4). Útil si un día PRUEBAS se queda corto o trabajan varias personas |

---

## 9. Plan por fases

**Hasta terminar E2, la regla es: no se hacen pruebas contra producción** (ni en local ni en la web publicada).

Resumen:

| Fase | En una frase | Toca producción |
|---|---|---|
| **E0** | Retirar el script de precios y poner en marcha las copias de seguridad | Solo lectura (la copia) |
| **E1** | Crear el Supabase de PRUEBAS con la misma estructura que producción, gestionada con migraciones | Lectura + tabla de control de migraciones (con aprobación) |
| **E2** | La web sabe en qué entorno está y no puede conectarse a producción por error | No |
| **E3** | Web de pruebas publicada desde `staging` | No |
| **E4** | Datos y usuarios de prueba, «Reiniciar pruebas» | Solo lectura de la carta pública |
| **E5** | Paso a producción con CI, migraciones automáticas y aprobación | Sí, solo con aprobación |
| **E6** | Guía final y ensayo de restauración | No |

En cada fase: **🤖 Claude** = lo que programa Claude Code; **🙋 Usuario** = lo que hace el usuario en Supabase o GitHub (Claude le da los pasos exactos, diciendo qué pulsar).

### E0 — Preparar

- **Ramas:** el trabajo va en `e0-preparar` (desde `main`). `staging` ya está creada y subida, sin cambios.
- **🤖 Claude:**
  - ✅ Revisión del repositorio («Resultado de la revisión»).
  - ✅ Rama `staging` creada desde `main` actualizado.
  - ✅ Este documento en el repositorio (`ENTORNOS.md`).
  - ✅ Retirar el script de precios (E-D8): `Actualizar precios.bat`, `scripts/publish-prices.ps1`, `scripts/sync-prices.mjs`, el script `sync-prices` de `package.json` y las dependencias `fflate` y `fast-xml-parser` (E-D14).
  - ✅ Quitar las instrucciones del Excel de `GUIA-EDICION.md`, `README.md` y `CONTEXT.MD`; en `POS.md`, solo las instrucciones (el historial no se toca).
  - ✅ Bloqueo al principio de `supabase/pos-limpieza-pruebas.sql` (E-D13). Probado en PGlite: falla con «BLOQUEADO» y no borra nada.
  - ✅ `.github/workflows/backup.yml` (E-D7, E-D12, E-D15): a las 05:00 UTC y a mano (`workflow_dispatch`); volcado de roles, estructura y datos con la CLI de Supabase por el session pooler; cifrado con `gpg`; subida a `Laalameda-copias` con la deploy key, rehaciendo la rama con las últimas 30; sin mostrar secretos.
  - ✅ `COPIAS.md` (con los pasos exactos para el usuario): qué contiene una copia, cómo descifrarla, cómo restaurarla **solo en PRUEBAS**, y qué revisar si dejan de llegar (incluida la regla de los 60 días).
- **🙋 Usuario:**
  - Crear el repositorio **privado** `Laalameda-copias` (vacío).
  - Crear una deploy key con escritura en `Laalameda-copias` y guardar la parte privada como secreto `COPIAS_DEPLOY_KEY` del repositorio principal.
  - Guardar como secretos del repositorio principal: `BACKUP_DB_URL` (cadena del **session pooler** de producción, con la contraseña de la base de datos) y `BACKUP_PASSPHRASE` (y guardarla también fuera de GitHub).
  - Abrir y mezclar el PR de `e0-preparar` a `main` (el workflow programado solo funciona en `main`). Es seguro: no cambia la web ni la base de datos.
  - Lanzar la primera copia a mano y comprobar que aparece en `Laalameda-copias`.
  - Decidir E-D17 y avisar al compañero.
- **Hecha cuando:** el script de precios ya no existe, la web publicada sigue igual y hay una primera copia cifrada en `Laalameda-copias`.
- **✅ Cerrada (2026-11-08):** PR #1 (E0) y PR #2 (versión fija de la CLI, 2.122.0) mezclados en `main`. Primera copia: `copia-2026-11-08_1911.tar.gz.gpg`. Notas: la base de datos de producción es **Postgres 17** (imagen `supabase/postgres:17.11.0.006`) y está en **eu-west-1** (Irlanda, por el host del pooler). La primera conexión falló por la contraseña de `BACKUP_DB_URL`; se resolvió con una contraseña nueva solo de letras y números.

### E1 — PRUEBAS en Supabase

Se divide en **E1a** y **E1b** (E-D18).

- **Proyecto de PRUEBAS (✅ 2026-11-08):** `la-alameda-pruebas`, identificador **`hrhhkzajweggpnupytms`**, URL `https://hrhhkzajweggpnupytms.supabase.co`. La clave anon la tiene el usuario (es pública, pero no se guarda en el repositorio: va al `.env` local y a los secretos del entorno `pruebas`). Producción está en **eu-west-1** y con **Postgres 17**: PRUEBAS, igual.

#### E1a — Workflow «Estructura de la base de datos»

- **🤖 Claude:** `.github/workflows/estructura.yml`, manual, con cuatro acciones:

  | Acción | Qué hace | Escribe en |
  |---|---|---|
  | `leer-produccion` | Copia **solo la estructura** de producción como `supabase/migrations/<fecha>_base.sql` y la guarda en la rama desde la que se lanza (nunca desde `main`). En el resumen enseña los triggers de `auth.users` y las tablas de Realtime, que el volcado no incluye | Nada en producción |
  | `aplicar-pruebas` | `supabase db push` de la rama elegida al Supabase de PRUEBAS | Solo PRUEBAS (se niega si la conexión es la de producción) |
  | `comparar` | Estructura de producción frente a la de PRUEBAS, con las diferencias en el resumen | Nada |
  | `marcar-produccion` | `migration repair` de la migración base en producción. Exige escribir `SI-PRODUCCION` | Solo la tabla de control de migraciones |

- **🙋 Usuario:** entorno `pruebas` con el secreto `PRUEBAS_DB_URL` (Session pooler de PRUEBAS); mezclar el PR de `e1-pruebas`.

#### E1b — Migraciones

- **🙋 Usuario (antes):** nada más; los datos de PRUEBAS ya están.
- **🤖 Claude:**
  - `supabase init` → `supabase/config.toml`.
  - Mover los `.sql` actuales a `supabase/legacy/`, con un `README` que explique el orden en que se aplicaron (sección 4).
  - Preparar el comando (o un workflow manual) que **lee solo la estructura** de producción (`supabase db dump`, sin datos) y genera `supabase/migrations/<fecha>_base.sql`. Revisar que incluye esquema `public`, funciones, triggers, políticas RLS, permisos (`grant`), publicación de Realtime y lo que se haya tocado en `auth` (el trigger `on_auth_user_created`).
  - Aplicar la migración base en PRUEBAS (`supabase link` **solo con PRUEBAS** + `supabase db push`) y comparar con producción hasta que no haya diferencias.
  - Lista de ajustes del panel de Supabase de PRUEBAS (sección 3b): URLs, sin confirmación de email (E-D9), Google opcional.
  - Las acciones de base de datos las lanza el usuario con el workflow de E1a, en este orden: `leer-produccion` (desde la rama de E1b) → revisión de Claude (completar lo que el volcado no incluye) → `aplicar-pruebas` → `comparar` hasta que salga «Iguales».
  - Sin pruebas de PGlite (E-D16, cambiada).
- **🙋 Usuario (al final, con aprobación explícita):** acción `marcar-produccion` (`supabase migration repair --status applied <fecha>`). **No ejecuta la migración:** solo apunta que producción ya la tiene.
- **Hecha cuando:** PRUEBAS tiene exactamente la estructura de producción («Iguales» en `comparar`) y producción figura con la migración base aplicada.
- **Avance (2026-11-09):**
  - `leer-produccion` ✅: el resumen confirmó el trigger `on_auth_user_created` y las tablas de Realtime `order_items`, `orders` y `tickets`, que se añadieron a mano al final de la migración base, junto con la fila de `app_settings`.
  - `aplicar-pruebas` ✅ y primer `comparar`: **184 líneas de diferencia**, todas de permisos. En PRUEBAS, `anon` y `authenticated` tenían todos los permisos por defecto de Supabase sobre tablas y funciones internas (en producción se quitaron con los `.sql` antiguos y el volcado no recoge lo quitado). Arreglo: migración nueva `20261109094300_permisos_como_produccion.sql`, generada a partir de la base: quita todo a `anon`/`authenticated` y devuelve exactamente lo de producción (20 tablas, 4 secuencias, 65 funciones). En producción no cambia nada.
  - Diferencia que se acepta: `public.rls_auto_enable()`, que Supabase crea solo en los proyectos nuevos (activa RLS en las tablas nuevas). No es nuestra.
  - **Cierre (2026-11-09):** tercer `comparar` → **✅ Iguales**. `marcar-produccion` → «Producción: migración base 20261108194540 marcada como aplicada». En producción queda pendiente `20261109094300_permisos_como_produccion.sql`, a propósito: se aplicará en E5 y no cambia nada (producción ya tiene esos permisos).
  - Segundo `comparar` (tras la migración de permisos): **solo diferencias de orden** (mismos `GRANT` en otro orden) y `rls_auto_enable`. `comparar` se mejora: compara sin tener en cuenta el orden de las líneas, aparta `rls_auto_enable` y enseña solo las líneas que están en un lado y no en el otro.
  - **Para revisar más adelante (no se toca ahora):** en producción, `anon` y `authenticated` tienen `TRUNCATE` sobre `profiles` (permiso por defecto de Supabase que nunca se quitó). La API (PostgREST) no permite `TRUNCATE`, así que no se puede usar desde la web, pero conviene quitarlo con una migración cuando exista el paso a producción (E5).

### E2 — Web por entornos

- **✅ Cerrada (2026-11-09):** probada por el usuario (`.env` local en PRUEBAS, franja, guarda) y mezclada en `main` (PR #5). `staging` puesta al día.
- **Estado (2026-11-09):** plan aprobado con las recomendaciones (sin `VITE_APP_ENV` = `local`; la copia de la carta sigue en E4). Programado en la rama `e2-entornos`:
  - `src/lib/entornoReglas.ts` (reglas sin dependencias, compartidas con `vite.config.ts`) y `src/lib/entorno.ts` (`entorno`, `esProduccion`, `storageKey()`).
  - Guarda en `src/lib/supabase.ts` (`bloqueoEntorno`) y en `vite.config.ts` (no arranca `npm run dev` ni se construye con una combinación incorrecta). Probado: `.env` local con producción → bloqueado; `produccion` + producción → construye sin `noindex`; `pruebas` + PRUEBAS → construye con `noindex` y «[PRUEBAS]»; `produccion` + PRUEBAS → bloqueado; valor mal escrito → bloqueado.
  - `src/components/Entorno.tsx`: aviso fijo arriba (pastilla centrada que no tapa clics, también en el TPV a pantalla completa) y pantalla de bloqueo. Título con «[LOCAL]» o «[PRUEBAS]».
  - Claves del navegador con `storageKey()` (producción conserva los nombres de siempre).
  - `deploy.yml` construye con `VITE_APP_ENV=produccion`; `.env.example` con los tres entornos; README actualizado.
  - `scripts/check-env.mjs` no hace falta: la comprobación está en `vite.config.ts`, que se ejecuta en cada `npm run dev` y `npm run build`.

- **🤖 Claude:**
  - `VITE_APP_ENV` (`local`, `pruebas`, `produccion`) y la guarda de `src/lib/supabase.ts` (sección 5, punto 2).
  - `scripts/check-env.mjs`: la misma comprobación antes del build.
  - La ruta base ya la pone cada workflow con `--base`: solo hay que pasar `/Laalameda-pruebas/` en el de pruebas (por defecto, `/Laalameda/`).
  - Prefijo de entorno en las claves de `localStorage`/`sessionStorage` (sección 5, punto 7). En producción se mantienen los nombres actuales, para no perder lo ya guardado en los navegadores de los clientes.
  - Franja «ENTORNO DE PRUEBAS», «[PRUEBAS]» en el título y `noindex` fuera de producción.
  - `catalog-snapshot` lee del Supabase del entorno del build.
  - `.env.example` con los tres entornos explicados.
- **🙋 Usuario:** cambiar su `.env` local a PRUEBAS y comprobar que `npm run dev` muestra la franja y lee PRUEBAS.
- **Hecha cuando:** en local la web funciona contra PRUEBAS, y poner a mano la URL de producción en el `.env` local hace que la web no arranque.

### E3 — Web de PRUEBAS

- **✅ Cerrada (2026-11-09):** PR #7 mezclado; `staging` puesta al día con `main`; primera publicación correcta (rama `gh-pages` de `Laalameda-pruebas`); Pages activado por el usuario. La web de pruebas muestra la pastilla «Entorno de pruebas», «[PRUEBAS]» en el título y la carta vacía (sin datos hasta E4).
- **Estado (2026-11-09):** plan aprobado con las recomendaciones (E-D19; se publica en cada push a `staging` y a mano; carta vacía hasta E4). Programado en la rama `e3-web-pruebas`:
  - `.github/workflows/deploy-pruebas.yml`: solo desde `staging`; comprueba que los secretos son los de PRUEBAS; copia de la carta desde PRUEBAS (si falla, la de la web de pruebas, nunca la de la real); construye con `VITE_APP_ENV=pruebas` y `--base=/Laalameda-pruebas/`; sube `dist` a `Laalameda-pruebas` (rama `gh-pages` rehecha en cada publicación, con `.nojekyll`). Probado en local: construye con la ruta `/Laalameda-pruebas/`, `noindex` y «[PRUEBAS]».

- **🙋 Usuario:**
  - Crear el repositorio público `Laalameda-pruebas` y activar Pages (*Deploy from a branch → gh-pages*).
  - Deploy key con escritura en `Laalameda-pruebas`.
  - En el repositorio principal, crear los GitHub Environments `pruebas` y `production` con sus secretos (sección 5, punto 3). Los de producción son los que hoy están como secretos del repositorio (los de las copias se quedan como secretos del repositorio, E-D15).
  - En el Supabase de PRUEBAS, las URLs de la web de pruebas.
- **🤖 Claude:** `.github/workflows/deploy-pruebas.yml`: en cada push a `staging`, construye con el entorno `pruebas` y publica en `Laalameda-pruebas`.
- **Hecha cuando:** un push a `staging` publica la web de pruebas con la franja, y la web real no cambia.

### E4 — Datos de prueba

- **✅ Cerrada (2026-11-09):** PR mezclado; el usuario lanzó `copiar-carta`, `crear-usuarios` y `reiniciar` sin errores (los correos `@prueba.test` se aceptaron) y comprobó los datos en la web de pruebas.
- **Estado (2026-11-09):** plan aprobado con las recomendaciones (carta copiada de la pública; correos `@prueba.test`; sin ventas ficticias por ahora; `reiniciar` borra también los tickets pero no la carta ni los usuarios). Programado en la rama `e4-datos-prueba`:
  - `.github/workflows/pruebas-datos.yml` (manual, entorno `pruebas`): `copiar-carta`, `crear-usuarios` y `reiniciar`. Antes de nada comprueba que `PRUEBAS_DB_URL` y `VITE_SUPABASE_URL` son de PRUEBAS y no de producción.
  - `scripts/pruebas/carta-a-sql.mjs`: lee el `catalogo.json` público de la web real (sin claves: en el entorno `pruebas` los secretos tapan a los del repositorio con el mismo nombre, así que no se usan claves de producción) y genera SQL que **actualiza sin borrar** (lo que ya no está, se oculta). Limitación: la copia está tan al día como la última publicación de la web real.
  - `scripts/pruebas/crear-usuarios.mjs`: registra los usuarios con la clave anon de PRUEBAS y prepara el SQL de roles. Alternativa si Supabase rechaza `@prueba.test`: secreto opcional `PRUEBAS_USUARIOS_EMAIL` (`nombre+admin@dominio`…).
  - `supabase/pruebas/reiniciar.sql` + `supabase/seed.sql` (mesas 1–4 y ajustes), en una sola transacción.
  - Comprobado en local con PGlite (sin guardarlo en el repositorio, E-D16): la carta de PRUEBAS sale idéntica a la pública (71 productos, mismos precios y promos), copiar dos veces no duplica, `reiniciar` vacía ventas y conserva carta y usuarios, la numeración vuelve a 1 y la protección de las ventas sigue activa.

- **🤖 Claude:**
  - `supabase/seed.sql` (carta, promos, franjas, mesas 1–4, ajustes) y `scripts/pruebas-usuarios.mjs` (admin, camarero, socio1, socio2, con contraseñas que no se escriben en el repositorio).
  - `scripts/pruebas-ventas.mjs` (opcional): varios días de ventas ficticias para probar cierres e informes.
  - `scripts/carta-a-pruebas.mjs`: copia la carta pública de producción (lectura con `catalogo()`) a PRUEBAS.
  - `.github/workflows/pruebas-reiniciar.yml`: lanzamiento manual; vacía ventas, cuentas, tickets y cierres **de PRUEBAS** y vuelve a cargar los datos. Se niega a ejecutarse si la URL es la de producción.
- **🙋 Usuario:** lanzar «Reiniciar pruebas» y entrar en la web de pruebas como camarero, admin y socio.
- **Hecha cuando:** se puede vender, cobrar, canjear y cerrar jornada en la web de pruebas, y «Reiniciar pruebas» lo deja todo como al principio.

### E5 — Paso a producción controlado

- **✅ Cerrada (2026-11-10):** entorno `production` creado con revisores (solo `main`) antes de mezclar; PR #9 mezclado y aprobado (aplicó en producción `20261109094300_permisos_como_produccion.sql`, sin cambios); `staging` puesta al día sola. `main` protegida: PR obligatorio (sin aprobaciones requeridas, para poder trabajar solo) y comprobaciones «Typecheck, lint y build» y «Migraciones». **Primer cambio real**, `20261110092745_profiles_sin_permisos_sobrantes.sql`: rama `profiles-permisos` → PR a `staging` → aplicada en PRUEBAS → PR `staging`→`main` («Qué cambiaría» mostró solo esa) → aprobación → producción. «Vigilar producción» lanzado a mano: iguales.
- **Estado (2026-11-10):** plan aprobado con las recomendaciones (E-D20). Programado en la rama `e5-produccion`:
  - `.github/workflows/ci.yml` («Comprobaciones», en PR a `staging` y `main`): «Typecheck, lint y build»; «Migraciones» (falla si se edita, renombra o borra una ya aplicada o si el nombre no es `AAAAMMDDHHMMSS_descripcion.sql`; avisa si crea tablas o funciones sin `revoke`); y en los PR a `main`, «Qué cambiaría en producción» (`db push --dry-run`, solo lectura). Probada en local la revisión de migraciones con un repositorio de ejemplo.
  - `deploy-pruebas.yml`: `supabase db push` a PRUEBAS antes de construir; si falla, no publica.
  - `deploy.yml` en cuatro trabajos: «Aprobar y migrar producción» (entorno `production`: espera aprobación; `db push` a producción; si falla, se para) → «Construir la web real» → «Publicar» (entorno `github-pages`) → «Poner staging al día». Ya no cancela un despliegue en marcha.
  - `.github/workflows/vigilar-produccion.yml`: lunes 07:00 UTC y a mano; compara las migraciones aplicadas con las del repositorio y la estructura de producción con la de PRUEBAS; falla si alguien tocó producción a mano. (Mientras una publicación espera aprobación con una migración nueva, puede salir diferencia: es normal.)
  - `scripts/comparar-estructuras.sh`: la comparación de `comparar`, compartida con la vigilancia.
- **Orden de activación (importante):** el entorno `production` con revisores tiene que existir **antes** de mezclar el PR de E5. Si no existe, GitHub lo crea solo **sin protección** y publicaría sin pedir aprobación.

- **🤖 Claude:**
  - `.github/workflows/ci.yml`: en cada PR, typecheck, lint, build y comprobación de entorno (sin PGlite, E-D16).
  - `deploy-pruebas.yml`: `supabase db push` a PRUEBAS antes del build.
  - En los PR a `main`: comentario con las migraciones que se aplicarían en producción (`db push --dry-run`).
  - `deploy.yml` adaptado: un paso con el entorno `production` (espera aprobación) → `db push` a producción → snapshot → build → Pages, que sigue usando el entorno `github-pages`. Si la migración falla, no se publica.
  - `.github/workflows/vigilar-produccion.yml`: semanal, compara producción con las migraciones y avisa de diferencias.
- **🙋 Usuario:**
  - En el entorno `production`: revisores (E-D10) y *Deployment branches* solo `main`.
  - Regla de protección de `main`: solo por PR, con el CI en verde.
  - Primer paso real a producción con un cambio pequeño e inofensivo.
- **Hecha cuando:** un cambio pequeño recorre todo el camino (rama → `staging` → PRUEBAS → PR → aprobación → producción) sin tocar los datos.

### E6 — Documentar

- **⚪ Pospuesta (2026-11-10)** a petición del usuario, para priorizar mejoras del TPV. Al retomarla, el plan propuesto (pendiente de aprobar) es:
  - **Ensayo de restauración fuera de PRUEBAS:** restaurar una copia real en PRUEBAS metería datos reales (socios, ventas) en el proyecto de pruebas y chocaría con lo que ya tiene. Propuesta: workflow «Ensayar restauración» (manual y una vez al mes) que, dentro del runner de GitHub, descifra la última copia de `Laalameda-copias`, la restaura en un Supabase temporal vacío (`supabase start`, sin migraciones) con los comandos de `COPIAS.md` y enseña solo **recuentos** (socios, ventas, productos, tickets). Los datos no salen del runner.
  - `COPIAS.md`: restauración con ese ensayo y qué hacer en una emergencia real (restaurar en producción solo con decisión escrita aquí).
  - Guía del equipo como guía definitiva; `CONTEXT.MD`, `POS.md` y `TICKETS.md` con el flujo nuevo (rama desde `staging`, migraciones, aprobación) y lo de pegar SQL marcado como historia; README con el día a día.

- **🤖 Claude:** guía paso a paso del día a día en este documento y en `README.md`; actualizar `CONTEXT.MD` (estado y ramas) y `POS.md`; quitar de `TICKETS.md` y `POS.md` lo que diga que se pega SQL a mano en producción.
- **🙋 Usuario:** ensayar la restauración de una copia **en PRUEBAS** siguiendo `COPIAS.md`.
- **Hecha cuando:** la restauración funciona en PRUEBAS y la guía basta para trabajar sin preguntar.

### Mientras tanto: el POS y los tickets

- Desde E5, **todo cambio nuevo del POS y de los tickets sigue este flujo**: rama desde `staging` → PR a `staging` (migraciones a PRUEBAS y web de pruebas) → prueba del usuario → PR de `staging` a `main` → aprobación en el entorno `production`.
- **Ejemplo real (2026-11-10): mejoras del TPV.** Rama `tpv-entrega-b` con dos migraciones (`mesas_tipo_barra` y `pago_por_separado`) → PR #12 a `staging` → probado en la web de pruebas → PR #13 a `main` → «Qué cambiaría en producción» listó solo esas dos migraciones → despliegue aprobado → comprobado en producción.
- Las ramas antiguas (`pos`, `tickets`, `miguel`, `miguel2`) son historia: las ramas de trabajo nuevas salen de `staging`.

**Forma de trabajar** (como en `POS.md`): una fase cada vez, plan de archivos antes de programar, pausa al final para probar y actualizar este documento.

---

## Historial

- **2026-11-07** — Creado el documento con el diagnóstico, la opción gratuita, el flujo, la comparativa de planes y el plan por fases. Decididas E-D1 (sin presupuesto) y E-D2 (producción intocable).
- **2026-11-07** — Elegida la opción gratuita (E-D11): dos proyectos de Supabase en la nube, PRODUCCIÓN (el actual) y PRUEBAS (nuevo). Se programa contra PRUEBAS, sin Docker (E-D4; Supabase local pospuesto como E-P4).
- **2026-11-07** — Decididas E-D3 (proyecto viejo ya borrado), E-D6 (rama `staging`), E-D8 (se retira el script de precios), E-D9 (sin confirmación de email en PRUEBAS) y E-D10 (aprueban los colaboradores del repositorio). Añadida la sección 3b: cómo funciona la web de pruebas.
- **2026-11-07** — Añadida la sección 3c: cómo se lleva una funcionalidad nueva de PRUEBAS a PRODUCCIÓN.
- **2026-11-07** — Decididas E-D5 (web de pruebas en `Laalameda-pruebas`) y E-D7 (copias nocturnas cifradas en `Laalameda-copias`, 30 días). Sin decisiones pendientes. Añadida la sección «Para Claude Code: empieza aquí» y el plan detallado por fases, con lo que hace Claude y lo que hace el usuario. **Listo para empezar E0.**
- **2026-11-07** — Revisión del repositorio por Claude Code: lo que encaja, lo que no (sin `base` fijo en Vite, pruebas de PGlite fuera del repositorio y parte perdidas, `prices.generated.ts` aún en uso, `deploy.yml` con el entorno `github-pages`) y riesgos nuevos (push directo a `main`, retención real de 30 días, secretos de las copias, regla de los 60 días, script de limpieza). Decididas E-D12 a E-D16 con las recomendaciones de Claude; E-D17 pendiente. Creadas las ramas `staging` y `e0-preparar`. **E0 en curso.**
- **2026-11-08** — E0 mezclado en `main` (PR #1). La primera copia falló al instalar la CLI de Supabase (`version: latest` → límite de la API de GitHub); se fija la versión 2.122.0 (rama `e0-arreglo-cli`).
- **2026-11-08** — **E0 cerrada:** primera copia cifrada en `Laalameda-copias` (`copia-2026-11-08_1911.tar.gz.gpg`). `staging` puesta al día con `main`.
- **2026-11-08** — Plan de E1 aprobado con las recomendaciones (E-D18: workflow manual, E1a + E1b; secretos de PRUEBAS en el entorno `pruebas`). Cambiada E-D16: no se recuperan las pruebas de PGlite. Proyecto de PRUEBAS creado por el usuario (`hrhhkzajweggpnupytms`). E1a programado en `e1-pruebas`.
- **2026-11-09** — E1b: migración base completada a mano (trigger de `auth.users`, Realtime y `app_settings`), aplicada en PRUEBAS. `comparar` destapó que en PRUEBAS `anon` y `authenticated` tenían todos los permisos por defecto: migración nueva de permisos y regla de permisos explícitos en cada migración. `comparar` mejorado (sin orden, sin `rls_auto_enable`). **E1 cerrada:** «Iguales» y migración base marcada en producción.
- **2026-11-09** — **E2 cerrada** (PR #5). Añadida la «Guía rápida para el equipo» al principio del documento.
- **2026-11-09** — Plan de E3 aprobado con las recomendaciones (E-D19: secretos de producción hasta E5). Workflow «Publicar web de pruebas» programado en `e3-web-pruebas`.
- **2026-11-09** — **E3 cerrada:** web de pruebas publicada y comprobada por el usuario.
- **2026-11-09** — Plan de E4 aprobado con las recomendaciones. Workflow «Datos de PRUEBAS» programado en `e4-datos-prueba`.
- **2026-11-09** — **E4 cerrada:** datos y usuarios de prueba funcionando en la web de pruebas.
- **2026-11-10** — Plan de E5 aprobado con las recomendaciones (E-D20; E-D19 confirmada; E-D17 se resuelve con la protección de `main`). Programado en `e5-produccion`.
- **2026-11-10** — **E5 cerrada:** protección activada y primer cambio real (permisos de `profiles`) llevado de rama a producción con aprobación. Vigilancia: iguales.
- **2026-11-10** — E6 pospuesta por el usuario (prioridad: justificantes, pagos por separado y barra en el TPV). Plan de E6 apuntado en su sección para retomarlo.
- **2026-11-10** — Segundo cambio por el flujo completo: mejoras del TPV (PR #12 a `staging`, PR #13 a `main`, dos migraciones aplicadas a producción con aprobación).
- **2026-11-12** — El usuario confirma las mejoras del TPV en producción. Actualizada la sección «Mientras tanto: el POS y los tickets» con el flujo actual.
