"use strict";

import St from "gi://St"
import type Gio from "gi://Gio"

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as Panel from "resource:///org/gnome/shell/ui/panel.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import BoxOrderManager from "./extensionModules/BoxOrderManager.js";
import type { Box } from "./extensionModules/BoxOrderManager.js";

export interface CustomPanel extends Panel.Panel {
    _leftBox: St.BoxLayout;
    _centerBox: St.BoxLayout;
    _rightBox: St.BoxLayout;
}

/**
 * Finds the uuid of the extension whose code is calling into the current
 * call stack, if any, by looking for the first stack frame under an
 * `extensions/<uuid>/` path other than `ownUuid`.
 * Used since some extensions' role names are not a stable way to recognize
 * which "family" an item belongs to (see `BoxOrderManager`'s `Family`
 * mechanism) — e.g. tasks-in-panel@fthx names each item `taskButton${windowId}`,
 * a new value every time a window opens. Which extension's code added the
 * item is stable regardless of what it names that item.
 * @param {string | undefined} stack - A stack trace, as produced by `new Error().stack`.
 * @param {string} ownUuid - This extension's own uuid, so its own frames
 * (e.g. the override calling this) are skipped rather than misidentified.
 * @returns {string | null} The first other extension's uuid found in the
 * stack, or `null` if none could be determined (e.g. a core GNOME Shell
 * component added the item, or the stack format didn't match).
 */
