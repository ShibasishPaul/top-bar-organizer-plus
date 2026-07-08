"use strict";

import Gtk from "gi://Gtk";
import Gdk from "gi://Gdk";
import Gio from "gi://Gio";
import GObject from "gi://GObject";
import Adw from "gi://Adw";
import GLib from "gi://GLib";

import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import PrefsBoxOrderItemOptionsDialog from "./PrefsBoxOrderItemOptionsDialog.js";
import type PrefsBoxOrderListBox from "./PrefsBoxOrderListBox.js";
import { FAMILIES, type Family, findFamilyByGroupSettingsId, familyGroupSettingsId } from "../Families.js";
import { assignRoleToFamily, removeRoleFromFamily } from "../FamilySettings.js";

export default class PrefsBoxOrderItemRow extends Adw.ActionRow {
    static {
        GObject.registerClass({
            GTypeName: "PrefsBoxOrderItemRow",
            Template: GLib.uri_resolve_relative(import.meta.url, "../ui/prefs-box-order-item-row.ui", GLib.UriFlags.NONE),
            InternalChildren: [
                "options-menu-button",
            ],
            Signals: {
                "move": {
                    param_types: [GObject.TYPE_STRING],
                },
            },
        }, this);
        this.install_action("row.forget", null, (self, _actionName, _param) => {
            const parentListBox = self.get_parent() as PrefsBoxOrderListBox;
            parentListBox.removeRow(self as PrefsBoxOrderItemRow);
            parentListBox.saveBoxOrderToSettings();
            parentListBox.determineRowMoveActionEnable();
        });
        this.install_action("row.options", null, (self, _actionName, _param) => {
            const itemOptionsDialog = new PrefsBoxOrderItemOptionsDialog({
                // Get the title from self as the constructor of
                // PrefsBoxOrderItemRow already processes the item name into a
                // nice title.
                title: (self as PrefsBoxOrderItemRow).get_title()
            }, (self as PrefsBoxOrderItemRow).item);
            itemOptionsDialog.present(self);
        });
        this.install_action("row.move-up", null, (self, _actionName, _param) => self.emit("move", "up"));
        this.install_action("row.move-down", null, (self, _actionName, _param) => self.emit("move", "down"));
        // Move a standalone row into the given family (parameterized by
        // family id, so a single action covers every family instead of one
        // per-family action — new families just start showing up in the
        // submenu built in `#buildOptionsMenu`, no new action needed).
        this.install_action("row.move-to-group", "s", (self, _actionName, param) => {
            const row = self as PrefsBoxOrderItemRow;
            const familyId = (param as GLib.Variant).get_string()[0];
            const family = FAMILIES.find(f => f.id === familyId);
            if (!family) {
                return;
            }
            assignRoleToFamily(row.#settings, family, row.item);
        });
        this.install_action("row.remove-from-group", null, (self, _actionName, _param) => {
            const row = self as PrefsBoxOrderItemRow;
            if (!row.family) {
                return;
            }
            removeRoleFromFamily(row.#settings, row.family, row.item);
        });
    }

    item: string;
    family: Family | null;
    declare _options_menu_button: Gtk.MenuButton;
    #settings: Gio.Settings;
    #drag_starting_point_x?: number;
    #drag_starting_point_y?: number;
    // Whether this row represents the AppIndicator family's collapsed group
    // slot (Item Order page) or one of its members (Groups page) while
    // `appindicator-order-mode` isn't "full". Locked instead of removed,
    // since the settings this row represents are deliberately preserved
    // across mode switches (see `BoxOrderManager#getResolvedBoxOrder`) —
    // this only prevents the UI from implying the position/order can be
    // changed right now; `#getResolvedBoxOrder` independently guarantees
    // the same thing has no effect on the actual top bar regardless of UI.
    #appIndicatorLocked: boolean = false;
    #appIndicatorOrderModeChangedHandlerId?: number;

    /**
     * @param {Object} params
     * @param {string} item - The role (or family collapsed-group id) this
     * row represents.
     * @param {Family | null} family - The family this row's list box is
     * bound to, if it's a family member list — used for title formatting
     * and to decide which group action ("Move to Group" vs "Remove from
     * Group") to offer. `null` for rows on a chained (left/center/right)
     * list.
     */
    constructor(params = {}, item: string, family: Family | null = null) {
        super(params);

        // Associate `this` with an item.
        this.item = item;
        this.family = family;
        this.#settings = ExtensionPreferences.lookupByURL(import.meta.url)!.getSettings();

        if (this.item.startsWith("appindicator-kstatusnotifieritem-")) {
            // Set the title to something nicer, if the associated item is an
            // AppIndicator/KStatusNotifierItem item.
            this.set_title(this.item.replace("appindicator-kstatusnotifieritem-", ""));
        } else {
            const groupFamily = findFamilyByGroupSettingsId(this.item);
            if (groupFamily) {
                // This row represents a family's collapsed group slot on the
                // Item Order page.
                this.set_title(`${groupFamily.displayName} Items`);
            } else if (this.family?.formatMemberTitle) {
                // This row represents an individual family member on the
                // Groups page.
                this.set_title(this.family.formatMemberTitle(this.item));
            } else {
                // Otherwise just set it to `item`.
                this.set_title(this.item);
            }
        }

        this._options_menu_button.set_menu_model(this.#buildOptionsMenu());

        if (findFamilyByGroupSettingsId(this.item) !== undefined) {
            // "Forget" can't have a lasting effect on a family's collapsed
            // group slot row: as long as the family still has members,
            // removing the group id from box-order just gets it silently
            // re-added on the extension's next reconciliation pass (see
            // `BoxOrderManager#saveNewTopBarItems`, which re-derives the
            // group id for any still-live member and adds it back if
            // missing). And if the family has no members left, this row
            // doesn't exist to begin with — `removeRoleFromFamily` already
            // replaces an emptied-out group's placeholder with its last
            // freed member directly instead of leaving a pointless empty
            // group behind. So there's no state this row can be in where
            // "Forget" would ever have a lasting effect. Greyed out
            // instead of left to silently no-op.
            // (Individual family member rows on the Groups page are
            // unaffected by this and keep "Forget" enabled — it's the only
            // way to manually clear a stale member for a family that
            // doesn't auto-prune, see `Family.pruneStaleMembers`.)
            this.action_set_enabled("row.forget", false);
        }

        // Only the AppIndicator family's group slot row and its members can
        // ever be locked this way — every other row is unaffected and this
        // never re-evaluates for them.
        if (this.item === familyGroupSettingsId("appindicator") || this.family?.id === "appindicator") {
            this.#updateAppIndicatorLockState();
            this.#appIndicatorOrderModeChangedHandlerId = this.#settings.connect("changed::appindicator-order-mode", () => {
                this.#updateAppIndicatorLockState();
            });
            this.connect("destroy", () => {
                if (this.#appIndicatorOrderModeChangedHandlerId !== undefined) {
                    this.#settings.disconnect(this.#appIndicatorOrderModeChangedHandlerId);
                }
            });
        }
    }

    /**
     * Whether this row is currently locked (see `#appIndicatorLocked`).
     * Consulted by `PrefsBoxOrderListBox#determineRowMoveActionEnable` to
     * force-disable the move actions, and by `onDrop` as a defense-in-depth
     * check against a locked row somehow still being dragged.
     */
    isLocked(): boolean {
        return this.#appIndicatorLocked;
    }

    /**
     * Refreshes this row's lock state and explanatory subtitle from the
     * current `appindicator-order-mode` value.
     */
    #updateAppIndicatorLockState(): void {
        this.#appIndicatorLocked = this.#settings.get_string("appindicator-order-mode") !== "full";
        this.set_subtitle(this.#appIndicatorLocked
            ? "Only reorderable while AppIndicator ordering mode is set to \"Full\""
            : "");
    }

