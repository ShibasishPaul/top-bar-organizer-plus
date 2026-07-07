"use strict";

import Gtk from "gi://Gtk";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import type Gio from "gi://Gio";

import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import PrefsBoxOrderItemRow from "./PrefsBoxOrderItemRow.js";
import PrefsBoxOrderListEmptyPlaceholder from "./PrefsBoxOrderListEmptyPlaceholder.js";
import type { Family } from "../Families.js";

export default class PrefsBoxOrderListBox extends Gtk.ListBox {
    static {
        GObject.registerClass({
            GTypeName: "PrefsBoxOrderListBox",
            Template: GLib.uri_resolve_relative(import.meta.url, "../ui/prefs-box-order-list-box.ui", GLib.UriFlags.NONE),
            Properties: {
                BoxOrder: GObject.ParamSpec.string(
                    "box-order",
                    "Box Order",
                    "The box order this PrefsBoxOrderListBox is associated with.",
                    GObject.ParamFlags.READWRITE,
                    ""
                ),
                // Definite, explicitly-set replacement for deriving "is this
                // list part of the left/center/right migration chain?" from
                // a hardcoded list of box-order key strings — that
                // derivation broke silently if a key name ever changed.
                // Every PrefsBoxOrderListBox now states this directly.
                IsChained: GObject.ParamSpec.boolean(
                    "is-chained",
                    "Is Chained",
                    "Whether this list box is part of the left/center/right migration chain (move-up/down and drag-and-drop between adjacent boxes) rather than a standalone list (e.g. a family's member list).",
                    GObject.ParamFlags.READWRITE,
                    true
                ),
                // The Family this list box is bound to, for standalone
                // family lists (null for chained left/center/right lists).
                // Set directly rather than derived from `box-order`'s
                // string value, so consumers (e.g. row title formatting,
                // the "Move to Group"/"Remove from Group" row actions)
                // never need to re-parse or guess it.
                Family: GObject.ParamSpec.jsobject(
                    "family",
                    "Family",
                    "The Family this list box is bound to, or null for a chained left/center/right list.",
                    GObject.ParamFlags.READWRITE
                ),
            },
            Signals: {
                "row-move": {
                    param_types: [PrefsBoxOrderItemRow.$gtype, GObject.TYPE_STRING],
                },
            },
        }, this);
    }

    _boxOrder!: string;
    _isChained: boolean = true;
    _family: Family | null = null;
    #settings: Gio.Settings;
    #rowSignalHandlerIds = new Map<PrefsBoxOrderItemRow, number[]>();
    #settingsChangedHandlerId?: number;

    /**
     * @param {Object} params
     */
    constructor(params = {}) {
        super(params);

        // Load the settings.
        this.#settings = ExtensionPreferences.lookupByURL(import.meta.url)!.getSettings();

        // Add a placeholder widget for the case, where no GtkListBoxRows are
        // present.
        this.set_placeholder(new PrefsBoxOrderListEmptyPlaceholder());

        this.connect("destroy", () => {
            if (this.#settingsChangedHandlerId !== undefined) {
                this.#settings.disconnect(this.#settingsChangedHandlerId);
            }
        });
    }

    get boxOrder(): string {
        return this._boxOrder;
    }

