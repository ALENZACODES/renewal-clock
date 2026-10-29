import { plan, reminders, TYPES } from "./plan.js";
import { read, highlight } from "./reader.js";
import { toICS } from "./ics.js";
import { SOURCES } from "./rules.js";
import { SAMPLE_TEXT, shiftSample } from "./sample.js";
import { addMonths, diffDays, isValid, pretty, short, ymd, toDays } from "./dates.js";

const $ = (id) => document.getElementById(id);
const KEY = "renewal-clock-v1";
const qs = new URLSearchParams(location.search);
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const TODAY = isValid(qs.get("today")) ? qs.get("today") : localToday();
const money = (n) => "$" + Math.round(n).toLocaleString("en-CA");

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v; else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}
const toast = (msg) => { const t = h("div", { class: "toast", role: "status", text: msg }); document.body.append(t); setTimeout(() => t.remove(), 2200); };
function download(name, text, type) {
  const a = h("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

let items = load();
let open = null; let editing = null;
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
function save() { localStorage.setItem(KEY, JSON.stringify(items)); }

const planned = () => items.map((c) => ({ c, p: plan(c, TODAY) })).filter((x) => !x.p.errors);
const order = (a, b) => (a.p.daysLeft ?? 1e9) - (b.p.daysLeft ?? 1e9);
function atStake({ c, p }) {
  let n = 0;
  if (c.promoEnd && c.regularPrice && toDays(c.promoEnd) >= toDays(TODAY)) n += (c.regularPrice - (c.promoPrice || c.monthly || 0)) * 12;
  if (c.type === "other" && c.autoRenew && c.price) n += Number(c.price);
  if (c.type === "gym" && c.prepaid) n += Number(c.prepaid);
  return Math.max(0, n);
}
const daysWord = (n) => n === 0 ? "today" : n === 1 ? "tomorrow" : n < 0 ? `${-n} days ago` : `in ${n} days`;

function render() {
  $("todayTxt").textContent = pretty(TODAY);
  const all = planned().sort(order);
  $("empty").hidden = items.length > 0;
  $("board").hidden = $("next").hidden = items.length === 0;
  if (!items.length) { $("detail").hidden = true; return; }
  // The next deadline
  const top = all.find((x) => x.p.daysLeft != null && x.p.daysLeft >= 0) || all[0];
  const nx = $("next"); nx.className = `next ${top.p.status}`; nx.replaceChildren(
    h("div", { class: "clock" }, h("b", { text: String(Math.max(0, top.p.daysLeft ?? 0)) }), h("small", { text: top.p.daysLeft === 1 ? "day left" : "days left" })),
    h("div", {}, h("div", { class: "kicker", text: "Next deadline" }), h("h2", { text: `${top.c.name}: ${top.p.deadline.label}` }),
      h("p", {}, h("strong", { text: pretty(top.p.deadline.date) })), h("p", { class: "note", text: top.p.ifMissed }),
      h("button", { class: "btn small", type: "button", onclick: () => show(top.c.id) , text: "What to do" })));
  $("sCount").textContent = items.length;
  $("sUrgent").textContent = all.filter((x) => x.p.status === "urgent").length;
  $("sSoon").textContent = all.filter((x) => x.p.daysLeft != null && x.p.daysLeft >= 0 && x.p.daysLeft <= 30).length;
  $("sMoney").textContent = money(all.reduce((s, x) => s + atStake(x), 0));
  $("list").replaceChildren(...all.map(({ c, p }) => h("li", { class: `st-${p.status}` },
    h("button", { class: "item", type: "button", "data-id": c.id, "aria-current": open === c.id ? "true" : "false", onclick: () => show(c.id) },
      h("div", { class: "days" }, p.daysLeft == null ? "–" : p.daysLeft < 0 ? "!" : String(p.daysLeft), h("small", { text: p.daysLeft == null ? "no date" : p.daysLeft < 0 ? "passed" : p.daysLeft === 1 ? "day" : "days" })),
      h("div", {}, h("div", { class: "t" }, h("span", { "aria-hidden": "true", text: TYPES[c.type].icon }), c.name), h("div", { class: "d", text: p.deadline ? p.deadline.label : "No deadline ahead" })),
      h("div", { class: "when" }, p.deadline ? short(p.deadline.date) : "", h("small", { text: p.deadline ? daysWord(p.daysLeft) : "" }))))));
  timeline(all);
  if (open) show(open, false);
}

function timeline(all) {
  const start = TODAY, end = addMonths(TODAY, 12), span = diffDays(start, end);
  const box = $("timeline");
  const months = h("div", { class: "tl-months" }); const ticks = [];
  const [y, m] = ymd(TODAY);
  for (let i = 1; i <= 12; i++) {
    const first = new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 10);
    const at = (diffDays(start, first) / span) * 100; if (at > 100) break;
    const lab = h("span", { text: new Date(Date.UTC(y, m - 1 + i, 1)).toLocaleString("en-CA", { month: "short", timeZone: "UTC" }) + (ymd(first)[1] === 1 ? ` ${ymd(first)[0]}` : "") });
    lab.style.left = `${at}%`; months.append(lab); ticks.push(at);
  }
  const rows = all.map(({ c, p }) => {
    const track = h("div", { class: "track" });
    for (const at of ticks) { const t = h("i", { class: "tick" }); t.style.left = `${at}%`; track.append(t); }
    const row = h("div", { class: "tl-row" }, h("span", { class: "lab", text: c.name }), track);
    for (const e of p.events) {
      const d = diffDays(start, e.date); if (d < 0 || d > span) continue;
      const dot = h("span", { class: `tl-dot ${e.kind}`, title: `${short(e.date)}: ${e.label}` });
      dot.style.left = `${(d / span) * 100}%`; track.append(dot);
    }
    return row;
  });
  box.replaceChildren(h("div", { class: "tl-head" }, h("span", { text: "" }), months), ...rows, h("div", { class: "tl-legend" }, h("i", { class: "r" }), "a deadline", h("i", { class: "b" }), "a date to know"));
  box.setAttribute("aria-label", `Deadlines over the next twelve months: ${all.flatMap(({ c, p }) => p.events.filter((e) => e.kind === "deadline" && toDays(e.date) >= toDays(TODAY)).map((e) => `${c.name}, ${e.label}, ${short(e.date)}`)).join("; ")}`);
}

function show(id, scroll = true) {
  const c = items.find((x) => x.id === id); if (!c) return;
  open = id; const p = plan(c, TODAY); const d = $("detail"); d.hidden = false;
  const kids = [
    h("div", { class: "head" },
      h("div", {}, h("div", { class: "note", text: `${TYPES[c.type].icon} ${TYPES[c.type].label}` }), h("h2", { text: c.name }),
        p.deadline ? h("p", { class: "big" }, `${p.deadline.label}: `, h("span", { text: pretty(p.deadline.date) }), h("span", { class: "note", text: ` (${daysWord(p.daysLeft)})` })) : h("p", { class: "big", text: "No deadline ahead" })),
      h("div", {}, h("button", { class: "btn small", type: "button", onclick: () => download(`${slug(c.name)}-deadlines.ics`, toICS([{ name: c.name, plan: p }]), "text/calendar"), text: "📅 Add to calendar" }),
        h("button", { class: "btn small alt", type: "button", onclick: () => edit(c), text: "Edit" }),
        h("button", { class: "btn small alt", type: "button", onclick: () => { if (confirm(`Remove ${c.name}?`)) { items = items.filter((x) => x.id !== c.id); open = null; save(); $("detail").hidden = true; render(); } }, text: "Remove" }))),
    h("div", { class: "missed" }, h("strong", { text: "If you miss it: " }), p.ifMissed),
    p.feeToday != null ? h("div", { class: "fee" }, h("strong", { text: "Cancel today: " }), p.feeToday ? `the most they can charge is ${money(p.feeToday)}.` : "no early cancellation fee.") : null,
    ...p.warnings.map((w) => h("div", { class: "warn", text: w })),
    h("div", { class: "grid2" },
      h("div", {}, h("h3", { text: "Dates" }), h("ol", { class: "events" }, ...p.events.map((e) => h("li", { class: `${e.kind}${toDays(e.date) < toDays(TODAY) ? " past" : ""}` }, h("div", { class: "dt", text: `${short(e.date)}: ${e.label}` }), h("div", { class: "note", text: e.detail })))),
        reminders(p, TODAY).length ? (() => { const n = p.events.filter((e) => e.kind === "deadline").length; return h("p", { class: "note", text: `The calendar file adds reminders 7 days and 1 day before ${n === 1 ? "the key date" : `each of the ${n} key dates`}.` }); })() : null),
      h("div", {}, h("h3", { text: "What to do" }), h("ol", { class: "steps" }, ...p.steps.map((s) => h("li", { text: s }))))),
    h("h3", { text: c.type === "lease" ? "A cover note to send with your Form N9" : "A message you can send" }),
    h("div", { class: "msg", id: "msg", text: p.message }),
    h("button", { class: "btn small", type: "button", onclick: () => copy(p.message), text: "Copy the message" }),
    c.note ? h("p", { class: "note", text: `Your note: ${c.note}` }) : null,
    p.sources.length ? h("p", { class: "note sources" }, "Rules from: ", ...p.sources.map((s) => h("a", { href: s.url, target: "_blank", rel: "noopener", text: s.name }))) : h("p", { class: "note", text: "These dates come from your contract's own terms." }),
  ];
  d.replaceChildren(...kids.filter(Boolean));
  document.querySelectorAll(".list button.item").forEach((b) => b.setAttribute("aria-current", b.dataset.id === id ? "true" : "false"));
  if (scroll) d.scrollIntoView({ behavior: "smooth", block: "start" });
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
async function copy(t) { try { await navigator.clipboard.writeText(t); toast("Copied"); } catch { const r = document.createRange(); r.selectNodeContents($("msg")); getSelection().removeAllRanges(); getSelection().addRange(r); toast("Selected. Press Ctrl+C to copy"); } }

// ---------- Adding and editing ----------
const FIELDS = {
  lease: [["kind", "Type of tenancy", "select", [["fixed", "Fixed term (a lease with an end date)"], ["monthly", "Month to month"], ["weekly", "Week to week"]]], ["leaseEnd", "Last day of the lease term", "date"], ["rentDay", "Rent is due on day", "number", "1 for the first of the month"], ["rentWeekday", "Weekly rent is due on", "select", [["1", "Monday"], ["2", "Tuesday"], ["3", "Wednesday"], ["4", "Thursday"], ["5", "Friday"], ["6", "Saturday"], ["0", "Sunday"]]], ["moveOut", "Planning to move? The day you want to leave", "date", "Leave empty to plan for the end of the lease"], ["address", "Rental address (for the message)", "text"], ["tenant", "Your name (for the message)", "text"]],
  phone: [["start", "Service start date", "date"], ["termMonths", "Term in months", "number", "0 if month to month"], ["subsidy", "Device subsidy, $", "number", "On your contract summary. 0 if you paid full price"], ["promoEnd", "Promotional price ends", "date"], ["promoPrice", "Price now, $ a month", "number"], ["regularPrice", "Price after the promo, $ a month", "number"], ["disability", "I identify as having a disability (30 day trial)", "check"], ["holder", "Your name (for the message)", "text"]],
  internet: [["start", "Service start date", "date"], ["termMonths", "Term in months", "number", "0 if month to month"], ["subsidy", "Early cancellation fee in the contract, $", "number", "0 if none"], ["promoEnd", "Promotional price ends", "date"], ["promoPrice", "Price now, $ a month", "number"], ["regularPrice", "Price after the promo, $ a month", "number"], ["holder", "Your name (for the message)", "text"]],
  gym: [["start", "Contract start date", "date"], ["copyReceived", "Day you got your written copy", "date"], ["end", "Contract end date", "date"], ["prepaid", "Paid in advance, $", "number"], ["member", "Your name (for the message)", "text"]],
  other: [["end", "End or renewal date", "date"], ["noticeDays", "Days of notice required", "number"], ["autoRenew", "It renews automatically", "check"], ["renewMonths", "Each renewal lasts (months)", "number"], ["price", "Cost of a renewal, $", "number"], ["noticeHow", "How notice must be given", "text", "For example: in writing to the billing address"], ["holder", "Your name (for the message)", "text"]],
};
function buildForm(c) {
  const f = $("form"); f.hidden = false;
  const typeSel = h("select", { id: "f-type", name: "type" }, ...Object.entries(TYPES).map(([k, v]) => h("option", { value: k, selected: c.type === k, text: `${v.icon} ${v.label}` })));
  typeSel.addEventListener("change", () => buildForm({ ...collect(), type: typeSel.value }));
  const rows = [h("div", {}, h("label", { for: "f-type", text: "What kind of contract" }), typeSel), h("div", {}, h("label", { for: "f-name", text: "Name it" }), h("input", { id: "f-name", name: "name", value: c.name || TYPES[c.type].label }))];
  for (const [k, label, kind, extra] of FIELDS[c.type]) {
    if (k === "rentWeekday" && c.kind !== "weekly") continue;
    if ((k === "leaseEnd") && c.kind && c.kind !== "fixed") continue;
    if (k === "rentDay" && c.kind === "weekly") continue;
    const id = `f-${k}`; let input;
    if (kind === "select") { input = h("select", { id, name: k }, ...extra.map(([v, t]) => h("option", { value: v, selected: String(c[k] ?? "") === v, text: t }))); if (k === "kind") input.addEventListener("change", () => buildForm({ ...collect(), kind: input.value })); }
    else if (kind === "check") { rows.push(h("div", { class: "check full" }, h("input", { id, name: k, type: "checkbox", checked: !!c[k] }), h("label", { for: id, text: label }))); continue; }
    else input = h("input", { id, name: k, type: kind, value: c[k] ?? "", step: kind === "number" ? "any" : null, min: kind === "number" ? "0" : null });
    rows.push(h("div", {}, h("label", { for: id }, label, extra && kind !== "select" ? h("span", { class: "hint", text: ` (${extra})` }) : null), input));
  }
  rows.push(h("div", { class: "full" }, h("label", { for: "f-note", text: "A note for yourself" }), h("input", { id: "f-note", name: "note", value: c.note || "" })));
  rows.push(h("p", { class: "errs full", id: "errs", role: "alert" }));
  rows.push(h("div", { class: "full" }, h("button", { class: "btn", type: "submit", id: "saveBtn", text: editing ? "Save changes" : "Start the clock" })));
  f.replaceChildren(...rows);
}
function collect() {
  const c = { type: $("f-type").value };
  for (const el of $("form").querySelectorAll("input,select")) {
    if (!el.name || el.name === "type") continue;
    if (el.type === "checkbox") c[el.name] = el.checked;
    else if (el.type === "number") c[el.name] = el.value === "" ? (el.name === "termMonths" || el.name === "subsidy" ? 0 : "") : Number(el.value);
    else c[el.name] = el.value.trim();
  }
  if (c.type === "lease") { c.kind = c.kind || "fixed"; if (c.rentWeekday !== undefined) c.rentWeekday = Number(c.rentWeekday); }
  return c;
}
$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  const c = collect(); c.id = editing || `c-${Date.now().toString(36)}`;
  const p = plan(c, TODAY);
  if (p.errors) { $("errs").textContent = p.errors.join(" "); return; }
  items = editing ? items.map((x) => (x.id === editing ? c : x)) : [...items, c];
  save(); closeAdd(); render(); show(c.id); toast(editing ? "Saved" : "The clock is running");
  editing = null;
});
function openAdd(c = { type: "gym" }, pane = "paste") {
  $("add").hidden = false; setTab(pane);
  if (pane === "form") buildForm(c); else { $("form").hidden = true; $("readOut").hidden = true; }
  $("add").scrollIntoView({ behavior: "smooth", block: "start" });
}
function closeAdd() { $("add").hidden = true; $("paste").value = ""; $("readOut").hidden = true; $("form").hidden = true; }
function edit(c) { editing = c.id; openAdd(c, "form"); }
function setTab(which) {
  $("tabPaste").setAttribute("aria-selected", which === "paste"); $("tabForm").setAttribute("aria-selected", which === "form");
  $("pastePane").hidden = which !== "paste";
  if (which === "form" && $("form").hidden) buildForm({ type: "gym" });
}
const LABEL = { start: "Starts", end: "Ends", leaseEnd: "Lease ends", promoEnd: "Promo ends", termMonths: "Term", noticeDays: "Notice", autoRenew: "Renews automatically", renewMonths: "Each renewal", subsidy: "Device subsidy", ecf: "Cancellation fee", promoPrice: "Promo price", regularPrice: "Price after", monthly: "Monthly", rentDay: "Rent due day", kind: "Tenancy", prepaid: "Paid in advance" };
const fmt = (k, v) => /^(start|end|leaseEnd|promoEnd)$/.test(k) ? short(v) : k === "termMonths" || k === "renewMonths" ? `${v} months` : k === "noticeDays" ? `${v} days` : /subsidy|ecf|Price|monthly|prepaid/.test(k) ? `$${v}` : v === true ? "yes" : String(v);
function doRead() {
  const text = $("paste").value; if (!text.trim()) { $("paste").focus(); return; }
  const { facts, evidence } = read(text);
  $("readOut").hidden = false;
  $("marked").replaceChildren(...highlight(text, evidence).map((p) => p.field ? h("mark", { class: `f-${p.field}`, title: LABEL[p.field] || p.field, text: p.text }) : document.createTextNode(p.text)));
  $("found").replaceChildren(h("li", {}, h("strong", { text: "Looks like: " }), `${TYPES[facts.type].icon} ${TYPES[facts.type].label}`), ...evidence.map((e) => h("li", {}, h("strong", { text: `${LABEL[e.field] || e.field}: ` }), fmt(e.field, e.value))));
  if (!evidence.length) $("found").append(h("li", { text: "No dates or terms found. Fill in the form below." }));
  editing = null; buildForm({ ...facts, name: TYPES[facts.type].label });
}

