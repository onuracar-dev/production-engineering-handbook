#!/usr/bin/env sh
set -eu
umask 077
timestamp=$(date -u +%Y%m%d%H%M%S)
restore_db="wpa_restore_check_${timestamp}"
backup_path="${1:-${backup_path:?usage: restore_check.sh <backup.dump.age> (or set backup_path)}}"
temporary_dump=$(mktemp)

cleanup() {
  docker compose exec -T postgres dropdb --username=postgres --if-exists "${restore_db}" >/dev/null 2>&1 || true
  if [ -n "${temporary_dump}" ]; then rm -f -- "${temporary_dump}"; fi
}
trap cleanup EXIT HUP INT TERM

sha256sum --check "${backup_path}.sha256"
age --decrypt --output "${temporary_dump}" "${backup_path}"
docker compose exec -T postgres createdb --username=postgres "${restore_db}"
docker compose exec -T postgres pg_restore --username=postgres --dbname="${restore_db}" --exit-on-error < "${temporary_dump}"
# A missing table fails psql (ON_ERROR_STOP); an empty migrations table means the
# dump restored no schema at all, so treat that as a failed restore too.
for table in wpa_schema_migrations wpa_workspaces wpa_reports; do
  rows=$(docker compose exec -T postgres psql --username=postgres --dbname="${restore_db}" \
    -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM ${table};")
  echo "${table}: ${rows} rows"
  if [ "${table}" = wpa_schema_migrations ] && [ "${rows}" -lt 1 ]; then
    echo "restore check failed: ${table} is empty" >&2
    exit 1
  fi
done
