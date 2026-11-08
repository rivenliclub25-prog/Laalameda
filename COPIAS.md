# Copias de seguridad

Cada noche, GitHub hace una **copia cifrada** de la base de datos de PRODUCCIÓN y la guarda en el repositorio **privado** `Laalameda-copias`. Se conservan las **últimas 30**. Lo hace el workflow `.github/workflows/backup.yml` (decisiones en `ENTORNOS.md`: E-D7, E-D12 y E-D15).

- **Solo lee** producción: no cambia nada.
- **Cuándo:** cada día a las 05:00 UTC (06:00 en Madrid en invierno, 07:00 en verano). También a mano.
- **Qué contiene:** tres archivos SQL dentro de un `.tar.gz` cifrado: `roles.sql` (roles), `schema.sql` (estructura) y `data.sql` (todos los datos: socios, ventas, tickets, cierres…).
- **Cifrado:** `gpg` con AES-256 y la contraseña `BACKUP_PASSPHRASE`. **Sin esa contraseña, las copias no se pueden abrir.**

---

## 1. Ponerlo en marcha (una sola vez)

### 1.1 Repositorio para las copias

1. GitHub → **New repository**.
2. Nombre: `Laalameda-copias`. Marca **Private**. No añadas README ni nada más.
3. **Create repository**.

### 1.2 Clave para que GitHub pueda escribir ahí (deploy key)

1. En tu ordenador, abre PowerShell y ejecuta:

   ```powershell
   ssh-keygen -t ed25519 -C "copias-laalameda" -f copias_deploy
   ```

   Cuando pida *passphrase*, pulsa **Enter dos veces** (sin contraseña). Se crean dos archivos: `copias_deploy` (privado) y `copias_deploy.pub` (público).
2. Parte **pública**: `Laalameda-copias` → **Settings → Deploy keys → Add deploy key**.
   - Title: `Copias desde Laalameda`.
   - Key: pega el contenido de `copias_deploy.pub` (ábrelo con el Bloc de notas).
   - Marca **Allow write access** → **Add key**.
3. Parte **privada**: repositorio `Laalameda` → **Settings → Secrets and variables → Actions → New repository secret**.
   - Name: `COPIAS_DEPLOY_KEY`.
   - Secret: pega **todo** el contenido de `copias_deploy`, incluidas las líneas `-----BEGIN…` y `-----END…`.
4. Borra los dos archivos de tu ordenador: ya no hacen falta.

### 1.3 Conexión a la base de datos (solo lectura en la práctica)

1. Supabase → proyecto de producción → botón **Connect** (arriba).
2. Elige **Session pooler** (no «Direct connection»: GitHub no tiene IPv6) y copia la URI. Es parecida a:
   `postgresql://postgres.hinebaxynlpjisteuaus:[YOUR-PASSWORD]@aws-0-eu-….pooler.supabase.com:5432/postgres`
3. Cambia `[YOUR-PASSWORD]` por la contraseña de la base de datos. Si no la recuerdas: **Project Settings → Database → Reset database password**. La web no se ve afectada: usa la clave anon, no esta contraseña. Mejor una contraseña solo con letras y números (otros símbolos habría que codificarlos en la URI).
4. Repositorio `Laalameda` → **New repository secret**:
   - Name: `BACKUP_DB_URL`.
   - Secret: la URI completa con la contraseña.

### 1.4 Contraseña de cifrado

1. Inventa una contraseña larga (por ejemplo, 5 o 6 palabras sin relación, de más de 30 caracteres).
2. **Guárdala fuera de GitHub** (gestor de contraseñas o en papel, en un sitio seguro). Si se pierde, las copias no sirven.
3. Repositorio `Laalameda` → **New repository secret**:
   - Name: `BACKUP_PASSPHRASE`.
   - Secret: la contraseña.

Los tres secretos van como **secretos del repositorio**, no en el entorno `production` (E-D15).

### 1.5 Primera copia

El workflow solo funciona cuando está en `main`. Después de mezclar el PR de E0:

1. Repositorio `Laalameda` → **Actions → Copia de seguridad → Run workflow → Run workflow**.
2. Espera a que salga en verde (1–3 minutos). En el resumen aparece el nombre del archivo.
3. Abre `Laalameda-copias`: tiene que haber una carpeta `copias/` con un archivo `copia-AAAA-MM-DD_HHMM.tar.gz.gpg`.

