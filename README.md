# Rubber Sheet

CloudTAK plugin that stretches an image or PDF over the map, the way ATAK rubber-sheets a floor plan onto a building.

**Minimum CloudTAK: v14.4.1**. Built and verified against CloudTAK v14.4.1 (commit 184ecb2, 2026-11-27). No upper limit: newer CloudTAK versions are expected to work. Report breakage as an issue.

This plugin is app-only (no `server/` routes), so no server install is needed. It installs two ways: compiled into the CloudTAK web build (Marketplace / `install.sh`), or as a runtime bundle for the CloudTAK iOS and Android apps (see [Mobile](#mobile-cloudtak-app)).

PDF pages are rendered with a vendored copy of [PDF.js](https://github.com/mozilla/pdf.js) 4.10.38 (Apache-2.0) under `lib/vendor/pdfjs/`, so the plugin does not need a host `pdfjs-dist` dependency. Copy-only installs (`WEB_PLUGINS`, marketplace) work once the plugin files are on disk and the API image is rebuilt.

## What it does

* Open **Rubber Sheet** from the right-side menu and choose a PNG, JPEG, WebP, GIF, or PDF. A multi-page PDF shows page previews so you can pick which page to use.
* The sheet is placed in the center of the current view, north-up, covering about a quarter of the view.
* Drag a corner to warp that corner. Hold Shift to scale about the opposite corner, or Alt (or Shift+Alt) to scale from the center — you can press or release those keys mid-drag to switch modes. Drag the rotate icon to rotate. Drag the image to move it. Ctrl/Cmd+Z undoes a map transform; Ctrl+Y or Ctrl/Cmd+Shift+Z redoes.
* **Edit Image** opens a fullscreen pixel editor: magic wand, rectangle marquee, eraser brush with a live size cursor, Selective Color (pick a color to select every match), and **Icons** for facility markers (first aid, AED, key box, extinguisher, hose cabinet, standpipe, hydrant, electric/gas/water shutoffs, electrical room, hazmat, and numbered placards 0–20 — click again to remove before Save). Marching ants + Delete/Deselect (bottom bar) clear a selection. Match range runs Exact → Loose. Undo/Redo with Ctrl/Cmd+Z and Ctrl+Y (or Ctrl/Cmd+Shift+Z). Revert To Original (with confirm) restores the unedited image from when the sheet was first loaded — that option stays available after Save, and undo/redo stacks are kept across reopen. Save Changes keeps your map corners; Cancel Changes discards the edit session.
* An opacity slider sits at the bottom of the map, from 0% (transparent) to 100% (fully visible). Scroll the wheel over it to change by 5%. It remembers the last value, and starts at 100% the first time.
* **Cancel** in the plugin header clears the sheet. Closing the sidebar leaves the sheet on the map so you can keep editing.
* **Export File Type** is required for Download / Data Sync: KMZ, GeoTIFF, GeoPDF, or a zipped bundle of all three.
* **Quality** (1–95, default 85) sets JPEG compression for opaque KMZ images, GeoTIFF tiles, and GeoPDF. Transparent KMZ imagery stays PNG.
* **Download** saves that file. **Upload to Data Sync** lists writable data syncs (same idea as Files → Share to Data Sync — including syncs you can write to even if you are not currently subscribed) and uploads the export.
* **Add to Map as Overlay** builds a north-up GeoTIFF, imports it through CloudTAK (same path as Files → Add to Map as Overlay), waits for Cloud Optimized tiles via the PMTiles TileJSON endpoint, and opens the Overlays menu. The live rubber-sheet warp stays editable until you Cancel/Remove.
* GeoTIFF and GeoPDF are a north-up copy of the fitted sheet, at most 4096 px on the long side, so they match what you see even though those formats cannot store a four-corner warp. The KMZ keeps the exact corners with a KML `gx:LatLonQuad`.
* GeoTIFF output is JPEG-tiled WGS84 with internal overviews (and an alpha band when the sheet has transparent pixels) so empty or erased areas stay see-through in ATAK Image Overlay.

## Install

```bash
git clone https://github.com/ValleyTacticalSolutions/cloudtak-plugin-rubbersheet.git
cd cloudtak-plugin-rubbersheet
./install.sh
```

Or pass the CloudTAK path:

```bash
./install.sh /path/to/CloudTAK
```

The script finds CloudTAK at `$CLOUDTAK`, `~/CloudTAK`, `/home/takwerx/CloudTAK`, or `/home/*/CloudTAK`. Before copying, it fetches the latest `main` from GitHub. If you run it from a marketplace copy (no plugin `.git`), it clones GitHub into a temp dir so the install is not stuck on stale files. Then it copies into `app/plugins/rubber-sheet/`, removes a leftover host `pdfjs-dist` entry if an older installer added one, and rebuilds the API image.

After it finishes: **Settings → Refresh App**. A normal browser refresh is not enough.

```bash
./install.sh --remove
```

## TAK Portal Marketplace

### Configuration required

No additional configuration required.

### Catalog entry

```json
{
  "id": "rubber-sheet",
  "name": "Rubber Sheet",
  "description": "Stretch an image or PDF over the map and export KMZ, GeoTIFF or GeoPDF",
  "repo": "https://github.com/ValleyTacticalSolutions/cloudtak-plugin-rubbersheet.git",
  "ref": "main",
  "maintainer": "ValleyTacticalSolutions",
  "web": { "dest": "rubber-sheet" },
  "exclude": ["test", "docs", "scripts", "release", "dist-bundle", ".github", "vite.bundle.config.ts", "verify-cloudtak.sh", "**/*.md"]
}
```

## Mobile (CloudTAK app)

Since CloudTAK 14.2 the iOS and Android apps load only **runtime plugin bundles**, so the compiled install above does not appear on phones. This repo also builds one:

```bash
npm install
npm run bundle     # -> release/rubber-sheet-<version>.tar.gz (manifest.json + index.js only)
```

An admin uploads the tar.gz to `POST /api/plugin/bundle` (Admin > Plugins); each user then enables it under **Settings > Plugins**, and it is stored on the device and loads offline. Tagged GitHub releases attach the tar.gz through `.github/workflows/release.yml`.

How the bundle differs from the compiled plugin:

- The host supplies only `vue`, `vue-router` and `@tak-ps/vue-tabler` (through `globalThis.__CLOUDTAK__`). Everything else, including PDF.js with its worker inlined as a blob URL, is bundled into `index.js`.
- No core imports. The app store is read from the host's Pinia (`lib/host.ts`), the three CloudTAK components are vendored under `lib/vendor/`, and all API calls use the saved server URL and token (`apiFetch`).
- The corner and rotate handles are plain DOM elements positioned with `map.project()` (`lib/handle-marker.ts`), so no second MapLibre is bundled.
- The Add to Data Sync list comes from the server mission catalog (`/api/marti/mission`); the host's local subscription database is not reachable from a bundle. The upload still enforces write access.
- A new overlay is created with `POST /api/profile/overlay`, then the host map store's `reconcileOverlays()` shows it.
- `enable()` and `disable()` are idempotent and safe when the plugin loads after the map is already up.

`npm run verify` builds the compiled plugin inside a CloudTAK checkout (set `CLOUDTAK_DIR` to reuse one) and runs its lint, type check and build. The phone-width layout is unchanged.

### Local development

Symlink this checkout to `CloudTAK/app/plugins/rubber-sheet`, then restart `npm run serve` from the CloudTAK `app` directory. PDF.js is already vendored in the plugin; you do not need to add `pdfjs-dist` to the CloudTAK app.

Type checking and linting of the compiled plugin happen inside CloudTAK (`npm run verify`). `npm test` runs the unit tests.

## Core imports

None. The bundle and the compiled plugin import nothing from CloudTAK's `src/`. Host state is reached only through `PluginAPI` (`api.map`, `api.menu`, `api.routes`, `api.bottomBar`) and the host Pinia stores `cloudtak-app` (`isMobileDetected`) and `cloudtak` (`reconcileOverlays()`), read by id in `lib/host.ts`. `MenuTemplate.vue`, `SlideDownHeader.vue` and `EmptyInfo.vue` are vendored copies in `lib/vendor/` (AGPL-3.0, from dfpc-coe/CloudTAK); re-sync them when CloudTAK changes its menu chrome.

## License

AGPL-3.0-or-later. See `LICENSE`. Third-party attribution is kept in `NOTICE` and `lib/vendor/pdfjs/LICENSE`: PDF.js (Apache-2.0) is vendored unchanged under `lib/vendor/pdfjs/`, and the vendored CloudTAK components in `lib/vendor/` are AGPL-3.0.
