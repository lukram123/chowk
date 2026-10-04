const env = import.meta.env;

function value(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

function firebaseConfig(): FirebaseConfig | null {
  const apiKey = value(env.VITE_FIREBASE_API_KEY);
  const authDomain = value(env.VITE_FIREBASE_AUTH_DOMAIN);
  const projectId = value(env.VITE_FIREBASE_PROJECT_ID);
  const appId = value(env.VITE_FIREBASE_APP_ID);
  return apiKey && authDomain && projectId && appId ? { apiKey, authDomain, projectId, appId } : null;
}

const firebase = firebaseConfig();

// Demo data must never be served by accident: outside `npm run dev` it has to be asked for.
const wantsDemo = value(env.VITE_BACKEND) === 'demo' || (!firebase && env.DEV === true);

export const config = {
  backend: wantsDemo ? ('demo' as const) : firebase ? ('firebase' as const) : ('unconfigured' as const),
  firebase,
  functionsRegion: value(env.VITE_FUNCTIONS_REGION) ?? 'asia-south1',
  /** Address customers reach the site at; used in QR codes and share text. Defaults to the current address. */
  siteUrl: value(env.VITE_SITE_URL)?.replace(/\/+$/, '') ?? null,
  appUrl: value(env.VITE_APP_URL),
  whatsappUrl: value(env.VITE_WHATSAPP_CHANNEL_URL),
  termsUrl: value(env.VITE_TERMS_URL),
  privacyUrl: value(env.VITE_PRIVACY_URL),
};
