// One Firebase app shared by the customer page and the shop app: sign-in by
// mobile number and calls to Cloud Functions. Auth and Functions are loaded on
// first use, so a page that only shows a deal does not pay for them.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import type { FirebaseConfig } from '../config';
import { OtpFailed, type AuthBackend, type OtpFailure } from './types';

export interface FirebaseHandle extends AuthBackend {
  readonly app: FirebaseApp;
  /** Calls a Cloud Function. Errors are thrown as the SDK raises them; see `callFailure`. */
  call<Req, Res>(name: string, data: Req): Promise<Res>;
}

function otpFailure(err: unknown): OtpFailure {
  const code = (err as { code?: string } | null)?.code ?? '';
  if (code === 'auth/invalid-phone-number') return 'invalid-number';
  if (code === 'auth/invalid-verification-code' || code === 'auth/code-expired') return 'wrong-code';
  if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') return 'too-many';
  return 'unknown';
}

/** What a failed function call said: `reason` and `field` come from the function's error details. */
export function callFailure(err: unknown): { unauthenticated: boolean; reason: string | null; field: string | null } {
  const e = err as { code?: string; details?: { reason?: unknown; field?: unknown } } | null;
  return {
    unauthenticated: e?.code === 'functions/unauthenticated',
    reason: typeof e?.details?.reason === 'string' ? e.details.reason : null,
    field: typeof e?.details?.field === 'string' ? e.details.field : null,
  };
}

let handle: FirebaseHandle | null = null;

export function firebaseHandle(firebaseConfig: FirebaseConfig, functionsRegion: string): FirebaseHandle {
  if (handle) return handle;
  const app = initializeApp(firebaseConfig);

  const loadAuth = async () => {
    const authModule = await import('firebase/auth');
    const auth = authModule.getAuth(app);
    await auth.authStateReady();
    return { authModule, auth };
  };
  let recaptcha: { clear(): void } | null = null;

  handle = {
    isDemo: false,
    app,

    async isSignedIn() {
      const { auth } = await loadAuth();
      return auth.currentUser !== null;
    },

    async sendOtp(mobile, recaptchaContainerId) {
      const { authModule, auth } = await loadAuth();
      try {
        recaptcha?.clear();
        const verifier = new authModule.RecaptchaVerifier(auth, recaptchaContainerId, { size: 'invisible' });
        recaptcha = verifier;
        const confirmation = await authModule.signInWithPhoneNumber(auth, `+91${mobile}`, verifier);
        return {
          async confirm(code) {
            try {
              await confirmation.confirm(code);
            } catch (err) {
              throw new OtpFailed(otpFailure(err));
            }
          },
        };
      } catch (err) {
        throw new OtpFailed(otpFailure(err));
      }
    },

    async signOut() {
      const { authModule, auth } = await loadAuth();
      await authModule.signOut(auth);
    },

    async call<Req, Res>(name: string, data: Req): Promise<Res> {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const fn = httpsCallable<Req, Res>(getFunctions(app, functionsRegion), name);
      return (await fn(data)).data;
    },
  };
  return handle;
}
