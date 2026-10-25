# Quantum Rift 0.3.4.1

Package version: **3.4.1**. Release tag: **v3.4.1**.

## Cockpit fixes

- Expanded cockpit buttons and the vent stay inside the HUD frame on ultrawide screens.
- HAIL stays visible, greyed out and disabled while landed, and becomes available again after takeoff.
- Sidebar status, navigation and menu text has more space beside the trim, including at different UI scales.
- Ships without mining capability no longer see motherlode targeting outlines or labels. Physical deposit artwork remains visible; mining-capable ships and active towing operations retain their highlights.

## Dialog controls

Confirmation, quit and boarding dialogs share priority and keyboard focus. Tab stays
inside the active dialog, Escape dismisses one dialog at a time, and closing a
dialog returns focus. Manual keyboard, pointer, touch and gamepad flight controls
are blocked while these dialogs are active. Existing autopilot navigation continues
while menus are open; menus do not pause a shared online world.

Other overlays retain their existing controls. This update does not migrate every
screen to the shared dialog controller.

## Updating

Close the old server before starting the new copy. Back up and preserve existing
Solo and friend-game save folders. No save-schema migration is introduced by this
patch. Import/export and pause remain Solo-only; local saves do not automatically
move to dedicated online storage.

Download the complete **Quantum-Rift-latest.zip** release attachment rather than
GitHub's source archive. Use the [supported pinned Node 27 runtime](TYPESCRIPT-RUNTIME.md)
and the launch instructions in the [README](../README.md). The archive includes
compiled modules and bundled libraries; players do not need to install npm dependencies.

The beta Solo save generator catalog matches package version 3.4.1 and retains its
custom captain, credits, ship and station controls. See the
[generator instructions](../test/Save%20Generator/README.md).

The game remains in beta. Browser device emulation does not certify physical touch
or gamepad hardware. Some content remains under development.
