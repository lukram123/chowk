// Check a customer's code at the counter, then mark it used.
import { formatCode, formatCountdown } from '../format';
import { h, icon, setBusy } from '../ui';
import { failureMessage, shell, type ShopContext, type View } from './shell';
import { ShopFailed, type CodeCheck } from './types';

function codeMessage(err: unknown): string {
  const reason = err instanceof ShopFailed ? err.reason : 'unknown';
  switch (reason) {
    case 'code-not-found':
      return 'No such code at your shop. Check the four digits with the customer.';
    case 'code-expired':
      return 'This code has expired. Ask the customer to get a new code on their phone.';
    case 'code-used':
      return 'This code has already been used.';
    case 'invalid-input':
      return 'Enter the bill amount in rupees, or leave it empty.';
    default:
      return failureMessage(err);
  }
}

export function checkView(ctx: ShopContext): View {
  let timer: ReturnType<typeof setInterval> | undefined;

  const codeInput = h('input', {
    id: 'check-code',
    class: 'code-input',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    maxlength: 4,
    placeholder: '••••',
    'aria-describedby': 'check-error',
  });
  const error = h('p', { id: 'check-error', class: 'field-error', role: 'alert' });
  const checkButton = h('button', { class: 'button primary', type: 'submit' }, 'Check code');
  const result = h('div', { class: 'block' });

  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('label', { for: 'check-code' }, 'Type the code on the customer\'s screen'),
    h('div', { class: 'input-row' }, h('span', { class: 'prefix big', 'aria-hidden': 'true' }, 'CH'), codeInput),
    error,
    checkButton,
  );

  function reset(): void {
    clearInterval(timer);
    result.replaceChildren();
    form.hidden = false;
    codeInput.value = '';
    error.textContent = '';
    codeInput.focus();
  }

  function showUsed(check: CodeCheck): void {
    clearInterval(timer);
    const again = h('button', { class: 'button primary', type: 'button' }, 'Check another code');
    again.addEventListener('click', reset);
    result.replaceChildren(
      h(
        'section',
        { class: 'card valid', role: 'status' },
        h('div', { class: 'valid-head' }, h('span', { class: 'valid-badge' }, icon('check', 24, 3)), h('h2', {}, 'Marked as used')),
        h('p', { class: 'muted' }, `${formatCode(check.code)} · ${check.headline}`),
      ),
      again,
    );
  }

  function showValid(check: CodeCheck): void {
    form.hidden = true;
    const countdown = h('span', { class: 'strong' }, '');
    const bill = h('input', { id: 'check-bill', type: 'text', inputmode: 'numeric', placeholder: 'Amount' });
    const usedError = h('p', { class: 'field-error', role: 'alert' });
    const useButton = h('button', { class: 'button primary', type: 'submit' }, 'Mark as used');
    const cancel = h('button', { class: 'link-button center', type: 'button' }, 'Check a different code');
    cancel.addEventListener('click', reset);

    const tick = () => {
      const left = check.expiresAt - Date.now();
      countdown.textContent = left > 0 ? formatCountdown(left) : 'Expired';
      if (left <= 0) clearInterval(timer);
    };
    tick();
    timer = setInterval(tick, 500);

    const useForm = h(
      'form',
      { class: 'form', novalidate: true },
      h('label', { for: 'check-bill' }, 'Bill amount (optional)'),
      h('div', { class: 'input-row' }, h('span', { class: 'prefix', 'aria-hidden': 'true' }, '₹'), bill),
      h('p', { class: 'help' }, 'Only you see this. It shows what the offer brought in.'),
      usedError,
      useButton,
    );
    useForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void (async () => {
        usedError.textContent = '';
        const billText = bill.value.replace(/[,\s₹]/g, '');
        const amount = billText === '' ? null : Number(billText);
        if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
          usedError.textContent = codeMessage(new ShopFailed('invalid-input', 'billAmount'));
          bill.focus();
          return;
        }
        setBusy(useButton, true, 'Saving…');
        try {
          await ctx.backend.markCodeUsed(check.code, amount);
        } catch (err) {
          setBusy(useButton, false);
          usedError.textContent = codeMessage(err);
          return;
        }
        showUsed(check);
      })();
    });

    result.replaceChildren(
      h(
        'section',
        { class: 'card valid' },
        h('div', { class: 'valid-head' }, h('span', { class: 'valid-badge' }, icon('check', 24, 3)), h('h2', {}, 'Valid code')),
        h('p', { class: 'ticket-offer' }, check.headline),
        h('hr', {}),
        h('div', { class: 'card-row' }, h('span', { class: 'muted' }, 'Code'), h('span', { class: 'strong' }, formatCode(check.code))),
        h(
          'div',
          { class: 'card-row' },
          h('span', { class: 'muted' }, 'Customer'),
          h('span', { class: 'strong' }, check.firstVisit ? 'First visit' : 'Returning'),
        ),
        h('div', { class: 'card-row' }, h('span', { class: 'muted' }, 'Code expires in'), countdown),
      ),
      useForm,
      cancel,
    );
    bill.focus();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      error.textContent = '';
      const code = codeInput.value.replace(/\D/g, '');
      if (code.length !== 4) {
        error.textContent = 'Enter the four digits after CH.';
        codeInput.focus();
        return;
      }
      setBusy(checkButton, true, 'Checking…');
      try {
        const check = await ctx.backend.checkCode(code);
        setBusy(checkButton, false);
        showValid(check);
      } catch (err) {
        setBusy(checkButton, false);
        error.textContent = codeMessage(err);
        codeInput.focus();
      }
    })();
  });

  return {
    el: shell('check', 'Check a code', ctx.dashboard.shop.name, form, result),
    dispose: () => clearInterval(timer),
  };
}
