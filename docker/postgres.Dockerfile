FROM postgres:15.17-bookworm

RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends ca-certificates curl && \
    dpkgArch="$(dpkg --print-architecture | awk -F- '{ print $NF }')" && \
    curl -fsSL "https://github.com/tianon/gosu/releases/download/1.17/gosu-$dpkgArch" -o /usr/local/bin/gosu && \
    chmod +x /usr/local/bin/gosu && \
    apt-get purge -y --auto-remove ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

COPY --chmod=755 worklenz-backend/database/00_init.sh /docker-entrypoint-initdb.d/00_init.sh
COPY worklenz-backend/database/sql /docker-entrypoint-initdb.d/sql
COPY worklenz-backend/database/sql/migrations /docker-entrypoint-initdb.d/migrations
COPY worklenz-backend/database/pg-migrations /docker-entrypoint-initdb.d/pg-migrations
