/*
 * This file is part of Top-Bar-Organizer (a Gnome Shell Extension for
 * organizing your Gnome Shell top bar).
 * Copyright (C) 2021-2022 Julian Schacher
 *
 * Top-Bar-Organizer is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
/* exported buildPrefsWidget, init */
"use strict";

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
    Template: Me.dir.get_child("prefs-page.ui").get_uri(),
    InternalChildren: [
        "left-box",
        "center-box",
        "right-box"
    ]
}, class PrefsPage extends Adw.PreferencesPage {
    _init(params = {}) {
        super._init(params);

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

function buildPrefsWidget() {
    return new PrefsPage();
}

function init() {
}
