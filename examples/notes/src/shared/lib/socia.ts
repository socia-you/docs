/**
 * JS bridge to the Socia host app.
 *
 * Two directions:
 *   - Mini app → host: `send()` posts a JSON message to `SociaBridge`.
 *   - Host → mini app: `socia._resolve`, `tabs._onHostChange`, `ui._onBack`.
 *
 * Every request carries a unique `id`. The host replies asynchronously
 * with either `result` or `error`, and we match it back by `id`.
 *
 * Five namespaces:
 *   - `socia.api`     — HTTP proxy to the Socia backend.
 *   - `socia.tabs`    — control over the host tab bar.
 *   - `socia.ui`      — hooks for back / settings buttons.
 *   - `socia.context` — per-app user context (sphereUserId, name, avatar).
 *   - `socia.home`    — pin the mini app to the Android home screen.
 *
 * ## Dev mode (`socia dev`)
 *
 * In production, the Flutter host calls `window.socia._*` directly
 * via `evaluateJavascript`. During `socia dev`, there is no Flutter —
 * the dev UI runs in a different origin and cannot reach into this
 * window. It uses `postMessage` instead. The same handlers accept
 * both paths, so mini app code does not need to know which host it
 * is running under.
 *
 * `socia.api.*` and `socia.context.get()` also accept values pushed
 * from the dev UI (`mock-api.json` in the project root, key
 * `__context` for the user context). When a mock matches, the call
 * resolves locally — no bridge round-trip.
 */

type Pending = {
	resolve: (value: unknown) => void
	reject: (reason: Error) => void
}

type ResolvePayload<T = unknown> = {
	id: string
	result?: T
	error?: string
}

/** Message shape sent from the dev UI to the mini app. */
interface HostMessage {
	type: 'socia:host'
	action: 'tabs.onHostChange' | 'ui.onBack' | 'ui.onSettings'
	tabId?: string
}

/**
 * A single field in a `socia.ui.showSheet` form.
 *
 * The host renders each field as a native Flutter widget inside a
 * `SociaBottomSheet`. The mini app never draws the sheet itself —
 * it just describes what it wants.
 */
export interface SociaSheetField {
	/** `text`, `textarea`, `number`, `email`, `password`. */
	type: 'text' | 'textarea' | 'number' | 'email' | 'password'
	/** Key for the value in the resolved object. */
	name: string
	/** Optional placeholder. */
	placeholder?: string
	/** Optional initial value. */
	value?: string
	/** Optional label above the field. */
	label?: string
}

/**
 * A button in a `socia.ui.showSheet` form.
 *
 * The host renders it as a `PrimaryButton`. Tapping it closes the
 * sheet and resolves the promise with `{ action: id, values: {...} }`.
 */
export interface SociaSheetAction {
	/** Returned as `action` in the result. */
	id: string
	/** Text on the button. */
	label: string
	/** `primary` (white) or `secondary` (transparent). */
	style?: 'primary' | 'secondary'
	/** If true, promise rejects when this action is picked. */
	cancel?: boolean
}

/**
 * Configuration for `socia.ui.showSheet`.
 */
export interface SociaSheetConfig {
	/** Sheet title, rendered in the SVG header. */
	title?: string
	/** Optional help text — opens an AlertDialog when `?` is tapped. */
	helpText?: string
	/** Fields to render. */
	fields?: SociaSheetField[]
	/** Buttons at the bottom. Defaults to a single "OK". */
	actions?: SociaSheetAction[]
}

/**
 * Result of `socia.ui.showSheet`.
 */
export interface SociaSheetResult {
	/** The `id` of the action the user picked. */
	action: string
	/** Field values, keyed by `field.name`. */
	values: Record<string, string>
}

/**
 * A button in a `socia.ui.alert` dialog.
 */
export interface SociaAlertAction {
	/** Returned as `action` in the result. */
	id: string
	/** Text on the button. */
	label: string
	/** `primary` (white) or `secondary` (transparent). Defaults to `primary`. */
	style?: 'primary' | 'secondary'
	/** If true, rendered with a red destructive style. */
	destructive?: boolean
}

/**
 * Configuration for `socia.ui.alert`.
 */
export interface SociaAlertConfig {
	/** Dialog title, rendered in the SVG header. */
	title?: string
	/** Optional help text — opens an AlertDialog when `?` is tapped. */
	helpText?: string
	/** Body text. Supports plain text only, no HTML. */
	message: string
	/** Buttons at the bottom. Defaults to a single "OK". */
	actions?: SociaAlertAction[]
}

