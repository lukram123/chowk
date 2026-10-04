import './styles.css';
import { loadBackend } from './backend';
import { DEMO_OTP, DEMO_OWNER_MOBILE } from './backend/demo-info';
import { config } from './config';
import { parsePincode } from './feed';
import { mountFeedPage } from './feedPage';
import { normalizeShopCode } from './format';
import { mountHomePage } from './homePage';
import { mountRedeemPage } from './redeemPage';
import { h, messageView } from './ui';

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Puts the page area on screen, under a banner when the data is only a demo. */
function frame(root: HTMLElement, demoNote: string | null): HTMLElement {
  const page = h('div', { id: 'page' });
  root.replaceChildren(demoNote ? h('p', { class: 'demo-banner', role: 'note' }, demoNote) : '', page);
  return page;
}

function notSetUp(root: HTMLElement): void {
  root.replaceChildren(
    messageView({
      title: 'Chowk is not set up yet',
      body: 'Add the Firebase settings to web/.env.local, or set VITE_BACKEND=demo to use sample data.',
    }),
  );
}

async function start(root: HTMLElement): Promise<void> {
  const path = window.location.pathname;

  if (/^\/shop\/?$/.test(path)) {
    // The shop app is loaded only here, so customers never download it.
    const [{ mountShopApp }, { loadShopBackend }] = await Promise.all([import('./shop/app'), import('./shop/backend')]);
    const backend = await loadShopBackend();
    if (!backend) return notSetUp(root);
    // The shop app is for owners only; keep it out of search results.
    document.title = 'Chowk for shops';
    document.head.append(h('meta', { name: 'robots', content: 'noindex' }));
    const owner = `${DEMO_OWNER_MOBILE.slice(0, 5)} ${DEMO_OWNER_MOBILE.slice(5)}`;
    const note = backend.isDemo
      ? `Demo data. Sign in with ${owner} to open the sample shop, or any other number to list a new one. Verification code ${DEMO_OTP}.`
      : null;
    mountShopApp(frame(root, note), backend);
    return;
  }

  const backend = await loadBackend();
  if (!backend) return notSetUp(root);
  const note = backend.isDemo
    ? `Demo data: codes are not real. Shop codes MS2041, AB1007, FB3300. Verification code ${DEMO_OTP}.`
    : null;
  const page = frame(root, note);

  const shopMatch = path.match(/^\/s\/([^/]+)\/?$/);
  const feedMatch = path.match(/^\/p\/(\d{6})\/?$/);
  // With a launch pincode configured, the front page is that pincode's feed.
  const feedPincode = feedMatch ? feedMatch[1] : path === '/' ? parsePincode(config.defaultPincode ?? '') : null;

  if (shopMatch) {
    mountRedeemPage(page, normalizeShopCode(safeDecode(shopMatch[1])), backend);
  } else if (feedPincode) {
    root.classList.add('wide'); // the feed uses the full width on larger screens
    mountFeedPage(page, feedPincode, backend);
  } else {
    mountHomePage(page); // also /pincode and /code
  }
}

const root = document.getElementById('root');
if (root) {
  start(root).catch(() => {
    root.replaceChildren(
      messageView({
        title: 'We could not load Chowk',
        body: 'Check your connection and try again.',
        action: { label: 'Try again', run: () => window.location.reload() },
      }),
    );
  });
}
