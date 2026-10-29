import { addMonths, lastOfMonth, ymd } from "./dates.js";
// A made up Toronto household, for trying the app. Every name, number and address is invented.
export const SAMPLE_TODAY = "2026-10-29";
export const SAMPLE = [
  { id: "s-lease", type: "lease", name: "Apartment lease", kind: "fixed", leaseEnd: "2027-01-31", rentDay: 1, moveOut: "", address: "1200 Sample Street, Unit 4, Toronto", tenant: "Sam Rivera", note: "Moving in with a friend in February if the new place works out." },
  { id: "s-phone", type: "phone", name: "Phone plan", start: "2025-03-14", termMonths: 24, subsidy: 840, monthly: 55, promoEnd: "2026-11-20", promoPrice: 55, regularPrice: 80, account: "account 000 123 456", holder: "Sam Rivera" },
  { id: "s-internet", type: "internet", name: "Home internet", start: "2026-01-02", termMonths: 0, subsidy: 0, promoEnd: "2027-01-02", promoPrice: 45, regularPrice: 95, holder: "Sam Rivera" },
  { id: "s-gym", type: "gym", name: "Gym membership", start: "2026-10-24", copyReceived: "2026-10-24", end: "2027-10-23", prepaid: 600, member: "Sam Rivera" },
  { id: "s-alarm", type: "other", name: "Home alarm monitoring", end: "2027-03-31", noticeDays: 60, autoRenew: true, renewMonths: 12, price: 420, holder: "Sam Rivera" },
];
// The same kind of wording the reader is built for, for the paste demo.
export const SAMPLE_TEXT = {
  gym: "FITLIFE STUDIO MEMBERSHIP AGREEMENT\nThis agreement is dated October 24, 2026. The membership starts October 24, 2026 and ends October 23, 2027. Membership fee of $50/month, paid in advance for 12 months ($600).\nThis contract will automatically renew for successive 12 month periods unless the member gives 30 days' written notice before the end of the term.",
  lease: "RESIDENTIAL TENANCY AGREEMENT (STANDARD FORM OF LEASE)\nThe tenancy is for a fixed term beginning on February 1, 2026 and ending on January 31, 2027. Rent of $2,150 is due on the first day of each month. After the fixed term, the tenancy continues on a month to month basis.",
  phone: "Wireless Service Agreement\nActivation date: March 14, 2025. This is a 24-month term agreement. Device subsidy: $840.00. Rate plan $55/month for 20 months, then $80/month. Early cancellation fee: $840 reduced by $35 each month.",
  other: "Monitoring Services Agreement\nThe initial term ends on March 31, 2027 and renews automatically for successive one year periods unless you give at least sixty (60) days' written notice. Monitoring fee $35 per month.",
};

// The sample keeps its shape on any day: dates move by whole months with today.
export function shiftSample(today) {
  const [y0, m0] = ymd(SAMPLE_TODAY), [y1, m1] = ymd(today);
  const n = (y1 - y0) * 12 + (m1 - m0);
  return SAMPLE.map((c) => {
    const s = { ...c };
    for (const k of ["leaseEnd", "start", "promoEnd", "copyReceived", "end"]) if (s[k]) s[k] = addMonths(s[k], n);
    if (s.leaseEnd) { const [y, m] = ymd(s.leaseEnd); s.leaseEnd = lastOfMonth(y, m); }
    if (s.type === "other" && s.end) { const [y, m] = ymd(s.end); s.end = lastOfMonth(y, m); }
    return s;
  });
}
