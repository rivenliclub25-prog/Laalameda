#!/usr/bin/env bash
# Compara la estructura de PRODUCCIÓN y la de PRUEBAS (ENTORNOS.md).
# Lo usan el workflow «Estructura de la base de datos» (acción comparar) y «Vigilar producción».
#
# Uso: scripts/comparar-estructuras.sh <produccion.sql> <pruebas.sql>
#   (volcados de `supabase db dump`). Escribe el resultado en $GITHUB_STEP_SUMMARY si existe.
# Sale con 0 si son iguales y con 1 si hay diferencias.
#
# Se ignoran: comentarios, líneas vacías, ajustes de sesión, el orden de las líneas (los GRANT
# cambian de orden si se quitan y se vuelven a dar permisos) y public.rls_auto_enable(), que
# Supabase crea solo en los proyectos nuevos.
set -euo pipefail

produccion="$1"
pruebas="$2"
resumen="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
tmp="$(mktemp -d)"

limpiar() {
  grep -v -E '^\s*(--|SET |SELECT pg_catalog\.set_config|$)' "$1" \
    | awk '/FUNCTION "public"\."rls_auto_enable"\(\) RETURNS/ {saltar=1}
           saltar && /^\$\$;/ {saltar=0; next}
           saltar {next}
           /"public"\."rls_auto_enable"\(\)/ {next}
           {print}' \
    | LC_ALL=C sort
}

limpiar "$produccion" > "$tmp/produccion"
limpiar "$pruebas" > "$tmp/pruebas"

nota="Se ignoran el orden de las líneas y \`public.rls_auto_enable()\` (la crea Supabase en los proyectos nuevos)."
if cmp -s "$tmp/produccion" "$tmp/pruebas"; then
  {
    echo "### ✅ Iguales: PRUEBAS tiene la misma estructura que producción"
    echo "$nota"
  } >> "$resumen"
  exit 0
fi

LC_ALL=C comm -23 "$tmp/produccion" "$tmp/pruebas" > "$tmp/solo-produccion"
LC_ALL=C comm -13 "$tmp/produccion" "$tmp/pruebas" > "$tmp/solo-pruebas"
{
  echo "### ⚠️ Hay diferencias entre producción y PRUEBAS"
  echo "$nota"
  echo "#### Solo en producción ($(wc -l < "$tmp/solo-produccion") líneas, primeras 150)"
  echo '```sql'
  head -n 150 "$tmp/solo-produccion"
  echo '```'
  echo "#### Solo en PRUEBAS ($(wc -l < "$tmp/solo-pruebas") líneas, primeras 150)"
  echo '```sql'
  head -n 150 "$tmp/solo-pruebas"
  echo '```'
} >> "$resumen"
exit 1
