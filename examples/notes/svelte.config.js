import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

// Enables TypeScript inside `<script lang="ts">` blocks and `$props()`
// rune typing. Svelte 5 compiles this at build time.
export default {
	preprocess: vitePreprocess(),
}
