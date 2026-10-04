// State for demo mode, kept in the browser's localStorage so the customer page
// and the shop app see the same data: unlock a code as a customer, then check it
// as the shop owner. Nothing here touches a server.
import { DEMO_OTP, DEMO_OWNER_MOBILE } from './demo-info';
import { OtpFailed, type AuthBackend, type OtpChallenge, type Shop } from './types';

export interface DemoShop extends Shop {
  ownerUid: string;
}

export interface DemoDeal {
  id: string;
  shopCode: string;
  headline: string;
  tag: string;
  terms: string[];
  status: 'live' | 'paused' | 'ended';
  startsAt: number;
  endsAt: number;
  oneUsePerCustomer: boolean;
  maxRedemptions: number | null;
  unlockedCount: number;
  usedCount: number;
  firstVisitCount: number;
  billTotal: number;
  createdAt: number;
}

export interface DemoRedemption {
  id: string;
  dealId: string;
  shopCode: string;
  uid: string;
  code: string;
  createdAt: number;
  expiresAt: number;
  status: 'unlocked' | 'used';
  firstVisit: boolean;
  usedAt: number | null;
  billAmount: number | null;
}

export interface DemoState {
  uid: string | null;
  shops: DemoShop[];
  deals: DemoDeal[];
  redemptions: DemoRedemption[];
}

const KEY = 'chowk-demo-v1';
const DAY = 24 * 60 * 60 * 1000;

export function demoUid(mobile: string): string {
  return `u${mobile}`;
}

function seed(now: number): DemoState {
  const deal = (id: string, shopCode: string, headline: string, tag: string, terms: string[], days: number): DemoDeal => ({
    id,
    shopCode,
    headline,
    tag,
    terms,
    status: 'live',
    startsAt: now - DAY,
    endsAt: now + days * DAY,
    oneUsePerCustomer: true,
    maxRedemptions: null,
    unlockedCount: 0,
    usedCount: 0,
    firstVisitCount: 0,
    billTotal: 0,
    createdAt: now - DAY,
  });
  return {
    uid: null,
    shops: [
      { code: 'MS2041', name: 'Meera Salon', category: 'Salon', pincode: '560102', address: '', ownerUid: demoUid(DEMO_OWNER_MOBILE) },
      { code: 'AB1007', name: 'Anand Bakery', category: 'Food', pincode: '560102', address: '', ownerUid: 'demo-owner-2' },
      { code: 'FB3300', name: 'Fresh Basket', category: 'Grocery', pincode: '560102', address: '', ownerUid: 'demo-owner-3' },
    ],
    deals: [
      deal('demo-ms2041', 'MS2041', 'Flat 30% off haircut and styling', '30% off', [
        'Weekdays, 11 am to 7 pm',
        'Not valid with other offers',
        'Show the unlocked code before billing',
      ], 9),
      deal('demo-ab1007', 'AB1007', 'Buy 1 kg cake, get 6 cupcakes free', 'Free cupcakes', [
        'One offer per bill',
        'Show the unlocked code before billing',
      ], 1),
    ],
    redemptions: [],
  };
}

let memory: DemoState | null = null;

/** Reads the current state. Falls back to memory when storage is unavailable (private windows). */
export function loadDemo(): DemoState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DemoState;
  } catch {
    // fall through to memory
  }
  if (!memory) memory = seed(Date.now());
  return memory;
}

export function saveDemo(state: DemoState): void {
  memory = state;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // memory copy is enough
  }
}

/** Runs `change` on the state and saves it. */
export function updateDemo<T>(change: (state: DemoState) => T): T {
  const state = loadDemo();
  const result = change(state);
  saveDemo(state);
  return result;
}

export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A random 4-digit code not held by an unexpired, unused redemption at the shop. */
export function freeCode(state: DemoState, shopCode: string, now: number): string {
  for (;;) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const taken = state.redemptions.some(
      (r) => r.shopCode === shopCode && r.code === code && r.status === 'unlocked' && r.expiresAt > now,
    );
    if (!taken) return code;
  }
}

/** Demo sign-in: any valid mobile number, with the fixed verification code. */
export const demoAuth: AuthBackend = {
  isDemo: true,

  async isSignedIn() {
    return loadDemo().uid !== null;
  },

  async sendOtp(mobile): Promise<OtpChallenge> {
    await pause(300);
    return {
      async confirm(code) {
        await pause(300);
        if (code !== DEMO_OTP) throw new OtpFailed('wrong-code');
        updateDemo((state) => {
          state.uid = demoUid(mobile);
        });
      },
    };
  },

  async signOut() {
    updateDemo((state) => {
      state.uid = null;
    });
  },
};
