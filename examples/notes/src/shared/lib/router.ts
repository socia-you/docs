/**
 * Tiny hash-based router.
 *
 * Why hash-based? The host loads the mini app via `loadHtmlString`,
 * which uses a fake base URL. That means `history.pushState` and
 * normal path routing don't work — the WebView won't resolve them.
 * The hash fragment (`#/about`) is the only navigation primitive
 * that survives a reload without a real origin.
 *
 * `App.svelte` wires this router to the host tab bar:
 *   - tab tap → `router.goto('/<tabId>')`
 *   - router change → `socia.tabs.setActive(tabId)`
 */

type RouteListener = (path: string) => void

const listeners = new Set<RouteListener>()
let currentPath = '/'

function readHash(): string {
	const raw = window.location.hash.replace(/^#/, '')
	return raw || '/'
}

export const router = {
	/** The current route path (e.g. `/home`, `/about`). */
	get current(): string {
		return currentPath
	},

	/**
	 * Start listening for hash changes and emit the current path once.
	 * Safe to call multiple times — listeners are added once.
	 */
	start(): void {
		currentPath = readHash()

		window.addEventListener('hashchange', () => {
			currentPath = readHash()
			for (const listener of listeners) listener(currentPath)
		})

		for (const listener of listeners) listener(currentPath)
	},

	/** Navigate to a path. No-op if we're already there. */
	goto(path: string): void {
		if (currentPath === path) return
		window.location.hash = path
	},

	/** Subscribe to route changes. Returns an unsubscribe function. */
	onChange(listener: RouteListener): () => void {
		listeners.add(listener)
		return () => listeners.delete(listener)
	},
}
