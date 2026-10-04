// The page a customer lands on after scanning a shop's QR: /s/<shop code>.
// Deal -> verify mobile number (first time only) -> code to show the shopkeeper.
import {
  RedeemFailed,
  type Backend,
  type Deal,
  type RedeemFailure,
  type Shop,
  type ShopDeal,
  type Unlocked,
} from './backend/types';
import { config } from './config';
import { formatCode, formatCountdown, formatDay } from './format';
import { otpForm } from './otpForm';
import { h, icon, loadingView, lockup, messageView, setBusy } from './ui';

interface View {
  el: HTMLElement;
  /** Stops timers when the view is replaced. */
  dispose?: () => void;
}

export function mountRedeemPage(root: HTMLElement, shopCode: string, backend: Backend): void {
  let dispose: (() => void) | undefined;

  function show(view: View): void {
    dispose?.();
    dispose = view.dispose;
    root.replaceChildren(view.el);
    window.scrollTo(0, 0);
  }

  async function load(): Promise<void> {
    show({ el: loadingView() });
    let data: ShopDeal | null;
    try {
      data = await backend.getShopDeal(shopCode);
    } catch {
      show({
        el: messageView({
          title: 'We could not load this offer',
          body: 'Check your connection and try again.',
          action: { label: 'Try again', run: () => void load() },
        }),
      });
      return;
    }
    if (!data) {
      show({ el: failureView('shop-not-found') });
      return;
    }
    if (!data.deal) {
      show({ el: failureView('no-live-deal', data.shop) });
      return;
    }
    showDeal(data.shop, data.deal);
  }

  function showDeal(shop: Shop, deal: Deal): void {
    show({
      el: dealView(shop, deal, async (button) => {
        setBusy(button, true);
        let signedIn = false;
        try {
          signedIn = await backend.isSignedIn();
        } catch {
          // Treat as signed out; verifying again is always safe.
        }
        if (signedIn) await unlock(shop, deal, null);
        else showVerify(shop, deal);
      }),
    });
  }

  function showVerify(shop: Shop, deal: Deal): void {
    show(
      verifyView(shop, backend, {
        onBack: () => showDeal(shop, deal),
        onVerified: (whatsappOptIn) => unlock(shop, deal, whatsappOptIn),
      }),
    );
  }

  async function unlock(shop: Shop, deal: Deal, whatsappOptIn: boolean | null): Promise<void> {
    try {
      const unlocked = await backend.redeem(shop.code, whatsappOptIn);
      show(unlockedView(shop, deal, unlocked, () => unlock(shop, deal, null)));
    } catch (err) {
      const reason: RedeemFailure = err instanceof RedeemFailed ? err.reason : 'unknown';
      if (reason === 'not-signed-in') showVerify(shop, deal);
      else show({ el: failureView(reason, shop, () => showDeal(shop, deal)) });
    }
  }

  void load();
}

function topbar(shop: Shop): HTMLElement {
  return h(
    'header',
    { class: 'topbar' },
    lockup(),
    shop.pincode ? h('a', { class: 'topbar-note', href: `/p/${shop.pincode}`, 'aria-label': `All offers in ${shop.pincode}` }, shop.pincode) : null,
  );
}

function dealView(shop: Shop, deal: Deal, onRedeem: (button: HTMLButtonElement) => void): HTMLElement {
  document.title = `${deal.headline} at ${shop.name} · Chowk`;
  const redeemButton = h('button', { class: 'button primary', type: 'button' }, 'Redeem now');
  redeemButton.addEventListener('click', () => onRedeem(redeemButton));

  const facts = h(
    'ul',
    { class: 'facts' },
    h('li', {}, icon('clock'), h('span', {}, `Valid till ${formatDay(deal.endsAt)}`)),
    deal.oneUsePerCustomer ? h('li', {}, icon('tag'), h('span', {}, 'One use per customer')) : null,
    shop.address ? h('li', {}, icon('pin'), h('span', {}, shop.address)) : null,
  );

  const terms =
    deal.terms.length > 0
      ? h('section', { class: 'terms' }, h('h2', {}, 'Terms'), h('ul', {}, ...deal.terms.map((term) => h('li', {}, term))))
      : null;

  return h(
    'div',
    { class: 'screen' },
    topbar(shop),
    h('div', { class: 'hero' }, deal.tag ? h('span', { class: 'pill' }, deal.tag) : null),
    h(
      'main',
      { class: 'content' },
      h(
        'div',
        { class: 'headline' },
        h('p', { class: 'eyebrow' }, [shop.name, shop.category].filter(Boolean).join(' · ')),
        h('h1', {}, deal.headline),
      ),
      facts,
      terms,
      h(
        'div',
        { class: 'actions' },
        redeemButton,
        h('p', { class: 'hint' }, 'First time here? You verify your mobile number once.'),
      ),
    ),
  );
}

