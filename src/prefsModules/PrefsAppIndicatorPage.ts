"use strict";

import GObject from "gi://GObject";
import Adw from "gi://Adw";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk";
import type Gio from "gi://Gio";

import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

const MODES = ["off", "safe", "full"];

export default class PrefsAppIndicatorPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass({
            GTypeName: "PrefsAppIndicatorPage",
            Template: GLib.uri_resolve_relative(import.meta.url, "../ui/prefs-appindicator-page.ui", GLib.UriFlags.NONE),
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
        this.#settings.connect("changed::appindicator-order-exceptions", () => {
            this.#rebuildExceptionRows();
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
}
