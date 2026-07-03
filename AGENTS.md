# AGENTS.md

## Cursor Cloud specific instructions

This repo (`mxifund-pet`) is a **single Electron desktop-pet app** (3D VRM anime character + a state
machine "干凯读/beat Kendall Square Capital"). There is no backend, database, or external service —
state lives in `localStorage` + a local `settings.json`. Dependencies install with plain `npm install`
(the startup update script already runs this). Standard run/build commands live in `package.json`
(`npm start`, `npm run dist`) and `README.md`.

### Running / demoing the app in the cloud VM (headless Linux)

The product targets **Windows** (`electron-builder --win`, registry auto-start, `.lnk` shortcuts, system
tray). On the Linux VM the core 3D scene + state machine still work, but keep these caveats in mind:

- **Preferred way to visually demo/test:** run the dev static server and open the renderer in Chrome —
  it runs the identical three.js scene + full state machine (`fsm()` runs when no `?tab=` is set), and
  is far easier to capture than the real transparent, click-through, always-on-top Electron window.
  - Start it: `node tools/dev-server.js` (serves `http://localhost:38217/src/index.html`, prints
    `DEV_SERVER_READY`). It also serves `/node_modules/**` and `/assets/model.vrm` (the importmap in
    `index.html` uses `../node_modules/...` paths, so the server must run from the repo root).
  - Use `?bg=light` or `?bg=dttark`-style preview backgrounds; in browser mode `window.petAPI` is
    undefined so Electron-only buttons (🚀 autostart, 📌 shortcut, 🫥 hide) just show a "preview mode"
    toast — this is expected, not a bug.
  - Debug camera/pose tabs: `?tab=sit|sleep|lounge|query|walk|celebrate` (see `README.md` "调参").
- **Running the real Electron app:** `npm start` works under the VM display. Non-obvious gotchas:
  - The **system tray fails** on Linux (`托盘创建失败: Failed to get file icon.`) — harmless, tray is a
    Windows feature.
  - WebGL falls back to software rendering; you may see `Automatic fallback to software WebGL has been
    deprecated ... --enable-unsafe-swiftshader` warnings and `Failed to connect to the bus` D-Bus
    errors. These are noise; the scene still renders.
  - The window is `transparent + frame:false + focusable:false + click-through` and pinned to the
    bottom of the screen, so it is hard to see/interact with via screenshots — prefer the dev server.
  - Headless automation hooks exist in `src/main.js` (e.g. `--test-display`, `--test-hud`,
    `--test-ball`, `--test-autostart=1`, `--diag`, `--devtools`) for driving/inspecting without a human.

### Hello-world / core action

Clicking the 🛰 button (or opening `?tab=query`) runs the signature "是否干翻凯读" satellite query: the
character walks to the holo station, a `KAIDU-MONITOR` scan panel animates, then a verdict stamp shows
(win chance is only `winRate: 0.01` in `src/js/config.js`, so it is almost always "否"). Clicking the
character pops hearts + a random line.

### Lint / test / build

- **Lint:** none configured. **Automated tests:** none (only the manual `--test-*` hooks above).
- **Build/package:** `npm run dist` → `electron-builder --win` (produces Windows NSIS installer + zip in
  `dist/`); this is a Windows-target packaging step, not needed just to run the app in dev.
