<script lang="ts">
  import { onMount } from 'svelte'
  import { socia } from '../../shared/lib/socia'
  import { router } from '../../shared/lib/router'
  import {
    loadNotes,
    saveNotes,
    type Note,
  } from '../../shared/lib/notes-store'

  /**
   * The note id, passed from App.svelte. Svelte 5 props via
   * `$props()` — see `App.svelte` for the wiring.
   */
  let { id }: { id: string } = $props()

  /** The loaded note, or `null` if not found. */
  let note = $state<Note | null>(null)

  /** Local draft state — bound to the inputs. */
  let draftTitle = $state('')
  let draftBody = $state('')

  /** Shown while the app is looking up the note in storage. */
  let loading = $state(true)

  onMount(() => {
    const all = loadNotes()
    const found = all.find(n => n.id === id) ?? null

    note = found
    if (found) {
      draftTitle = found.title
      draftBody = found.body
    }
    loading = false
  })

  /**
   * Persist the current draft to storage.
   *
   * Called on every input event. Cheap — `localStorage` writes are
   * synchronous and fast for small payloads.
   */
  function persist() {
    if (!note) return

    const all = loadNotes().map(n =>
      n.id === note!.id
        ? {
            ...n,
            title: draftTitle.trim() || 'Untitled',
            body: draftBody,
            updatedAt: Date.now(),
          }
        : n,
    )

    try {
      saveNotes(all)
    } catch {
      void socia.ui.alert({
        title: 'Storage full',
        message:
          'Could not save your changes. Free up space and try again.',
      })
    }
  }

  /** Navigate back to the list. */
  function goBack() {
    router.goto('/home')
  }

  /**
   * Delete the current note. Shows the native confirm dialog
   * first.
   */
  async function deleteCurrent() {
    if (!note) return

    const ok = await socia.ui.confirm({
      title: 'Delete note?',
      message: 'This note will be removed. This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    })

    if (!ok) return

    const all = loadNotes().filter(n => n.id !== note!.id)
    try {
      saveNotes(all)
    } catch {
      // ignore
    }
    goBack()
  }

  /** Long date for the header — "27 Sep 2026". */
  let metaLabel = $derived.by(() => {
    if (!note) return ''
    const d = new Date(note.createdAt)
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  })
</script>

<section class="page">
  <header class="header">
    <button
      class="icon-btn"
      type="button"
      onclick={goBack}
      aria-label="Back"
    >
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>

    <div class="title-block">
      <span class="title-label">Note</span>
      {#if note}
        <span class="title-meta small">{metaLabel}</span>
      {/if}
    </div>

    <button
      class="icon-btn icon-btn--danger"
      type="button"
      onclick={deleteCurrent}
      aria-label="Delete"
    >
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    </button>
  </header>

  {#if loading}
    <div class="center">
      <div class="spinner"></div>
    </div>
  {:else if !note}
    <div class="center">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
      </div>
      <p class="empty-title">Note not found</p>
      <p class="empty-subtitle">
        It may have been deleted. Go back to the list.
      </p>
    </div>
  {:else}
    <div class="editor">
      <input
        class="title-input"
        type="text"
        bind:value={draftTitle}
        oninput={persist}
        placeholder="Title"
        spellcheck="false"
        autocomplete="off"
      />

      <textarea
        class="body-input"
        bind:value={draftBody}
        oninput={persist}
        placeholder="Write something…"
        spellcheck="false"
      ></textarea>
    </div>
  {/if}
</section>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 8px;
    min-height: calc(100vh - 200px);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 0;
  }

  .title-block {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    text-align: center;
  }

  .title-label {
    font-family: var(--font-title);
    font-size: 26px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: 0.3px;
    line-height: 1;
  }

  .title-meta {
    font-family: var(--font-small);
    font-size: 11px;
    color: var(--ink-dim);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.1px;
  }

  .editor {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
  }

  .title-input {
    width: 100%;
    background: var(--paper-raised);
    border: 1.5px solid var(--ink-line);
    border-radius: var(--wobbly-md);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.2px;
    padding: 0 20px;
    height: 64px;
    outline: none;
    -webkit-tap-highlight-color: transparent;
    box-shadow: var(--shadow-card);
    transition:
      transform 0.12s ease,
      box-shadow 0.12s ease,
      background 0.15s ease,
      border-color 0.15s ease;
  }

  .title-input::placeholder {
    color: var(--ink-dim);
    font-weight: 700;
  }

  .title-input:hover {
    background: var(--paper-hover);
  }

  .title-input:focus {
    border-color: var(--accent);
    background: var(--paper-hover);
  }

  .body-input {
    width: 100%;
    background: var(--paper-raised);
    border: 1.5px solid var(--ink-line);
    border-radius: var(--wobbly-lg);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 16px;
    line-height: 1.6;
    letter-spacing: 0.1px;
    padding: 18px 20px;
    outline: none;
    resize: none;
    min-height: 340px;
    flex: 1;
    -webkit-tap-highlight-color: transparent;
    box-shadow: var(--shadow-card);
    transition:
      transform 0.12s ease,
      box-shadow 0.12s ease,
      background 0.15s ease,
      border-color 0.15s ease;
  }

  .body-input::placeholder {
    color: var(--ink-dim);
  }

  .body-input:hover {
    background: var(--paper-hover);
  }

  .body-input:focus {
    border-color: var(--accent);
    background: var(--paper-hover);
  }

  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 80px 24px;
    text-align: center;
  }

  .spinner {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2.5px solid var(--ink-line);
    border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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
    box-shadow: var(--shadow-card);
    margin-bottom: 4px;
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
</style>