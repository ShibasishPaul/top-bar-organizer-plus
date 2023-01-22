/* exported buildPrefsWidget, init */
"use strict";

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PrefsPage = Me.imports.prefsModules.PrefsPage;

function buildPrefsWidget() {
    return new PrefsPage.PrefsPage();
}

function init() {
}
