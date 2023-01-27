"use strict";
/* exported init */

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const Panel = imports.ui.panel;

const AppIndicatorKStatusNotifierItemManager = Me.imports.extensionModules.AppIndicatorKStatusNotifierItemManager;
const BoxOrderManager = Me.imports.extensionModules.BoxOrderManager;

class Extension {
    constructor() {
    }

    enable() {
        this.settings = ExtensionUtils.getSettings();

        // Create an instance of AppIndicatorKStatusNotifierItemManager to
        // handle AppIndicator/KStatusNotifierItem items.
        this._appIndicatorKStatusNotifierItemManager = new AppIndicatorKStatusNotifierItemManager.AppIndicatorKStatusNotifierItemManager();

        this._boxOrderManager = new BoxOrderManager.BoxOrderManager(this._appIndicatorKStatusNotifierItemManager);

        // Stuff to do on startup(extension enable).
        this._boxOrderManager.saveNewTopBarItems();
        this.#orderTopBarItems("left");
        this.#orderTopBarItems("center");
        this.#orderTopBarItems("right");
        this.#overwritePanelAddToPanelBox();

        // Handle changes of configured box orders.
        this._settingsHandlerIds = [ ];

        const addConfiguredBoxOrderChangeHandler = (box) => {
            let handlerId = this.settings.connect(`changed::${box}-box-order`, () => {
                this.#orderTopBarItems(box);

                // For the case, where the currently saved box order is based on
                // a permutation of an outdated box order, save new top bar
                // items.
                this._boxOrderManager.saveNewTopBarItems();
            });
            this._settingsHandlerIds.push(handlerId);
        };

        addConfiguredBoxOrderChangeHandler("left");
        addConfiguredBoxOrderChangeHandler("center");
        addConfiguredBoxOrderChangeHandler("right");
    }

    disable() {
        // Revert the overwrite of `Panel._addToPanelBox`.
        Panel.Panel.prototype._addToPanelBox = Panel.Panel.prototype._originalAddToPanelBox;
        // Set `Panel._originalAddToPanelBox` to `undefined`.
        Panel._originalAddToPanelBox = undefined;

        // Disconnect signals.
        for (const handlerId of this._settingsHandlerIds) {
            this.settings.disconnect(handlerId);
        }

        this.settings = null;
    }

    ////////////////////////////////////////////////////////////////////////////
    /// Methods used on extension enable.                                    ///
    ////////////////////////////////////////////////////////////////////////////

    /**
     * An object containing a position and box overwrite.
     * @typedef PositionAndBoxOverwrite
     * @property {Number} position - The position overwrite.
     * @property {string} box - The position box overwrite.
     */

    /**
     * Overwrite `Panel._addToPanelBox` with a custom method, which handles top
     * bar item additions to make sure that they are added in the correct
     * position and box.
     */
    #overwritePanelAddToPanelBox() {
        // Add the original `Panel._addToPanelBox` method as
        // `Panel._originalAddToPanelBox`.
        Panel.Panel.prototype._originalAddToPanelBox = Panel.Panel.prototype._addToPanelBox;

