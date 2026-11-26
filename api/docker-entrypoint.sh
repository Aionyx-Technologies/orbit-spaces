#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
    mkdir -p /data
    chown -R orbit:orbit /data
    export HOME=/home/orbit
    exec setpriv --reuid=orbit --regid=orbit --init-groups -- "$@"
fi

exec "$@"
