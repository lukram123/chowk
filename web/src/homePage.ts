// The entry page for someone who has no link to follow: find offers by pincode,
// or type the shop code printed under a counter QR.
import { parsePincode } from './feed';
import { normalizeShopCode } from './format';
import { h, logoMark } from './ui';

function pincodeForm(): HTMLElement {
  const input = h('input', {
    id: 'pincode',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'postal-code',
    maxlength: 6,
    placeholder: '560102',
    'aria-describedby': 'pincode-error',
  });
  const error = h('p', { id: 'pincode-error', class: 'field-error', role: 'alert' });
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('label', { for: 'pincode' }, 'Your pincode'),
    input,
    error,
    h('button', { class: 'button accent', type: 'submit' }, 'Show offers'),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const pincode = parsePincode(input.value);
    if (!pincode) {
      error.textContent = 'Enter your 6-digit pincode.';
      input.focus();
      return;
    }
    window.location.assign(`/p/${pincode}`);
  });
  return form;
}

function shopCodeForm(): HTMLElement {
  const input = h('input', {
    id: 'shop-code',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'characters',
    placeholder: 'MS 2041',
    'aria-describedby': 'shop-code-error',
  });
  const error = h('p', { id: 'shop-code-error', class: 'field-error', role: 'alert' });
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('label', { for: 'shop-code' }, 'Shop code'),
    input,
    error,
    h('button', { class: 'button secondary', type: 'submit' }, 'Show offer'),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const code = normalizeShopCode(input.value);
    if (!code) {
      error.textContent = 'Type the shop code printed under the QR.';
      input.focus();
      return;
    }
    window.location.assign(`/s/${encodeURIComponent(code)}`);
  });
  return form;
}

export function mountHomePage(root: HTMLElement): void {
  document.title = 'Chowk · Offers from the shops on your street';
  root.replaceChildren(
    h(
      'div',
      { class: 'screen home' },
      h(
        'div',
        { class: 'home-brand' },
        logoMark(72, '#FFC633', '#0F4C43'),
        h('p', { class: 'wordmark' }, 'Chowk'),
        h('h1', {}, 'Offers from the shops on your street'),
      ),
      h('div', { class: 'card home-card' }, h('p', {}, 'See what shops near you are offering this week.'), pincodeForm()),
      h(
        'div',
        { class: 'card' },
        h('p', {}, 'At a shop with a Chowk QR? Scan it, or type the shop code printed under it.'),
        shopCodeForm(),
      ),
      h('a', { class: 'home-shop-link', href: '/shop' }, 'Own a shop? Open Chowk for shops'),
    ),
  );
}
