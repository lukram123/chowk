// Mobile number + one-time code form, used by the customer page and the shop app.
import { OtpFailed, type AuthBackend, type OtpChallenge, type OtpFailure } from './backend/types';
import { parseIndianMobile } from './format';
import { h, setBusy } from './ui';

const RESEND_WAIT_SECONDS = 30;
const RECAPTCHA_CONTAINER_ID = 'recaptcha-container';

const OTP_MESSAGES: Record<OtpFailure, string> = {
  'invalid-number': 'That does not look like a valid mobile number.',
  'wrong-code': 'That code does not match. Check the message and try again.',
  'too-many': 'Too many attempts. Wait a few minutes and try again.',
  unknown: 'Something went wrong. Check your connection and try again.',
};

function otpMessage(err: unknown): string {
  return OTP_MESSAGES[err instanceof OtpFailed ? err.reason : 'unknown'];
}

export interface OtpFormOptions {
  /** Label of the final button, e.g. "Verify and unlock offer". */
  submitLabel: string;
  /** Shown between the code field and the final button, e.g. an opt-in checkbox. */
  beforeSubmit?: HTMLElement | null;
  /** Runs once the person is signed in. The final button stays busy until it settles. */
  onVerified: () => Promise<void>;
}

export function otpForm(auth: Pick<AuthBackend, 'sendOtp'>, options: OtpFormOptions): { el: HTMLElement; dispose: () => void } {
  let challenge: OtpChallenge | null = null;
  let resendTimer: ReturnType<typeof setInterval> | undefined;

  const mobileInput = h('input', {
    id: 'verify-mobile',
    type: 'tel',
    inputmode: 'numeric',
    autocomplete: 'tel-national',
    placeholder: '10-digit number',
    'aria-describedby': 'verify-mobile-error',
  });
  const mobileError = h('p', { id: 'verify-mobile-error', class: 'field-error', role: 'alert' });
  const sendButton = h('button', { class: 'button primary', type: 'submit' }, 'Send code');
  const changeButton = h('button', { class: 'link-button', type: 'button', hidden: true }, 'Change number');

  const codeInput = h('input', {
    id: 'verify-code',
    class: 'code-input',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'one-time-code',
    maxlength: 6,
    placeholder: '••••••',
    'aria-describedby': 'verify-code-error',
  });
  const codeLabel = h('label', { for: 'verify-code' }, 'Enter the 6-digit code');
  const codeError = h('p', { id: 'verify-code-error', class: 'field-error', role: 'alert' });
  const resendButton = h('button', { class: 'link-button', type: 'button' }, 'Resend code');
  const verifyButton = h('button', { class: 'button primary', type: 'submit' }, options.submitLabel);

  function startResendWait(): void {
    clearInterval(resendTimer);
    let left = RESEND_WAIT_SECONDS;
    const tick = () => {
      if (left <= 0) {
        clearInterval(resendTimer);
        resendButton.disabled = false;
        resendButton.textContent = 'Resend code';
        return;
      }
      resendButton.disabled = true;
      resendButton.textContent = `Resend code in 0:${String(left).padStart(2, '0')}`;
      left -= 1;
    };
    tick();
    resendTimer = setInterval(tick, 1000);
  }

  async function sendCode(button: HTMLButtonElement): Promise<void> {
    mobileError.textContent = '';
    codeError.textContent = '';
    const mobile = parseIndianMobile(mobileInput.value);
    if (!mobile) {
      mobileError.textContent = 'Enter your 10-digit mobile number.';
      mobileInput.focus();
      return;
    }
    setBusy(button, true, 'Sending…');
    try {
      challenge = await auth.sendOtp(mobile, RECAPTCHA_CONTAINER_ID);
    } catch (err) {
      setBusy(button, false);
      (codeForm.hidden ? mobileError : codeError).textContent = otpMessage(err);
      return;
    }
    setBusy(button, false);
    mobileInput.readOnly = true;
    sendButton.hidden = true;
    changeButton.hidden = false;
    codeLabel.textContent = `Enter the 6-digit code sent to +91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
    codeForm.hidden = false;
    codeInput.value = '';
    codeInput.focus();
    startResendWait();
  }

  const mobileForm = h(
    'form',
    { class: 'form', novalidate: true },
    h('label', { for: 'verify-mobile' }, 'Mobile number'),
    h('div', { class: 'input-row' }, h('span', { class: 'prefix', 'aria-hidden': 'true' }, '+91'), mobileInput),
    mobileError,
    sendButton,
    changeButton,
  );
  mobileForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void sendCode(sendButton);
  });

  const codeForm = h(
    'form',
    { class: 'form', novalidate: true, hidden: true },
    codeLabel,
    codeInput,
    codeError,
    resendButton,
    options.beforeSubmit ?? null,
    verifyButton,
  );
  codeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      codeError.textContent = '';
      const code = codeInput.value.replace(/\D/g, '');
      if (code.length !== 6 || !challenge) {
        codeError.textContent = 'Enter the 6-digit code from the message.';
        codeInput.focus();
        return;
      }
      setBusy(verifyButton, true, 'Checking…');
      try {
        await challenge.confirm(code);
      } catch (err) {
        setBusy(verifyButton, false);
        codeError.textContent = otpMessage(err);
        codeInput.focus();
        return;
      }
      await options.onVerified();
    })();
  });

  resendButton.addEventListener('click', () => void sendCode(resendButton));
  changeButton.addEventListener('click', () => {
    clearInterval(resendTimer);
    challenge = null;
    mobileInput.readOnly = false;
    sendButton.hidden = false;
    changeButton.hidden = true;
    codeForm.hidden = true;
    codeError.textContent = '';
    mobileInput.focus();
  });

  return {
    el: h('div', { class: 'otp' }, mobileForm, codeForm, h('div', { id: RECAPTCHA_CONTAINER_ID })),
    dispose: () => clearInterval(resendTimer),
  };
}