function extractCreatorExtensionUuid(stack: string | undefined, ownUuid: string): string | null {
    if (!stack) {
        return null;
    }

    for (const line of stack.split("\n")) {
        const match = line.match(/\/extensions\/([^/]+)\//);
        if (match && match[1] !== ownUuid) {
            return match[1];
        }
    }

    return null;
}

export default class TopBarOrganizerExtension extends Extension {
    _settings!: Gio.Settings;
    _boxOrderManager!: BoxOrderManager;
    _settingsHandlerIds!: number[];

    enable(): void {
        this._settings = this.getSettings();

        this._boxOrderManager = new BoxOrderManager({}, this._settings);

        /// Stuff to do on startup(extension enable).
        // Initially handle new top bar items and order top bar boxes.
        this.#handleNewItemsAndOrderTopBar();

        // Overwrite the `Panel._addToPanelBox` method with one handling new
        // items.
        this.#overwritePanelAddToPanelBox();

        // Handle changes of settings.
        this._settingsHandlerIds = [];
        const addSettingsChangeHandler = (settingsName: string) => {
            const handlerId = this._settings.connect(`changed::${settingsName}`, () => {
                this.#handleNewItemsAndOrderTopBar();
            });
            this._settingsHandlerIds.push(handlerId);
        };
        addSettingsChangeHandler("left-box-order");
        addSettingsChangeHandler("center-box-order");
        addSettingsChangeHandler("right-box-order");
        addSettingsChangeHandler("hide");
        addSettingsChangeHandler("show");
    }

    disable(): void {
        // Revert the overwrite of `Panel._addToPanelBox`.
        // @ts-ignore
        Panel.Panel.prototype._addToPanelBox = Panel.Panel.prototype._originalAddToPanelBox;
        // Set `Panel._originalAddToPanelBox` to `undefined`.
        // @ts-ignore
        Panel.Panel.prototype._originalAddToPanelBox = undefined;

        // Disconnect signals.
        for (const handlerId of this._settingsHandlerIds) {
            this._settings.disconnect(handlerId);
        }

        // @ts-ignore
        this._settings = null;
        // @ts-ignore
        this._boxOrderManager = null;
    }

    ////////////////////////////////////////////////////////////////////////////
    /// Methods used on extension enable.                                    ///
    ////////////////////////////////////////////////////////////////////////////

    /**
     * Overwrite `Panel._addToPanelBox` with a custom method, which simply calls
     * the original one and handles new items and orders the top bar afterwards.
     */
    #overwritePanelAddToPanelBox(): void {
        // Add the original `Panel._addToPanelBox` method as
        // `Panel._originalAddToPanelBox`.
        // @ts-ignore
        Panel.Panel.prototype._originalAddToPanelBox = Panel.Panel.prototype._addToPanelBox;

        const handleNewItemsAndOrderTopBar = () => {
            this.#handleNewItemsAndOrderTopBar();
        };
        const recordItemCreator = (role: string) => {
            // Captured here, since this is called synchronously from within
            // the override below, which is itself called synchronously by
            // whichever extension is adding this role — the creator's stack
            // frame is present up the call chain at this exact point.
            const creatorUuid = extractCreatorExtensionUuid(new Error().stack, this.uuid);
            this._boxOrderManager.recordItemCreator(role, creatorUuid);
        };

        // Overwrite `Panel._addToPanelBox`.
        Panel.Panel.prototype._addToPanelBox = function(role, indicator, position, box) {
            // Simply call the original `_addToPanelBox` and order the top bar
            // and handle new items afterwards.
            // @ts-ignore
            this._originalAddToPanelBox(role, indicator, position, box);
            recordItemCreator(role);
            handleNewItemsAndOrderTopBar();
        };
    }

    ////////////////////////////////////////////////////////////////////////////
    /// Helper methods holding logic needed by other methods.                ///
    ////////////////////////////////////////////////////////////////////////////

    /**
     * This method orders the top bar items of the specified box according to
     * the configured box orders.
     * @param {Box} box - The box to order.
     */
    #orderTopBarItems(box: Box): void {
        // Only run, when the session mode is "user" or the parent session mode
        // is "user".
        if(Main.sessionMode.currentMode !== "user" && Main.sessionMode.parentMode !== "user") {
            return;
        }

        // Get the valid box order.
        const validBoxOrder = this._boxOrderManager.getValidBoxOrder(box);

        // Get the relevant box of `Main.panel`.
        let panelBox = (Main.panel as CustomPanel)[`_${box}Box`];

        /// Go through the items of the validBoxOrder and order the GNOME Shell
        /// top bar box accordingly.
        for (let i = 0; i < validBoxOrder.length; i++) {
            const item = validBoxOrder[i];
            // Get the indicator container associated with the current role.
            const associatedIndicatorContainer = (Main.panel.statusArea as any)[item.role]?.container;
            if (!(associatedIndicatorContainer instanceof St.Bin)) {
                // TODO: maybe add logging
                continue;
            }

            // Save whether or not the indicator container is visible.
            const isVisible = associatedIndicatorContainer.visible;

            // For the left/center boxes, `i` is a concrete target index, so
            // it's possible to tell in advance whether reparenting would
            // actually be a no-op and skip it — avoids touching the Clutter
            // actor tree at all on reorder passes triggered by unrelated
            // events (e.g. any other item being added anywhere in the top
            // bar) once this item is already correctly placed.
            // Not done for the right box: it always inserts at index `-1`
            // ("whatever the end of the box's children currently is, right
            // now"), not a fixed index, so there's no equally simple way to
            // tell in advance whether a given item's insert this pass would
            // actually be a no-op.
            const alreadyAtIndex = box !== "right" && panelBox.get_child_at_index(i) === associatedIndicatorContainer;

            if (!alreadyAtIndex) {
                const parent = associatedIndicatorContainer.get_parent();
                if (parent !== null) {
                    parent.remove_child(associatedIndicatorContainer);
                }
                if (box === "right") {
                    // If the target panel box is the right panel box, insert the
                    // indicator container at index `-1`, which just adds it to the
                    // end (correct order is ensured, since `validBoxOrder` is
                    // sorted correctly and we're looping over it in order).
                    // This way unaccounted-for indicator containers will be at the
                    // left, which is preferred, since the box is logically
                    // right-to-left.
                    // The same applies for indicator containers, which are just
                    // temporarily unaccounted for (like for indicator containers of
                    // not yet ready app indicators), since them being at the right
                    // for a probably temporary stay causes all the indicator
                    // containers to shift.
                    panelBox.insert_child_at_index(associatedIndicatorContainer, -1);
                } else {
                    panelBox.insert_child_at_index(associatedIndicatorContainer, i);
                }
            }

            // Hide the indicator container...
            // - ...if it wasn't visible before and the hide property of the
            //   item is "default".
            // - if the hide property of the item is "hide".
            // In all other cases have the item show.
            // An e.g. screen recording indicator still wouldn't show tho, since
            // this here acts on the indicator container, but a screen recording
            // indicator is hidden on the indicator level.
            if ((!isVisible && item.hide === "default") ||
                item.hide === "hide") {
                associatedIndicatorContainer.hide();
            }
        }
        // To handle the case, where the box order got set to a permutation
        // of an outdated box order, it would be wise, if the caller updated the
        // box order now to include the items present in the top bar.
    }

    /**
     * This method handles all new items currently present in the top bar and
     * orders the items of all top bar boxes.
     */
    #handleNewItemsAndOrderTopBar(): void {
        // Only run, when the session mode is "user" or the parent session mode
        // is "user".
        if(Main.sessionMode.currentMode !== "user" && Main.sessionMode.parentMode !== "user") {
            return;
        }

        this._boxOrderManager.saveNewTopBarItems();
        this.#orderTopBarItems("left");
        this.#orderTopBarItems("center");
        this.#orderTopBarItems("right");
        // In `this.#orderTopBarItems` it says to update the box orders to
        // include potentially new items, since the ordering might have been
        // based on an outdated box order. However, since we already handle new
        // top bar items at the beginning of this method, this isn't a concern.
    }
}
