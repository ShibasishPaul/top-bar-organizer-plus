#!/bin/bash

set -e

REAL_BASE_DIR=$( dirname $( readlink -f "$0" ))

gnome-extensions pack "$REAL_BASE_DIR/src" \
    --force \
    --extra-source extensionModules \
    --extra-source prefsModules \
    --extra-source ../data/ui \
    --schema ../data/org.gnome.shell.extensions.top-bar-organizer.gschema.xml
