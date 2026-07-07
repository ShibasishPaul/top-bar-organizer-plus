#!/bin/bash

set -e

REAL_BASE_DIR=$( dirname $( readlink -f "$0" ))

rm -rf "$REAL_BASE_DIR/dist"
cd "$REAL_BASE_DIR"
npx tsc
cp "$REAL_BASE_DIR/src/metadata.json" "$REAL_BASE_DIR/dist/metadata.json"
gnome-extensions pack "$REAL_BASE_DIR/dist" \
    --force \
    --extra-source extensionModules \
    --extra-source prefsModules \
    --extra-source Families.js \
    --extra-source ../data/ui \
    --extra-source ../data/css \
    --schema ../data/org.gnome.shell.extensions.top-bar-organizer-plus.gschema.xml
