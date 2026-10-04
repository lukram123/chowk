// Shown at "/": for someone who typed the address instead of scanning a shop's QR.
import { normalizeShopCode } from './format';
import { h, logoMark } from './ui';

export function mountHomePage(root: HTMLElement): void {
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
    h('button', { class: 'button accent', type: 'submit' }, 'Show offer'),
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

  root.replaceChildren(
    h(
      'div',
      { class: 'screen home' },
      h(
        'div',
        { class: 'home-brand' },
        logoMark(72, '#FFC633', '#0F4C43'),
        h('p', { class: 'wordmark' }, 'Chowk'),
        h('h1', {}, 'Scan the Chowk QR at the shop counter to get its offer'),
      ),
      h('div', { class: 'card home-card' }, h('p', {}, 'No camera handy? Type the shop code printed under the QR.'), form),
    ),
  );
}
