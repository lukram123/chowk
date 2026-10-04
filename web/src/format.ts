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
