# Notes

Hand-drawn notes app, the end-to-end example for the **Socia Sphere**. **Svelte 5**, **TypeScript**, **Vite**; `localStorage` persistence; native dialogs and user context via `window.socia`.

Tutorial: **https://socia.you/docs/tutorial/notes/01-what**

## What it does

- **List of notes** — cards with title, preview, relative date, newest first.
- **Create** via the native sheet (`socia.ui.showSheet`, title + body).
- **Detail page** — view and edit in real time; every keystroke persists.
- **Delete** via long-press on a card or a button, confirmed with `socia.ui.confirm` (destructive).
- **Profile** — `socia.context.get()` avatar, name, per-app `sphere_user_id`; note and character stats.

## Design

Hand-drawn notebook: warm dark paper, dot grid, wobbly borders (two sets of `border-radius` radii), hard offset shadows, **Caveat** headings, **Architects Daughter** body, system sans labels; yellow accent. All in `src/app/app.css`.

## Structure

```
src/
├── main.ts                    # Mounts App, exposes window.socia
├── app/
│   ├── App.svelte             # Root component, tab↔route wiring
│   └── app.css                # Design system: colors, fonts, shapes
├── pages/
│   ├── home/HomePage.svelte   # List, counter, FAB, long-press delete
│   ├── note/NotePage.svelte   # Detail: view, edit, delete
│   └── profile/ProfilePage.svelte  # User context + note stats
└── shared/
    ├── lib/
    │   ├── socia.ts           # JS bridge (api, tabs, ui, context)
    │   ├── router.ts          # Tiny hash-based router
    │   └── notes-store.ts     # Note type, loadNotes, saveNotes
    └── ui/
        └── (shared components)
```

The app is bundled into `.socia`; nothing under `src/` is served externally.

## Running locally

```bash
npm install
socia dev
```

`socia dev` opens `http://localhost:3003` with an iPhone frame, a native tab bar, mock user context from `mock-api.json` (Profile shows `Mock User`), and hot reload.

Do **not** use `npm run dev` — bare Vite has no frame, mock API or bridge; `socia.api` fails with `SociaBridge is not available`.

### Screenshots

```bash
socia shot
```

Prompts for tabs and destination; PNGs include phone frame, status bar and native tab bar.

## Publishing

```bash
socia login         # once
socia keygen        # once, before the first deploy
socia deploy
```

The CLI builds, signs with the Ed25519 key, packs `.socia`, opens a publish form in the browser. Fill in name, description, category, icon and screenshots, press **Publish** — the app goes to `status: pending`, awaits moderation, then appears in the catalog.

```bash
socia bump patch    # or minor / major
socia deploy
```

## Storage

Notes live in `localStorage` under `socia.notes.v1`.

- Each mini app has its own origin; its `localStorage` is invisible to other apps.
- `.v1` is a contract: on a format change introduce `.v2`, migrate from `.v1`, delete the old key.
- `loadNotes` is fail-soft (broken JSON → empty array, bad entries dropped); `saveNotes` does **not** swallow errors — a quota failure surfaces as a native alert.
- For cloud sync, replace `notes-store.ts` with `socia.api` calls — same interface.

## Documentation

- **Tutorial:** https://socia.you/docs/tutorial/notes/01-what
- **Manifest reference:** https://socia.you/docs/reference/manifest
- **JS Bridge reference:** https://socia.you/docs/reference/js-bridge
- **AI context:** `AI.md` in this folder

## Gotchas

- `sphere_user_id` is **not** the user UUID — it is `HMAC-SHA256(user_id + ":" + app_username, sphere_hmac_key)`, different per app. Use it to authenticate against your own backend.
- The FAB needs `bottom: calc(96px + env(safe-area-inset-bottom))` to clear the host tab bar; keep `env(...)` or the iOS home indicator overlaps it.
- Rebuild the `.socia` package after any `manifest.json` change — the manifest is signed with the rest of the files.
- If the tab bar ignores taps in `socia dev`, reload: the iframe may have loaded before `socia.tabs.onChange` was attached.
