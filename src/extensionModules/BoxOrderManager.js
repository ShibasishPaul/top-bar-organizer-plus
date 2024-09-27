"use strict";

import GObject from "gi://GObject";

import * as Main from "resource:///org/gnome/shell/ui/main.js";

/**
 * A resolved box order item containing the items role, settings identifier and
 * additional information.
 * @typedef {Object} ResolvedBoxOrderItem
 * @property {string} settingsId - The settings identifier of the item.
 * @property {string} role - The role of the item.
 * @property {string} hide - Whether the item should be (forcefully) hidden
 * (hide), shown (show) or just be left as is (default).
 */

/**
 * This class provides an interfaces to the box orders stored in settings.
 * It takes care of handling AppIndicator items and resolving from the internal
 * item settings identifiers to roles.
 * In the end this results in convenient functions, which are directly useful in
 * other extension code.
 */
export default class BoxOrderManager extends GObject.Object {
    static {
        GObject.registerClass({
            Signals: {
                "appIndicatorReady": {},
            },
        }, this);
    }

    #appIndicatorReadyHandlerIdMap;
    #appIndicatorItemSettingsIdToRolesMap;
    #settings;

    constructor(params = {}, settings) {
        super(params);

        this.#appIndicatorReadyHandlerIdMap = new Map();
        this.#appIndicatorItemSettingsIdToRolesMap = new Map();

        this.#settings = settings;
    }