function verifyView(
  shop: Shop,
  backend: Backend,
  handlers: { onBack: () => void; onVerified: (whatsappOptIn: boolean) => Promise<void> },
): View {
  const optIn = h('input', { type: 'checkbox' });
  const form = otpForm(backend, {
    submitLabel: 'Verify and unlock offer',
    beforeSubmit: h(
      'label',
      { class: 'check' },
      optIn,
      h('span', {}, `Send me new deals in ${shop.pincode || 'my area'} on WhatsApp`),
    ),
    onVerified: () => handlers.onVerified(optIn.checked),
  });

  const legal =
    config.termsUrl && config.privacyUrl
      ? h(
          'p',
          { class: 'hint' },
          'By continuing you agree to the ',
          h('a', { href: config.termsUrl }, 'terms'),
          ' and ',
          h('a', { href: config.privacyUrl }, 'privacy policy'),
          '.',
        )
      : null;

  const backButton = h('button', { class: 'icon-button', type: 'button', 'aria-label': 'Back to the offer' }, icon('back', 22));
  backButton.addEventListener('click', handlers.onBack);

  const el = h(
    'div',
    { class: 'screen' },
    h('header', { class: 'topbar compact' }, backButton, h('span', { class: 'topbar-note' }, 'Step 1 of 2')),
    h(
      'main',
      { class: 'content' },
      h(
        'div',
        { class: 'headline' },
        h('h1', {}, 'Verify your number'),
        h('p', { class: 'lead' }, 'Only needed the first time. It keeps each offer to one use per customer.'),
      ),
      form.el,
      legal,
    ),
  );

  return { el, dispose: form.dispose };
}

function unlockedView(shop: Shop, deal: Deal, unlocked: Unlocked, onRenew: () => Promise<void>): View {
  const countdown = h('span', {}, '');
  const timer = h('div', { class: 'timer', role: 'timer' }, icon('clock'), countdown);
  const renewButton = h('button', { class: 'button primary', type: 'button' }, 'Get a new code');
  renewButton.addEventListener('click', () => {
    setBusy(renewButton, true);
    void onRenew();
  });
  const expired = h(
    'div',
    { class: 'expired', hidden: true },
    h('p', { class: 'expired-note', role: 'status' }, 'This code has expired.'),
    renewButton,
  );
  const code = h('p', { class: 'code' }, formatCode(unlocked.code));

  let interval: ReturnType<typeof setInterval> | undefined;
  const tick = () => {
    const left = unlocked.expiresAt - Date.now();
    if (left <= 0) {
      clearInterval(interval);
      timer.hidden = true;
      expired.hidden = false;
      code.classList.add('is-expired');
      return;
    }
    countdown.textContent = `Expires in ${formatCountdown(left)}`;
  };
  tick();
  interval = setInterval(tick, 500);

  const next = h(
    'section',
    { class: 'card next' },
    h('h2', {}, 'More offers near you'),
    h('p', {}, `See what other shops in ${shop.pincode || 'your area'} are offering.`),
    config.appUrl ? h('a', { class: 'button primary', href: config.appUrl }, 'Get the app') : null,
    config.whatsappUrl ? h('a', { class: 'button secondary', href: config.whatsappUrl }, 'Follow on WhatsApp') : null,
    shop.pincode ? h('a', { class: 'button secondary', href: `/p/${shop.pincode}` }, `See all offers in ${shop.pincode}`) : null,
  );

  const el = h(
    'div',
    { class: 'screen' },
    h(
      'div',
      { class: 'banner' },
      h('div', { class: 'banner-check' }, icon('check', 30, 3)),
      h('h1', {}, 'Offer unlocked'),
      h('p', {}, 'Show this screen to the shopkeeper before billing'),
    ),
    h(
      'main',
      { class: 'content' },
      h(
        'section',
        { class: 'card ticket' },
        h('p', { class: 'eyebrow' }, shop.name),
        h('p', { class: 'ticket-offer' }, deal.headline),
        h('hr', {}),
        h('p', { class: 'code-label' }, 'Your code'),
        code,
        timer,
        expired,
      ),
      next,
    ),
  );

  return { el, dispose: () => clearInterval(interval) };
}

function failureView(reason: RedeemFailure, shop?: Shop, retry?: () => void): HTMLElement {
  switch (reason) {
    case 'shop-not-found':
      return messageView({
        title: 'We could not find this shop',
        body: 'Check the shop code printed on the counter and try again.',
        action: { label: 'Enter a shop code', href: '/code' },
      });
    case 'no-live-deal':
      return messageView({
        title: 'No offer running right now',
        body: shop ? `${shop.name} has no offer on Chowk at the moment. Check back soon.` : 'Check back soon.',
        action: shop?.pincode ? { label: `See other offers in ${shop.pincode}`, href: `/p/${shop.pincode}` } : undefined,
      });
    case 'deal-ended':
      return messageView({ title: 'This offer has ended', body: 'Ask at the counter about the next one.' });
    case 'sold-out':
      return messageView({
        title: 'This offer has been fully claimed',
        body: 'The shop set a limit on this offer and it has been reached.',
      });
    case 'already-used':
      return messageView({
        title: 'You have already used this offer',
        body: 'Each customer can use it once.',
      });
    default:
      return messageView({
        title: 'We could not unlock the offer',
        body: 'Check your connection and try again.',
        action: retry ? { label: 'Try again', run: retry } : undefined,
      });
  }
}
