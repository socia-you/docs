<script lang="ts">
  import { onMount } from 'svelte'
  import { socia } from '../../shared/lib/socia'
  import { router } from '../../shared/lib/router'
  import {
    loadNotes,
    saveNotes,
    newNoteId,
    type Note,
  } from '../../shared/lib/notes-store'

  // The full list of notes. Loaded from localStorage on mount.
  let notes = $state<Note[]>([])

  // Prevent double-deletes from a fast double-tap on long-press.
  let busy = $state(false)

  onMount(() => {
    notes = loadNotes()
  })

  /** Sort notes by most-recently updated first. */
  let sorted = $derived.by(() =>
    [...notes].sort((a, b) => b.updatedAt - a.updatedAt),
  )

  /** Number of notes, for the counter under the title. */
  let countLabel = $derived(
    sorted.length === 1 ? '1 note' : `${sorted.length} notes`,
  )

  /**
   * Open the native Socia sheet, ask for a title and a body, and
   * append the result to the notes list.
   */
  async function createNote() {
    try {
      const res = await socia.ui.showSheet({
        title: 'New note',
        helpText:
          'Both fields are optional. An empty title becomes "Untitled".',
        fields: [
          {
            type: 'text',
            name: 'title',
            label: 'Title',
            placeholder: 'Note title',
          },
          {
            type: 'textarea',
            name: 'body',
            label: 'Body',
            placeholder: 'Write something…',
          },
        ],
        actions: [{ id: 'save', label: 'Save', style: 'primary' }],
      })

      const now = Date.now()
      const note: Note = {
        id: newNoteId(),
        title: res.values.title?.trim() || 'Untitled',
        body: res.values.body ?? '',
        createdAt: now,
        updatedAt: now,
      }

      notes = [note, ...notes]

      try {
        saveNotes(notes)
      } catch {
        await socia.ui.alert({
          title: 'Storage full',
          message:
            'Could not save your note. Free up space and try again.',
        })
      }
    } catch {
      // User closed the sheet via the × button. Nothing to do.
    }
  }

  /**
   * Confirm and delete a note.
   */
  async function deleteNote(note: Note) {
    if (busy) return
    busy = true

    try {
      const ok = await socia.ui.confirm({
        title: 'Delete note?',
        message: `"${note.title}" will be removed. This cannot be undone.`,
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        destructive: true,
      })

      if (!ok) return

      notes = notes.filter(n => n.id !== note.id)

      try {
        saveNotes(notes)
      } catch {
        await socia.ui.alert({
          title: 'Storage full',
          message: 'Could not update your notes.',
        })
      }
    } finally {
      busy = false
    }
  }

  /** Navigate to the detail page for a note. */
  function openNote(note: Note) {
    router.goto(`/note/${note.id}`)
  }

  /**
   * Long-press handler. On mobile WebViews a long-press fires
   * `contextmenu`. We prevent the platform's default context menu
   * and route the gesture to `deleteNote`.
   */
  function onLongPress(
    event: MouseEvent | PointerEvent,
    note: Note,
  ) {
    event.preventDefault()
    void deleteNote(note)
  }

  /** Keyboard handler for a11y — Enter / Space open the note. */
  function onKeyDown(event: KeyboardEvent, note: Note) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openNote(note)
    }
  }

  /** Format a Unix timestamp as a short relative label. */
  function formatDate(ts: number): string {
    const diff = Date.now() - ts
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour

    if (diff < minute) return 'now'
    if (diff < hour) return `${Math.floor(diff / minute)}m`
    if (diff < day) return `${Math.floor(diff / hour)}h`
    if (diff < 7 * day) return `${Math.floor(diff / day)}d`

    const d = new Date(ts)
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    })
  }
</script>

