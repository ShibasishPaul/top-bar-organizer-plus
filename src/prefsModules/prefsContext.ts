"use strict";

import type Gio from "gi://Gio";
import type { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

// Set once by prefs.ts's `fillPreferencesWindow` (the sole ExtensionPreferences
// instance for this run), then read by every prefs widget module below it in the
// tree, so they can reach `this.getSettings()`/`this.metadata`/`this.dir` without
// each doing their own `ExtensionPreferences.lookupByURL()`/`lookupByUUID()` call -
// which is meant for looking up some *other* extension, and is flagged by EGO's
// shexli static analyzer when used for current-extension access instead. Some of
// these widgets (e.g. the three PrefsBoxOrderListBox rows on the Item Order page)
// are instantiated directly by GtkBuilder from a <template>, with no opportunity
// for constructor injection.
let currentExtension: ExtensionPreferences | null = null;

export function setPrefsExtension(extension: ExtensionPreferences): void {
    currentExtension = extension;
}

function getPrefsExtension(): ExtensionPreferences {
    if (!currentExtension) {
        throw new Error("setPrefsExtension() must be called before any prefs widget is constructed.");
    }
    return currentExtension;
}

export function getPrefsSettings(): Gio.Settings {
    return getPrefsExtension().getSettings();
}

export function getPrefsMetadata(): ExtensionPreferences["metadata"] {
    return getPrefsExtension().metadata;
}

export function getPrefsDir(): Gio.File {
    return getPrefsExtension().dir;
}
