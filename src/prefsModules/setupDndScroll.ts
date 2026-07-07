"use strict";

import Gdk from "gi://Gdk";
import Gtk from "gi://Gtk";
import type Adw from "gi://Adw";

import ScrollManager from "./ScrollManager.js";

/**
 * Sets up Drag-and-Drop scrolling for the given preferences page.
 * This means that scroll up or down is happening when a Drag-and-Drop
 * operation is in progress and the user has their cursor either in the
 * upper or lower 10% of the page respectively.
 * Shared by every AdwPreferencesPage this extension's prefs window hosts, so
 * pages beyond the first one don't each need their own copy.
 * @param {Adw.PreferencesPage} page - The page to set this up for.
 */
export default function setupDndScroll(page: Adw.PreferencesPage): void {
    // Pass `page.get_first_child()` to the ScrollManager, since the first
    // child of an `Adw.PreferencesPage` is the built-in `Gtk.ScrolledWindow`.
    const scrollManager = new ScrollManager(page.get_first_child() as Gtk.ScrolledWindow);

    /// Setup GtkDropControllerMotion event controller and make use of its
    /// events.
    let controller = new Gtk.DropControllerMotion();

    // Make sure scrolling stops, when DND operation ends.
    let dndEnded = true;

    // Scroll, when the pointer is in the right places and a DND operation
    // is properly set up (dndEnded is false).
    controller.connect("motion", (_, _x, y) => {
        if ((y <= page.get_allocated_height() * 0.1) && !dndEnded) {
            // If the pointer is currently in the upper ten percent of the
            // page, then scroll up.
            scrollManager.startScrollUp();
        } else if ((y >= page.get_allocated_height() * 0.9) && !dndEnded) {
            // If the pointer is currently in the lower ten percent of the
            // page, then scroll down.
            scrollManager.startScrollDown();
        } else {
            // Otherwise stop scrolling.
            scrollManager.stopScrollAll();
        }
    });

    const stopScrollAllAtDNDEnd = () => {
        dndEnded = true;
        scrollManager.stopScrollAll();
    };
    controller.connect("leave", () => {
        stopScrollAllAtDNDEnd();
    });
    controller.connect("enter", () => {
        // Make use of `dndEnded` to setup stopScrollAtDNDEnd only once per
        // DND operation.
        if (dndEnded) {
            const drag = controller.get_drop()?.get_drag() ?? null;
            // Ensure we have a Gdk.Drag.
            // If this is not the case for whatever reason, then don't start
            // DND scrolling and just return.
            if (!(drag instanceof Gdk.Drag)) {
                // TODO: maybe add logging
                return;
            }
            drag.connect("drop-performed", () => {
                stopScrollAllAtDNDEnd();
            });
            drag.connect("dnd-finished", () => {
                stopScrollAllAtDNDEnd();
            });
            drag.connect("cancel", () => {
                stopScrollAllAtDNDEnd();
            });
            dndEnded = false;
        }
    });

    page.add_controller(controller);
}
