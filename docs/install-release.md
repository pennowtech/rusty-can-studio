# Install A Release

This guide explains how to install Rusty CAN Studio from GitHub Release artifacts.

## Download

1. Open the releases page:
   https://github.com/pennowtech/rusty-can-studio/releases
2. Select the version you want.
3. Download the artifact for your operating system.

Release artifacts are created automatically when a tag such as `v0.2.1` is pushed.

## Windows

Download the `.msi` installer from the release assets.

Install:

1. Double click the `.msi`.
2. Follow the installer prompts.
3. Start Rusty CAN Studio from the Start menu or installed shortcut.

If Windows SmartScreen warns about an unknown publisher, that means the package is not code-signed yet. Choose to run it only if you trust the release source.

## Linux

Release assets can include Linux packages such as `.AppImage`, `.deb`, or `.rpm`, depending on the runner output.

### AppImage

```bash
chmod +x rusty-can-studio*.AppImage
./rusty-can-studio*.AppImage
```

### Debian / Ubuntu package

```bash
sudo apt install ./rusty-can-studio*.deb
```

Then launch it from the app menu or terminal.

### Runtime note

Live CAN access still needs `can_bridge_daemon` running where the SocketCAN interfaces exist. Installing the desktop app does not create `vcan0`, configure physical CAN hardware, or start the daemon.

## macOS

Download the macOS release asset, usually a `.dmg` or `.app.tar.gz`.

Install from `.dmg`:

1. Open the `.dmg`.
2. Drag Rusty CAN Studio to Applications.
3. Launch it from Applications.

If macOS blocks the app because it is unsigned or not notarized, open System Settings > Privacy & Security and allow the app only if you trust the release source.

## After Installation

For offline work:

1. Open CAN Monitor.
2. Load a candump log.
3. Load profile JSON if decoded fields are needed.

For live work:

1. Start `can_bridge_daemon` in Linux or WSL.
2. Create a Remote Daemon connection profile.
3. Discover interfaces.
4. Connect and monitor traffic.

## Known Packaging Notes

- Windows release artifacts are expected to include an MSI.
- Linux release artifacts depend on Tauri bundling output for the runner.
- macOS artifacts are not signed or notarized unless signing secrets are configured in CI.
- The release workflow is tag-triggered and should be validated after the first tag build completes on GitHub Actions.