        // This function gets used by the `Panel._addToPanelBox` overwrite to
        // determine the position and box for a new item.
        // It also adds the new item to the relevant box order, if it isn't in
        // it already.
        const getPositionAndBoxOverwrite = (role, box, indicator) => {
            const boxOrders = {
                left: this.settings.get_strv("left-box-order"),
                center: this.settings.get_strv("center-box-order"),
                right: this.settings.get_strv("right-box-order"),
            };
            let boxOrder;

            // Handle the case where the new item is a
            // AppIndicator/KStatusNotifierItem.
            // Note: This code is currently broken, since the extension
            // providing AppIndicator/KStatusNotifierItems
            // (appindicatorsupport@rgcjonas.gmail.com) doesn't give us an id on
            // addition anymore and therefore we don't know which program/id the
            // AppIndicator/KStatusNotifierItem belongs to.
            // So just throw an error for now.
            if (role.startsWith("appindicator-")) {
                throw new Error("AppIndicator/KStatusNotifierItem addition is currently broken.");
                // switch (box) {
                //     case "left":
                //         boxOrder = this.settings.get_strv("left-box-order");
                //         this._appIndicatorKStatusNotifierItemManager.handleAppIndicatorKStatusNotifierItemItem(indicator.container, role, boxOrder, boxOrders);
                //         this.settings.set_strv("left-box-order", boxOrder);
                //         break;
                //     case "center":
                //         boxOrder = this.settings.get_strv("center-box-order");
                //         this._appIndicatorKStatusNotifierItemManager.handleAppIndicatorKStatusNotifierItemItem(indicator.container, role, boxOrder, boxOrders);
                //         this.settings.set_strv("center-box-order", boxOrder);
                //         break;
                //     case "right":
                //         boxOrder = this.settings.get_strv("right-box-order");
                //         this._appIndicatorKStatusNotifierItemManager.handleAppIndicatorKStatusNotifierItemItem(indicator.container, role, boxOrder, boxOrders, true);
                //         this.settings.set_strv("right-box-order", boxOrder);
                //         break;
                // }
            }

            // Get the resolved box orders for all boxes.
            const resolvedBoxOrders = {
                left: this._appIndicatorKStatusNotifierItemManager.createResolvedBoxOrder(this.settings.get_strv("left-box-order")),
                center: this._appIndicatorKStatusNotifierItemManager.createResolvedBoxOrder(this.settings.get_strv("center-box-order")),
                right: this._appIndicatorKStatusNotifierItemManager.createResolvedBoxOrder(this.settings.get_strv("right-box-order")),
            };
            // Also get the restricted valid box order of the target box.
            const restrictedValidBoxOrderOfTargetBox = this._boxOrderManager.createRestrictedValidBoxOrder(box);

            // Get the index of the role for each box order.
            const indices = {
                left: resolvedBoxOrders.left.indexOf(role),
                center: resolvedBoxOrders.center.indexOf(role),
                right: resolvedBoxOrders.right.indexOf(role),
            };

            // If the role is not already configured in one of the box orders,
            // just add it to the target box order at the end/beginning, save
            // the updated box order and return the relevant position and box.
            if (indices.left === -1
                && indices.center === -1
                && indices.right === -1) {
                switch (box) {
                    // For the left and center box, insert the role at the end,
                    // since they're LTR.
                    case "left":
                        boxOrders["left"].push(role);
                        this.settings.set_strv("left-box-order", boxOrders["left"]);
                        return {
                            position: restrictedValidBoxOrderOfTargetBox.length - 1,
                            box: box
                        };
                    case "center":
                        boxOrders["center"].push(role);
                        this.settings.set_strv("center-box-order", boxOrders["center"]);
                        return {
                            position: restrictedValidBoxOrderOfTargetBox.length - 1,
                            box: box
                        };
                    // For the right box, insert the role at the beginning,
                    // since it's RTL.
                    case "right":
                        boxOrders["right"].unshift(role);
                        this.settings.set_strv("right-box-order", boxOrders["right"]);
                        return {
                            position: 0,
                            box: box
                        };
                }
            }

            /// Since the role is already configured in one of the box orders,
            /// determine the correct insertion index for the position.
            const determineInsertionIndex = (index, restrictedValidBoxOrder, boxOrder) => {
                // Set the insertion index initially to 0, so that if no closest
                // item can be found, the new item just gets inserted at the
                // beginning.
                let insertionIndex = 0;

                // Find the index of the closest item, which is also in the
                // valid box order and before the new item.
                // This way, we can insert the new item just after the index of
                // this closest item.
                for (let i = index - 1; i >= 0; i--) {
                    let potentialClosestItemIndex = restrictedValidBoxOrder.indexOf(boxOrder[i]);
                    if (potentialClosestItemIndex !== -1) {
                        insertionIndex = potentialClosestItemIndex + 1;
                        break;
                    }
                }

                return insertionIndex;
            };

            if (indices.left !== -1) {
                return {
                    position: determineInsertionIndex(indices.left, this._boxOrderManager.createRestrictedValidBoxOrder("left"), resolvedBoxOrders.left),
                    box: "left"
                };
            }

            if (indices.center !== -1) {
                return {
                    position: determineInsertionIndex(indices.center, this._boxOrderManager.createRestrictedValidBoxOrder("center"), resolvedBoxOrders.center),
                    box: "center"
                };
            }

            if (indices.right !== -1) {
                return {
                    position: determineInsertionIndex(indices.right, this._boxOrderManager.createRestrictedValidBoxOrder("right"), resolvedBoxOrders.right),
                    box: "right"
                };
            }
        };