    set boxOrder(value: string) {
        this._boxOrder = value;

        this.#rebuildFromSettings();

        // Live-update: whenever this list's settings key changes — whether
        // from a move/drag within this same list, or from an entirely
        // different list box (e.g. a "Move to Group" row action on another
        // page, or another PrefsBoxOrderListBox instance for the same key)
        // — reconcile this list's rows with the new value. `#rebuildFromSettings`
        // no-ops when the value already matches what's rendered, so this
        // doesn't fight with this list's own writes.
        if (this.#settingsChangedHandlerId !== undefined) {
            this.#settings.disconnect(this.#settingsChangedHandlerId);
        }
        this.#settingsChangedHandlerId = this.#settings.connect(`changed::${this._boxOrder}`, () => {
            this.#rebuildFromSettings();
        });

        this.notify("box-order");
    }

    get isChained(): boolean {
        return this._isChained;
    }

    set isChained(value: boolean) {
        this._isChained = value;
        this.notify("is-chained");
    }

    get family(): Family | null {
        return this._family;
    }

    set family(value: Family | null) {
        this._family = value;
        this.notify("family");
    }

    /**
     * Collects the roles of this list box's current rows, in order.
     */
    #getCurrentRoles(): string[] {
        let roles: string[] = [];
        for (let potentialPrefsBoxOrderItemRow of this) {
            if (!(potentialPrefsBoxOrderItemRow instanceof PrefsBoxOrderItemRow)) {
                continue;
            }
            roles.push(potentialPrefsBoxOrderItemRow.item);
        }
        return roles;
    }

    /**
     * Reconciles this list box's rows with the current settings value of
     * `boxOrder`. A no-op if they already match (e.g. right after this
     * list box's own write triggered the `changed` signal), so this is
     * safe to call unconditionally on every `changed::${boxOrder}` signal
     * regardless of who wrote it.
     */
    #rebuildFromSettings(): void {
        const newRoles = this.#settings.get_strv(this._boxOrder);
        const currentRoles = this.#getCurrentRoles();

        if (JSON.stringify(newRoles) === JSON.stringify(currentRoles)) {
            return;
        }

        const rowsToRemove: PrefsBoxOrderItemRow[] = [];
        for (let potentialPrefsBoxOrderItemRow of this) {
            if (potentialPrefsBoxOrderItemRow instanceof PrefsBoxOrderItemRow) {
                rowsToRemove.push(potentialPrefsBoxOrderItemRow);
            }
        }
        for (const row of rowsToRemove) {
            this.removeRow(row);
        }

        for (const item of newRoles) {
            const row = new PrefsBoxOrderItemRow({}, item, this._family);
            this.insertRow(row, -1);
        }

        this.determineRowMoveActionEnable();
    }

    /**
     * Inserts the given PrefsBoxOrderItemRow to this list box at the given
     * position.
     * Also handles stuff like connecting signals.
     */
    insertRow(row: PrefsBoxOrderItemRow, position: number): void {
        this.insert(row, position);

        const signalHandlerIds: number[] = [];
        signalHandlerIds.push(row.connect("move", (row, direction) => {
            this.emit("row-move", row, direction);
        }));

        this.#rowSignalHandlerIds.set(row, signalHandlerIds);
    }

    /**
     * Removes the given PrefsBoxOrderItemRow from this list box.
     * Also handles stuff like disconnecting signals.
     */
    removeRow(row: PrefsBoxOrderItemRow): void {
        const signalHandlerIds = this.#rowSignalHandlerIds.get(row) ?? [];

        for (const id of signalHandlerIds) {
            row.disconnect(id);
        }

        this.remove(row);
    }

    /**
     * Saves the box order represented by `this` (and its
     * `PrefsBoxOrderItemRows`) to settings.
     */
    saveBoxOrderToSettings(): void {
        this.#settings.set_strv(this.boxOrder, this.#getCurrentRoles());
    }

    /**
     * Determines whether or not each move action of each PrefsBoxOrderItemRow
     * should be enabled or disabled.
     */
    determineRowMoveActionEnable(): void {
        const isChained = this.isChained;

        for (let potentialPrefsBoxOrderItemRow of this) {
            // Only process PrefsBoxOrderItemRows.
            if (!(potentialPrefsBoxOrderItemRow instanceof PrefsBoxOrderItemRow)) {
                continue;
            }

            const row = potentialPrefsBoxOrderItemRow;

            // If the current row is the topmost row in the topmost list box
            // of the chain, then disable the move-up action. A standalone
            // (non-chained) list has no chain to migrate into at all, so its
            // topmost row disables move-up unconditionally.
            if (row.get_index() === 0 && (!isChained || this.boxOrder === "left-box-order")) {
                row.action_set_enabled("row.move-up", false);
            } else { // Else enable it.
                row.action_set_enabled("row.move-up", true);
            }

            // Same idea for the bottommost row of the bottommost list box in
            // the chain, or unconditionally for a standalone list.
            const rowNextSibling = row.get_next_sibling();
            const isLastRow = rowNextSibling instanceof PrefsBoxOrderListEmptyPlaceholder || rowNextSibling === null;
            if (isLastRow && (!isChained || this.boxOrder === "right-box-order")) {
                row.action_set_enabled("row.move-down", false);
            } else { // Else enable it.
                row.action_set_enabled("row.move-down", true);
            }
        }
    }
}
