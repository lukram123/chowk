/** Shop codes are printed on the standee as "MS 2041"; store and compare them as "MS2041". */
export function normalizeShopCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Returns the 10-digit Indian mobile number, or null if the input is not one. */
export function parseIndianMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** "09:42" for the time left; never negative. */
export function formatCountdown(msLeft: number): string {
  const seconds = Math.max(0, Math.ceil(msLeft / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

const dayFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/** "12 Oct", in India time whatever the phone's time zone. */
export function formatDay(ms: number): string {
  return dayFormat.format(ms);
}

/** "CH 4827": the form the customer reads out and the shop types in. */
export function formatCode(code: string): string {
  return `CH ${code}`;
}

const DAY = 24 * 60 * 60 * 1000;
const INDIA_OFFSET = 5.5 * 60 * 60 * 1000;

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
});

/** "7:42 pm", in India time. */
export function formatTime(ms: number): string {
  return timeFormat.format(ms).toLowerCase();
}

/** "2026-10-12" for a date input, in India time. */
export function toIndiaDateInput(ms: number): string {
  return new Date(ms + INDIA_OFFSET).toISOString().slice(0, 10);
}

/** The start (or last millisecond) of a "YYYY-MM-DD" day in India; null if the text is not a date. */
export function fromIndiaDateInput(value: string, endOfDay: boolean): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = Date.UTC(year, month - 1, day);
  if (new Date(utc).getUTCDate() !== day) return null; // e.g. 31 February
  return utc - INDIA_OFFSET + (endOfDay ? DAY - 1 : 0);
}

/** Whole days until `endsAt`, counting a part day as one. 0 or less once it has passed. */
export function daysLeft(endsAt: number, now: number): number {
  return Math.ceil((endsAt - now) / DAY) || 0; // "|| 0" turns -0 into 0
}

const rupeeFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** "₹1,25,000", with Indian digit grouping. */
export function formatRupees(amount: number): string {
  return `₹${rupeeFormat.format(amount)}`;
}
