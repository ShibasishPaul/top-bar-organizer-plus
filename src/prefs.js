"use strict";
/* exported buildPrefsWidget, init */

const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PrefsPage = Me.imports.prefsModules.PrefsPage;

const provider = new Gtk.CssProvider();
provider.load_from_path(Me.dir.get_path() + "/css/prefs.css");
Gtk.StyleContext.add_provider_for_display(
    Gdk.Display.get_default(),
    provider,
    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
);

function buildPrefsWidget() {
    return new PrefsPage.PrefsPage();
}

function init() {
}
