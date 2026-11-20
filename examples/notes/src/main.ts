import { mount } from 'svelte'
import './app/app.css'
import App from './app/App.svelte'
import { socia } from './shared/lib/socia'
;(window as unknown as { socia: typeof socia }).socia = socia

const target = document.getElementById('app')
if (!target) {
	throw new Error('#app element not found in the DOM')
}

mount(App, { target })
