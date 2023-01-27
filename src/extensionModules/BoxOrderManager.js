"use strict";
/* exported BoxOrderManager */

const ExtensionUtils = imports.misc.extensionUtils;

const Main = imports.ui.main;

/**
 * An object containing a box order for the left, center and right top bar
 * box.
 * @typedef {Object} BoxOrders
 * @property {string[]} left - The box order for the left top bar box.
 * @property {string[]} center - The box order for the center top bar box.
 * @property {string[]} right - The box order for the right top bar box.
 */

/**
 * This class provides methods get, set and interact with box orders, while
 * taking over the work of translating between what is stored in settings and
 * what is really useable by the other extension code.
 * It's basically a heavy wrapper around the box orders stored in the settings.
 */
var BoxOrderManager = class BoxOrderManager {
    /**
     * @param {AppIndicatorKStatusNotifierItemManager}
     * appIndicatorKStatusNotifierItemManager - An instance of
     * AppIndicatorKStatusNotifierItemManager to be used in the methods of
     * `this`.
     */
    constructor(appIndicatorKStatusNotifierItemManager) {
        this._appIndicatorKStatusNotifierItemManager = appIndicatorKStatusNotifierItemManager;

        this._settings = ExtensionUtils.getSettings();
    }

    /**
     * This method returns a valid box order for the given top bar box.
     * This means it returns a box order, where only roles are included, which
     * have their associated indicator container already in some box of the
     * Gnome Shell top bar.
     * @param {string} box - The top bar box to return the valid box order for.
     * Must be one of the following values:
     * - "left"
     * - "center"
     * - "right"
     * @returns {string[]} - The valid box order.
     */
    createValidBoxOrder(box) {
        // Get a resolved box order.
        let boxOrder = this._appIndicatorKStatusNotifierItemManager.createResolvedBoxOrder(this._settings.get_strv(`${box}-box-order`));

        // ToDo: simplify.
        // Get the indicator containers (of the items) currently present in the
        // Gnome Shell top bar.
        const indicatorContainers = [
            Main.panel._leftBox.get_children(),
            Main.panel._centerBox.get_children(),
            Main.panel._rightBox.get_children()
        ].flat();

        // Create an indicator containers set from the indicator containers for
        // fast easy access.
        const indicatorContainerSet = new Set(indicatorContainers);

        // Go through the box order and only add items to the valid box order,
        // where their indicator is present in the Gnome Shell top bar
        // currently.
        let validBoxOrder = [ ];
        for (const role of boxOrder) {
            // Get the indicator container associated with the current role.
            const associatedIndicatorContainer = Main.panel.statusArea[role]?.container;

            if (indicatorContainerSet.has(associatedIndicatorContainer)) validBoxOrder.push(role);
        }

        return validBoxOrder;
    }

    /**
     * This method saves all new items currently present in the Gnome Shell top
     * bar to the correct box orders.
     */
    saveNewTopBarItems() {
        // Load the configured box orders from settings.
        const boxOrders = {
            left: this._settings.get_strv("left-box-order"),
            center: this._settings.get_strv("center-box-order"),
            right: this._settings.get_strv("right-box-order"),
        };

        // Get roles (of items) currently present in the Gnome Shell top bar and
        // index them using their associated indicator container.
        let indicatorContainerRoleMap = new Map();
        for (const role in Main.panel.statusArea) {
            indicatorContainerRoleMap.set(Main.panel.statusArea[role].container, role);
        }

        // Get the indicator containers (of the items) currently present in the
        // Gnome Shell top bar boxes.
        const boxIndicatorContainers = {
            left: Main.panel._leftBox.get_children(),
            center: Main.panel._centerBox.get_children(),
            // Reverse this array, since the items in the left and center box
            // are logically LTR, while the items in the right box are RTL.
            right: Main.panel._rightBox.get_children().reverse()
        };

        // This function goes through the indicator containers of the given box
        // and adds roles of new items to the box order.
        const addNewItemsToBoxOrder = (indicatorContainers, boxOrder, box) => {
            for (const indicatorContainer of indicatorContainers) {
                // First get the role associated with the current indicator
                // container.
                const role = indicatorContainerRoleMap.get(indicatorContainer);
                if (!role) continue;

                // Handle an AppIndicator/KStatusNotifierItem item differently.
                if (role.startsWith("appindicator-")) {
                    this._appIndicatorKStatusNotifierItemManager.handleAppIndicatorKStatusNotifierItemItem(indicatorContainer, role, boxOrder, boxOrders, box === "right");
                    continue;
                }

                // Add the role to the box order, if it isn't in in one already.
                if (!boxOrders.left.includes(role)
                    && !boxOrders.center.includes(role)
                    && !boxOrders.right.includes(role)) {
                    if (box === "right") {
                        // Add the items to the beginning for this array, since
                        // its RTL.
                        boxOrder.unshift(role);
                    } else {
                        boxOrder.push(role);
                    }
                }
            }
        };

        addNewItemsToBoxOrder(boxIndicatorContainers.left, boxOrders.left, "left");
        addNewItemsToBoxOrder(boxIndicatorContainers.center, boxOrders.center, "center");
        addNewItemsToBoxOrder(boxIndicatorContainers.right, boxOrders.right, "right");

        // This function saves the given box order to settings.
        const saveBoxOrderToSettings = (boxOrder, box) => {
            const currentBoxOrder = this._settings.get_strv(`${box}-box-order`);
            // Only save the updated box order to settings, if it is different,
            // to avoid loops, when listening on settings changes.
            if (JSON.stringify(currentBoxOrder) !== JSON.stringify(boxOrder)) {
                this._settings.set_strv(`${box}-box-order`, boxOrder);
            }
        };

        saveBoxOrderToSettings(boxOrders.left, "left");
        saveBoxOrderToSettings(boxOrders.center, "center");
        saveBoxOrderToSettings(boxOrders.right, "right");
    }
};
