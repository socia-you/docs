# AI Context — Notes

The reference **Socia Sphere** mini app: a hand-drawn notebook with three pages, `localStorage`, native dialogs, and a custom tab bar style.

Docs: **https://socia.you/docs**

Source: **https://github.com/socia-you/docs/tree/main/examples/notes**

## What a Socia mini app is

A Svelte 5 + TypeScript web app inside the Socia messenger (`Sphere` section). The Flutter host serves it from a per-app loopback origin (`http://127.0.0.1:<port>/`), so each app gets isolated `localStorage`, `IndexedDB`, `window`. The host is reached via the bridge `window.socia`.

A package is one `.socia` file — `tar + brotli (q11) + Ed25519 signature` — holding `manifest.json`, `index.html`, `assets/` (`_.js`, `_.css`), `signature.bin` (base64). The signature is verified **before** unpacking; a mismatch means refuse.

## What Notes is

- **Home** — notes list, counter, floating “+” button; long-press a card to delete.
- **Note detail** — view, live edit, delete; saved on every keystroke.
- **Profile** — avatar, name, per-app `sphere_user_id` from `socia.context.get()`, stats.

Storage: `localStorage`, key `socia.notes.v1`. Fonts: **Caveat** (headings) + **Architects Daughter** (body) + system sans (labels).

## Project structure

```

src/
├── main.ts # Mounts App, exposes window.socia
├── app/
│ ├── App.svelte # Root, router ↔ tab bar wiring
│ └── app.css # Design system
├── pages/
│ ├── home/HomePage.svelte # List, counter, FAB, long-press delete
│ ├── note/NotePage.svelte # Detail: view, edit, delete
│ └── profile/ProfilePage.svelte # User context + stats
└── shared/
├── lib/
│ ├── socia.ts # JS bridge (api, tabs, ui, context)
│ ├── router.ts # Tiny hash-based router
│ └── notes-store.ts # Note type, loadNotes, saveNotes
└── ui/ # Reusable components

```

Code used by one page stays there; used twice — moves to `shared/`.

## The JS bridge — `window.socia`

`shared/lib/socia.ts` wraps the request/response cycle by `id`; import from there, not `window.socia`.

### `socia.api` — HTTP proxy

```ts
await socia.api.get<T>('/users/me')
await socia.api.post('/notes', { title: 'First' })
await socia.api.put('/notes/42', { title: 'Updated' })
await socia.api.delete('/notes/42')
```

Paths are checked against `backend.allowed_paths`, methods against `backend.allowed_methods`. The host injects `Authorization: Bearer <user JWT>` — **the JWT never reaches JS**. Promises **reject** with `Error(message)`; always `try/catch`.

| Message                        | Meaning                                  |
| ------------------------------ | ---------------------------------------- |
| `Path not allowed`             | Path not in `backend.allowed_paths`.     |
| `Method not allowed`           | Method not in `backend.allowed_methods`. |
| `HTTP <code>`                  | Backend returned non-2xx.                |
| `timeout`                      | Exceeded `backend.timeout_sec`.          |
| `SociaBridge is not available` | Not running inside the host (browser).   |

Notes is local-only; `socia.api` is a reference for other apps.

### `socia.tabs` — native tab bar

```ts
socia.tabs.setActive(tabId) // highlight a tab
socia.tabs.getActive() // → string | null
socia.tabs.onChange(cb) // fires on tab tap, returns unsubscribe
socia.tabs.setTabbarVisible(visible) // hide/show the bar
```

Two-way binding with the Flutter bar: taps arrive via `onChange`, internal navigation calls `setActive`. Wired in `App.svelte`.

### `socia.ui` — native dialogs

```ts
socia.ui.showSheet(config) // Promise<{ action, values }>
socia.ui.alert(config) // Promise<{ action }>
socia.ui.confirm(config) // Promise<boolean>
socia.ui.onBack(handler) // Promise<{ ok }>
socia.ui.onSettings(handler) // Promise<{ ok }>
socia.ui.setOrientation(o) // Promise<{ ok }>
```

`showSheet`/`alert` **reject** when the user closes via “×” — catch and ignore.

`showSheet`: `title?`, `helpText?` (the “?”), `fields?[]`, `actions?[]`. Field: `type` (`text | textarea | number | email | password`), `name` (result key), `label?`, `placeholder?`, `value?`. Action: `id` (→ `res.action`), `label`, `style?` (`primary | secondary`), `cancel?` (rejects). Result `{ action, values }`. Notes uses it to create a note, `confirm` to delete, `alert` on storage full.

### `socia.context` — user context