        // Overwrite `Panel._addToPanelBox`.
        Panel.Panel.prototype._addToPanelBox = function (role, indicator, position, box) {
            // Get the position and box overwrite.
            let positionBoxOverwrite;
            switch (box) {
                case this._leftBox:
                    positionBoxOverwrite = getPositionAndBoxOverwrite(role, "left", indicator);
                    break;
                case this._centerBox:
                    positionBoxOverwrite = getPositionAndBoxOverwrite(role, "center", indicator);
                    break;
                case this._rightBox:
                    positionBoxOverwrite = getPositionAndBoxOverwrite(role, "right", indicator);
                    break;
            }

            // Call the original `Panel._addToPanelBox` with the position
            // overwrite as the position argument and the box determined by the
            // box overwrite as the box argument.
            switch (positionBoxOverwrite.box) {
                case "left":
                    this._originalAddToPanelBox(role, indicator, positionBoxOverwrite.position, Main.panel._leftBox);
                    break;
                case "center":
                    this._originalAddToPanelBox(role, indicator, positionBoxOverwrite.position, Main.panel._centerBox);
                    break;
                case "right":
                    this._originalAddToPanelBox(role, indicator, positionBoxOverwrite.position, Main.panel._rightBox);
                    break;
            }
        };
    }

    ////////////////////////////////////////////////////////////////////////////
    /// Helper methods holding logic needed by other methods.                ///
    ////////////////////////////////////////////////////////////////////////////

    /**
     * An object containing a box order for the left, center and right top bar
     * box.
     * @typedef {Object} BoxOrders
     * @property {string[]} left - The box order for the left top bar box.
     * @property {string[]} center - The box order for the center top bar box.
     * @property {string[]} right - The box order for the right top bar box.
     */

    /**
     * This method orders the top bar items of the specified box according to
     * the configured box orders.
     * @param {string} box - The box to order.
     */
    #orderTopBarItems(box) {
        // Get the valid box order.
        const validBoxOrder = this._boxOrderManager.createValidBoxOrder(box);

        // Get the relevant box of `Main.panel`.
        let panelBox;
        switch (box) {
            case "left":
                panelBox = Main.panel._leftBox;
                break;
            case "center":
                panelBox = Main.panel._centerBox;
                break;
            case "right":
                panelBox = Main.panel._rightBox;
                break;
        }

        /// Go through the items (or rather their roles) of the validBoxOrder
        /// and order the panelBox accordingly.
        for (let i = 0; i < validBoxOrder.length; i++) {
            const role = validBoxOrder[i];
            // Get the indicator container associated with the current role.
            const associatedIndicatorContainer = Main.panel.statusArea[role].container;

            associatedIndicatorContainer.get_parent().remove_child(associatedIndicatorContainer);
            panelBox.insert_child_at_index(associatedIndicatorContainer, i);
        }
        // To handle the case, where the box order got set to a permutation
        // of an outdated box order, it would be wise, if the caller updated the
        // box order now to include the items present in the top bar.
    }
}

function init() {
    return new Extension();
}