// ---------- Wiring ----------
$("tryBtn").addEventListener("click", () => { items = shiftSample(TODAY); save(); open = null; render(); toast("Sample household loaded. Everything in it is made up"); });
for (const b of [$("addBtn"), $("addBtn0")]) b.addEventListener("click", () => { editing = null; openAdd(); });
$("closeAdd").addEventListener("click", closeAdd);
$("tabPaste").addEventListener("click", () => setTab("paste"));
$("tabForm").addEventListener("click", () => setTab("form"));
$("readBtn").addEventListener("click", doRead);
document.querySelectorAll(".ex").forEach((b) => b.addEventListener("click", () => { $("paste").value = SAMPLE_TEXT[b.dataset.ex]; doRead(); }));
$("icsAll").addEventListener("click", () => download("renewal-clock.ics", toICS(planned().map(({ c, p }) => ({ name: c.name, plan: p }))), "text/calendar"));
$("exportBtn").addEventListener("click", () => download("renewal-clock-backup.json", JSON.stringify({ app: "renewal-clock", version: 1, items }, null, 2), "application/json"));
$("importFile").addEventListener("change", async (e) => { try { const j = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(j.items)) throw 0; items = j.items; save(); render(); toast("Backup restored"); } catch { toast("That file is not a Renewal Clock backup"); } });
$("clearBtn").addEventListener("click", () => { if (confirm("Remove every contract from this device?")) { items = []; open = null; save(); $("detail").hidden = true; render(); } });

