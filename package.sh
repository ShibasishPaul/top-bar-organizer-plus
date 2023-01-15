#!/bin/bash

set -e

REAL_BASE_DIR=$( dirname $( readlink -f "$0" ))

gnome-extensions pack "$REAL_BASE_DIR/src" \
    --force \
    --extra-source extensionModules \
    --extra-source prefsModules \
    --extra-source prefs-box-order-item-row.ui \
    --extra-source prefs-box-order-list-box.ui \
    --extra-source prefs-box-order-list-empty-placeholder.ui \
    --extra-source prefs-page.ui \
