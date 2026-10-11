#!/bin/sh
# First start: write /data/config.json from the example, with the database and backups in /data. After that it's
# yours to edit (switches, soundboard), and a restart picks it up.
set -e
if [ ! -f "$COUNT_DRACULA_CONFIG" ]; then
  bun -e '
    const config = JSON.parse(await Bun.file("/app/config/config.example.json").text())
    config.port = 3131
    config.dbPath = "/data/count-dracula.sqlite"
    config.backupDir = "/data/backups"
    await Bun.write(process.env.COUNT_DRACULA_CONFIG, JSON.stringify(config, null, 2) + "\n")
    console.log(`Wrote ${process.env.COUNT_DRACULA_CONFIG}`)
  '
fi
exec "$@"
