FROM postgres:15.17-bookworm

COPY --chmod=755 worklenz-backend/database/00_init.sh /docker-entrypoint-initdb.d/00_init.sh
COPY worklenz-backend/database/sql /docker-entrypoint-initdb.d/sql
COPY worklenz-backend/database/sql/migrations /docker-entrypoint-initdb.d/migrations
COPY worklenz-backend/database/pg-migrations /docker-entrypoint-initdb.d/pg-migrations
