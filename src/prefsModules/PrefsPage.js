"use strict";
/* exported PrefsPage */

const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;
const Adw = imports.gi.Adw;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PrefsBoxOrderListBox = Me.imports.prefsModules.PrefsBoxOrderListBox;
const PrefsBoxOrderListEmptyPlaceholder = Me.imports.prefsModules.PrefsBoxOrderListEmptyPlaceholder;
const PrefsBoxOrderItemRow = Me.imports.prefsModules.PrefsBoxOrderItemRow;
const ScrollManager = Me.imports.prefsModules.ScrollManager;

var PrefsPage = GObject.registerClass({
    GTypeName: "PrefsPage",
    Template: Me.dir.get_child("ui").get_child("prefs-page.ui").get_uri(),
    InternalChildren: [
        "left-box",
        "center-box",
        "right-box"
    ]
}, class PrefsPage extends Adw.PreferencesPage {
    constructor(params = {}) {
        super(params);

        this._settings = ExtensionUtils.getSettings();

        // Scroll up or down, when a Drag-and-Drop operation is in progress and
        // the user has their cursor either in the upper or lower 10% of this
        // widget respectively.
        // Pass `this.get_first_child()` to the ScrollManager, since this
        // `PrefsPage` extends an `Adw.PreferencesPage` and the first child of
        // an `Adw.PreferencesPage` is the built-in `Gtk.ScrolledWindow`.
        this._scrollManager = new ScrollManager.ScrollManager(this.get_first_child());
        let controller = new Gtk.DropControllerMotion();
        controller.connect("motion", (_, x, y) => {
            // If the pointer is currently in the upper ten percent of this
            // widget, then scroll up.
            if (y <= this.get_allocated_height() * 0.1) this._scrollManager.startScrollUp();
            // If the pointer is currently in the lower ten percent of this
            // widget, then scroll down.
            else if (y >= this.get_allocated_height() * 0.9) this._scrollManager.startScrollDown();
            // Otherwise stop scrolling.
            else this._scrollManager.stopScrollAll();
        });
        controller.connect("leave", () => {
            // Stop scrolling on leave.
            this._scrollManager.stopScrollAll();
        });
        this.add_controller(controller);

        // Add custom GTKListBoxes (PrefsBoxOrderListBoxes).
        this._left_box_order = new PrefsBoxOrderListBox.PrefsBoxOrderListBox({}, "left-box-order");
        this._left_box.append(this._left_box_order);
        this._center_box_order = new PrefsBoxOrderListBox.PrefsBoxOrderListBox({}, "center-box-order");
        this._center_box.append(this._center_box_order);
        this._right_box_order = new PrefsBoxOrderListBox.PrefsBoxOrderListBox({}, "right-box-order");
        this._right_box.append(this._right_box_order);

        // Initialize the given `gtkListBox`.
        const initializeGtkListBox = (boxOrder, gtkListBox) => {
            // Add the items of the given configured box order as
            // GtkListBoxRows.
            for (const item of boxOrder) {
                const listBoxRow = new PrefsBoxOrderItemRow.PrefsBoxOrderItemRow({}, this._scrollManager, item);
                gtkListBox.append(listBoxRow);
            }

            // Add a placeholder widget for the case, where `gtkListBox` doesn't
            // have any GtkListBoxRows.
            gtkListBox.set_placeholder(new PrefsBoxOrderListEmptyPlaceholder.PrefsBoxOrderListEmptyPlaceholder());
        };

        initializeGtkListBox(this._settings.get_strv("left-box-order"), this._left_box_order);
        initializeGtkListBox(this._settings.get_strv("center-box-order"), this._center_box_order);
        initializeGtkListBox(this._settings.get_strv("right-box-order"), this._right_box_order);
    }
});
