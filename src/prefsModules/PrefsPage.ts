"use strict";

import GObject from "gi://GObject";
import Adw from "gi://Adw";
import GLib from "gi://GLib";

import setupDndScroll from "./setupDndScroll.js";
import PrefsBoxOrderListEmptyPlaceholder from "./PrefsBoxOrderListEmptyPlaceholder.js";
import type PrefsBoxOrderItemRow from "./PrefsBoxOrderItemRow.js";

// Imports to make UI file work.
// eslint-disable-next-line
import PrefsBoxOrderListBox from "./PrefsBoxOrderListBox.js";

export default class PrefsPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass({
            GTypeName: "PrefsPage",
            Template: GLib.uri_resolve_relative(import.meta.url, "../ui/prefs-page.ui", GLib.UriFlags.NONE),
            InternalChildren: [
                "left-box-order-list-box",
                "center-box-order-list-box",
                "right-box-order-list-box",
            ],
        }, this);
    }

    declare _left_box_order_list_box: PrefsBoxOrderListBox;
    declare _center_box_order_list_box: PrefsBoxOrderListBox;
    declare _right_box_order_list_box: PrefsBoxOrderListBox;

    constructor(params = {}) {
        super(params);

        setupDndScroll(this);
    }

    onRowMove(listBox: PrefsBoxOrderListBox, row: PrefsBoxOrderItemRow, direction: string): void {
        const rowPosition = row.get_index();

        if (direction === "up") { // If the direction of the move is up.
            // Handle the case, where the row is the topmost row in the list box.
            if (rowPosition === 0) {
                switch (listBox.boxOrder) {
                    // If the row is also in the topmost list box, then do
                    // nothing and return.
                    case "left-box-order":
                        log("The row is already the topmost row in the topmost box order.");
                        return;
                    // If the row is in the center list box, then move it up to
                    // the left one.
                    case "center-box-order":
                        listBox.removeRow(row);
                        this._left_box_order_list_box.insertRow(row, -1);
                        // First save the box order of the destination, then do
                        // "a save for clean up".
                        this._left_box_order_list_box.saveBoxOrderToSettings();
                        this._left_box_order_list_box.determineRowMoveActionEnable();
                        listBox.saveBoxOrderToSettings();
                        listBox.determineRowMoveActionEnable();
                        return;
                    // If the row is in the right list box, then move it up to
                    // the center one.
                    case "right-box-order":
                        listBox.removeRow(row);
                        this._center_box_order_list_box.insertRow(row, -1);
                        this._center_box_order_list_box.saveBoxOrderToSettings();
                        this._center_box_order_list_box.determineRowMoveActionEnable();
                        listBox.saveBoxOrderToSettings();
                        listBox.determineRowMoveActionEnable();
                        return;
                }
            }

            // Else just move the row up in the box.
            listBox.removeRow(row);
            listBox.insertRow(row, rowPosition - 1);
            listBox.saveBoxOrderToSettings();
            listBox.determineRowMoveActionEnable();
            return;
        } else { // Else the direction of the move must be down.
            // Handle the case, where the row is the bottommost row in the list box.
            const rowNextSibling = row.get_next_sibling();
            if (rowNextSibling instanceof PrefsBoxOrderListEmptyPlaceholder || rowNextSibling === null) {
                switch (listBox.boxOrder) {
                    // If the row is also in the bottommost list box, then do
                    // nothing and return.
                    case "right-box-order":
                        log("The row is already the bottommost row in the bottommost box order.");
                        return;
                    // If the row is in the center list box, then move it down
                    // to the right one.
                    case "center-box-order":
                        listBox.removeRow(row);
                        this._right_box_order_list_box.insertRow(row, 0);
                        this._right_box_order_list_box.saveBoxOrderToSettings();
                        this._right_box_order_list_box.determineRowMoveActionEnable();
                        listBox.saveBoxOrderToSettings();
                        listBox.determineRowMoveActionEnable();
                        return;
                    // If the row is in the left list box, then move it down to
                    // the center one.
                    case "left-box-order":
                        listBox.removeRow(row);
                        this._center_box_order_list_box.insertRow(row, 0);
                        this._center_box_order_list_box.saveBoxOrderToSettings();
                        this._center_box_order_list_box.determineRowMoveActionEnable();
                        listBox.saveBoxOrderToSettings();
                        listBox.determineRowMoveActionEnable();
                        return;
                }
            }

            // Else just move the row down in the box.
            listBox.removeRow(row);
            listBox.insertRow(row, rowPosition + 1);
            listBox.saveBoxOrderToSettings();
            listBox.determineRowMoveActionEnable();
            return;
        }
    }
}
