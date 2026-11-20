<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    /** Optional title shown above the content. */
    title?: string
    /** Card body. Pass content as children. */
    children: Snippet
  }

  const { title, children }: Props = $props()
</script>

<section class="card">
  {#if title}
    <h3 class="title">{title}</h3>
  {/if}
  <div class="body">
    {@render children()}
  </div>
</section>

<style>
  .card {
    padding: 20px;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .title {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.50);
    letter-spacing: 0.6px;
    text-transform: uppercase;
    margin-bottom: 12px;
  }

  .body {
    display: flex;
    flex-direction: column;
  }
</style>