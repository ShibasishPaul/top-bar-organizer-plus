"use strict";

import Gtk from "gi://Gtk";
import Gdk from "gi://Gdk";
import GObject from "gi://GObject";
import Adw from "gi://Adw";
import GLib from "gi://GLib";

export default class PrefsBoxOrderItemRow extends Adw.ActionRow {
    static {
        GObject.registerClass({
            GTypeName: "PrefsBoxOrderItemRow",
            Template: GLib.uri_resolve_relative(import.meta.url, "../ui/prefs-box-order-item-row.ui", GLib.UriFlags.NONE),
            InternalChildren: [
                "item-name-display-label",
            ],
            Signals: {
                "move": {
                    param_types: [GObject.TYPE_STRING],
                },
            },
        }, this);
        this.install_action("row.forget", null, (self, _actionName, _param) => {
            const parentListBox = self.get_parent();
            parentListBox.removeRow(self);
            parentListBox.saveBoxOrderToSettings();
            parentListBox.determineRowMoveActionEnable();
        });
        this.install_action("row.move-up", null, (self, _actionName, _param) => self.emit("move", "up"));
        this.install_action("row.move-down", null, (self, _actionName, _param) => self.emit("move", "down"));
    }

    #drag_starting_point_x;
    #drag_starting_point_y;

    constructor(params = {}, item) {
        super(params);

        this.#associateItem(item);
    }

    /**
     * Associate `this` with an item.
     * @param {String} item
     */
    #associateItem(item) {
        this.item = item;

        if (item.startsWith("appindicator-kstatusnotifieritem-")) {
            // Set `this._item_name_display_label` to something nicer, if the
            // associated item is an AppIndicator/KStatusNotifierItem item.
            this._item_name_display_label.set_label(item.replace("appindicator-kstatusnotifieritem-", ""));
        } else {
            // Otherwise just set it to `item`.
            this._item_name_display_label.set_label(item);
        }
    }

    onDragPrepare(_source, x, y) {
        const value = new GObject.Value();
        value.init(PrefsBoxOrderItemRow);
        value.set_object(this);

        this.#drag_starting_point_x = x;
        this.#drag_starting_point_y = y;
        return Gdk.ContentProvider.new_for_value(value);
    }

    onDragBegin(_source, drag) {
        let dragWidget = new Gtk.ListBox();
        let allocation = this.get_allocation();
        dragWidget.set_size_request(allocation.width, allocation.height);

        let dragPrefsBoxOrderItemRow = new PrefsBoxOrderItemRow({}, this.item);
        dragWidget.append(dragPrefsBoxOrderItemRow);
        dragWidget.drag_highlight_row(dragPrefsBoxOrderItemRow);

        let currentDragIcon = Gtk.DragIcon.get_for_drag(drag);
        currentDragIcon.set_child(dragWidget);
        drag.set_hotspot(this.#drag_starting_point_x, this.#drag_starting_point_y);
    }

    // Handle a new drop on `this` properly.
    // `value` is the thing getting dropped.
    onDrop(_target, value, _x, _y) {
        // If `this` got dropped onto itself, do nothing.
        if (value === this) {
            return;
        }

        // Get the GtkListBoxes of `this` and the drop value.
        const ownListBox = this.get_parent();
        const valueListBox = value.get_parent();

        // Get the position of `this` and the drop value.
        const ownPosition = this.get_index();
        const valuePosition = value.get_index();

        // Remove the drop value from its list box.
        valueListBox.removeRow(value);

        // Since an element got potentially removed from the list of `this`,
        // get the position of `this` again.
        const updatedOwnPosition = this.get_index();

        if (ownListBox !== valueListBox) {
            // First handle the case where `this` and the drop value are in
            // different list boxes.
            if ((ownListBox.boxOrder === "right-box-order" && valueListBox.boxOrder === "left-box-order")
                || (ownListBox.boxOrder === "right-box-order" && valueListBox.boxOrder === "center-box-order")
                || (ownListBox.boxOrder === "center-box-order" && valueListBox.boxOrder === "left-box-order")) {
                // If the list box of the drop value comes before the list
                // box of `this`, add the drop value after `this`.
                ownListBox.insertRow(value, updatedOwnPosition + 1);
            } else {
                // Otherwise, add the drop value where `this` currently is.
                ownListBox.insertRow(value, updatedOwnPosition);
            }
        } else {
            if (valuePosition < ownPosition) {
                // If the drop value was before `this`, add the drop value
                // after `this`.
                ownListBox.insertRow(value, updatedOwnPosition + 1);
            } else {
                // Otherwise, add the drop value where `this` currently is.
                ownListBox.insertRow(value, updatedOwnPosition);
            }
        }

        /// Finally save the box order(/s) to settings and make sure move
        /// actions are correctly enabled/disabled.
        ownListBox.saveBoxOrderToSettings();
        ownListBox.determineRowMoveActionEnable();
        // If the list boxes of `this` and the drop value were different, handle
        // the former list box of the drop value as well.
        if (ownListBox !== valueListBox) {
            valueListBox.saveBoxOrderToSettings();
            valueListBox.determineRowMoveActionEnable();
        }
    }
}
