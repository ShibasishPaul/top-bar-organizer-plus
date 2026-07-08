#!/bin/bash

set -e

REAL_BASE_DIR=$( dirname $( readlink -f "$0" ))

rm -rf "$REAL_BASE_DIR/dist"
cd "$REAL_BASE_DIR"
npx tsc
cp "$REAL_BASE_DIR/src/metadata.json" "$REAL_BASE_DIR/dist/metadata.json"
cp "$REAL_BASE_DIR/COPYING" "$REAL_BASE_DIR/dist/COPYING"
gnome-extensions pack "$REAL_BASE_DIR/dist" \
    --force \
    --extra-source extensionModules \
    --extra-source prefsModules \
    --extra-source Families.js \
    --extra-source FamilySettings.js \
    --extra-source SettingsBackup.js \
    --extra-source ../data/ui \
    --extra-source ../data/css \
    --extra-source COPYING \
    --schema ../data/org.gnome.shell.extensions.top-bar-organizer-plus.gschema.xml
