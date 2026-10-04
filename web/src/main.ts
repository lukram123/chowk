import './styles.css';
import { loadBackend } from './backend';
import { DEMO_OTP } from './backend/demo-info';
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

async function start(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) return;

  let backend;
  try {
    backend = await loadBackend();
  } catch {
    root.replaceChildren(
      messageView({
        title: 'We could not load Chowk',
        body: 'Check your connection and try again.',
        action: { label: 'Try again', run: () => window.location.reload() },
      }),
    );
    return;
  }
  if (!backend) {
    root.replaceChildren(
      messageView({
        title: 'Chowk is not set up yet',
        body: 'Add the Firebase settings to web/.env.local, or set VITE_BACKEND=demo to use sample data.',
      }),
    );
    return;
  }

  const page = h('div', { id: 'page' });
  root.replaceChildren(
    backend.isDemo
      ? h(
          'p',
          { class: 'demo-banner', role: 'note' },
          `Demo data: codes are not real. Shop codes MS2041, AB1007, FB3300. Verification code ${DEMO_OTP}.`,
        )
      : '',
    page,
  );

  const match = window.location.pathname.match(/^\/s\/([^/]+)\/?$/);
  if (match) mountRedeemPage(page, normalizeShopCode(safeDecode(match[1])), backend);
  else mountHomePage(page);
}

void start();
