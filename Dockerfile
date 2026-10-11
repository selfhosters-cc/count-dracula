# Count Dracula in one container: Bun, the app, and a /data volume for the database, its backups and config.json.
# See "Install with Docker Compose" in README.md.
FROM oven/bun:1.4.2-slim

WORKDIR /app
COPY package.json bunfig.toml ./
COPY server server
COPY shared shared
COPY public public
COPY kiosk kiosk
COPY config/config.example.json config/2025-counts.json config/
COPY deploy/copy-db.js deploy/import-past-counts.js deploy/
COPY docker/entrypoint.sh docker/entrypoint.sh

# The volume: the SQLite database, nightly backups and config.json (written on first start, then yours to edit).
RUN mkdir -p /data && chown bun:bun /data
VOLUME /data
ENV COUNT_DRACULA_CONFIG=/data/config.json
USER bun
EXPOSE 3131
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD bun -e "fetch('http://127.0.0.1:3131/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["bun", "server/main.js"]