    /**
     * Builds this row's three-dot options menu. Built programmatically
     * (rather than as a static block in the .ui file) so the "Move to
     * Group"/"Remove from Group" section can be populated dynamically from
     * the current FAMILIES list and from whether this row is itself a
     * family member — no per-family menu entries to keep in sync by hand
     * as families get added.
     */
    #buildOptionsMenu(): Gio.Menu {
        const menu = new Gio.Menu();

        const moveSection = new Gio.Menu();
        moveSection.append("Move Up", "row.move-up");
        moveSection.append("Move Down", "row.move-down");
        menu.append_section(null, moveSection);

        const optionsSection = new Gio.Menu();
        optionsSection.append("Options", "row.options");
        menu.append_section(null, optionsSection);

        // Not offered for a family's own collapsed-group row (moving/removing
        // the group itself as a whole isn't a supported operation here) —
        // only for rows representing an actual role, on either page.
        const isGroupPlaceholderRow = findFamilyByGroupSettingsId(this.item) !== undefined;
        if (!isGroupPlaceholderRow) {
            const groupSection = new Gio.Menu();
            if (this.family) {
                // This row is a family member (Groups page) — offer to
                // unassign it back to being a standalone top-level item.
                groupSection.append("Remove from Group", "row.remove-from-group");
            } else if (FAMILIES.length > 0) {
                // This row is a standalone item (Item Order page) — offer
                // to assign it into any currently known family.
                const moveToGroupMenu = new Gio.Menu();
                for (const family of FAMILIES) {
                    // Built via a real GVariant target rather than a
                    // detailed-action-name string (e.g.
                    // "row.move-to-group::gsconnect") — avoids relying on
                    // g_action_parse_detailed_name()'s string grammar
                    // (whose `::` shorthand and `(...)` GVariant-text forms
                    // have different, easy-to-conflate quoting rules).
                    const menuItem = new Gio.MenuItem();
                    menuItem.set_label(family.displayName);
                    menuItem.set_action_and_target_value("row.move-to-group", GLib.Variant.new_string(family.id));
                    moveToGroupMenu.append_item(menuItem);
                }
                groupSection.append_submenu("Move to Group", moveToGroupMenu);
            }
            if (groupSection.get_n_items() > 0) {
                menu.append_section(null, groupSection);
            }
        }