<section class="page">
  <header class="header">
    <div class="title-block">
      <h1>Notes</h1>
      <p class="count">{countLabel}</p>
    </div>
  </header>

  {#if sorted.length === 0}
    <div class="empty">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 3v4a1 1 0 0 0 1 1h4" />
          <path
            d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"
          />
        </svg>
      </div>
      <p class="empty-title">No notes yet</p>
      <p class="empty-subtitle">
        Tap the + button to write your first note.
      </p>
    </div>
  {:else}
    <ul class="list">
      {#each sorted as note (note.id)}
        <li class="item">
          <button
            class="note"
            type="button"
            onclick={() => openNote(note)}
            oncontextmenu={(e) => onLongPress(e, note)}
            onkeydown={(e) => onKeyDown(e, note)}
          >
            <div class="note-top">
              <div class="note-title">{note.title}</div>
              <div class="note-date small">
                {formatDate(note.updatedAt)}
              </div>
            </div>
            {#if note.body.trim().length > 0}
              <div class="note-body">{note.body}</div>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <button
    class="fab"
    type="button"
    aria-label="New note"
    onclick={createNote}
  >
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <line x1="12" x2="12" y1="5" y2="19" />
      <line x1="5" x2="19" y1="12" y2="12" />
    </svg>
  </button>
</section>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding-top: 8px;
  }

  .header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    padding: 4px 4px 0;
  }

  .title-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  h1 {
    font-family: var(--font-title);
    font-size: 52px;
    font-weight: 700;
    letter-spacing: 0;
    color: var(--ink);
    line-height: 0.95;
  }

  .count {
    font-family: var(--font-small);
    font-size: 13px;
    color: var(--ink-muted);
    letter-spacing: 0.2px;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 72px 24px;
    text-align: center;
  }

  .empty-icon {
    width: 72px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
    background: var(--paper-raised);
    border: 1.5px solid var(--ink-line);
    margin-bottom: 4px;
    box-shadow: var(--shadow-card);
  }

  .empty-icon svg {
    width: 32px;
    height: 32px;
    stroke: var(--ink-muted);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
  }

  .empty-title {
    font-family: var(--font-title);
    font-size: 28px;
    font-weight: 700;
    color: var(--ink-soft);
    letter-spacing: 0.3px;
    line-height: 1;
  }

  .empty-subtitle {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--ink-muted);
    max-width: 260px;
    line-height: 1.5;
  }

  .list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-bottom: 96px;
  }

  .item {
    display: block;
  }

  .note {
    display: block;
    width: 100%;
    text-align: left;
    padding: 16px 18px;
    background: var(--paper-raised);
    border: 1.5px solid var(--ink-line);
    border-radius: var(--wobbly-lg);
    cursor: pointer;
    box-shadow: var(--shadow-card);
    transition:
      transform 0.12s ease,
      box-shadow 0.12s ease,
      background 0.15s ease,
      border-color 0.15s ease;
    -webkit-tap-highlight-color: transparent;
    outline: none;
    font-family: inherit;
    color: inherit;
  }

  .note:hover {
    background: var(--paper-hover);
    border-color: var(--ink-line-strong);
    box-shadow: var(--shadow-card-hover);
    transform: translate(2px, 2px);
  }

  .note:active {
    box-shadow: var(--shadow-card-active);
    transform: translate(4px, 4px);
  }

  .note:focus-visible {
    border-color: var(--accent);
    box-shadow: var(--shadow-card-hover);
  }

  .note-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 2px;
  }

  .note-title {
    font-family: var(--font-body);
    font-size: 17px;
    font-weight: 700;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
    letter-spacing: 0.2px;
    line-height: 1.3;
  }

  .note-date {
    font-family: var(--font-small);
    font-size: 11px;
    color: var(--ink-dim);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.1px;
  }

  .note-body {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--ink-muted);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .fab {
    position: fixed;
    right: 20px;
    bottom: calc(96px + env(safe-area-inset-bottom));
    width: 60px;
    height: 60px;
    border-radius: var(--wobbly-md);
    background: var(--accent);
    color: var(--accent-ink);
    border: 1.5px solid #000;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-fab);
    transition:
      transform 0.12s ease,
      box-shadow 0.12s ease,
      background 0.15s ease;
    -webkit-tap-highlight-color: transparent;
    outline: none;
    z-index: 10;
  }

  .fab:hover {
    background: #fcd34d;
    box-shadow: var(--shadow-fab-hover);
    transform: translate(2px, 2px);
  }

  .fab:active {
    box-shadow: var(--shadow-card-active);
    transform: translate(5px, 5px);
  }

  .fab svg {
    width: 26px;
    height: 26px;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
  }
</style>