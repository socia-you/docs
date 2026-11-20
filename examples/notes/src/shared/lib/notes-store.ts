/**
 * Persistent storage for the Notes app.
 *
 * Wraps `localStorage` with a versioned key and a safe JSON
 * round-trip. If the stored blob is invalid or has a different
 * shape, it is discarded rather than crashing the app.
 *
 * ## Why `localStorage` is OK here
 *
 * Each mini app runs in its own origin inside the host — its own
 * `localStorage` bucket. Notes written by the Notes app are not
 * visible to any other mini app, and vice versa.
 *
 * `localStorage` is fine for a small, local-only app like Notes.
 * It does **not** sync between devices and is **not** encrypted.
 * If you later want cloud sync, replace this module with calls
 * to your own backend through `socia.api`.
 */

export interface Note {
	/** Unique id, generated client-side. */
	id: string
	/** Title shown in the list and on the detail page. */
	title: string
	/** Body text. May be empty. */
	body: string
	/** Unix timestamp (ms) when the note was created. */
	createdAt: number
	/** Unix timestamp (ms) when the note was last edited. */
	updatedAt: number
}

/**
 * Storage key. The `.v1` suffix lets us change the format later
 * without breaking existing installs — we can read `v1`, migrate
 * to `v2`, and delete the old key.
 */
const STORAGE_KEY = 'socia.notes.v1'

/**
 * Read all notes from storage.
 *
 * Returns an empty array on any failure — invalid JSON, wrong
 * shape, missing key. The UI never has to handle a `null` list.
 * Individual notes that fail `isNote` are dropped.
 */
export function loadNotes(): Note[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return []

		const parsed: unknown = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []

		return parsed.filter(isNote)
	} catch {
		return []
	}
}

/**
 * Write the full list of notes to storage.
 *
 * Throws if `localStorage.setItem` fails — for example, when the
 * storage quota is exceeded. The caller should surface the error
 * to the user. We do not swallow it, because silent data loss is
 * worse than a visible error.
 */
export function saveNotes(notes: Note[]): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}

/**
 * Erase all notes from storage.
 *
 * Used by the "Delete all" action, if we ever add one. Kept here
 * so the storage layer owns every mutation.
 */
export function clearNotes(): void {
	localStorage.removeItem(STORAGE_KEY)
}

/**
 * Generate a new note id.
 *
 * Format: `note_<timestamp>_<random>`. Collision-resistant enough
 * for local notes; not a UUID, but does not need to be.
 */
export function newNoteId(): string {
	return `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Type guard. Ensures a value read from storage matches the
 * `Note` shape before it reaches the UI.
 *
 * Rejects anything that is missing a field or has the wrong type.
 * This is important after a schema change — old notes with a
 * different shape are dropped silently instead of crashing.
 */
function isNote(value: unknown): value is Note {
	if (!value || typeof value !== 'object') return false
	const obj = value as Record<string, unknown>

	return (
		typeof obj.id === 'string' &&
		typeof obj.title === 'string' &&
		typeof obj.body === 'string' &&
		typeof obj.createdAt === 'number' &&
		typeof obj.updatedAt === 'number'
	)
}
