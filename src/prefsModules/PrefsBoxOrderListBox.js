/* exported PrefsBoxOrderListBox */
"use strict";

const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var PrefsBoxOrderListBox = GObject.registerClass({
    GTypeName: "PrefsBoxOrderListBox",
    Template: Me.dir.get_child("ui").get_child("prefs-box-order-list-box.ui").get_uri()
}, class PrefsBoxOrderListBox extends Gtk.ListBox {
    /**
     * @param {Object} params
     * @param {String} boxOrder - The box order this PrefsBoxOrderListBox is
     * associated with.
     */
    _init(params = {}, boxOrder) {
        super._init(params);

        this._settings = ExtensionUtils.getSettings();

        this.boxOrder = boxOrder;
    }

    /**
     * Saves the box order represented by `this` (and its
     * `PrefsBoxOrderItemRows`) to settings.
     */
    saveBoxOrderToSettings() {
        let currentBoxOrder = [ ];
        for (let potentialPrefsBoxOrderItemRow of this) {
            // Only process PrefsBoxOrderItemRows.
            if (potentialPrefsBoxOrderItemRow.constructor.$gtype.name !== "PrefsBoxOrderItemRow") continue;

            const item = potentialPrefsBoxOrderItemRow.item;
            currentBoxOrder.push(item);
        }
        this._settings.set_strv(this.boxOrder, currentBoxOrder);
    }
});
