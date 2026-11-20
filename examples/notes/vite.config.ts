import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// The Socia host loads the mini app from an unpacked folder inside
// a WebView via `loadFileUrl`. That means:
//
//   1. We do NOT inline everything into a single HTML file. Separate
//      JS chunks and CSS files compress much better with Brotli,
//      which is what `socia build` uses.
//   2. Asset paths must be relative (`./assets/...`), not absolute
//      (`/assets/...`), so they resolve correctly inside the WebView.
//
// The old approach used `vite-plugin-singlefile`, but it produced a
// bloated HTML and killed Brotli's static dictionary advantage.
export default defineConfig({
	plugins: [svelte()],
	base: './',
	// Dev server settings for `socia dev`.
	//
	// The `socia dev` UI runs on a different origin (localhost:3003)
	// and embeds the Vite dev server (localhost:5173) in an iframe.
	// Without these settings the browser blocks the HMR WebSocket
	// and module requests with CORS errors.
	server: {
		// Allow the `socia dev` UI origin to load modules.
		cors: {
			origin: ['http://localhost:3003', 'http://127.0.0.1:3003'],
			credentials: true,
		},
		// Point the HMR client at the right port. Vite's HMR
		// WebSocket runs on the same port as the dev server, but
		// when loaded inside an iframe from another origin the
		// client needs an explicit target.
		hmr: {
			host: 'localhost',
			port: 5173,
			protocol: 'ws',
		},
	},
	build: {
		// Emit readable chunk names for easier debugging inside `.socia`.
		// Brotli handles the size anyway.
		chunkSizeWarningLimit: 600,
		// Keep the folder structure predictable: `assets/<name>-<hash>.<ext>`.
		assetsDir: 'assets',
		rollupOptions: {
			output: {
				// Predictable names; hashing is fine because the host
				// unpacks the whole folder each time.
				entryFileNames: 'assets/[name]-[hash].js',
				chunkFileNames: 'assets/[name]-[hash].js',
				assetFileNames: 'assets/[name]-[hash].[ext]',
			},
		},
	},
})
