// The rules behind each kind of contract, with their sources. Opened October 29, 2026.
import { addDays, addMonths, diffDays, toDays, fromDays, ymd, lastOfMonth, make, weekday } from "./dates.js";

export const SOURCES = {
  rta: { name: "Residential Tenancies Act, 2006, s. 44 (period of notice)", url: "https://www.ontario.ca/laws/statute/06r17" },
  ltb: { name: "Landlord and Tenant Board: how a tenant can end their tenancy", url: "https://tribunalsontario.ca/documents/ltb/Brochures/How%20a%20Tenant%20Can%20End%20Their%20Tenancy.html" },
  n9: { name: "Form N9: Tenant's Notice to End the Tenancy", url: "https://tribunalsontario.ca/ltb/forms-filing-and-fees/" },
  wireless: { name: "CRTC: the Wireless Code, simplified", url: "https://crtc.gc.ca/eng/phone/mobile/codesimpl.htm" },
  internet: { name: "CRTC: the Internet Code, simplified", url: "https://crtc.gc.ca/eng/internet/codesimpl.htm" },
  gym: { name: "Ontario: joining a gym or fitness club", url: "https://www.ontario.ca/page/joining-gym-or-fitness-club" },
  ccts: { name: "CCTS: complaints about phone, internet and TV", url: "https://www.ccts-cprst.ca/" },
};

// ---------- Ontario residential tenancies ----------
// A rental period ends the day before rent is next due. Rent on the 1st means the
// period ends on the last day of the month.
export function periodEndOnOrAfter(date, rentDay) {
  const [y, m, d] = ymd(date);
  if (rentDay === 1) return lastOfMonth(y, m);
  // Period ends on rentDay - 1, clamped to short months.
  const endThis = make(y, m, rentDay - 1);
  return toDays(endThis) >= toDays(date) ? endThis : make(y, m + 1, rentDay - 1);
}
export function weekEndOnOrAfter(date, rentWeekday) {
  const endWd = (rentWeekday + 6) % 7; // the day before rent day
  const add = (endWd - weekday(date) + 7) % 7;
  return addDays(date, add);
}
const isEndOfFeb = (iso) => { const [y, m] = ymd(iso); return m === 2 && iso === lastOfMonth(y, 2); };
const isEndOfMar = (iso) => { const [y, m] = ymd(iso); return m === 3 && iso === lastOfMonth(y, 3); };

// The last day a tenant can give notice for a given termination date.
export function lastNoticeDay(termination, t) {
  if (t.kind === "weekly") return addDays(termination, -28);
  let last = addDays(termination, -60);
  const [y] = ymd(termination);
  // RTA s. 44 (5): end of February needs notice by January 1, end of March by February 1.
  if (isEndOfFeb(termination) && toDays(`${y}-01-01`) > toDays(last)) last = `${y}-01-01`;
  if (isEndOfMar(termination) && toDays(`${y}-02-01`) > toDays(last)) last = `${y}-02-01`;
  return last;
}

// The earliest termination date a tenant can put on a notice given on `noticeDate`.
// t = { kind: "fixed" | "monthly" | "weekly", leaseEnd?, rentDay?, rentWeekday? }
export function earliestTermination(noticeDate, t) {
  if (t.kind === "weekly") {
    let d = weekEndOnOrAfter(addDays(noticeDate, 28), t.rentWeekday ?? 1);
    if (t.leaseEnd && toDays(d) < toDays(t.leaseEnd)) d = t.leaseEnd;
    return d;
  }
  const rentDay = t.rentDay || 1;
  const floor = t.kind === "fixed" && t.leaseEnd ? t.leaseEnd : null;
  // Walk the period ends from the floor (or the notice date) and take the first that the notice covers.
  let d = periodEndOnOrAfter(floor && toDays(floor) > toDays(noticeDate) ? floor : noticeDate, rentDay);
  for (let i = 0; i < 40; i++) {
    if ((!floor || toDays(d) >= toDays(floor)) && toDays(noticeDate) <= toDays(lastNoticeDay(d, t))) return d;
    d = periodEndOnOrAfter(addDays(d, 1), rentDay);
  }
  return null;
}

// ---------- Phone and internet (CRTC codes) ----------
// Months elapsed, counting a partly elapsed month as complete (Wireless Code G.1.2).
export function monthsElapsed(start, on) {
  if (toDays(on) <= toDays(start)) return 0;
  let n = 0;
  while (toDays(addMonths(start, n)) < toDays(on)) n++;
  return n;
}
// Early cancellation fee on a date. subsidy: device subsidy (or the contract's fee for
// fixed internet without a device). Reduced equally to $0 over min(24, term) months.
export function earlyCancellationFee({ start, termMonths, subsidy }, on) {
  if (!subsidy) return 0;
  const n = Math.min(24, termMonths || 24);
  const left = Math.max(0, n - monthsElapsed(start, on));
  return Math.round((subsidy * left / n) * 100) / 100;
}
export const feeFreeDate = ({ start, termMonths }) => addMonths(start, Math.min(24, termMonths || 24));
export const trialEnd = (serviceStart, disability = false) => addDays(serviceStart, disability ? 30 : 15);

// ---------- Ontario gyms (personal development services) ----------
export const gymCoolingOffEnd = (copyReceived) => addDays(copyReceived, 10);
export const gymRenewalWindow = (end) => ({ from: addDays(end, -90), to: addDays(end, -30) });
export const gymTooLong = (start, end) => toDays(end) > toDays(addDays(addMonths(start, 12), -1)) + 1;

export { toDays, fromDays, diffDays, addDays, addMonths };