/**
 * Result of `socia.ui.alert`.
 */
export interface SociaAlertResult {
	/** The `id` of the action the user picked. */
	action: string
}

/**
 * Configuration for `socia.ui.confirm`.
 *
 * A thin wrapper over `socia.ui.alert` with two actions:
 * `Cancel` (secondary) and the confirm action (primary).
 */
export interface SociaConfirmConfig {
	/** Dialog title. */
	title?: string
	/** Body text. */
	message: string
	/** Label of the confirm button. Defaults to `OK`. */
	confirmLabel?: string
	/** Label of the cancel button. Defaults to `Cancel`. */
	cancelLabel?: string
	/** If true, the confirm button is rendered with a destructive style. */
	destructive?: boolean
}

/**
 * True when running inside the Flutter host.
 *
 * `flutter_inappwebview` exposes a global `window.flutter_inappwebview`
 * object with a `callHandler` method. We use that instead of a custom
 * `window.SociaBridge` — the plugin does not create per-handler
 * globals.
 */
function hasSociaBridge(): boolean {
	const w = window as unknown as {
		flutter_inappwebview?: { callHandler?: unknown }
	}
	return typeof w.flutter_inappwebview?.callHandler === 'function'
}

let counter = 0
const pending = new Map<string, Pending>()

function nextId(): string {
	counter += 1
	return `req_${Date.now()}_${counter}`
}

/** Post a message to the host and wait for the response. */
function send<T = unknown>(payload: Record<string, unknown>): Promise<T> {
	const id = nextId()

	return new Promise<T>((resolve, reject) => {
		pending.set(id, {
			resolve: resolve as (value: unknown) => void,
			reject,
		})

		const w = window as unknown as {
			flutter_inappwebview?: {
				callHandler: (name: string, ...args: unknown[]) => Promise<unknown>
			}
		}

		const callHandler = w.flutter_inappwebview?.callHandler

		if (typeof callHandler !== 'function') {
			pending.delete(id)
			reject(new Error('SociaBridge is not available'))
			return
		}

		callHandler('SociaBridge', JSON.stringify({ id, ...payload })).catch(
			(err: unknown) => {
				pending.delete(id)
				reject(err instanceof Error ? err : new Error(String(err)))
			},
		)
	})
}

/** Called by the host when a request finishes. Internal. */
function resolve(id: string, payload: ResolvePayload): void {
	const entry = pending.get(id)
	if (!entry) return
	pending.delete(id)

	if (payload.error) {
		entry.reject(new Error(payload.error))
	} else {
		entry.resolve(payload.result)
	}
}

/**
 * Send a message to the parent window (the dev UI), if any.
 *
 * No-op when the bridge is present — in that case `send()` already
 * talks to the Flutter host and the dev UI is not involved.
 */
function notifyParent(
	action: string,
	payload: Record<string, unknown> = {},
): void {
	if (hasSociaBridge()) return
	if (typeof window === 'undefined') return
	if (window.parent === window) return
	try {
		window.parent.postMessage({ type: 'socia:mini', action, ...payload }, '*')
	} catch {
		// Cross-origin parent — ignore. The dev UI is same-origin or
		// it cannot talk to us anyway.
	}
}

// ===== CONTEXT =====

/**
 * Per-app user context.
 *
 * - `sphereUserId` — pseudonymous per-app identifier (hex).
 *   Stable for the (user, app) pair. Use it for authentication in
 *   your own backend. Different for every mini app.
 * - `username` — optional. May be `null` if the user chose not to
 *   share it.
 * - `firstName` / `lastName` — public profile fields.
 * - `avatarUrl` — public avatar, may be `null`.
 * - `app` — app username this context was issued for.
 * - `publisherPubkey` — publisher's Ed25519 key (base64). Pin it.
 * - `exp` / `nonce` / `sig` — signed assertion. Forward all of them
 *   (with `app` and `publisherPubkey`) to your backend, which verifies
 *   `sig` against `/api/sphere/context/pubkey` and rejects expired
 *   timestamps and replayed nonces.
 */
export interface SociaContext {
	sphereUserId: string
	username: string | null
	firstName: string | null
	lastName: string | null
	avatarUrl: string | null
	app: string
	publisherPubkey: string
	exp: number
	nonce: string
	sig: string
}