    /**
     * Gets a box order for the given top bar box from settings.
     * @param {string} box - The top bar box for which to get the box order.
     * Must be one of the following values:
     * - "left"
     * - "center"
     * - "right"
     * @returns {string[]} - The box order consisting of an array of item
     * settings identifiers.
     */
    #getBoxOrder(box) {
        return this.#settings.get_strv(`${box}-box-order`);
    }

    /**
     * Save the given box order to settings, making sure to only save a changed
     * box order, to avoid loops when listening on settings changes.
     * @param {string} box - The top bar box for which to save the box order.
     * Must be one of the following values:
     * - "left"
     * - "center"
     * - "right"
     * @param {string[]} boxOrder - The box order to save. Must be an array of
     * item settings identifiers.
     */
    #saveBoxOrder(box, boxOrder) {
        const currentBoxOrder = this.#getBoxOrder(box);

        // Only save the given box order to settings, if it is different, to
        // avoid loops when listening on settings changes.
        if (JSON.stringify(boxOrder) !== JSON.stringify(currentBoxOrder)) {
            this.#settings.set_strv(`${box}-box-order`, boxOrder);
        }
    }

    /**
     * Handles an AppIndicator/KStatusNotifierItem item by deriving a settings
     * identifier and then associating the role of the given item to the items
     * settings identifier.
     * It then returns the derived settings identifier.
     * In the case, where the settings identifier can't be derived, because the
     * application can't be determined, this method throws an error. However it
     * then also makes sure that once the app indicators "ready" signal emits,
     * this classes "appIndicatorReady" signal emits as well, such that it and
     * other methods can be called again to properly handle the item.
     * @param {string} indicatorContainer - The container of the indicator of the
     * AppIndicator/KStatusNotifierItem item.
     * @param {string} role - The role of the AppIndicator/KStatusNotifierItem
     * item.
     * @returns {string} The derived items settings identifier.
     */
    #handleAppIndicatorItem(indicatorContainer, role) {
        const appIndicator = indicatorContainer.get_child()._indicator;
        let application = appIndicator.id;

        if (!application && this.#appIndicatorReadyHandlerIdMap) {
            const handlerId = appIndicator.connect("ready", () => {
                this.emit("appIndicatorReady");
                appIndicator.disconnect(handlerId);
                this.#appIndicatorReadyHandlerIdMap.delete(handlerId);
            });
            this.#appIndicatorReadyHandlerIdMap.set(handlerId, appIndicator);
            throw new Error("Application can't be determined.");
        }

        // Since the Dropbox client appends its PID to the id, drop the PID and
        // the hyphen before it.
        if (application.startsWith("dropbox-client-")) {
            application = "dropbox-client";
        }

        // Derive the items settings identifier from the application name.
        const itemSettingsId = `appindicator-kstatusnotifieritem-${application}`;

        // Associate the role with the items settings identifier.
        let roles = this.#appIndicatorItemSettingsIdToRolesMap.get(itemSettingsId);
        if (roles) {
            // If the settings identifier already has an array of associated
            // roles, just add the role to it, if needed.
            if (!roles.includes(role)) {
                roles.push(role);
            }
        } else {
            // Otherwise create a new array.
            this.#appIndicatorItemSettingsIdToRolesMap.set(itemSettingsId, [role]);
        }

        // Return the item settings identifier.
        return itemSettingsId;
    }

    /**
     * Gets a resolved box order for the given top bar box, where all
     * AppIndicator items got resolved using their roles, meaning they might be
     * present multiple times or not at all depending on the roles stored.
     * The items of the box order also have additional information stored.
     * @param {string} box - The top bar box for which to get the resolved box order.
     * Must be one of the following values:
     * - "left"
     * - "center"
     * - "right"
     * @returns {ResolvedBoxOrderItem[]} - The resolved box order.
     */
    #getResolvedBoxOrder(box) {
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

            // If the items settings identifier doesn't indicate that the item
            // is an AppIndicator/KStatusNotifierItem item, then its identifier
            // is the role and it can just be added to the resolved box order.
            if (!itemSettingsId.startsWith("appindicator-kstatusnotifieritem-")) {
                resolvedBoxOrderItem.role = resolvedBoxOrderItem.settingsId;
                resolvedBoxOrder.push(resolvedBoxOrderItem);
                continue;
            }

            // If the items settings identifier indicates otherwise, then handle
            // the item specially.

            // Get the roles roles associated with the items settings id.
            let roles = this.#appIndicatorItemSettingsIdToRolesMap.get(resolvedBoxOrderItem.settingsId);

            // If there are no roles associated, continue.
            if (!roles) {
                continue;
            }

            // Otherwise create a new resolved box order item for each role and
            // add it to the resolved box order.
            for (const role of roles) {
                const newResolvedBoxOrderItem = JSON.parse(JSON.stringify(resolvedBoxOrderItem));
                newResolvedBoxOrderItem.role = role;
                resolvedBoxOrder.push(newResolvedBoxOrderItem);
            }
        }

        return resolvedBoxOrder;
    }

    /**
     * Disconnects all signals (and disables future signal connection).
     * This is typically used before nulling an instance of this class to make
     * sure all signals are disconnected.
     */
    disconnectSignals() {
        for (const [handlerId, appIndicator] of this.#appIndicatorReadyHandlerIdMap) {
            if (handlerId && appIndicator?.signalHandlerIsConnected(handlerId)) {
                appIndicator.disconnect(handlerId);
            }
        }
        this.#appIndicatorReadyHandlerIdMap = null;
    }

    /**
     * Gets a valid box order for the given top bar box, where all AppIndicator
     * items got resolved and where only items are included, which are in some
     * GNOME Shell top bar box.
     * The items of the box order also have additional information stored.
     * @param {string} box - The top bar box to return the valid box order for.
     * Must be one of the following values:
     * - "left"
     * - "center"
     * - "right"
     * @returns {ResolvedBoxOrderItem[]} - The valid box order.
     */
    getValidBoxOrder(box) {
        // Get a resolved box order.
        let resolvedBoxOrder = this.#getResolvedBoxOrder(box);

        // ToDo: simplify.
        // Get the indicator containers (of the items) currently present in the
        // GNOME Shell top bar.
        const indicatorContainers = [
            Main.panel._leftBox.get_children(),
            Main.panel._centerBox.get_children(),
            Main.panel._rightBox.get_children(),
        ].flat();

        // Create an indicator containers set from the indicator containers for
        // fast easy access.
        const indicatorContainerSet = new Set(indicatorContainers);

        // Go through the resolved box order and only add items to the valid box
        // order, where their indicator is currently present in the GNOME Shell
        // top bar.
        let validBoxOrder = [];
        for (const item of resolvedBoxOrder) {
            // Get the indicator container associated with the items role.
            const associatedIndicatorContainer = Main.panel.statusArea[item.role]?.container;

            if (indicatorContainerSet.has(associatedIndicatorContainer)) {
                validBoxOrder.push(item);
            }
        }

        return validBoxOrder;
    }

    /**
     * This method saves all new items currently present in the GNOME Shell top
     * bar to the settings.
     */
    saveNewTopBarItems() {
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
        let indicatorContainerRoleMap = new Map();
        for (const role in Main.panel.statusArea) {
            indicatorContainerRoleMap.set(Main.panel.statusArea[role].container, role);
        }

        // Get the indicator containers (of the items) currently present in the
        // GNOME Shell top bar boxes.
        const boxIndicatorContainers = {
            left: Main.panel._leftBox.get_children(),
            center: Main.panel._centerBox.get_children(),
            // Reverse this array, since the items in the left and center box
            // are logically LTR, while the items in the right box are RTL.
            right: Main.panel._rightBox.get_children().reverse(),
        };

        // This function goes through the indicator containers of the given box
        // and adds new item settings identifiers to the given box order.
        const addNewItemSettingsIdsToBoxOrder = (indicatorContainers, boxOrder, box) => {
            for (const indicatorContainer of indicatorContainers) {
                // First get the role associated with the current indicator
                // container.
                let role = indicatorContainerRoleMap.get(indicatorContainer);
                if (!role) {
                    continue;
                }

                // Then get a settings identifier for the item.
                let itemSettingsId;
                // If the role indicates that the item is an
                // AppIndicator/KStatusNotifierItem item, then handle it
                // differently
                if (role.startsWith("appindicator-")) {
                    try {
                        itemSettingsId = this.#handleAppIndicatorItem(indicatorContainer, role);
                    } catch (e) {
                        if (e.message !== "Application can't be determined.") {
                            throw(e);
                        }
                        continue;
                    }
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
