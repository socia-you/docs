<script lang="ts">
  import { onMount } from 'svelte'
  import { socia, type SociaContext } from '../../shared/lib/socia'
  import { loadNotes } from '../../shared/lib/notes-store'

  /** User context injected by the host on page load. */
  let ctx = $state<SociaContext | null>(null)

  /** Whether the context is still loading. */
  let loading = $state(true)

  /** Number of notes in storage. */
  let noteCount = $state(0)

  /** Total characters across all notes. */
  let charCount = $state(0)

  onMount(async () => {
    const notes = loadNotes()
    noteCount = notes.length
    charCount = notes.reduce(
      (sum, n) => sum + n.title.length + n.body.length,
      0,
    )

    ctx = await socia.context.get()
    loading = false
  })

  /** User's display name — first + last, or "Anonymous". */
  let displayName = $derived.by(() => {
    if (!ctx) return '—'
    const parts = [ctx.firstName, ctx.lastName].filter(Boolean)
    return parts.length > 0 ? parts.join(' ') : 'Anonymous'
  })

  /** First letter of the display name, for the avatar fallback. */
  let initial = $derived(displayName.charAt(0).toUpperCase() || '?')

  /** Truncate a long hex id for display. */
  function shortId(id: string): string {
    if (!id) return '—'
    if (id.length <= 16) return id
    return `${id.slice(0, 8)}…${id.slice(-8)}`
  }

  /** Compact number formatting — 1.2k, 12k, 1.2m. */
  function compact(n: number): string {
    if (n < 1000) return String(n)
    if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
    return `${(n / 1_000_000).toFixed(1)}m`
  }
</script>