const EMPTY_CONTEXT: SociaContext = {
	sphereUserId: '',
	username: null,
	firstName: null,
	lastName: null,
	avatarUrl: null,
	app: '',
	publisherPubkey: '',
	exp: 0,
	nonce: '',
	sig: '',
}

/**
 * A single mocked endpoint entry.
 *
 * Shape of `mock-api.json` in the project root:
 *
 * ```json
 * {
 *   "__context": {
 *     "sphereUserId": "mock-user",
 *     "username": "mockuser"
 *   },
 *   "GET /users/me": {
 *     "status": 200,
 *     "body": { "username": "mockuser" }
 *   }
 * }
 * ```
 */
interface MockEndpoint {
	status: number
	body: unknown
	delayMs?: number
}

/**
 * Mock table, populated by the dev UI via a `socia:mock` message.
 *
 * In production this is always `null` — `window.SociaBridge` is
 * present, so `api.*` talks to the Flutter host.
 */
let mockTable: Record<string, MockEndpoint> | null = null

/**
 * Mock user context, populated by the dev UI via a `socia:mock`
 * message. Used when `window.socia.__contextData` is not injected
 * (i.e. during `socia dev`, where there is no Flutter host).
 *
 * Comes from the reserved `__context` key in `mock-api.json`.
 */
let mockContext: SociaContext | null = null

const context = {
	/**
	 * Get the current user's context.
	 *
	 * Resolution order:
	 *   1. `window.socia.__contextData` — injected by the Flutter
	 *      host on page load (production).
	 *   2. `mockContext` — pushed by the dev UI in `socia dev`.
	 *   3. Bridge request — asks the host directly.
	 *   4. `EMPTY_CONTEXT` — nothing available.
	 */
	async get(): Promise<SociaContext> {
		const injected = (
			window as unknown as {
				socia?: { __contextData?: unknown }
			}
		).socia?.__contextData
		if (injected) {
			return normalizeContext(injected)
		}

		if (mockContext) return mockContext

		try {
			const res = await send<SociaContext>({
				namespace: 'context',
				action: 'get',
			})
			return normalizeContext(res)
		} catch {
			return EMPTY_CONTEXT
		}
	},

	/**
	 * Force a re-fetch of the context from the backend.
	 *
	 * Rarely needed. Call this only if you know the user's profile
	 * changed (e.g. they just updated their avatar in the host).
	 */
	async refresh(): Promise<SociaContext> {
		try {
			const res = await send<SociaContext>({
				namespace: 'context',
				action: 'refresh',
			})
			return normalizeContext(res)
		} catch {
			return mockContext ?? EMPTY_CONTEXT
		}
	},

	/**
	 * Synchronous read of the current context.
	 *
	 * Prefer `await socia.context.get()` in components — it works
	 * even if the injection happens slightly after the first paint.
	 */
	get cached(): SociaContext {
		const raw = (
			window as unknown as {
				socia?: { __contextData?: unknown }
			}
		).socia?.__contextData
		if (raw) return normalizeContext(raw)
		if (mockContext) return mockContext
		return EMPTY_CONTEXT
	},
}

function normalizeContext(raw: unknown): SociaContext {
	if (!raw || typeof raw !== 'object') return EMPTY_CONTEXT

	const obj = raw as Record<string, unknown>
	return {
		sphereUserId: typeof obj.sphereUserId === 'string' ? obj.sphereUserId : '',
		username: typeof obj.username === 'string' ? obj.username : null,
		firstName: typeof obj.firstName === 'string' ? obj.firstName : null,
		lastName: typeof obj.lastName === 'string' ? obj.lastName : null,
		avatarUrl: typeof obj.avatarUrl === 'string' ? obj.avatarUrl : null,
		app: typeof obj.app === 'string' ? obj.app : '',
		publisherPubkey:
			typeof obj.publisherPubkey === 'string' ? obj.publisherPubkey : '',
		exp: typeof obj.exp === 'number' ? obj.exp : 0,
		nonce: typeof obj.nonce === 'string' ? obj.nonce : '',
		sig: typeof obj.sig === 'string' ? obj.sig : '',
	}
}

/** Look up a mock for `method path`. */
function findMock(method: string, path: string): MockEndpoint | undefined {
	if (!mockTable) return undefined
	return mockTable[`${method} ${path}`]
}

