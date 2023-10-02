"use strict";

import Gtk from "gi://Gtk";
import GObject from "gi://GObject";
import Adw from "gi://Adw";
import GLib from "gi://GLib";

import ScrollManager from "./ScrollManager.js";

// Imports to make UI file work.
import PrefsBoxOrderListBox from "./PrefsBoxOrderListBox.js";

const PrefsPage = GObject.registerClass({
    GTypeName: "PrefsPage",
    Template: GLib.uri_resolve_relative(import.meta.url, "../ui/prefs-page.ui", GLib.UriFlags.NONE)
}, class PrefsPage extends Adw.PreferencesPage {
    constructor(params = {}) {
        super(params);

        this.#setupDNDScroll();
    }

    /**
     * This function sets up Drag-and-Drop scrolling.
     * This means that scroll up or down is happening when a Drag-and-Drop
     * operation is in progress and the user has their cursor either in the
     * upper or lower 10% of this widget respectively.
     */
    #setupDNDScroll() {
        // Pass `this.get_first_child()` to the ScrollManager, since this
        // `PrefsPage` extends an `Adw.PreferencesPage` and the first child of
        // an `Adw.PreferencesPage` is the built-in `Gtk.ScrolledWindow`.
        const scrollManager = new ScrollManager(this.get_first_child());

        /// Setup GtkDropControllerMotion event controller and make use of its
        /// events.
        let controller = new Gtk.DropControllerMotion();

        // Scroll, when the pointer is in the right places.
        controller.connect("motion", (_, _x, y) => {
            if (y <= this.get_allocated_height() * 0.1) {
                // If the pointer is currently in the upper ten percent of this
                // widget, then scroll up.
                scrollManager.startScrollUp();
            } else if (y >= this.get_allocated_height() * 0.9) {
                // If the pointer is currently in the lower ten percent of this
                // widget, then scroll down.
                scrollManager.startScrollDown();
            } else {
                // Otherwise stop scrolling.
                scrollManager.stopScrollAll();
            }
        });

        // Make sure scrolling stops, when DND operation ends.
        this._dndEnded = true;
        const stopScrollAllAtDNDEnd = () => {
            scrollManager.stopScrollAll();
            this._dndEnded = true;
        };
        controller.connect("leave", () => {
            stopScrollAllAtDNDEnd();
        });
        controller.connect("enter", () => {
            // Make use of `this._dndEnded` to setup stopScrollAtDNDEnd only
            // once per DND operation.
            if (this._dndEnded) {
                let drag = controller.get_drop().get_drag();
                drag.connect("drop-performed", () => {
                    stopScrollAllAtDNDEnd();
                });
                drag.connect("dnd-finished", () => {
                    stopScrollAllAtDNDEnd();
                });
                drag.connect("cancel", () => {
                    stopScrollAllAtDNDEnd();
                });
                this._dndEnded = false;
            }
        });

        this.add_controller(controller);
    }
});

export default PrefsPage;
