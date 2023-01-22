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
    Template: Me.dir.get_child("ui").get_child("prefs-page.ui").get_uri()
}, class PrefsPage extends Adw.PreferencesPage {
    constructor(params = {}) {
        super(params);

        // Scroll up or down, when a Drag-and-Drop operation is in progress and
        // the user has their cursor either in the upper or lower 10% of this
        // widget respectively.
        // Pass `this.get_first_child()` to the ScrollManager, since this
        // `PrefsPage` extends an `Adw.PreferencesPage` and the first child of
        // an `Adw.PreferencesPage` is the built-in `Gtk.ScrolledWindow`.
        globalThis.scrollManager = new ScrollManager.ScrollManager(this.get_first_child());
        let controller = new Gtk.DropControllerMotion();
        controller.connect("motion", (_, x, y) => {
            // If the pointer is currently in the upper ten percent of this
            // widget, then scroll up.
            if (y <= this.get_allocated_height() * 0.1) scrollManager.startScrollUp();
            // If the pointer is currently in the lower ten percent of this
            // widget, then scroll down.
            else if (y >= this.get_allocated_height() * 0.9) scrollManager.startScrollDown();
            // Otherwise stop scrolling.
            else scrollManager.stopScrollAll();
        });
        controller.connect("leave", () => {
            // Stop scrolling on leave.
            scrollManager.stopScrollAll();
        });
        this.add_controller(controller);
    }
});
