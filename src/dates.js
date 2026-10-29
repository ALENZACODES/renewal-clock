// Date only arithmetic. A date is a "YYYY-MM-DD" string; maths uses UTC days so
// time zones and daylight saving never shift a deadline.
const DAY = 86400000;
export const toDays = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / DAY; };
export const fromDays = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const addDays = (iso, n) => fromDays(toDays(iso) + n);
export const diffDays = (a, b) => toDays(b) - toDays(a); // b minus a
export const ymd = (iso) => iso.split("-").map(Number);
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const lastOfMonth = (y, m) => `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
export const make = (y, m, d) => { while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, daysInMonth(y, m))).padStart(2, "0")}`; };
// Add whole months, clamping to the end of a short month (Jan 31 + 1 month = Feb 28).
export const addMonths = (iso, n) => { const [y, m, d] = ymd(iso); return make(y, m + n, d); };
export const weekday = (iso) => new Date(toDays(iso) * DAY).getUTCDay(); // 0 Sunday
export const isValid = (iso) => typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso) && fromDays(toDays(iso)) === iso;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const pretty = (iso, withDay = true) => { const [y, m, d] = ymd(iso); return `${withDay ? DAYS[weekday(iso)] + ", " : ""}${MONTHS[m - 1]} ${d}, ${y}`; };
export const short = (iso) => { const [y, m, d] = ymd(iso); return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`; };
export { MONTHS };