---

## 2. Comprobar que siguen llegando

- **Una vez a la semana:** abre `Laalameda-copias`. El README dice cuál es la última copia; tiene que ser de esta noche o de la anterior.
- **Si una copia falla**, GitHub manda un correo a la persona que hizo el último cambio en la programación del workflow (quien subió `backup.yml`). Si no te llegan, revisa **Actions → Copia de seguridad** de vez en cuando.
- **Regla de los 60 días:** GitHub **desactiva** los workflows programados de un repositorio público si en 60 días no ha habido ningún commit. Si dejan de llegar copias:
  1. `Laalameda` → **Actions → Copia de seguridad**.
  2. Si sale el aviso «This scheduled workflow is disabled…», pulsa **Enable workflow**.
  3. Lanza una copia a mano (**Run workflow**) para no esperar a la noche.
- **Errores típicos:**

  | Mensaje | Qué hacer |
  |---|---|
  | `Falta el secreto …` | Crear ese secreto (sección 1) |
  | `BACKUP_DB_URL no es la de producción` | La URI no es la del proyecto `hinebaxynlpjisteuaus` |
  | `password authentication failed` | La contraseña de la URI no es la buena (sección 1.3) |
  | `Permission denied (publickey)` | La deploy key no está, o le falta **Allow write access** (sección 1.2) |
  | `La copia ocupa … bytes` | La base de datos ha crecido mucho: hay que cambiar el sistema de copias (avisar) |
  | `Failed to resolve latest Supabase CLI release: rate limit exceeded` | Pasaba con `version: latest`. Ya está fijada una versión en `backup.yml` (2026-11-08) |

- **Versión de la CLI de Supabase:** está fija en `backup.yml` (`version: 2.122.0`). Si un día el volcado falla porque la versión es antigua, se cambia por una más reciente de https://github.com/supabase/cli/releases (con un PR, como cualquier cambio).

---

## 3. Restaurar una copia

> ⚠️ **Solo en PRUEBAS** (o en un proyecto vacío creado para ello). **Nunca sobre producción**: se ensaya primero en PRUEBAS (fase E6 de `ENTORNOS.md`) y cualquier recuperación real se decide antes, por escrito, en `ENTORNOS.md`.

Necesitas `gpg` (en Windows, [Gpg4win](https://www.gpg4win.org/)) y `psql` (en Windows, el instalador de PostgreSQL con «Command Line Tools»), o hacerlo desde WSL o Linux.

1. **Descargar** el archivo de `Laalameda-copias` (`copias/copia-….tar.gz.gpg` → *Download raw file*).
2. **Descifrar** (pide la contraseña `BACKUP_PASSPHRASE`):

   ```sh
   gpg --output copia.tar.gz --decrypt copia-AAAA-MM-DD_HHMM.tar.gz.gpg
   ```

3. **Descomprimir**:

   ```sh
   tar -xzf copia.tar.gz
   ```

   Salen `roles.sql`, `schema.sql` y `data.sql`. **Contienen datos personales:** bórralos al terminar.
4. **Cargar en el proyecto de destino**, con su cadena de conexión (Session pooler del proyecto de PRUEBAS, nunca la de producción):

   ```sh
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql \
     --command 'SET session_replication_role = replica' \
     --file schema.sql \
     --file data.sql \
     --dbname "postgresql://postgres.<proyecto-de-pruebas>:<contraseña>@…pooler.supabase.com:5432/postgres"
   ```

   `--single-transaction` hace que, si algo falla, no se cargue nada a medias.
5. **Borrar** `copia.tar.gz`, `roles.sql`, `schema.sql` y `data.sql` de tu ordenador.

El procedimiento exacto (por ejemplo, si el proyecto de destino ya tiene tablas) se termina de ajustar en el ensayo de E6 y se apunta aquí.

---

## 4. Cambiar la contraseña de cifrado

1. Nueva contraseña → guárdala fuera de GitHub → actualiza el secreto `BACKUP_PASSPHRASE`.
2. Las copias nuevas usan la nueva; **las ya guardadas siguen necesitando la anterior** hasta que dejen de existir (30 días). Guarda la anterior ese tiempo.
