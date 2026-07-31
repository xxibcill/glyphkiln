#!/bin/sh
set -eu

: "${GLYPHKILN_POSTGRES_RUNTIME_PASSWORD:?set GLYPHKILN_POSTGRES_RUNTIME_PASSWORD}"
: "${GLYPHKILN_POSTGRES_WORKER_PASSWORD:?set GLYPHKILN_POSTGRES_WORKER_PASSWORD}"

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 <<'SQL'
\getenv runtime_password GLYPHKILN_POSTGRES_RUNTIME_PASSWORD
\getenv worker_password GLYPHKILN_POSTGRES_WORKER_PASSWORD

SELECT format(
  'CREATE ROLE glyphkiln_runtime LOGIN PASSWORD %L',
  :'runtime_password'
)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_roles
  WHERE rolname = 'glyphkiln_runtime'
)
\gexec

SELECT format(
  'ALTER ROLE glyphkiln_runtime WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',
  :'runtime_password'
)
\gexec

SELECT format(
  'CREATE ROLE glyphkiln_worker LOGIN PASSWORD %L',
  :'worker_password'
)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_roles
  WHERE rolname = 'glyphkiln_worker'
)
\gexec

SELECT format(
  'ALTER ROLE glyphkiln_worker WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',
  :'worker_password'
)
\gexec

GRANT CONNECT ON DATABASE glyphkiln TO glyphkiln_runtime;
GRANT CONNECT ON DATABASE glyphkiln TO glyphkiln_worker;
GRANT USAGE ON SCHEMA public TO glyphkiln_runtime;
GRANT USAGE ON SCHEMA public TO glyphkiln_worker;

ALTER DEFAULT PRIVILEGES
  FOR ROLE glyphkiln_migrator
  IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO glyphkiln_runtime;

ALTER DEFAULT PRIVILEGES
  FOR ROLE glyphkiln_migrator
  IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO glyphkiln_runtime;
SQL
