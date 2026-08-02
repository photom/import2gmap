# How-To: Build the WXT + React Extension into a Distributable Artifact

Goal: go from a clean checkout to a loadable Manifest V3 build (`output/chrome-mv3/`) and, optionally, a zipped artifact — using the WXT + React toolchain ([ADR-0006](../explanation/adr/0006-wxt-framework-adoption.md), [ADR-0007](../explanation/adr/0007-wxt-react-popup-ui-framework.md)).

## Prerequisites

- Node.js (this repo was verified with Node v22 / npm 11; any current LTS Node works).
- No global CLI needed — all commands run through the local `wxt` devDependency via `npm run`.

## 1. Install dependencies

```bash
npm install
```

`postinstall` runs `wxt prepare`, which generates `.wxt/` (gitignored) — WXT's internal type/reference cache used by `tsconfig.json` (`extends: "./.wxt/tsconfig.json"`). Re-run `npm install` (or `npx wxt prepare` directly) if `.wxt/` is ever deleted.

## 2. (Optional) Verify before building

```bash
npm test      # vitest run — domain/parser/KML unit tests
npm run compile   # tsc --noEmit — type-check without emitting
```

Not required to produce a build, but catches regressions before packaging.

## 3. Development build (auto-reload)

```bash
npm run dev
```

Starts the WXT dev server and opens a browser profile with the unpacked extension loaded and HMR wired up (popup UI + content scripts). Use this while iterating; stop with `Ctrl+C`.

## 4. Production build

```bash
npm run build
```

Output goes to `output/chrome-mv3/` (gitignored; configured via `outDir: 'output'` in `wxt.config.ts` — a non-hidden directory so it's easy to pick in Chrome's "Load unpacked" file browser, unlike WXT's `.output` default). Example output from this repo:

```text
output/chrome-mv3/manifest.json
output/chrome-mv3/popup.html
output/chrome-mv3/background.js
output/chrome-mv3/chunks/popup-*.js            # bundled React popup
output/chrome-mv3/content-scripts/tabelog.js   # Tabelog saved-list extraction
output/chrome-mv3/content-scripts/mymaps.js    # My Maps import automation
output/chrome-mv3/assets/popup-*.css
output/chrome-mv3/icon/{16,32,48,96,128}.png
```

`manifest.json`'s `name` / `description` / `permissions` / `optional_host_permissions` come from `wxt.config.ts`'s `manifest` block (see [wxt-entrypoints-and-directory-structure](../reference/wxt-entrypoints-and-directory-structure.md)); `version` still comes from `package.json` (`0.0.0`, unset for this stage of development).

## 5. Load the unpacked build in Chrome

1. Open `chrome://extensions`.
2. Enable **デベロッパーモード** (Developer mode) top-right.
3. **パッケージ化されていない拡張機能を読み込む** (Load unpacked) → select `output/chrome-mv3/`.
4. Reload the extension after each `npm run build` (or keep `npm run dev` running for auto-reload instead).

## 6. Package a distributable artifact (optional)

```bash
npm run zip
```

Runs a production build, then zips it to `output/<package.json name>-<version>-<browser>.zip` (e.g. `output/wxt-react-starter-0.0.0-chrome.zip`). This is a manual-distribution artifact only — Chrome Web Store submission is explicitly deferred (see [decision checklist](../explanation/chrome-extension-decision-checklist.md)); there is no publish step in this repo.

## Firefox variants

Every command above has a `:firefox` counterpart (`npm run dev:firefox`, `npm run build:firefox`, `npm run zip:firefox`), building to `output/firefox-mv3/` (or the Firefox-equivalent manifest). Not part of the current product scope but available from the same WXT config.

## Summary

| Step | Command | Output |
| :--- | :--- | :--- |
| Install | `npm install` | `node_modules/`, `.wxt/` |
| Test / typecheck | `npm test`, `npm run compile` | pass/fail only |
| Dev | `npm run dev` | live-reloading unpacked profile |
| Build | `npm run build` | `output/chrome-mv3/` |
| Package | `npm run zip` | `output/*.zip` |