<section class="page">
  <header class="header">
    <h1>Profile</h1>
  </header>

  <div class="user-card">
    {#if loading}
      <div class="user">
        <div class="avatar avatar--skeleton"></div>
        <div class="info">
          <div class="skeleton skeleton--line"></div>
          <div class="skeleton skeleton--line skeleton--short"></div>
        </div>
      </div>
    {:else if !ctx || !ctx.sphereUserId}
      <div class="unavailable">
        <div class="unavailable-icon">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
        </div>
        <p class="unavailable-title">Context unavailable</p>
        <p class="unavailable-sub">
          This mini app is running without a user context.
        </p>
      </div>
    {:else}
      <div class="user">
        {#if ctx.avatarUrl}
          <img class="avatar" src={ctx.avatarUrl} alt="avatar" />
        {:else}
          <div class="avatar avatar--fallback">{initial}</div>
        {/if}
        <div class="info">
          <div class="name">{displayName}</div>
          {#if ctx.username}
            <div class="username">@{ctx.username}</div>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <div class="stats">
    <div class="stat">
      <div class="stat-value">{noteCount}</div>
      <div class="stat-label small">
        {noteCount === 1 ? 'Note' : 'Notes'}
      </div>
    </div>
    <div class="stat">
      <div class="stat-value">{compact(charCount)}</div>
      <div class="stat-label small">Characters</div>
    </div>
  </div>

  <div class="card">
    <h2 class="section-title small">Identifiers</h2>

    <div class="row">
      <span class="row-label small">sphere_user_id</span>
      <code title={ctx?.sphereUserId ?? ''}>
        {ctx ? shortId(ctx.sphereUserId) : '—'}
      </code>
    </div>

    <div class="row">
      <span class="row-label small">username</span>
      <code>{ctx?.username ?? '—'}</code>
    </div>

    <p class="hint small">
      <code>sphere_user_id</code> is different for every mini app
      and stable for the (user, app) pair. Use it to authenticate
      the user in your own backend.
    </p>
  </div>

  <div class="card">
    <h2 class="section-title small">About this app</h2>

    <div class="row">
      <span class="row-label small">Name</span>
      <span class="row-value">Notes</span>
    </div>

    <div class="row">
      <span class="row-label small">Version</span>
      <span class="row-value">0.1.0</span>
    </div>

    <div class="row">
      <span class="row-label small">Id</span>
      <code>com.socia.notes</code>
    </div>
  </div>
</section>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding-top: 8px;
  }

  .header {
    padding: 4px 4px 0;
  }

  h1 {
    font-family: var(--font-title);
    font-size: 52px;
    font-weight: 700;
    letter-spacing: 0;
    color: var(--ink);
    line-height: 0.95;
  }

  .user-card {
    padding: 24px 22px;
    background: var(--paper-raised);
    border: 1.5px solid var(--ink-line);
    border-radius: var(--wobbly-lg);
    box-shadow: var(--shadow-card);
  }

  .user {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .avatar {
    width: 68px;
    height: 68px;
    border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
    object-fit: cover;
    flex-shrink: 0;
    border: 1.5px solid var(--ink-line-strong);
  }

  .avatar--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent);
    color: var(--accent-ink);
    font-family: var(--font-title);
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 0;
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.5);
  }

  .avatar--skeleton {
    background: var(--paper-hover);
    border: 1.5px solid var(--ink-line);
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .name {
    font-family: var(--font-body);
    font-size: 20px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: 0.2px;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .username {
    font-family: var(--font-small);
    font-size: 14px;
    color: var(--ink-muted);
  }

  .skeleton {
    background: linear-gradient(
      90deg,
      rgba(232, 228, 222, 0.05) 0%,
      rgba(232, 228, 222, 0.08) 50%,
      rgba(232, 228, 222, 0.05) 100%
    );
    background-size: 200% 100%;
    border-radius: 6px;
    height: 14px;
    animation: shimmer 1.6s ease-in-out infinite;
  }

  .skeleton--line {
    width: 140px;
  }

  .skeleton--short {
    width: 80px;
    height: 12px;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .unavailable {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    text-align: center;
    padding: 8px 0;
  }

  .unavailable-icon {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
    background: var(--paper-hover);
    border: 1.5px solid var(--ink-line);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.45);
    margin-bottom: 4px;
  }

  .unavailable-icon svg {
    width: 24px;
    height: 24px;
    stroke: var(--ink-muted);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
  }

  .unavailable-title {
    font-family: var(--font-title);
    font-size: 22px;
    font-weight: 700;
    color: var(--ink-soft);
    line-height: 1;
    letter-spacing: 0.2px;
  }

  .unavailable-sub {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--ink-muted);
    max-width: 260px;
    line-height: 1.5;
  }

  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .stat {
    padding: 20px 22px;
    background: var(--paper-raised);
    border: 1.5px solid var(--ink-line);
    border-radius: var(--wobbly-md);
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-value {
    font-family: var(--font-title);
    font-size: 40px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: 0;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-family: var(--font-small);
    font-size: 11px;
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-weight: 600;
  }

  .card {
    padding: 20px 22px;
    background: var(--paper-raised);
    border: 1.5px solid var(--ink-line);
    border-radius: var(--wobbly-lg);
    box-shadow: var(--shadow-card);
  }

  .section-title {
    font-family: var(--font-small);
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-muted);
    letter-spacing: 0.8px;
    text-transform: uppercase;
    margin-bottom: 16px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 13px;
    margin-bottom: 12px;
  }

  .row:last-of-type {
    margin-bottom: 0;
  }

  .row-label {
    font-family: var(--font-small);
    color: var(--ink-muted);
    font-size: 12px;
  }

  .row-value {
    font-family: var(--font-body);
    color: var(--ink-soft);
    font-size: 14px;
    letter-spacing: 0.2px;
  }

  .hint {
    font-family: var(--font-small);
    margin-top: 16px;
    font-size: 12px;
    line-height: 1.55;
    color: var(--ink-dim);
  }

  code {
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(232, 228, 222, 0.06);
    border: 1px solid var(--ink-line);
    color: var(--ink-soft);
    max-width: 55%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>