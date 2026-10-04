// Chowk for shops: the app a shop owner uses at /shop. Signs in by mobile number,
// then moves between a few screens with the bottom bar; the address hash keeps
// the phone's back button working.
import { loadingView, messageView } from '../ui';
import { checkView } from './check';
import { homeView } from './home';
import { offerView } from './offer';
import { registerView, signInView } from './onboard';
import { qrView } from './qrPage';
import { resultsView } from './results';
import type { ShopContext, View } from './shell';
import { ShopFailed, type Dashboard, type ShopBackend } from './types';

export function mountShopApp(root: HTMLElement, backend: ShopBackend): void {
  let dispose: (() => void) | undefined;
  let dashboard: Dashboard | null = null;

  function show(view: View): void {
    dispose?.();
    dispose = view.dispose;
    root.replaceChildren(view.el);
    window.scrollTo(0, 0);
  }

  function context(current: Dashboard): ShopContext {
    return {
      backend,
      dashboard: current,
      go(hash) {
        if (window.location.hash === hash) route();
        else window.location.hash = hash;
      },
      async reload(hash) {
        await load(hash);
      },
      async signOut() {
        await backend.signOut();
        dashboard = null;
        showSignIn();
      },
    };
  }

  function route(): void {
    if (!dashboard) return;
    const ctx = context(dashboard);
    switch (window.location.hash) {
      case '#offer':
        show(offerView(ctx));
        break;
      case '#check':
        show(checkView(ctx));
        break;
      case '#results':
        show(resultsView(ctx));
        break;
      case '#qr':
        show(qrView(ctx));
        break;
      default:
        show(homeView(ctx));
    }
  }

  function showSignIn(): void {
    show(signInView(backend, () => load('#home')));
  }

  /** Loads the dashboard and shows the screen for `hash`; sends the owner to sign-in or listing as needed. */
  async function load(hash?: string): Promise<void> {
    try {
      dashboard = await backend.getDashboard();
    } catch (err) {
      const reason = err instanceof ShopFailed ? err.reason : 'unknown';
      dashboard = null;
      if (reason === 'no-shop') {
        show(registerView(backend, { onListed: () => load('#qr'), onSignOut: () => backend.signOut().then(showSignIn) }));
      } else if (reason === 'not-signed-in') {
        showSignIn();
      } else {
        show({
          el: messageView({
            title: 'We could not load your shop',
            body: 'Check your connection and try again.',
            action: { label: 'Try again', run: () => void load(hash) },
          }),
        });
      }
      return;
    }
    if (hash !== undefined && window.location.hash !== hash) window.location.hash = hash;
    else route();
  }

  window.addEventListener('hashchange', route);

  void (async () => {
    show({ el: loadingView('Opening your shop…') });
    let signedIn = false;
    try {
      signedIn = await backend.isSignedIn();
    } catch {
      // treat as signed out
    }
    if (signedIn) await load();
    else showSignIn();
  })();
}