```ts
socia.context.get() // Promise<SociaContext>
socia.context.refresh() // force re-fetch
socia.context.cached // synchronous read
```

```ts
interface SociaContext {
	sphereUserId: string // HMAC-SHA256(user_id + ":" + app_username, key) — hex, 64 chars
	username: string | null
	firstName: string | null
	lastName: string | null
	avatarUrl: string | null
	app: string // app username the context was issued for
	publisherPubkey: string // publisher Ed25519 key (base64), pin it
	exp: number // expiry, unix seconds (TTL 300 s, host renews)
	nonce: string // unique per issue, reject repeats
	sig: string // Ed25519 signature, base64
}
```

`sphereUserId` is per-app pseudonymous: stable per (user, app), different per app (no cross-app correlation), never the real `user_id` UUID.

**The context is signed — verify `sig`, never trust a bare `sphereUserId`.** Forward the object to your backend, fetch the key once from `GET /api/sphere/context/pubkey` (`{ algorithm: "Ed25519", public_key, ttl_sec }`, refetch if checks fail), rebuild the canonical string (STANDARD base64 with padding per field, `null` = base64 of empty):

```text
socia:sphere:context:v2|<b64 app>|<b64 publisherPubkey>|<b64 sphereUserId>|<exp>|<b64 nonce>|<b64 username>|<b64 firstName>|<b64 lastName>|<b64 avatarUrl>
```

Then verify Ed25519 over its UTF-8 bytes and reject a past `exp`, a foreign `app`, a `publisherPubkey` other than your pinned key, and a repeated `nonce` (keep seen nonces ≥ `ttl_sec`). Otherwise whoever learns `n` can impersonate the user — it is a pseudonym, not a bearer token.

The host renews the context (~60 s before `exp`, max once per minute) and rejects one whose `app`/`publisherPubkey` mismatch the package. Do not store `sig`/`nonce` past `exp`. `get()` is cached per session; `refresh()` only if the profile changed.

### `socia.home` — home screen shortcut

```ts
socia.home.add() // Promise<{ ok: boolean }>
```

Pins the app to the Android home screen (manifest name/icon). `ok` is `true` only when the OS dialog appeared; `false` on iOS, Android < 8, or an unsupported launcher. The shortcut opens `socia://miniapp/<username>`.

## Hash router

`shared/lib/router.ts` keeps the path in `window.location.hash` — `history.pushState` does not survive a reload on the loopback origin.

```ts
import { router } from '../shared/lib/router'

router.goto('/about') // navigate
router.onChange(path => console.log(path)) // subscribe
router.current // read current path
router.start() // read hash and emit once
```

```
/home              → HomePage
/note/:id          → NotePage (id parsed from the path)
/profile           → ProfilePage
```

`/note/:id` is the only URL parsing: `App.svelte` extracts the id with `$derived.by()` and passes it as a prop.

## Storage — `notes-store.ts`

```ts
export interface Note {
	id: string // generated client-side via newNoteId()
	title: string
	body: string
	createdAt: number // unix timestamp in ms — number, not Date
	updatedAt: number
}

const STORAGE_KEY = 'socia.notes.v1'
```

Numbers, not `Date` — `JSON.stringify` stringifies dates. `.v1` is a contract: on a format change add `.v2`, migrate, delete `.v1`.

`loadNotes(): Note[]`, `saveNotes(notes): void`, `clearNotes(): void`, `newNoteId(): string`. `loadNotes` is fail-soft (no key / broken JSON → `[]`; a bad note is dropped, the rest kept). `saveNotes` does not swallow quota errors — the caller catches; silent data loss is worse than a visible error. `newNoteId` → `note_<timestamp>_<random>` (no `crypto.randomUUID()` needed). `isNote` is a type predicate, so `filter(isNote)` narrows to `Note[]`.

## Manifest

```json
{
	"username": "notes",
	"name": "Notes",
	"version": "0.1.3",
	"entry": "index.html",
	"ui": {
		"fullscreen": true,
		"showHeader": false,
		"orientation": "auto",
		"tabbar": {
			"enabled": true,
			"defaultTab": "home",
			"showBack": true,
			"showSettings": true,
			"style": {
				"background": "#202020",
				"borderColor": "rgba(232,228,222,0.14)",
				"borderWidth": 1.5,
				"borderRadius": 18,
				"activeColor": "#fbbf24",
				"inactiveColor": "rgba(232,228,222,0.48)",
				"shadow": "hard"
			},
			"tabs": [
				{ "id": "home", "icon": "home", "label": "Notes" },
				{ "id": "profile", "icon": "user", "label": "Profile" }
			]
		}
	},
	"permissions": ["network"],
	"backend": {
		"base_url": "https://backend.socia.you",
		"allowed_paths": ["/api/users/me"],
		"allowed_methods": ["GET", "POST", "PUT", "DELETE"],
		"timeout_sec": 15
	}
}
```

