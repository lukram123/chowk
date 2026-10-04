// Before the dashboard: signing in, and listing the shop the first time.
import { otpForm } from '../otpForm';
import { h, lockup, setBusy } from '../ui';
import { failureMessage, type View } from './shell';
import { CATEGORIES, ShopFailed, type ShopBackend } from './types';

function head(): HTMLElement {
  return h('header', { class: 'topbar' }, lockup(), h('span', { class: 'pill small' }, 'For shops'));
}

export function signInView(backend: ShopBackend, onSignedIn: () => Promise<void>): View {
  const form = otpForm(backend, { submitLabel: 'Verify and continue', onVerified: onSignedIn });
  return {
    el: h(
      'div',
      { class: 'screen' },
      head(),
      h(
        'main',
        { class: 'content' },
        h(
          'div',
          { class: 'headline' },
          h('h1', {}, 'Sign in to your shop'),
          h('p', { class: 'lead' }, 'Use the shop owner\'s mobile number. New here? You can list your shop after this step.'),
        ),
        form.el,
      ),
    ),
    dispose: form.dispose,
  };
}

const FIELD_MESSAGES: Record<string, string> = {
  name: 'Enter the shop name, 2 to 60 characters.',
  category: 'Choose a category.',
  pincode: 'Enter the 6-digit pincode.',
  address: 'Enter the shop address, so customers can find you.',
};

export function registerView(
  backend: ShopBackend,
  handlers: { onListed: () => Promise<void>; onSignOut: () => void },
): View {
  const name = h('input', { id: 'shop-name', type: 'text', autocomplete: 'organization', maxlength: 60 });
  const category = h(
    'select',
    { id: 'shop-category' },
    h('option', { value: '' }, 'Choose one'),
    ...CATEGORIES.map((c) => h('option', { value: c }, c)),
  );
  const pincode = h('input', { id: 'shop-pincode', type: 'text', inputmode: 'numeric', maxlength: 6, autocomplete: 'postal-code' });
  const address = h('input', { id: 'shop-address', type: 'text', autocomplete: 'street-address', maxlength: 160 });
  const error = h('p', { class: 'field-error', role: 'alert' });
  const submit = h('button', { class: 'button primary', type: 'submit' }, 'List my shop');
  const fields: Record<string, HTMLElement> = { name, category, pincode, address };

  function fail(field: string): void {
    error.textContent = FIELD_MESSAGES[field] ?? 'Check the details and try again.';
    fields[field]?.focus();
  }

  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('label', { for: 'shop-name' }, 'Shop name'),
    name,
    h('label', { for: 'shop-category' }, 'Category'),
    category,
    h('label', { for: 'shop-pincode' }, 'Pincode'),
    pincode,
    h('label', { for: 'shop-address' }, 'Shop address'),
    address,
    error,
    submit,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      error.textContent = '';
      const input = {
        name: name.value.trim(),
        category: category.value,
        pincode: pincode.value.trim(),
        address: address.value.trim(),
      };
      if (input.name.length < 2) return fail('name');
      if (!input.category) return fail('category');
      if (!/^[1-9]\d{5}$/.test(input.pincode)) return fail('pincode');
      if (input.address.length < 5) return fail('address');

      setBusy(submit, true, 'Listing…');
      try {
        await backend.registerShop(input);
      } catch (err) {
        setBusy(submit, false);
        if (err instanceof ShopFailed && err.reason === 'invalid-input' && err.field) fail(err.field);
        else if (err instanceof ShopFailed && err.reason === 'already-registered') await handlers.onListed();
        else error.textContent = failureMessage(err);
        return;
      }
      await handlers.onListed();
    })();
  });

  const signOut = h('button', { class: 'link-button center', type: 'button' }, 'Not your number? Sign out');
  signOut.addEventListener('click', handlers.onSignOut);

  return {
    el: h(
      'div',
      { class: 'screen' },
      head(),
      h(
        'main',
        { class: 'content' },
        h(
          'div',
          { class: 'headline' },
          h('h1', {}, 'List your shop'),
          h('p', { class: 'lead' }, 'This is what customers see with your offer.'),
        ),
        form,
        signOut,
      ),
    ),
  };
}
