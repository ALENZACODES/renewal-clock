import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addMonths, isValid, diffDays } from "../src/dates.js";
import { earliestTermination, lastNoticeDay, periodEndOnOrAfter, monthsElapsed, earlyCancellationFee, feeFreeDate, trialEnd, gymCoolingOffEnd, gymRenewalWindow, gymTooLong } from "../src/rules.js";
import { plan, reminders, status } from "../src/plan.js";
import { read, findDates, guessType, highlight } from "../src/reader.js";
import { toICS } from "../src/ics.js";
import { SAMPLE, SAMPLE_TODAY, SAMPLE_TEXT, shiftSample } from "../src/sample.js";

test("dates clamp to the end of short months and know real dates", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2027-12-31", 2), "2028-02-29");
  assert.ok(isValid("2028-02-29")); assert.ok(!isValid("2027-02-29")); assert.ok(!isValid("2026-13-01"));
});

test("the Landlord and Tenant Board's own examples", () => {
  // Fixed lease ending August 31, notice given June 20: the earliest date is August 31.
  assert.equal(earliestTermination("2026-06-20", { kind: "fixed", leaseEnd: "2026-08-31", rentDay: 1 }), "2026-08-31");
  // Notice given July 31 for a lease that ended: September 30.
  assert.equal(earliestTermination("2026-07-31", { kind: "monthly", rentDay: 1 }), "2026-09-30");
  // Month to month, notice August 15: October 31.
  assert.equal(earliestTermination("2026-08-15", { kind: "monthly", rentDay: 1 }), "2026-10-31");
});

test("60 days' notice, and the February and March exception", () => {
  assert.equal(lastNoticeDay("2027-01-31", { kind: "monthly" }), "2026-12-02");
  assert.equal(lastNoticeDay("2027-02-28", { kind: "monthly" }), "2027-01-01");
  assert.equal(lastNoticeDay("2027-03-31", { kind: "monthly" }), "2027-02-01");
  assert.equal(lastNoticeDay("2028-02-29", { kind: "monthly" }), "2028-01-01");
  assert.equal(earliestTermination("2026-12-31", { kind: "monthly", rentDay: 1 }), "2027-02-28");
  assert.equal(earliestTermination("2027-01-02", { kind: "monthly", rentDay: 1 }), "2027-03-31");
});

test("rent due on the 15th ends periods on the 14th; weekly rent needs 28 days", () => {
  assert.equal(periodEndOnOrAfter("2026-11-20", 15), "2026-12-14");
  assert.equal(earliestTermination("2026-11-01", { kind: "monthly", rentDay: 15 }), "2027-01-14");
  const wk = earliestTermination("2026-10-29", { kind: "weekly", rentWeekday: 1 }); // rent on Mondays
  assert.equal(wk, "2026-11-29"); // a Sunday, the last day of a weekly period, 31 days on
  assert.equal(lastNoticeDay(wk, { kind: "weekly" }), "2026-11-01");
});

test("early cancellation fee falls equally to $0 within 24 months", () => {
  const c = { start: "2025-03-14", termMonths: 24, subsidy: 840 };
  assert.equal(monthsElapsed("2025-03-14", "2025-03-15"), 1, "a partly elapsed month counts");
  assert.equal(earlyCancellationFee(c, "2025-03-14"), 840);
  assert.equal(earlyCancellationFee(c, "2026-10-29"), 140);
  assert.equal(earlyCancellationFee(c, "2027-03-14"), 0);
  assert.equal(feeFreeDate(c), "2027-03-14");
  assert.equal(earlyCancellationFee({ start: "2026-01-01", termMonths: 36, subsidy: 720 }, "2026-07-01"), 540, "36 month terms still reach $0 in 24");
  assert.equal(earlyCancellationFee({ start: "2026-01-01", termMonths: 24, subsidy: 0 }, "2026-07-01"), 0, "no subsidy, no fee");
  assert.equal(trialEnd("2026-10-01"), "2026-10-16"); assert.equal(trialEnd("2026-10-01", true), "2026-10-31");
});

test("Ontario gym windows", () => {
  assert.equal(gymCoolingOffEnd("2026-10-24"), "2026-11-03");
  assert.deepEqual(gymRenewalWindow("2027-10-23"), { from: "2027-07-25", to: "2027-09-23" });
  assert.ok(!gymTooLong("2026-10-24", "2027-10-23")); assert.ok(gymTooLong("2026-10-24", "2028-10-23"));
});

test("the sample household gives five clear deadlines in order", () => {
  const ps = SAMPLE.map((c) => [c.id, plan(c, SAMPLE_TODAY)]);
  const left = Object.fromEntries(ps.map(([id, p]) => [id, p.daysLeft]));
  assert.deepEqual(left, { "s-gym": 5, "s-phone": 22, "s-lease": 34, "s-internet": 65, "s-alarm": 93 });
  const P = Object.fromEntries(ps);
  assert.equal(P["s-lease"].deadline.date, "2026-12-02");
  assert.equal(P["s-phone"].feeToday, 140);
  assert.equal(P["s-alarm"].deadline.date, "2027-01-30");
  assert.equal(status(5), "urgent"); assert.equal(status(22), "soon"); assert.equal(status(34), "later"); assert.equal(status(-1), "missed");
  for (const [, p] of ps) { assert.ok(p.message.length > 80); assert.ok(p.steps.length >= 2); assert.ok(p.ifMissed); }
});

