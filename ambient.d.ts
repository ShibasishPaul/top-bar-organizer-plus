import "@girs/gjs"
import "@girs/gjs/dom"
import "@girs/gnome-shell/ambient"
import "@girs/gnome-shell/extensions/global"

// GJS provides `connectObject`/`disconnectObject` on every GObject.Object
// instance (added by GJS's own JS-side override, not part of the
// GObject-Introspection-derived API), so @girs doesn't declare them. See
// https://gjs.guide/guides/gobject/basics.html#signals for the actual
// runtime behavior these types describe.
declare module "@girs/gobject-2.0/gobject-2.0" {
    namespace GObject {
        interface Object {
            /**
             * Connects one or more signals to `this`, tying every
             * connection's lifetime to `trackedObject` — disconnected all
             * at once by a matching `disconnectObject(trackedObject)`
             * call, instead of tracking raw handler ids by hand.
             * Call signature: pairs of (signalSpec, callback), optionally
             * followed by GObject.ConnectFlags.AFTER before a given pair,
             * then a single trailing `trackedObject`.
             */
            connectObject(...args: unknown[]): void;
            /**
             * Disconnects every signal connection made on `this` via
             * `connectObject(..., trackedObject)` for the given
             * `trackedObject`. Safe to call even if nothing is currently
             * connected for it.
             */
            disconnectObject(trackedObject: object): void;
        }
    }
}
