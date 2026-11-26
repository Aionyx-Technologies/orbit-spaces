FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app
WORKDIR /app
RUN pip install --upgrade pip

FROM base AS deps
COPY pyproject.toml ./
RUN mkdir orbit && touch orbit/__init__.py \
    && pip install ".[sentry,backup]" \
    && pip uninstall -y orbit-api \
    && rm -rf orbit build ./*.egg-info

FROM deps AS dev
RUN mkdir orbit && touch orbit/__init__.py \
    && pip install ".[sentry,backup,dev]" \
    && pip uninstall -y orbit-api \
    && rm -rf orbit build ./*.egg-info
CMD ["pytest"]

FROM deps AS runtime
# pg_dump for nightly Postgres backups. Its major version must be at least the server's, so raise
# this to match a newer server: docker build --build-arg PG_CLIENT_MAJOR=19 . Railway's Postgres
# is version 18.
ARG PG_CLIENT_MAJOR=18
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
        https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && . /etc/os-release \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends "postgresql-client-${PG_CLIENT_MAJOR}" \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 10001 --create-home orbit \
    && mkdir -p /data \
    && chown orbit:orbit /data
COPY orbit ./orbit
COPY alembic ./alembic
COPY alembic.ini ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh
ENV DATABASE_URL=sqlite:////data/orbit.db \
    FORWARDED_ALLOW_IPS=*
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "orbit.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log", "--proxy-headers"]