/** Simulate a mock response with an optional delay. */
function mockResponse<T>(
	method: string,
	path: string,
	endpoint: MockEndpoint,
): Promise<T> {
	const delay = endpoint.delayMs ?? 0
	return new Promise<T>((resolve, reject) => {
		const deliver = () => {
			if (endpoint.status >= 200 && endpoint.status < 300) {
				resolve(endpoint.body as T)
			} else {
				const err = new Error(
					`Mock HTTP ${endpoint.status}: ${method} ${path}`,
				) as Error & { status: number; body: unknown }
				err.status = endpoint.status
				err.body = endpoint.body
				reject(err)
			}
		}
		if (delay > 0) setTimeout(deliver, delay)
		else deliver()
	})
}

// ===== INCOMING HOST COMMANDS =====

if (typeof window !== 'undefined') {
	window.addEventListener('message', event => {
		const data = event.data as
			| HostMessage
			| { type: 'socia:mock'; table: unknown }
			| undefined
		if (!data || typeof data !== 'object') return

		if (data.type === 'socia:mock') {
			const table = (data.table as Record<string, unknown> | null) ?? null

			// The `__context` key is reserved: it carries a mock user
			// context. Extract it and keep the rest as the API table.
			if (table && typeof table.__context === 'object') {
				mockContext = normalizeContext(table.__context)
				const { __context, ...rest } = table
				mockTable = rest as Record<string, MockEndpoint>
			} else {
				mockContext = null
				mockTable = table as Record<string, MockEndpoint> | null
			}
			return
		}

		if (data.type !== 'socia:host') return

		switch (data.action) {
			case 'tabs.onHostChange':
				if (typeof data.tabId === 'string') {
					tabs._onHostChange(data.tabId)
				}
				break
			case 'ui.onBack':
				ui._onBack()
				break
			case 'ui.onSettings':
				ui._onSettings()
				break
		}
	})
}

// ===== Tabs =====

type TabListener = (tabId: string) => void
const tabListeners = new Set<TabListener>()

const tabs = {
	/** Tell the host which tab is currently visible. */
	setActive(tabId: string): Promise<{ ok: boolean }> {
		if (hasSociaBridge()) {
			return send({ namespace: 'tabs', action: 'setActive', tabId })
		}
		notifyParent('tabs.setActive', { tabId })
		return Promise.resolve({ ok: true })
	},

	/** Get the currently active tab id. Returns `null` if unknown. */
	async getActive(): Promise<string | null> {
		if (!hasSociaBridge()) return null
		const res = await send<{ tabId: string | null }>({
			namespace: 'tabs',
			action: 'getActive',
		})
		return res.tabId
	},

	/**
	 * Subscribe to tab changes coming from the host tab bar.
	 * Returns an unsubscribe function.
	 */
	onChange(listener: TabListener): () => void {
		tabListeners.add(listener)
		return () => tabListeners.delete(listener)
	},

	/** Called by the host when the user taps a tab. Internal. */
	_onHostChange(tabId: string): void {
		for (const listener of tabListeners) {
			try {
				listener(tabId)
			} catch (err) {
				console.error('Tab listener error:', err)
			}
		}
	},

	/** Show or hide the host tab bar. Useful for fullscreen screens. */
	setTabbarVisible(visible: boolean): Promise<{ ok: boolean }> {
		if (hasSociaBridge()) {
			return send({
				namespace: 'tabs',
				action: 'setTabbarVisible',
				visible,
			})
		}
		notifyParent('tabs.setTabbarVisible', { visible })
		return Promise.resolve({ ok: true })
	},
}

// ===== UI =====

let backHandler: (() => void) | null = null
let settingsHandler: (() => void) | null = null

