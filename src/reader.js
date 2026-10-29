// Reads a pasted contract and pulls out the facts that set deadlines, keeping the
// exact words it used as evidence so you can check every one. Nothing leaves the page.
import { addMonths, isValid, make } from "./dates.js";

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, eighteen: 18, twenty: 20, "twenty-four": 24, "twenty four": 24, thirty: 30, "thirty-six": 36, sixty: 60, ninety: 90 };
const ORD = { first: 1, second: 2, third: 3, fifth: 5, tenth: 10, fifteenth: 15, twentieth: 20 };
const num = (s) => { s = String(s).toLowerCase().trim(); return /^\d+$/.test(s) ? +s : WORDS[s] ?? ORD[s] ?? null; };
const NUMW = "(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|eighteen|twenty[- ]four|twenty|thirty[- ]six|thirty|sixty|ninety)";
const MONTHRX = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_RX = new RegExp(`\\b(?:${MONTHRX}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})|(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTHRX}\\.?,?\\s+(\\d{4})|(\\d{4})-(\\d{2})-(\\d{2}))\\b`, "gi");

export function findDates(text) {
  const out = [];
  for (const m of text.matchAll(DATE_RX)) {
    let y, mo, d;
    if (m[1]) { mo = MON[m[1].toLowerCase().slice(0, m[1].toLowerCase().startsWith("sept") ? 4 : 3)] ?? MON[m[1].toLowerCase().slice(0, 3)]; d = +m[2]; y = +m[3]; }
    else if (m[5]) { mo = MON[m[5].toLowerCase().slice(0, 3)]; d = +m[4]; y = +m[6]; }
    else { y = +m[7]; mo = +m[8]; d = +m[9]; }
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (isValid(iso)) out.push({ iso, index: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return out;
}

// What a date means, from the words just before it (and a little after).
const ROLES = [
  ["promoEnd", /(promo(?:tional)?|introductory|discount(?:ed)?|special|bonus)\b[^.]{0,80}\b(until|ends?|ending|expires?|through|to)\b[^.]{0,20}$/i],
  ["end", /(end(?:s|ing)?|expir(?:es|y|ation|ing)|terminat(?:es|ion)|until|through|last day of the term|ending on|to and including)\b[^.]{0,40}$/i],
  ["start", /(start(?:s|ing)?|commenc(?:es|ing|ement)|beginn?ing|begins|effective|activat(?:ed|ion)|from|dated|signed|entered into)\b[^.]{0,40}$/i],
];
function roleOf(text, d) {
  const before = text.slice(Math.max(0, d.index - 120), d.index);
  const sentenceStart = Math.max(before.lastIndexOf(". "), before.lastIndexOf("\n"));
  const clause = before.slice(sentenceStart + 1);
  if (/\bfrom\b[^.]{0,40}$/i.test(clause) && /^\s*(to|until|through|and ending)\b/i.test(text.slice(d.end, d.end + 15))) return "start";
  for (const [role, rx] of ROLES) if (rx.test(clause)) return role;
  return null;
}

export function guessType(text) {
  const t = text.toLowerCase();
  const score = {
    lease: (t.match(/\b(landlord|tenant|tenancy|rent(al)? unit|residential|lease|n9)\b/g) || []).length,
    phone: (t.match(/\b(wireless|mobile|cell(ular)?|device|handset|smartphone|data plan|talk and text|sim)\b/g) || []).length,
    internet: (t.match(/\b(internet|mbps|gbps|modem|broadband|wi-?fi|fibre|fiber|tv package)\b/g) || []).length,
    gym: (t.match(/\b(gym|fitness|membership|member|classes|personal training|studio)\b/g) || []).length,
  };
  const [best, n] = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return n >= 2 ? best : "other";
}

const MONEY = "\\$\\s?(\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?)";
const toMoney = (s) => +s.replace(/,/g, "");

export function read(text) {
  const facts = {}; const evidence = [];
  const put = (field, value, index, end, why) => { if (facts[field] !== undefined) return; facts[field] = value; evidence.push({ field, value, index, end, text: text.slice(index, end), why }); };
  const first = (rx, fn) => { const m = rx.exec(text); if (m) fn(m); return m; };
  const type = guessType(text);
  facts.type = type;

  for (const d of findDates(text)) { const r = roleOf(text, d); if (r) put(r === "end" && type === "lease" ? "leaseEnd" : r, d.iso, d.index, d.end, `a date next to words that mean ${r === "promoEnd" ? "a promo ending" : r}`); }

  first(new RegExp(`\\b${NUMW}[- ]?(month|year)s?\\b[^.]{0,30}\\b(term|agreement|contract|commitment|lease)`, "i"), (m) => put("termMonths", num(m[1]) * (m[2].toLowerCase() === "year" ? 12 : 1), m.index, m.index + m[0].length, "the length of the term"));
  if (facts.termMonths === undefined) first(new RegExp(`\\b(term|commitment|period) of ${NUMW} (month|year)s?`, "i"), (m) => put("termMonths", num(m[2]) * (m[3].toLowerCase() === "year" ? 12 : 1), m.index, m.index + m[0].length, "the length of the term"));
  first(/\b(automatic(?:ally)?[- ]renew\w*|auto[- ]?renew\w*|renews? automatically|will (?:be )?(?:automatically )?renew(?:ed)?|continue (?:on|as) a month[- ]to[- ]month)\b/i, (m) => put("autoRenew", true, m.index, m.index + m[0].length, "words that mean it renews by itself"));
  first(new RegExp(`\\b(?:for )?(?:successive|additional|further|another) (?:periods? of )?${NUMW}[- ]?(month|year)s?`, "i"), (m) => put("renewMonths", num(m[1]) * (m[2].toLowerCase() === "year" ? 12 : 1), m.index, m.index + m[0].length, "how long each renewal lasts"));
  first(new RegExp(`\\b(?:at least |no less than |not less than |minimum of )?${NUMW}(?: \\(\\d+\\))? (?:calendar )?days'?[’]?s? (?:prior |advance )?(?:written )?notice|notice[^.]{0,40}?\\b${NUMW}(?: \\(\\d+\\))? (?:calendar )?days\\b`, "i"), (m) => put("noticeDays", num(m[1] || m[2]), m.index, m.index + m[0].length, "how much notice it asks for"));
  first(new RegExp(`(?:device (?:subsidy|balance)|subsidy|device savings)[^.$]{0,40}${MONEY}|${MONEY}[^.]{0,30}(?:device (?:subsidy|balance)|subsidy)`, "i"), (m) => put("subsidy", toMoney(m[1] || m[2]), m.index, m.index + m[0].length, "the device subsidy, which sets the early cancellation fee"));
  first(new RegExp(`early (?:cancellation|termination) fee[^.$]{0,40}${MONEY}`, "i"), (m) => put("ecf", toMoney(m[1]), m.index, m.index + m[0].length, "the early cancellation fee"));
  // "$45/month for the first 12 months, then $85/month"
  first(new RegExp(`${MONEY}\\s?(?:/|per |a )\\s?(?:month|mo)\\.?[^.]{0,40}?(?:\\s*for (?:the first )?${NUMW} months?)?[^.$]{0,40}?(?:then|after which|thereafter|regular(?: price)?(?: of| is)?)[^.$]{0,30}${MONEY}`, "i"), (m) => {
    put("promoPrice", toMoney(m[1]), m.index, m.index + m[0].length, "the promotional price");
    put("regularPrice", toMoney(m[3]), m.index, m.index + m[0].length, "the price after the promo");
    if (m[2] && facts.start && facts.promoEnd === undefined) put("promoEnd", addMonths(facts.start, num(m[2])), m.index, m.index + m[0].length, `${num(m[2])} months after the start date`);
  });
  first(new RegExp(`(?:paid|payable|prepaid) (?:in advance|up front|upfront)[^.$]{0,40}?\\(?${MONEY}|${MONEY}(?![\\d,.]|\\s?(?:/|per |a month))\\)?[^.$]{0,20}?(?:paid |payable )?(?:in advance|up front|upfront)`, "i"), (m) => put("prepaid", toMoney(m[1] || m[2]), m.index, m.index + m[0].length, "the amount paid in advance"));
  if (facts.promoPrice === undefined) first(new RegExp(`${MONEY}\\s?(?:/|per |a )\\s?(?:month|mo)`, "i"), (m) => put("monthly", toMoney(m[1]), m.index, m.index + m[0].length, "the monthly price"));
  first(new RegExp(`rent[^.]{0,40}\\bdue\\b[^.]{0,20}?\\bon the (\\d{1,2}|first|fifteenth|second|fifth|tenth|twentieth)(?:st|nd|rd|th)?(?: day)?`, "i"), (m) => put("rentDay", num(m[1]), m.index, m.index + m[0].length, "the day rent is due"));
  first(/\b(month[- ]to[- ]month|monthly tenancy)\b/i, (m) => { if (type === "lease") put("kind", facts.leaseEnd ? "fixed" : "monthly", m.index, m.index + m[0].length, "a monthly tenancy"); });
  if (type === "lease" && facts.kind === undefined) facts.kind = facts.leaseEnd ? "fixed" : "monthly";
  if (type === "lease" && facts.rentDay === undefined) facts.rentDay = 1;
  // An end date from a start and a term.
  if (facts.end === undefined && facts.leaseEnd === undefined && facts.start && facts.termMonths && type !== "phone" && type !== "internet") facts.end = addMonths(facts.start, facts.termMonths);
  if (type === "gym" && facts.start && facts.copyReceived === undefined) facts.copyReceived = facts.start;
  evidence.sort((a, b) => a.index - b.index);
  return { facts, evidence };
}

// Splits text into plain and highlighted pieces, for showing the evidence in place.
export function highlight(text, evidence) {
  const parts = []; let at = 0;
  for (const e of evidence.filter((e, i, a) => !a.slice(0, i).some((p) => p.end > e.index))) {
    if (e.index > at) parts.push({ text: text.slice(at, e.index) });
    parts.push({ text: text.slice(e.index, e.end), field: e.field });
    at = e.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}
export { make };