const RULES = [
  ["Ontario leases", "A tenant ends a tenancy with Form N9. Notice is at least 60 days (28 for weekly rent), and the termination date must be the last day of a rental period, and not before the end of a fixed term. For the end of February, notice by January 1 is enough; for the end of March, by February 1. If nobody gives notice, the tenancy simply continues month to month.", [SOURCES.ltb, SOURCES.rta, SOURCES.n9]],
  ["Phone plans", "Under the CRTC Wireless Code you can cancel any time, and it takes effect the day the provider is told. An early cancellation fee is only allowed when the device was subsidized, and it must fall by the same amount each month to $0 within 24 months. There is a 15 day trial (30 days if you identify as having a disability).", [SOURCES.wireless]],
  ["Internet and TV", "Under the CRTC Internet Code, large providers must cancel on the day you ask and refund days paid in advance. Fees for fixed terms fall to $0 within 24 months. There is a 15 day trial for fixed terms (30 days with a disability).", [SOURCES.internet]],
  ["Ontario gyms", "For gyms and classes paid $50 or more in advance, you can cancel for any reason within 10 days of getting your written copy. Contracts must end after one year. Before a renewal, the gym must send notice between 90 and 30 days before the end, or the renewal is not valid. Not for profit clubs, member owned clubs and City centres are not covered.", [SOURCES.gym]],
  ["What it cannot do", "It cannot read a scanned image, only text. It cannot know about a deal you made with a landlord or provider that isn't in the contract. Smaller internet providers and gyms outside Ontario follow other rules. Treat every date as a plan to check, and act early.", []],
];
$("rules").replaceChildren(...RULES.map(([t, s, src]) => h("div", {}, h("h3", { text: t }), h("p", { text: s }), src.length ? h("p", { class: "note sources" }, ...src.map((x) => h("a", { href: x.url, target: "_blank", rel: "noopener", text: x.name }))) : null)));
render();
if (qs.has("sample") && !items.length) $("tryBtn").click();
document.body.dataset.ready = "1";
