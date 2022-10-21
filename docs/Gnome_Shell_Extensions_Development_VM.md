# Gnome Shell Extensions Development VM

This document holds some setup instructions and tips for getting the most of your Gnome Shell Extensions Development VM.

Note on commands in this document:

- `$` indicates that a command should be run as your normal user.
- `#` indicates that a command should be run as root.

## GTKInspector

Enable GTKInspector by running the following command:

```
$ gsettings set org.gtk.Settings.Debug enable-inspector-keybinding true
```

Now you can inspect GTK Apps by pressing `Ctrl + Shift + D`.

### Links and Sources

- <https://wiki.gnome.org/Projects/GTK/Inspector>

## Looking Glass

Looking Glass is Gnome Shells integrated debugger and inspector tool.
You can use it by pressing `Alt + F2`, typing `lg` and pressing Enter.

If you want to exit Looking Glass, press `Esc` in the Evaluator pane.

### Links and Sources

- <https://wiki.gnome.org/Projects/GnomeShell/LookingGlass>

## Sharing a Directory Between the Host and the Guest

To share a directory between the host and the Gnome Shell Extensions Development VM, do the following.
Note that this guide assumes you're using Virtual Machine Manager (virt-manager) and at least v4.0.0 of it.

1. Shut down the VM.
2. Go to your VMs hardware details and then to `Memory`.  
   Check the `Enable shared memory` checkbox there.
3. Go to your VMs hardware details and then to `Add Hardware -> Filesystem`.  
   Then select `virtiofs` for the driver and an appropriate source path (like `/home/user/gse_dev_vm_shared_folder`) and target path (like `shared_folder`).
   Finally click on `Finish`.
4. Power on the VM.
5. Create a mountpoint by running:

   ```
   # mkdir /mnt/shared_host_folder
   ```

6. Edit `/etc/fstab` and add the following line at the end:

   ```
   TARGET_PATH_YOU_SET_IN_VIRT_MANAGER /mnt/shared_host_folder virtiofs rw,noatime,_netdev 0 0
   ```

7. Reboot the VM.

Now you have a shared folder between your host and your VM, which you can access on your host at the specified source path and in the VM at `/mnt/shared_host_folder`.

### Links and Sources

- <https://wiki.archlinux.org/title/Libvirt#Sharing_data_between_host_and_guest>
- <https://libvirt.org/kbase/virtiofs.html>
- <https://github.com/virt-manager/virt-manager/releases/tag/v4.0.0>

## Enabling Automatic Login

Enabling Automatic Login in the Gnome Settings under `Users -> Unlock... -> Automatic Login` saves you from inserting the VM users password after VM startups.

## Disabling Automatic Screen Lock

Disabling Automatic Screen Lock in the Gnome Settings under `Privacy -> Screen Lock -> Automatic Screen Lock` saves you from Gnome locking the VM and you having to insert the VM users password.

## Running Applications Providing Tray Icons Automatically on Startup

Especially for the development of this extension it is useful to have some applications, which provide tray icons (e.g. Element, Telegram) run automatically on startup.
To make this happen (nicely), you need to do the following:

1. Make sure the applications get started automatically on log in by using Gnome Tweaks, going to `Startup Applications` and adding them there.
2. If you're using Automatic Login, use the Password and Keys application (seahorse) to set the Login keyrings password to a blank one.
   Do this to avoid the Login keyring password prompt after log in, which is triggered by some applications like Element.
   Note that this leaves the keyring unencrypted, but since you're in a Dev VM, no important things should be stored in there anyway (hopefully).
3. Use the "Auto Move Windows" extension to move the windows of your applications to a different workspace, so your main one doesn't get cluttered.
4. To see tray icons, install the "AppIndicator and KStatusNotifierItem Support" extension.

### Links and Sources

- <https://wiki.archlinux.org/title/GNOME/Keyring>
