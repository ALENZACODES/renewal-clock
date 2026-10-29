// A calendar file with one all day event per deadline, each with alarms.
const fold = (line) => { const out = []; let s = line; while (new TextEncoder().encode(s).length > 75) { let i = 74; while (new TextEncoder().encode(s.slice(0, i)).length > 75) i--; out.push(s.slice(0, i)); s = " " + s.slice(i); } out.push(s); return out.join("\r\n"); };
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const d8 = (iso) => iso.replace(/-/g, "");
export function toICS(items, stamp = "20261029T120000Z") {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//John Khan//Renewal Clock//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  let n = 0;
  for (const { name, plan } of items) for (const e of plan.events.filter((e) => e.kind === "deadline")) {
    const next = e.date.replace(/^(\d+)-(\d+)-(\d+)$/, (_, y, m, d) => new Date(Date.UTC(+y, +m - 1, +d + 1)).toISOString().slice(0, 10));
    L.push("BEGIN:VEVENT", `UID:rc-${d8(e.date)}-${n++}@renewal-clock`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(e.date)}`, `DTEND;VALUE=DATE:${d8(next)}`,
      fold(`SUMMARY:${esc(`${name}: ${e.label}`)}`), fold(`DESCRIPTION:${esc(e.detail || "")}`),
      "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-P7D", fold(`DESCRIPTION:${esc(`In 7 days: ${name}, ${e.label}`)}`), "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-P1D", fold(`DESCRIPTION:${esc(`Tomorrow: ${name}, ${e.label}`)}`), "END:VALARM",
      "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}