const ui = {
	/**
	 * Register a handler for the back button in the host tab bar.
	 * If you don't register one, the host will close the mini app.
	 */
	onBack(handler: () => void): Promise<{ ok: boolean }> {
		backHandler = handler
		if (!hasSociaBridge()) return Promise.resolve({ ok: true })
		return send({ namespace: 'ui', action: 'onBack' })
	},

	/**
	 * Register a handler for the settings button in the host tab bar.
	 * If you don't register one, the host shows a "no settings" toast.
	 */
	onSettings(handler: () => void): Promise<{ ok: boolean }> {
		settingsHandler = handler
		if (!hasSociaBridge()) return Promise.resolve({ ok: true })
		return send({ namespace: 'ui', action: 'onSettings' })
	},

	/**
	 * Show a native modal sheet with a form.
	 *
	 * The host renders it in `SociaBottomSheet` style — the same SVG
	 * header, the same rounded corners, the same animations as the
	 * rest of the app. The mini app never draws the sheet itself;
	 * it just describes fields and buttons.
	 *
	 * Resolves with `{ action, values }` when the user taps a
	 * non-cancel button. Rejects when the user taps a cancel button
	 * or dismisses the sheet.
	 *
	 * In `socia dev`, where there is no Flutter host, this falls
	 * back to `window.prompt` for each field — so tutorials and
	 * manual testing still work.
	 *
	 * ```ts
	 * try {
	 *   const res = await socia.ui.showSheet({
	 *     title: 'New note',
	 *     fields: [
	 *       { type: 'text', name: 'title', label: 'Title' },
	 *       { type: 'textarea', name: 'body', label: 'Body' },
	 *     ],
	 *     actions: [
	 *       { id: 'save', label: 'Save', style: 'primary' },
	 *     ],
	 *   })
	 *   console.log(res.action, res.values) // 'save', { title, body }
	 * } catch {
	 *   // user closed the sheet via the × button
	 * }
	 * ```
	 */
	async showSheet(config: SociaSheetConfig): Promise<SociaSheetResult> {
		if (hasSociaBridge()) {
			return send<SociaSheetResult>({
				namespace: 'ui',
				action: 'showSheet',
				config,
			})
		}

		return devShowSheet(config)
	},

	/**
	 * Show a native alert dialog with a message and buttons.
	 *
	 * Rendered in `SociaBottomSheet` style. The mini app does not
	 * draw the dialog itself — it only describes the text and the
	 * buttons.
	 *
	 * Resolves with `{ action }` when the user picks a button.
	 * Rejects when the user closes the dialog via the `×` button.
	 *
	 * ```ts
	 * const res = await socia.ui.alert({
	 *   title: 'Delete note?',
	 *   message: 'This cannot be undone.',
	 *   actions: [
	 *     { id: 'delete', label: 'Delete', destructive: true },
	 *   ],
	 * })
	 * if (res.action === 'delete') { ... }
	 * ```
	 *
	 * In `socia dev`, this falls back to `window.confirm` / `alert`.
	 */
	async alert(config: SociaAlertConfig): Promise<SociaAlertResult> {
		if (hasSociaBridge()) {
			return send<SociaAlertResult>({
				namespace: 'ui',
				action: 'alert',
				config,
			})
		}

		return devAlert(config)
	},

	/**
	 * Show a yes/no confirmation dialog.
	 *
	 * A thin wrapper over `socia.ui.alert` with two actions:
	 * `Cancel` (secondary) and the confirm action (primary).
	 *
	 * Resolves with `true` if the user confirmed, `false` if they
	 * cancelled or dismissed the dialog.
	 *
	 * ```ts
	 * const ok = await socia.ui.confirm({
	 *   title: 'Delete note?',
	 *   message: 'This cannot be undone.',
	 *   confirmLabel: 'Delete',
	 *   destructive: true,
	 * })
	 * if (ok) { ... }
	 * ```
	 */
	async confirm(config: SociaConfirmConfig): Promise<boolean> {
		const confirmLabel = config.confirmLabel ?? 'OK'
		const cancelLabel = config.cancelLabel ?? 'Cancel'

		const alertConfig: SociaAlertConfig = {
			title: config.title,
			message: config.message,
			actions: [
				{ id: 'cancel', label: cancelLabel, style: 'secondary' },
				{
					id: 'confirm',
					label: confirmLabel,
					style: 'primary',
					destructive: config.destructive ?? false,
				},
			],
		}

		try {
			const res = await ui.alert(alertConfig)
			return res.action === 'confirm'
		} catch {
			return false
		}
	},

	/**
	 * Set the screen orientation for the whole mini app session.
	 *
	 * The manifest's `ui.orientation` field is the initial value.
	 * This method overrides it at runtime — useful for a video
	 * player that needs landscape, or a reader that wants portrait.
	 *
	 * The change affects the whole host app, not just the WebView.
	 * When the mini app closes, the host restores its own default
	 * (portrait-only for Socia).
	 *
	 * iOS note: the requested orientation must be enabled in the
	 * host app's `Info.plist`, otherwise iOS silently ignores it.
	 *
	 * ```ts
	 * await socia.ui.setOrientation('landscape')
	 * // … later
	 * await socia.ui.setOrientation('portrait')
	 * ```
	 */
	setOrientation(
		orientation: 'auto' | 'portrait' | 'landscape',
	): Promise<{ ok: boolean }> {
		if (hasSociaBridge()) {
			return send({
				namespace: 'ui',
				action: 'setOrientation',
				orientation,
			})
		}
		// Dev mode — nothing to rotate in a browser iframe.
		return Promise.resolve({ ok: true })
	},

	/** Called by the host. Internal. */
	_onBack(): void {
		backHandler?.()
	},

	/** Called by the host. Internal. */
	_onSettings(): void {
		settingsHandler?.()
	},
}