test("a missed lease deadline tells you the earliest date that still works", () => {
  const p = plan({ type: "lease", kind: "fixed", leaseEnd: "2026-12-31", rentDay: 1 }, "2026-11-10");
  assert.equal(p.deadline.date, "2027-01-31");
  assert.match(p.ifMissed, /earliest termination date you can use is Sunday, January 31, 2027/);
  const ok = plan({ type: "lease", kind: "fixed", leaseEnd: "2027-01-31", rentDay: 1, moveOut: "2027-03-10" }, "2026-10-29");
  assert.equal(ok.termination, "2027-03-31"); assert.equal(ok.deadline.date, "2027-02-01");
  assert.ok(ok.warnings.some((w) => /February and March/.test(w)));
});

test("bad input gets plain errors, not wrong dates", () => {
  assert.ok(plan({ type: "lease", kind: "fixed", leaseEnd: "2027-02-30" }, SAMPLE_TODAY).errors.length);
  assert.ok(plan({ type: "gym", start: "2026-10-01" }, SAMPLE_TODAY).errors[0].includes("end date"));
});

test("the reader pulls deadlines out of real contract wording", () => {
  const g = read(SAMPLE_TEXT.gym).facts;
  assert.equal(g.type, "gym"); assert.equal(g.start, "2026-10-24"); assert.equal(g.end, "2027-10-23"); assert.equal(g.autoRenew, true); assert.equal(g.renewMonths, 12); assert.equal(g.noticeDays, 30); assert.equal(g.prepaid, 600);
  assert.equal(read("You paid $900 up front for the year.").facts.prepaid, 900);
  const l = read(SAMPLE_TEXT.lease).facts;
  assert.equal(l.type, "lease"); assert.equal(l.leaseEnd, "2027-01-31"); assert.equal(l.rentDay, 1); assert.equal(l.kind, "fixed");
  const ph = read(SAMPLE_TEXT.phone).facts;
  assert.equal(ph.type, "phone"); assert.equal(ph.termMonths, 24); assert.equal(ph.subsidy, 840); assert.equal(ph.promoPrice, 55); assert.equal(ph.regularPrice, 80); assert.equal(ph.promoEnd, "2026-11-14");
  const o = read(SAMPLE_TEXT.other).facts;
  assert.equal(o.type, "other"); assert.equal(o.end, "2027-03-31"); assert.equal(o.noticeDays, 60); assert.equal(o.renewMonths, 12); assert.equal(o.autoRenew, true);
});

test("the reader handles other ways of writing dates and numbers", () => {
  assert.deepEqual(findDates("on 3 March 2027, Sept. 5, 2026 and 2027-01-15 but not 2027-02-30").map((d) => d.iso), ["2027-03-03", "2026-09-05", "2027-01-15"]);
  const f = read("Internet 1 Gbps plan. Service starts July 2, 2026. Promotional price of $45/month for the first 12 months, then $90/month. Modem rental included.").facts;
  assert.equal(f.type, "internet"); assert.equal(f.promoEnd, "2027-07-02");
  assert.equal(read("The agreement may be cancelled with ninety (90) days notice.").facts.noticeDays, 90);
  assert.equal(read("a term of two years").facts.termMonths, 24);
  assert.equal(guessType("Hello, this is a note about lunch."), "other");
  assert.deepEqual(read("Nothing useful here.").evidence, []);
});

test("highlights keep the text whole and mark the evidence", () => {
  const { evidence } = read(SAMPLE_TEXT.other);
  const parts = highlight(SAMPLE_TEXT.other, evidence);
  assert.equal(parts.map((p) => p.text).join(""), SAMPLE_TEXT.other);
  assert.ok(parts.filter((p) => p.field).length >= 3);
});

test("calendar file is valid: CRLF, all day events, folded lines, two alarms", () => {
  const items = SAMPLE.map((c) => ({ name: c.name, plan: plan(c, SAMPLE_TODAY) }));
  const ics = toICS(items);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n")); assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "every line ends with CRLF");
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.match(ics, /DTSTART;VALUE=DATE:20261203\r\nDTEND;VALUE=DATE:20261204|DTSTART;VALUE=DATE:20261202\r\nDTEND;VALUE=DATE:20261203/);
  const events = (ics.match(/BEGIN:VEVENT/g) || []).length;
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, events * 2);
  assert.match(ics, /SUMMARY:Apartment lease: Last day to give notice/);
  assert.ok(reminders(items[0].plan, SAMPLE_TODAY).length >= 1);
});

test("the sample keeps its shape on any later day", () => {
  for (const day of ["2026-11-25", "2027-02-10", "2027-06-30"]) {
    const sh = shiftSample(day);
    const left = sh.map((c) => plan(c, day).daysLeft);
    assert.ok(left.every((n) => n >= 0 && n < 130), `${day}: ${left}`);
    assert.ok(sh.find((c) => c.type === "lease").leaseEnd.match(/-(28|29|30|31)$/));
  }
});

test("the page is locked: a strict security policy and no outside scripts", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self';[^"]*connect-src 'self'; form-action 'none'/);
  assert.ok(!/<script(?![^>]*src="src\/app\.js")/.test(html), "only the one local module");
  assert.ok(!/style="/.test(html), "no inline styles");
  for (const f of ["app.js", "plan.js", "reader.js", "rules.js", "ics.js", "dates.js", "sample.js"]) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
    assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|innerHTML/.test(src), `${f} has no network calls and no innerHTML`);
  }
});

test("public text uses no dashes as punctuation", () => {
  for (const f of ["index.html", "README.md", "DEVPOST.md"]) {
    let t; try { t = readFileSync(new URL(`../${f}`, import.meta.url), "utf8"); } catch { continue; }
    t = t.replace(/<[^>]+>/g, " ").replace(/\[[^\]]*\]\([^)]*\)/g, " ").replace(/`[^`]*`/g, " ").replace(/https?:\S+/g, " ");
    assert.ok(!/ [–—-] |—|–/.test(t), `${f} has a dash used as punctuation`);
  }
});
