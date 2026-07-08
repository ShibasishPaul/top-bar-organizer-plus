"use strict";

import GLib from "gi://GLib";
import type Gio from "gi://Gio";

/**
 * Export/import helpers for the extension's entire GSettings schema, backing
 * the Settings page's "Backup" section. Generic over every key currently
 * defined in the schema (via `Gio.SettingsSchema.list_keys`), so a new
 * settings key never needs a matching line here.
 */

/**
 * Serializes every key in `settings`'s schema to a JSON string, keyed by
 * settings key name, with each value taken from its GVariant's native JS
 * representation (`deep_unpack`).
 */
export function exportSettingsToJson(settings: Gio.Settings): string {
    const schema = settings.settings_schema!;
    const data: Record<string, unknown> = {};

    for (const key of schema.list_keys()) {
        data[key] = settings.get_value(key).deep_unpack();
    }

    return JSON.stringify(data, null, 2);
}

/**
 * Restores every key present in a previously exported JSON string back into
 * `settings`. Unknown keys (e.g. from a newer/older version of the
 * extension) are silently ignored rather than failing the whole import.
 *
 * Applied via `delay()`/`apply()` so every key lands as one atomic backend
 * commit — otherwise the extension process (reacting to each key's own
 * `changed` signal independently) could observe a partially-imported,
 * inconsistent settings state mid-import. See the same pattern in
 * `FamilySettings.ts` for why that matters.
 */
export function importSettingsFromJson(settings: Gio.Settings, json: string): void {
    const data = JSON.parse(json) as Record<string, unknown>;
    const schema = settings.settings_schema!;

    settings.delay();
    for (const key of schema.list_keys()) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) {
            continue;
        }
        const variantType = schema.get_key(key).get_value_type();
        const variant = new GLib.Variant(variantType.dup_string(), data[key]);
        settings.set_value(key, variant);
    }
    settings.apply();
}