/**
 * Dev-mode fallback for `showSheet`.
 *
 * Reads each field with `window.prompt`. Returns the same shape as
 * the Flutter host. Rejects if the user cancels a prompt.
 */
async function devShowSheet(
	config: SociaSheetConfig,
): Promise<SociaSheetResult> {
	if (config.fields && config.fields.length > 0) {
		const values: Record<string, string> = {}
		for (const field of config.fields) {
			const label = field.label ?? field.placeholder ?? field.name
			const value = window.prompt(label, field.value ?? '')
			if (value === null) throw new Error('User cancelled')
			values[field.name] = value
		}
		return {
			action: config.actions?.[config.actions.length - 1]?.id ?? 'ok',
			values,
		}
	}
	return { action: 'ok', values: {} }
}

/**
 * Dev-mode fallback for `alert`.
 *
 * Uses `window.confirm` when there are exactly two actions (one
 * cancel, one confirm), otherwise `window.alert` followed by the
 * first action's id. Not pretty, but works in a plain browser.
 */
async function devAlert(config: SociaAlertConfig): Promise<SociaAlertResult> {
	const actions = config.actions ?? [{ id: 'ok', label: 'OK' }]
	const text = config.title
		? `${config.title}\n\n${config.message}`
		: config.message

	if (actions.length === 2) {
		const ok = window.confirm(text)
		return { action: ok ? actions[1].id : actions[0].id }
	}

	window.alert(text)
	return { action: actions[0].id }
}

// ===== API =====

const api = {
	async get<T = unknown>(path: string): Promise<T> {
		const mock = findMock('GET', path)
		if (mock) return mockResponse<T>('GET', path, mock)
		return send<T>({ namespace: 'api', method: 'GET', path })
	},

	async post<T = unknown>(path: string, body?: unknown): Promise<T> {
		const mock = findMock('POST', path)
		if (mock) return mockResponse<T>('POST', path, mock)
		return send<T>({ namespace: 'api', method: 'POST', path, body })
	},

	async put<T = unknown>(path: string, body?: unknown): Promise<T> {
		const mock = findMock('PUT', path)
		if (mock) return mockResponse<T>('PUT', path, mock)
		return send<T>({ namespace: 'api', method: 'PUT', path, body })
	},

	async delete<T = unknown>(path: string): Promise<T> {
		const mock = findMock('DELETE', path)
		if (mock) return mockResponse<T>('DELETE', path, mock)
		return send<T>({ namespace: 'api', method: 'DELETE', path })
	},
}

// ===== HOME =====

const home = {
	/**
	 * Ask the host to add this mini app to the Android home screen.
	 *
	 * The host takes the name and icon from the app manifest and the
	 * cached catalog details, then opens the system "Add to home
	 * screen?" dialog. Resolves with `{ ok: true }` when the dialog
	 * was shown; `{ ok: false }` on iOS, Android < 8 or when the
	 * launcher does not support pinned shortcuts.
	 *
	 * ```ts
	 * const res = await socia.home.add()
	 * if (res.ok) console.log('confirm the dialog')
	 * ```
	 */
	add(): Promise<{ ok: boolean }> {
		if (hasSociaBridge()) {
			return send({ namespace: 'home', action: 'add' })
		}
		notifyParent('home.add')
		return Promise.resolve({ ok: false })
	},
}

// ===== PUBLIC =====

export const socia = {
	api,
	tabs,
	ui,
	context,
	home,
	_resolve: resolve,
}

export type SociaBridge = typeof socia
