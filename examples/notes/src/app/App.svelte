<script lang="ts">
  import { onMount } from 'svelte'
  import { socia } from '../shared/lib/socia'
  import { router } from '../shared/lib/router'
  import HomePage from '../pages/home/HomePage.svelte'
  import NotePage from '../pages/note/NotePage.svelte'
  import ProfilePage from '../pages/profile/ProfilePage.svelte'

  /**
   * Current route path. Updated whenever the router changes.
   * Starts at `/` — the router emits the initial value on mount.
   */
  let path = $state('/')

  onMount(() => {
    // Two-way binding between the host tab bar and the in-page
    // router.
    //
    // 1. Host → app. When the user taps a tab, the host calls
    //    `socia.tabs._onHostChange(tabId)`, which fires our
    //    listener.
    const offTabs = socia.tabs.onChange(tabId => {
      router.goto(`/${tabId}`)
    })

    // 2. App → host. When we navigate internally, we tell the host
    //    which tab should now be highlighted. Special-case routes
    //    like `/note/:id` collapse to their parent tab (`home`).
    const offRouter = router.onChange(next => {
      path = next

      // Collapse to the parent tab id.
      let tabId = 'home'
      if (next.startsWith('/profile')) tabId = 'profile'
      else if (next.startsWith('/note/')) tabId = 'home'

      socia.tabs.setActive(tabId).catch(() => {
        // The host will not fail if the tab is unknown. Safe to
        // ignore.
      })
    })

    // 3. Settings. The host draws a gear button because
    //    manifest.json → ui.tabbar.showSettings is true. The sheet
    //    and the system pin dialog are both native - we only
    //    describe them.
    void socia.ui.onSettings(async () => {
      try {
        const res = await socia.ui.showSheet({
          title: 'Settings',
          actions: [
            { id: 'home', label: 'Add to home screen', style: 'primary' },
            {
              id: 'cancel',
              label: 'Cancel',
              style: 'secondary',
              cancel: true,
            },
          ],
        })

        if (res.action !== 'home') return

        const pinned = await socia.home.add()
        if (!pinned.ok) {
          await socia.ui.alert({
            title: 'Not available',
            message:
              'Home screen shortcuts need Android 8 or newer and a launcher that supports them.',
            actions: [{ id: 'ok', label: 'OK', style: 'primary' }],
          })
        }
      } catch {
        // The user dismissed the sheet - nothing to do.
      }
    }).catch(() => {
      // The host bridge is not ready - settings stay unavailable.
    })

    // Kick off the router - reads the current hash and emits once.
    router.start()

    return () => {
      offTabs()
      offRouter()
    }
  })

  /**
   * Pick which page to render based on the current route.
   * Add new pages here as the app grows.
   */
  let Page = $derived.by(() => {
    if (path.startsWith('/profile')) return ProfilePage
    if (path.startsWith('/note/')) return NotePage
    return HomePage
  })

  /**
   * If the current route is a note detail page, extract its id.
   * Otherwise `null`.
   */
  let noteId = $derived.by(() => {
    if (!path.startsWith('/note/')) return null
    const raw = path.slice('/note/'.length)
    return raw.length > 0 ? raw : null
  })
</script>

<main class="shell">
  {#if Page === NotePage && noteId}
    <NotePage id={noteId} />
  {:else}
    <Page />
  {/if}
</main>

<style>
  .shell {
    position: relative;
    z-index: 1;
  }
</style>