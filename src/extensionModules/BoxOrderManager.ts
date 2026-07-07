"use strict";

import GObject from "gi://GObject";
import St from "gi://St";
import type Gio from "gi://Gio";

import * as Main from "resource:///org/gnome/shell/ui/main.js";

import type { CustomPanel } from "../extension.js"

export type Box = "left" | "center" | "right";
type Hide = "hide" | "show" | "default";
/**
 * A resolved box order item containing the items role, settings identifier and
 * additional information.
 */
interface ResolvedBoxOrderItem {
    settingsId: string // The settings identifier of the item.
    role: string // The role of the item.
    hide: Hide // Whether the item should be (forcefully) hidden, (forcefully) shown or just be left as is.
}

/**
 * This class provides an interfaces to the box orders stored in settings.
 * It takes care of handling Task Up UltraLite items and resolving from the
 * internal item settings identifiers to roles.
 * In the end this results in convenient functions, which are directly useful in
 * other extension code.
 *
 * NOTE: AppIndicator/KStatusNotifierItem (tray) items are deliberately NOT
 * tracked, resolved or ordered by this fork. Their containers are destroyed and
 * recreated on the application side (readiness transitions, reconnects, legacy
 * XEmbed socket rebuilds), and reparenting such a disposed container crashes
 * gnome-shell (SIGSEGV in mutter). See `saveNewTopBarItems`.
 */
export default class BoxOrderManager extends GObject.Object {
    static {
        GObject.registerClass(this);
    }

    #taskUpUltraLiteItemRoles: string[];
    #settings: Gio.Settings;

    constructor(params = {}, settings: Gio.Settings) {
        // @ts-ignore Params should be passed, see: https://gjs.guide/guides/gobject/subclassing.html#subclassing-gobject
        super(params);

        this.#taskUpUltraLiteItemRoles = [];

        this.#settings = settings;
    }