        const forgetSection = new Gio.Menu();
        forgetSection.append("Forget", "row.forget");
        menu.append_section(null, forgetSection);

        return menu;
    }

    onDragPrepare(_source: Gtk.DragSource, x: number, y: number): Gdk.ContentProvider | null {
        // Refuse to even start a drag for a locked row — returning `null`
        // from a `GtkDragSource`'s "prepare" handler cancels the drag.
        if (this.#appIndicatorLocked) {
            return null;
        }

        const value = new GObject.Value();
        value.init(PrefsBoxOrderItemRow.$gtype);
        value.set_object(this);

        this.#drag_starting_point_x = x;
        this.#drag_starting_point_y = y;
        return Gdk.ContentProvider.new_for_value(value);
    }

    onDragBegin(_source: Gtk.DragSource, drag: Gdk.Drag): void {
        let dragWidget = new Gtk.ListBox();
        let allocation = this.get_allocation();
        dragWidget.set_size_request(allocation.width, allocation.height);

        let dragPrefsBoxOrderItemRow = new PrefsBoxOrderItemRow({}, this.item, this.family);
        dragWidget.append(dragPrefsBoxOrderItemRow);
        dragWidget.drag_highlight_row(dragPrefsBoxOrderItemRow);

        let currentDragIcon = Gtk.DragIcon.get_for_drag(drag);
        currentDragIcon.set_child(dragWidget);
        // Even tho this should always be the case, ensure the values for the hotspot aren't undefined.
        if (typeof this.#drag_starting_point_x !== "undefined" &&
            typeof this.#drag_starting_point_y !== "undefined") {
            drag.set_hotspot(this.#drag_starting_point_x, this.#drag_starting_point_y);
        }
    }

    // Handle a new drop on `this` properly.
    // `value` is the thing getting dropped.
    onDrop(_target: Gtk.DropTarget, value: any, _x: number, _y: number): boolean {
        // According to the type annotations of Gtk.DropTarget, value is of type
        // GObject.Value, so ensure the one we work with is of type
        // PrefsBoxOrderItemRow.
        if (!(value instanceof PrefsBoxOrderItemRow)) {
            // TODO: maybe add logging
            return false;
        }

        // If `this` got dropped onto itself, do nothing.
        if (value === this) {
            return false;
        }

        // Defense-in-depth: refuse to move a locked row even if a drag
        // somehow started for it (`onDragPrepare` already refuses to start
        // one in the first place).
        if (value.isLocked()) {
            return false;
        }

        // Get the GtkListBoxes of `this` and the drop value.
        const ownListBox = this.get_parent() as PrefsBoxOrderListBox;
        const valueListBox = value.get_parent() as PrefsBoxOrderListBox;

        // A row's `item` is a raw role string that belongs to a specific
        // settings key by construction (a plain box order, or one particular
        // family's family-order-* key). Cross-list-box drops only make sense
        // between boxes that are part of the left/center/right chain (the
        // only case this ever needed to support); refuse anything else
        // before touching either list, rather than letting a role get
        // silently written into a settings key it doesn't belong in (e.g.
        // dragging a GSConnect device row into the Tasks in Panel list).
        if (ownListBox !== valueListBox
            && (!ownListBox.isChained || !valueListBox.isChained)) {
            return false;
        }

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

        return true;
    }
}
