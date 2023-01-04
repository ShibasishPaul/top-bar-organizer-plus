/* exported PrefsBoxOrderItemRow */
"use strict";

const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Adw = imports.gi.Adw;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var PrefsBoxOrderItemRow = GObject.registerClass({
    GTypeName: "PrefsBoxOrderItemRow",
    Template: Me.dir.get_child("prefs-box-order-item-row.ui").get_uri(),
    InternalChildren: [
        "item-name-display-label",
        "menu-button"
    ]
}, class PrefsBoxOrderItemRow extends Adw.ActionRow {
    _init(params = {}, scrollManager, item) {
        super._init(params);

        this._associateItem(item);
        this._configureMenu();

        // Make `this` draggable by creating a drag source and adding it to
        // `this`.
        let dragSource = new Gtk.DragSource();
        dragSource.set_actions(Gdk.DragAction.MOVE);
        dragSource.connect("prepare", (source, x, y) => {
            this._drag_starting_point_x = x;
            this._drag_starting_point_y = y;
            return Gdk.ContentProvider.new_for_value(this);
        });
        // Stop all scrolling, which is due to this DND operation.
        dragSource.connect("drag-end", () => {
            scrollManager.stopScrollAll();
        });
        dragSource.connect("drag-begin", (source, drag) => {
            let dragWidget = new Gtk.ListBox();
            let allocation = this.get_allocation();
            dragWidget.set_size_request(allocation.width, allocation.height);

            let dragPrefsBoxOrderItemRow = new PrefsBoxOrderItemRow({}, null, this.item)
            dragWidget.append(dragPrefsBoxOrderItemRow);
            dragWidget.drag_highlight_row(dragPrefsBoxOrderItemRow);

            let currentDragIcon = Gtk.DragIcon.get_for_drag(drag);
            currentDragIcon.set_child(dragWidget);
            drag.set_hotspot(this._drag_starting_point_x, this._drag_starting_point_y);
        });
        this.add_controller(dragSource);

        /// Make `this` accept drops by creating a drop target and adding it to
        /// `this`.
        let dropTarget = new Gtk.DropTarget();
        dropTarget.set_gtypes([this.constructor.$gtype]);
        dropTarget.set_actions(Gdk.DragAction.MOVE);
        // Handle a new drop on `this` properly.
        // `value` is the thing getting dropped.
        dropTarget.connect("drop", (target, value) => {
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
            valueListBox.remove(value);

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
                    ownListBox.insert(value, updatedOwnPosition + 1);
                } else {
                    // Otherwise, add the drop value where `this` currently is.
                    ownListBox.insert(value, updatedOwnPosition);
                }
            } else {
                if (valuePosition < ownPosition) {
                    // If the drop value was before `this`, add the drop value
                    // after `this`.
                    ownListBox.insert(value, updatedOwnPosition + 1);
                } else {
                    // Otherwise, add the drop value where `this` currently is.
                    ownListBox.insert(value, updatedOwnPosition);
                }
            }

            /// Finally save the box order(/s) to settings.
            ownListBox.saveBoxOrderToSettings();
            // If the list boxes of `this` and the drop value were different,
            // save an updated box order for the list were the drop value was in
            // as well.
            if (ownListBox !== valueListBox) valueListBox.saveBoxOrderToSettings();
        });
        this.add_controller(dropTarget);
    }

    /**
     * Associate `this` with an item.
     * @param {String} item
     */
    _associateItem(item) {
        this.item = item;

        // Set `this._item_name_display_label` to something nicer, if the
        // associated item is an AppIndicator/KStatusNotifierItem item.
        if (item.startsWith("appindicator-kstatusnotifieritem-")) this._item_name_display_label.set_label(item.replace("appindicator-kstatusnotifieritem-", ""));
        // Otherwise just set it to `item`.
        else this._item_name_display_label.set_label(item);
    }

    /**
     * Configure the menu.
     */
    _configureMenu() {
        let menu = new Gio.Menu();
        menu.append("Forget", `prefsBoxOrderItemRow-${this.item}.forget`);
        this._menu_button.set_menu_model(menu);

        const forgetAction = new Gio.SimpleAction({ name: "forget" });
        forgetAction.connect("activate", () => {
            const parentListBox = this.get_parent();
            parentListBox.remove(this);
            parentListBox.saveBoxOrderToSettings();
        });

        const actionGroup = new Gio.SimpleActionGroup();
        actionGroup.add_action(forgetAction);
        this.insert_action_group(`prefsBoxOrderItemRow-${this.item}`, actionGroup);
    }
});
