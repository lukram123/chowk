// Types for the Vite environment, declared here so the project type-checks without vite/client.

interface ImportMetaEnv {
  readonly DEV?: boolean;
  readonly VITE_BACKEND?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FUNCTIONS_REGION?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_DEFAULT_PINCODE?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_WHATSAPP_CHANNEL_URL?: string;
  readonly VITE_TERMS_URL?: string;
  readonly VITE_PRIVACY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.css';