`backend` requires `network`; `base_url` must be absolute `https` without userinfo, query, fragment — `http://` or missing `network` is rejected at install (fail closed). Use `socia dev` locally; drop `backend` if unused. Tab bar style lives here, **not in CSS** — Flutter draws the bar.

## Design system

`src/app/app.css`: warm paper `#1a1a1a`…raised `#202020`, ink `#e8e4de`, `--accent #fbbf24`, `--danger #f87171`.

**Wobbly shapes** — four radii (first four horizontal, second four vertical):

```css
--wobbly-md: 18px 10px 22px 12px / 12px 22px 10px 18px;
--wobbly-lg: 28px 14px 32px 18px / 18px 32px 14px 28px;
```

**Hard shadow** — no blur; on press the card moves 2px and the shadow shrinks 2px: `--shadow-card: 4px 4px 0 rgba(0, 0, 0, 0.55)`. Dot grid: two `radial-gradient`s on `body::before` (24px / 12px, offsets 0,0 / 6,6).

## UI/UX patterns

- **No emojis in UI text**; **only Lucide icons**. Tap targets ≥ 44×44; wrap keyframes in `prefers-reduced-motion`.
- **Motion:** screen fade 500ms `easeOut`; modal fade + scale 0.9 → 1.0, 350ms; press scale 0.98, 110–120ms. No white flashes.
- **Loading:** show something within 100ms — a content-shaped skeleton beats a spinner. **Empty state:** icon, title, one sentence, action. **Errors:** readable message, “Retry” when retryable — never a stack trace.
- **Debounce input** 300–400ms. **Confirm destructive actions** with `socia.ui.confirm` + `destructive: true`. **Long-press** fires `contextmenu` — intercept and `preventDefault()`.
- **FAB:** `position: fixed` + `bottom: calc(96px + env(safe-area-inset-bottom))` (96 = bar 56 + offset 12 + 28). Keep `env(...)` for the iOS home indicator.

## Common tasks

**Page:** add `src/pages/your-page/YourPage.svelte`, a route in `App.svelte`, and for a tab an entry in `manifest.json → ui.tabbar.tabs`; rebuild. **Accent:** `--accent` in `app.css`; the tab bar is styled in the manifest. **New note field:** extend `Note`, update `isNote`, bump the key to `.v2`, migrate from `.v1` — skipping the bump silently breaks installs. **Cloud sync:** swap the bodies of `loadNotes`/`saveNotes` for `socia.api` calls, add paths to `backend.allowed_paths`.

## Platform limits

- **Deploy:** icon ≤ 5 MB, screenshot ≤ 10 MB (max 5), multipart body ≤ 100 MB, signed package ≤ 50 MB (compressed and unpacked), `publisher_pubkey` = base64 of 32 bytes.
- **Runtime:** `localStorage`/`IndexedDB` work; `fetch` is blocked (use `socia.api`); external `<script src>`/`<link href>` do not load; no camera/files/push or background tasks.
- **Bundle:** target < 1 MB, hard limit 50 MB.

## CLI

```bash
socia create [name]   # scaffold a new app (create-socia-sphere)
socia dev             # live preview with HMR (localhost:3003)
socia login           # sign in, token in ~/.socia/config.json
socia keygen          # Ed25519 signing key (once)
socia bump patch      # bump manifest version (patch|minor|major)
socia build           # build into a signed .socia
socia deploy          # build, sign and open the deploy UI
socia publish         # copy an existing .socia to the local registry
socia update          # refresh framework files from the template
socia shot            # screenshots in a phone frame
```

## Publishing

```bash
socia login         # once
socia keygen        # once, before the first deploy
socia deploy
```

The CLI builds, signs with the Ed25519 key, packs `.socia`, and opens the publish form (name, description, category, icon, screenshots); **Publish** → `status: pending` → moderation → Sphere catalog. New version:

```bash
socia bump patch    # 0.1.0 → 0.1.1, or minor / major
socia deploy
```

Signing key: `~/.socia/signing_key`. **Back it up** — otherwise no updates to already-signed apps.

## When you are not sure

For anything not covered here, **say so explicitly**; do not invent methods, fields, or keys.

- **This project:** `manifest.json`, `src/shared/lib/socia.ts`, `src/shared/lib/notes-store.ts`.
- **Platform:** https://socia.you/docs
- **Tutorial:** https://socia.you/docs/tutorial/notes/01-what
