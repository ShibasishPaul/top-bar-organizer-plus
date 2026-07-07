"use strict";

import GObject from "gi://GObject";
import Adw from "gi://Adw";
import GLib from "gi://GLib";

import setupDndScroll from "./setupDndScroll.js";
import PrefsBoxOrderListEmptyPlaceholder from "./PrefsBoxOrderListEmptyPlaceholder.js";
import type PrefsBoxOrderItemRow from "./PrefsBoxOrderItemRow.js";
import PrefsBoxOrderListBox from "./PrefsBoxOrderListBox.js";
import { FAMILIES, familyOrderKey } from "../Families.js";

export default class PrefsGroupsPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass({
            GTypeName: "PrefsGroupsPage",
            Template: GLib.uri_resolve_relative(import.meta.url, "../ui/prefs-groups-page.ui", GLib.UriFlags.NONE),
        }, this);
    }

    constructor(params = {}) {
        super(params);

        // One AdwPreferencesGroup + PrefsBoxOrderListBox per currently
        // known family, built dynamically instead of one static section per
        // family in the .ui file — a new family only needs an entry in
        // FAMILIES (src/Families.ts), no matching .ui edit required.
        for (const family of FAMILIES) {
            const group = new Adw.PreferencesGroup({
                title: family.displayName,
                description: family.groupDescription
                    ?? `Order ${family.displayName}'s items within their group. Unlike the Item Order page, this list has no adjacent box to migrate into — moving an item only reorders it within this group.`,
            });

            // Set `isChained`/`family` via plain post-construction JS
            // assignment, not the constructor's params object — TS class
            // field initializers (`_isChained: boolean = true;` etc.) run
            // right after `super(params)` returns and would silently
            // overwrite a value applied during construction. Setting
            // `family` before `boxOrder` still matters: the `boxOrder`
            // setter immediately builds rows using `this.family`.
            const listBox = new PrefsBoxOrderListBox({});
            listBox.isChained = false;
            listBox.family = family;
            listBox.boxOrder = familyOrderKey(family.id);
            listBox.connect("row-move", (emittedListBox: PrefsBoxOrderListBox, row: PrefsBoxOrderItemRow, direction: string) => {
                this.onRowMove(emittedListBox, row, direction);
            });

            group.add(listBox);
            this.add(group);
        }

        setupDndScroll(this);
    }

    /**
     * Every list box on this page is standalone (`is-chained` is false) —
     * there's no adjacent list to migrate a row into, so this only ever
     * moves a row within its own list, clamping (doing nothing) at either
     * boundary. Its buttons should already be disabled there (see
     * PrefsBoxOrderListBox#determineRowMoveActionEnable), but this doesn't
     * rely on that alone.
     */
    onRowMove(listBox: PrefsBoxOrderListBox, row: PrefsBoxOrderItemRow, direction: string): void {
        const rowPosition = row.get_index();

        if (direction === "up") {
            if (rowPosition === 0) {
                return;
            }
            listBox.removeRow(row);
            listBox.insertRow(row, rowPosition - 1);
        } else {
            const rowNextSibling = row.get_next_sibling();
            if (rowNextSibling instanceof PrefsBoxOrderListEmptyPlaceholder || rowNextSibling === null) {
                return;
            }
            listBox.removeRow(row);
            listBox.insertRow(row, rowPosition + 1);
        }

        listBox.saveBoxOrderToSettings();
        listBox.determineRowMoveActionEnable();
    }
}
