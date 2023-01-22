/* exported PrefsBoxOrderListEmptyPlaceholder */
"use strict";

const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const GObject = imports.gi.GObject;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var PrefsBoxOrderListEmptyPlaceholder = GObject.registerClass({
    GTypeName: "PrefsBoxOrderListEmptyPlaceholder",
    Template: Me.dir.get_child("ui").get_child("prefs-box-order-list-empty-placeholder.ui").get_uri()
}, class PrefsBoxOrderListEmptyPlaceholder extends Gtk.Box {
    constructor(params = {}) {
        super(params);
    }

    // Handle a new drop on `this` properly.
    // `value` is the thing getting dropped.
    onDrop(_target, value, _x, _y) {
        // Get the GtkListBoxes of `this` and the drop value.
        const ownListBox = this.get_parent();
        const valueListBox = value.get_parent();

        // Remove the drop value from its list box.
        valueListBox.remove(value);

        // Insert the drop value into the list box of `this`.
        ownListBox.insert(value, 0);

        /// Finally save the box orders to settings.
        settings.set_strv(ownListBox.boxOrder, [value.item]);

        let updatedBoxOrder = [ ];
        for (let potentialListBoxRow of valueListBox) {
            // Only process PrefsBoxOrderItemRows.
            if (potentialListBoxRow.constructor.$gtype.name !== "PrefsBoxOrderItemRow") {
                continue;
            }

            const item = potentialListBoxRow.item;
            updatedBoxOrder.push(item);
        }
        settings.set_strv(valueListBox.boxOrder, updatedBoxOrder);
    }
});