    /**
     * Gets a box order for the given top bar box from settings.
     * @param {Box} box - The top bar box for which to get the box order.
     * @returns {string[]} - The box order consisting of an array of item
     * settings identifiers.
     */
    #getBoxOrder(box: Box): string[] {
        return this.#settings.get_strv(`${box}-box-order`);
    }

    /**
     * Save the given box order to settings, making sure to only save a changed
     * box order, to avoid loops when listening on settings changes.
     * @param {Box} box - The top bar box for which to save the box order.
     * @param {string[]} boxOrder - The box order to save. Must be an array of
     * item settings identifiers.
     */
    #saveBoxOrder(box: Box, boxOrder: string[]): void {
        const currentBoxOrder = this.#getBoxOrder(box);

        // Only save the given box order to settings, if it is different, to
        // avoid loops when listening on settings changes.
        if (JSON.stringify(boxOrder) !== JSON.stringify(currentBoxOrder)) {
            this.#settings.set_strv(`${box}-box-order`, boxOrder);
        }
    }

    /**
     * Handles a Task Up UltraLite item by storing its role and returning the
     * Task Up UltraLite settings identifier.
     * This is needed since the Task Up UltraLite extension creates a bunch of
     * top bar items as part of its functionality, so we want to group them
     * under one identifier in the settings.
     * https://extensions.gnome.org/extension/7700/task-up-ultralite/
     * @param {string} role - The role of the Task Up UltraLite item.
     * @returns {string} The settings identifier to use.
     */
    #handleTaskUpUltraLiteItem(role: string): string {
        const roles = this.#taskUpUltraLiteItemRoles;

        if (!roles.includes(role)) {
            roles.push(role);
        }

        return "item-role-group-task-up-ultralite";
    }

    /**
     * Gets a resolved box order for the given top bar box, where all Task Up
     * UltraLite items got resolved using their roles, meaning they might be
     * present multiple times or not at all depending on the roles stored.
     * The items of the box order also have additional information stored.
     * @param {Box} box - The top bar box for which to get the resolved box order.
     * @returns {ResolvedBoxOrderItem[]} - The resolved box order.
     */
    #getResolvedBoxOrder(box: Box): ResolvedBoxOrderItem[] {
        let boxOrder = this.#getBoxOrder(box);

        const itemsToHide = this.#settings.get_strv("hide");
        const itemsToShow = this.#settings.get_strv("show");

        let resolvedBoxOrder = [];
        for (const itemSettingsId of boxOrder) {
            const resolvedBoxOrderItem = {
                settingsId: itemSettingsId,
                role: "",
                hide: "",
            };

            // Set the hide state of the item.
            if (itemsToHide.includes(resolvedBoxOrderItem.settingsId)) {
                resolvedBoxOrderItem.hide = "hide";
            } else if (itemsToShow.includes(resolvedBoxOrderItem.settingsId)) {
                resolvedBoxOrderItem.hide = "show";
            } else {
                resolvedBoxOrderItem.hide = "default";
            }

            // If the item's settings identifier isn't the Task Up UltraLite
            // item role group, then its identifier is the role and it can just
            // be added to the resolved box order.
            // (Any leftover `appindicator-kstatusnotifieritem-*` identifiers
            // from older settings are treated the same way; they won't match a
            // current status area role and get dropped by getValidBoxOrder.)
            if (itemSettingsId !== "item-role-group-task-up-ultralite") {
                resolvedBoxOrderItem.role = resolvedBoxOrderItem.settingsId;
                resolvedBoxOrder.push(resolvedBoxOrderItem);
                continue;
            }

            // The Task Up UltraLite item role group is expanded to its roles.
            const roles: string[] = this.#taskUpUltraLiteItemRoles;

            // Create a new resolved box order item for each role and add it to
            // the resolved box order.
            for (const role of roles) {
                const newResolvedBoxOrderItem = JSON.parse(JSON.stringify(resolvedBoxOrderItem));
                newResolvedBoxOrderItem.role = role;
                resolvedBoxOrder.push(newResolvedBoxOrderItem);
            }
        }

        return resolvedBoxOrder;
    }

    /**
     * Gets a valid box order for the given top bar box, where all Task Up
     * UltraLite items got resolved and where only items are
     * included, which are in some GNOME Shell top bar box.
     * The items of the box order also have additional information stored.
     * @param {Box} box - The top bar box to return the valid box order for.
     * @returns {ResolvedBoxOrderItem[]} - The valid box order.
     */
    getValidBoxOrder(box: Box): ResolvedBoxOrderItem[] {
        // Get a resolved box order.
        let resolvedBoxOrder = this.#getResolvedBoxOrder(box);

        // Get the indicator containers (of the items) currently present in the
        // GNOME Shell top bar.
        // They should be St.Bins (see link), so ensure that using a filter.
        // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/48.2/js/ui/panelMenu.js?ref_type=tags#L21
        const indicatorContainers = new Set([
            (Main.panel as CustomPanel)._leftBox.get_children(),
            (Main.panel as CustomPanel)._centerBox.get_children(),
            (Main.panel as CustomPanel)._rightBox.get_children(),
        ].flat().filter(ic => ic instanceof St.Bin));

        // Go through the resolved box order and only add items to the valid box
        // order, where their indicator is currently present in the GNOME Shell
        // top bar.
        let validBoxOrder: ResolvedBoxOrderItem[] = [];
        for (const item of resolvedBoxOrder) {
            const associatedIndicatorContainer = (Main.panel.statusArea as any)[item.role]?.container;
            if (!(associatedIndicatorContainer instanceof St.Bin)) {
                // TODO: maybe add logging
                continue;
            }

            if (indicatorContainers.has(associatedIndicatorContainer)) {
                validBoxOrder.push(item);
            }
        }

        return validBoxOrder;
    }

    /**
     * This method saves all new items currently present in the GNOME Shell top
     * bar to the settings.
     */
    saveNewTopBarItems(): void {
        // Only run, when the session mode is "user" or the parent session mode
        // is "user".
        if (Main.sessionMode.currentMode !== "user" && Main.sessionMode.parentMode !== "user") {
            return;
        }

        // Get the box orders.
        const boxOrders = {
            left: this.#getBoxOrder("left"),
            center: this.#getBoxOrder("center"),
            right: this.#getBoxOrder("right"),
        };

        // Get roles (of items) currently present in the GNOME Shell top bar and
        // index them using their associated indicator container.
        let indicatorContainerRoleMap = new Map<St.Bin, string>();
        for (const role in (Main.panel.statusArea as any)) {
            const associatedIndicatorContainer = (Main.panel.statusArea as any)[role]?.container;
            if (!(associatedIndicatorContainer instanceof St.Bin)) {
                // TODO: maybe add logging
                continue;
            }
            indicatorContainerRoleMap.set(associatedIndicatorContainer, role);
        }

        // Get the indicator containers (of the items) currently present in the
        // GNOME Shell top bar boxes.
        // They should be St.Bins (see link), so ensure that using a filter.
        // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/48.2/js/ui/panelMenu.js?ref_type=tags#L21
        const boxIndicatorContainers = {
            left: (Main.panel as CustomPanel)._leftBox.get_children().filter(ic => ic instanceof St.Bin),
            center: (Main.panel as CustomPanel)._centerBox.get_children().filter(ic => ic instanceof St.Bin),
            // Reverse this array, since the items in the left and center box
            // are logically LTR, while the items in the right box are RTL.
            right: (Main.panel as CustomPanel)._rightBox.get_children().filter(ic => ic instanceof St.Bin).reverse(),
        };

        // This function goes through the indicator containers of the given box
        // and adds new item settings identifiers to the given box order.
        const addNewItemSettingsIdsToBoxOrder = (indicatorContainers: St.Bin[], boxOrder: string[], box: Box) => {
            for (const indicatorContainer of indicatorContainers) {
                // First get the role associated with the current indicator
                // container.
                let role = indicatorContainerRoleMap.get(indicatorContainer);
                if (!role) {
                    continue;
                }

                // Then get a settings identifier for the item.
                let itemSettingsId;
                if (role.startsWith("appindicator-")) {
                    // AppIndicator/KStatusNotifierItem (tray) items are
                    // intentionally skipped: they are never tracked, saved or
                    // ordered. Their containers get destroyed and recreated on
                    // the application side, and reparenting a disposed container
                    // (which the ordering pass does) crashes gnome-shell. Leave
                    // tray icons wherever the AppIndicator extension places them.
                    continue;
                } else if (role.startsWith("task-button-")) {
                    // If the role indicates that the item is a Task Up
                    // UltraLite item, then handle it differently.
                    itemSettingsId = this.#handleTaskUpUltraLiteItem(role);
                } else { // Otherwise just use the role as the settings identifier.
                    itemSettingsId = role;
                }

                // Add the items settings identifier to the box order, if it
                // isn't in in one already.
                if (!boxOrders.left.includes(itemSettingsId)
                    && !boxOrders.center.includes(itemSettingsId)
                    && !boxOrders.right.includes(itemSettingsId)) {
                    if (box === "right") {
                        // Add the items to the beginning for this array, since
                        // its RTL.
                        boxOrder.unshift(itemSettingsId);
                    } else {
                        boxOrder.push(itemSettingsId);
                    }
                }
            }
        };

        addNewItemSettingsIdsToBoxOrder(boxIndicatorContainers.left, boxOrders.left, "left");
        addNewItemSettingsIdsToBoxOrder(boxIndicatorContainers.center, boxOrders.center, "center");
        addNewItemSettingsIdsToBoxOrder(boxIndicatorContainers.right, boxOrders.right, "right");

        this.#saveBoxOrder("left", boxOrders.left);
        this.#saveBoxOrder("center", boxOrders.center);
        this.#saveBoxOrder("right", boxOrders.right);
    }
}
