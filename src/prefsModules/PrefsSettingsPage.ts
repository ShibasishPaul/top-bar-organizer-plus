"use strict";

import GObject from "gi://GObject";
import Adw from "gi://Adw";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";

import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { exportSettingsToJson, importSettingsFromJson } from "../SettingsBackup.js";

const MODES = ["off", "safe", "full"];

// Gtk.FileDialog's save()/open() aren't auto-promisified by GJS (unlike
// most of Gio's async pairs) - without this, `await dialog.save(...)`
// throws synchronously ("At least 3 arguments required") since it's still
// the raw (parent, cancellable, callback) signature.
Gio._promisify(Gtk.FileDialog.prototype, "save", "save_finish");
Gio._promisify(Gtk.FileDialog.prototype, "open", "open_finish");

export default class PrefsSettingsPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass({
            GTypeName: "PrefsSettingsPage",
            Template: GLib.uri_resolve_relative(import.meta.url, "../ui/prefs-settings-page.ui", GLib.UriFlags.NONE),
            InternalChildren: [
                "mode-row",
                "exceptions-group",
                "add-exception-entry-row",
            ],
        }, this);
    }

    declare _mode_row: Adw.ComboRow;
    declare _exceptions_group: Adw.PreferencesGroup;
    declare _add_exception_entry_row: Adw.EntryRow;
    #settings: Gio.Settings;
    #exceptionRows: Adw.ActionRow[];

    constructor(params = {}) {
        super(params);

        this.#settings = ExtensionPreferences.lookupByURL(import.meta.url)!.getSettings();
        this.#exceptionRows = [];

        this._mode_row.set_selected(MODES.indexOf(this.#settings.get_string("appindicator-order-mode")));

        this.#rebuildExceptionRows();
        // Live-update from settings changes made by any source (e.g. dconf
        // directly, or a future second prefs window), not just this page's
        // own add/remove actions.
        const exceptionsChangedHandlerId = this.#settings.connect("changed::appindicator-order-exceptions", () => {
            this.#rebuildExceptionRows();
        });
        this.connect("destroy", () => {
            this.#settings.disconnect(exceptionsChangedHandlerId);
        });
    }

    onModeRowSelectionChanged(): void {
        const selected = this._mode_row.get_selected();
        if (selected === Gtk.INVALID_LIST_POSITION) {
            return;
        }
        this.#settings.set_string("appindicator-order-mode", MODES[selected]);
    }

    onAddExceptionEntryApply(): void {
        const applicationId = this._add_exception_entry_row.get_text().trim();
        if (!applicationId) {
            return;
        }

        const exceptions = this.#settings.get_strv("appindicator-order-exceptions");
        if (!exceptions.includes(applicationId)) {
            exceptions.push(applicationId);
            this.#settings.set_strv("appindicator-order-exceptions", exceptions);
        }

        this._add_exception_entry_row.set_text("");
    }

    /**
     * Rebuilds the exception rows shown below the add-entry row from the
     * current settings value, replacing whatever rows were previously shown.
     */
    #rebuildExceptionRows(): void {
        for (const row of this.#exceptionRows) {
            this._exceptions_group.remove(row);
        }
        this.#exceptionRows = [];

        for (const applicationId of this.#settings.get_strv("appindicator-order-exceptions")) {
            const row = new Adw.ActionRow({ title: applicationId });

            const removeButton = new Gtk.Button({
                iconName: "list-remove-symbolic",
                valign: Gtk.Align.CENTER,
                tooltipText: "Remove",
            });
            removeButton.add_css_class("flat");
            removeButton.connect("clicked", () => {
                this.#removeException(applicationId);
            });
            row.add_suffix(removeButton);

            this._exceptions_group.add(row);
            this.#exceptionRows.push(row);
        }
    }

    #removeException(applicationId: string): void {
        const exceptions = this.#settings.get_strv("appindicator-order-exceptions")
            .filter(existingApplicationId => existingApplicationId !== applicationId);
        this.#settings.set_strv("appindicator-order-exceptions", exceptions);
    }

    async onExportButtonClicked(): Promise<void> {
        const dialog = new Gtk.FileDialog({
            initialName: "top-bar-organizer-plus-settings.json",
        });

        let file: Gio.File | null;
        try {
            file = await dialog.save(this.get_root() as Gtk.Window, null);
        } catch {
            // Cancelled, or the dialog itself failed to show - nothing to do.
            return;
        }
        if (!file) {
            return;
        }

        try {
            const json = exportSettingsToJson(this.#settings);
            file.replace_contents(
                new TextEncoder().encode(json),
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (e) {
            console.error(`top-bar-organizer-plus: failed to export settings: ${e}`);
            await this.#showErrorDialog("Export Failed", "Couldn't write settings to the selected file. See the logs for details.");
        }
    }

    async onImportButtonClicked(): Promise<void> {
        const dialog = new Gtk.FileDialog();

        let file: Gio.File | null;
        try {
            file = await dialog.open(this.get_root() as Gtk.Window, null);
        } catch {
            // Cancelled, or the dialog itself failed to show - nothing to do.
            return;
        }
        if (!file) {
            return;
        }

        const confirmed = await this.#confirmImport();
        if (!confirmed) {
            return;
        }

        try {
            const [, contents] = file.load_contents(null);
            const json = new TextDecoder("utf-8").decode(contents);
            importSettingsFromJson(this.#settings, json);
        } catch (e) {
            console.error(`top-bar-organizer-plus: failed to import settings: ${e}`);
            await this.#showErrorDialog("Import Failed", "Couldn't read settings from the selected file. It may not be a settings file exported from this extension. See the logs for details.");
        }
    }

    /**
     * Shows a destructive-styled confirmation dialog before an import
     * actually overwrites every current setting. Resolves to whether the
     * user chose to proceed.
     */
    #confirmImport(): Promise<boolean> {
        return new Promise(resolve => {
            const dialog = new Adw.MessageDialog({
                heading: "Import Settings?",
                body: "This replaces every current setting with the ones from the selected file. This can't be undone.",
                transientFor: this.get_root() as Gtk.Window,
                modal: true,
            });
            dialog.add_response("cancel", "Cancel");
            dialog.add_response("import", "Import");
            dialog.set_response_appearance("import", Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.set_default_response("cancel");
            dialog.set_close_response("cancel");

            dialog.connect("response", (_dialog: Adw.MessageDialog, response: string) => {
                resolve(response === "import");
            });
            dialog.present();
        });
    }

    #showErrorDialog(heading: string, body: string): Promise<void> {
        return new Promise(resolve => {
            const dialog = new Adw.MessageDialog({
                heading,
                body,
                transientFor: this.get_root() as Gtk.Window,
                modal: true,
            });
            dialog.add_response("ok", "OK");
            dialog.connect("response", () => resolve());
            dialog.present();
        });
    }
}
