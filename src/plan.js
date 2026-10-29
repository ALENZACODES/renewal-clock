// Turns a contract into its deadlines: the last day to act, what happens if you miss
// it, the dates on the way, the steps and a message ready to send.
import { SOURCES, earliestTermination, lastNoticeDay, periodEndOnOrAfter, earlyCancellationFee, feeFreeDate, trialEnd, gymCoolingOffEnd, gymRenewalWindow, gymTooLong } from "./rules.js";
import { addDays, addMonths, diffDays, toDays, pretty, short, isValid } from "./dates.js";

export const TYPES = {
  lease: { label: "Lease (Ontario)", icon: "🏠" },
  phone: { label: "Phone plan", icon: "📱" },
  internet: { label: "Internet or TV", icon: "📶" },
  gym: { label: "Gym or classes (Ontario)", icon: "🏋️" },
  other: { label: "Anything else", icon: "📄" },
};
const money = (n) => "$" + Number(n).toLocaleString("en-CA", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const after = (a, b) => toDays(a) > toDays(b);
const onOrAfter = (a, b) => toDays(a) >= toDays(b);

export function status(daysLeft) {
  if (daysLeft == null) return "none";
  if (daysLeft < 0) return "missed";
  if (daysLeft <= 7) return "urgent";
  if (daysLeft <= 30) return "soon";
  return "later";
}

export function validate(c) {
  const errs = [];
  const need = (k, what) => { if (!isValid(c[k])) errs.push(`Add ${what}.`); };
  if (c.type === "lease") { if (c.kind === "fixed") need("leaseEnd", "the last day of the lease"); if (c.moveOut && !isValid(c.moveOut)) errs.push("The move out date is not a real date."); }
  if (c.type === "phone" || c.type === "internet") { need("start", "the start date"); if (!(c.termMonths >= 0)) errs.push("Add the term in months (0 if month to month)."); }
  if (c.type === "gym") { need("start", "the start date"); need("end", "the end date"); }
  if (c.type === "other") need("end", "the end or renewal date");
  return errs;
}

export function plan(c, today) {
  const errors = validate(c);
  if (errors.length) return { errors };
  const P = { events: [], steps: [], warnings: [], sources: [], message: "" };
  const ev = (date, label, detail, kind = "info") => { if (date) P.events.push({ date, label, detail, kind }); };
  const name = c.name || TYPES[c.type].label;

  if (c.type === "lease") {
    const t = { kind: c.kind || "fixed", leaseEnd: c.leaseEnd, rentDay: Number(c.rentDay) || 1, rentWeekday: Number(c.rentWeekday ?? 1) };
    let termination;
    if (c.moveOut) {
      termination = t.kind === "weekly" ? earliestTermination(addDays(c.moveOut, -28), t) : periodEndOnOrAfter(c.moveOut, t.rentDay);
      if (t.kind === "fixed" && t.leaseEnd && after(t.leaseEnd, termination)) termination = t.leaseEnd;
    } else termination = t.kind === "fixed" ? t.leaseEnd : earliestTermination(today, t);
    const last = lastNoticeDay(termination, t);
    const late = after(today, last);
    const earliestNow = earliestTermination(today, t);
    P.deadline = late ? { date: earliestNow, label: "Earliest move out if you give notice today", kind: "info" }
      : { date: last, label: `Last day to give your landlord Form N9 for ${short(termination)}`, kind: "deadline" };
    P.termination = late ? earliestNow : termination;
    ev(last, "Last day to give notice", `Form N9 must reach your landlord by this day to end the tenancy on ${short(termination)}.`, "deadline");
    ev(addDays(last, -14), "Fill in Form N9", "Download Form N9, fill in the termination date and sign it.");
    if (t.kind === "fixed" && t.leaseEnd) ev(t.leaseEnd, "Lease term ends", "If no notice was given, the tenancy simply continues month to month on the same terms. You do not have to sign a new lease.");
    ev(P.termination, "Termination date", "The last day you live in the unit.");
    P.ifMissed = late
      ? `The ${short(termination)} date has passed for notice. If you give Form N9 today, the earliest termination date you can use is ${pretty(earliestNow)}.`
      : `You cannot leave on ${short(termination)} without your landlord's agreement. The tenancy continues, and the earliest date moves to the end of a later rental period.`;
    if (isFebMar(termination)) P.warnings.push("February and March have a special rule: notice for the end of February can be given by January 1, and for the end of March by February 1.");
    P.steps = [
      `Use Form N9, the Tenant's Notice to End the Tenancy. Put ${pretty(P.termination)} as the termination date. It has to be the last day of a rental period${t.kind === "fixed" ? " and not before the end of your lease" : ""}.`,
      "Sign it and give it to your landlord, keeping proof of the day you gave it (a photo of the hand off, an email receipt, or registered mail).",
      "Staying instead? You don't need to do anything. Your tenancy continues month to month on the same terms, and you are not required to sign a new lease.",
      "Ending your tenancy by agreement with your landlord is also possible, on any date you both agree to in writing.",
    ];
    P.message = `Hello,\n\nI am giving notice to end my tenancy at ${c.address || "[my address]"}. My termination date is ${pretty(P.termination, false)}. My completed Form N9, Tenant's Notice to End the Tenancy, is attached.\n\nPlease confirm you received it, and let me know when you would like to arrange the move out inspection and the return of keys.\n\nThank you,\n${c.tenant || "[your name]"}`;
    P.sources = [SOURCES.ltb, SOURCES.rta, SOURCES.n9];
  }

  if (c.type === "phone" || c.type === "internet") {
    const code = c.type === "phone" ? SOURCES.wireless : SOURCES.internet;
    const term = Number(c.termMonths) || 0;
    const subsidy = Number(c.subsidy) || 0;
    const end = term ? addMonths(c.start, term) : null;
    const feeOn = { start: c.start, termMonths: term, subsidy };
    const feeToday = term || subsidy ? earlyCancellationFee(feeOn, today) : 0;
    const zero = subsidy ? feeFreeDate(feeOn) : null;
    const trial = subsidy && (c.type === "phone" || c.newCustomer !== false) ? trialEnd(c.start, !!c.disability) : null;
    if (trial) ev(trial, "Trial period ends", `You can cancel with no fee up to this day if you used under half your monthly allowance and return the ${c.type === "phone" ? "phone" : "equipment"} in near new condition.${c.disability ? " This is the 30 day period for customers who identify as having a disability." : ""}`, "deadline");
    if (c.promoEnd) ev(c.promoEnd, "Promotional price ends", c.regularPrice ? `The bill goes from ${money(c.promoPrice || c.monthly || 0)} to ${money(c.regularPrice)} a month.` : "The bill goes up to the regular price.", "deadline");
    if (c.promoEnd) ev(addDays(c.promoEnd, -21), "Call about the promo ending", "Ask what they will offer to keep you. Have a competitor's price ready.");
    if (zero) ev(zero, "Early cancellation fee reaches $0", "From this day you can leave with no fee.", "info");
    if (end) ev(end, "Contract term ends", "The contract can carry on month to month at the same rates and terms. From here you can switch plans, change providers or cancel with no penalty.", "deadline");
    const key = P.events.filter((e) => e.kind === "deadline" && onOrAfter(e.date, today)).sort((a, b) => toDays(a.date) - toDays(b.date))[0];
    P.deadline = key ? { date: key.date, label: key.label, kind: "deadline" } : null;
    P.feeToday = feeToday;
    P.ifMissed = key?.label === "Promotional price ends" ? `The price rises on ${short(c.promoEnd)}${c.regularPrice && (c.promoPrice || c.monthly) ? `, about ${money((c.regularPrice - (c.promoPrice || c.monthly)) * 12)} more a year` : ""}. You can still cancel or switch later, but you pay the higher price until you do.`
      : key?.label === "Trial period ends" ? "After the trial, leaving early means the early cancellation fee."
      : key ? "Nothing bad happens at the end of the term. It just becomes the best day to shop around, because there is no fee to leave." : "No deadline left on this contract. You can cancel any time, and it takes effect on the day you ask.";
    P.steps = [
      `You can cancel any time by telling the provider. ${c.type === "phone" ? "It takes effect the day they get your notice." : "They must cancel on the day you ask, and refund unused days billed in advance."}`,
      feeToday ? `If you cancelled today, the most they can charge is about ${money(feeToday)}, falling every month${zero ? ` to $0 on ${short(zero)}` : ""}.` : (subsidy || term ? "There is no early cancellation fee left to pay." : "With no device subsidy, there is no early cancellation fee."),
      "Before the promo or term ends, ask for the retention offer, and compare plans from at least one other provider.",
      "If the provider breaks the code, complain to them first, then to the CCTS, which is free.",
    ];
    P.message = `Hello,\n\nI'm reviewing my ${c.type === "phone" ? "mobile" : "internet"} account${c.account ? ` (${c.account})` : ""}. ${c.promoEnd ? `My promotional price ends on ${pretty(c.promoEnd, false)}. ` : ""}${end ? `My term ends on ${pretty(end, false)}. ` : ""}I'm comparing offers from other providers and would like to know the best price you can give me to stay. If it isn't competitive, I'd like to cancel effective ${c.promoEnd ? pretty(addDays(c.promoEnd, -1), false) : "[date]"}.\n\nThank you,\n${c.holder || "[your name]"}`;
    P.sources = [code, SOURCES.ccts];
    if (c.type === "internet") P.warnings.push("The Internet Code applies to the large providers (Bell, Cogeco, Eastlink, Rogers, TELUS, Videotron and a few others). Smaller providers set their own terms.");
  }

  if (c.type === "gym") {
    const cool = c.copyReceived ? gymCoolingOffEnd(c.copyReceived) : null;
    const win = gymRenewalWindow(c.end);
    if (cool) ev(cool, "Cooling off period ends", "Up to this day you can cancel for any reason. Do it in writing and keep proof.", "deadline");
    ev(win.from, "Renewal notice can arrive", "The gym must send a renewal notice between 90 and 30 days before the end.");
    ev(win.to, "Renewal notice deadline", "If no notice has arrived by now and they renew you anyway, the renewal is not valid.", "deadline");
    ev(c.end, "Contract ends", "All personal development contracts must end after one year.");
    const key = P.events.filter((e) => e.kind === "deadline" && onOrAfter(e.date, today)).sort((a, b) => toDays(a.date) - toDays(b.date))[0];
    P.deadline = key ? { date: key.date, label: key.label, kind: "deadline" } : { date: c.end, label: "Contract ends", kind: "info" };
    P.ifMissed = key?.label === "Cooling off period ends" ? "After the cooling off period you are held to the contract, though it still has to end within a year." : "If they send a proper renewal notice and you don't answer, they can renew and bill you. If they renew without one, you can cancel and ask for the money back.";
    if (gymTooLong(c.start, c.end)) P.warnings.push("This contract runs longer than one year. Under the Consumer Protection Act, gym contracts must end after one year.");
    P.warnings.push("These rules cover gyms and classes where you pay $50 or more in advance. They do not cover not for profit clubs like the YMCA, member owned clubs or City run centres.");
    P.steps = ["To cancel in the cooling off period, email a short letter and keep the sent copy, hand deliver it and get a signed receipt, or use registered mail.", "When the renewal notice arrives, check every change they made before you let it renew.", "If the contract leaves out required details (the total cost, the start and end dates, the cancellation and renewal terms), you can cancel within one year."];
    P.message = `Hello,\n\nI am cancelling my membership contract dated ${c.start ? pretty(c.start, false) : "[date]"}${cool && !after(today, cool) ? ", within the 10 day cooling off period under Ontario's Consumer Protection Act" : ""}. Please confirm the cancellation in writing and refund any amounts paid.\n\nThank you,\n${c.member || "[your name]"}`;
    P.sources = [SOURCES.gym];
  }

  if (c.type === "other") {
    const notice = Number(c.noticeDays) || 0;
    const last = addDays(c.end, -notice);
    ev(last, notice ? "Last day to give notice" : "Last day to decide", notice ? `The contract asks for ${notice} days' notice before ${short(c.end)}.` : "Nothing to send, but this is when it renews.", "deadline");
    if (notice) ev(addDays(last, -14), "Get quotes", "Two weeks to compare before the notice is due.");
    ev(c.end, c.autoRenew ? "Renews automatically" : "Ends", c.autoRenew ? `It renews${c.renewMonths ? ` for another ${c.renewMonths} months` : ""} unless you gave notice.` : "The contract ends.");
    if (c.promoEnd) ev(c.promoEnd, "Promotional price ends", "", "deadline");
    const key = P.events.filter((e) => e.kind === "deadline" && onOrAfter(e.date, today)).sort((a, b) => toDays(a.date) - toDays(b.date))[0];
    P.deadline = key ? { date: key.date, label: key.label, kind: "deadline" } : null;
    P.ifMissed = c.autoRenew ? `It renews${c.renewMonths ? ` for ${c.renewMonths} more months` : ""}${c.price ? ` at about ${money(c.price)}` : ""}.` : "The contract simply ends.";
    P.steps = [notice ? `Send written notice by ${short(last)}. Email is usually fine, but check the contract for how notice must be given${c.noticeHow ? ` (it says: ${c.noticeHow})` : ""}.` : "Decide before it renews.", "Ask for a confirmation in writing, and save it."];
    P.message = `Hello,\n\nPlease take this as my notice that I do not wish to renew ${name}${c.account ? ` (${c.account})` : ""}, which ends on ${pretty(c.end, false)}. Please confirm in writing.\n\nThank you,\n${c.holder || "[your name]"}`;
  }

  P.events.sort((a, b) => toDays(a.date) - toDays(b.date));
  P.daysLeft = P.deadline ? diffDays(today, P.deadline.date) : null;
  P.status = P.deadline?.kind === "info" && P.daysLeft != null && P.daysLeft >= 0 ? "info" : status(P.daysLeft);
  return P;
}
const isFebMar = (iso) => /-0[23]-(28|29|31)$/.test(iso);

// Reminders: 30, 7 and 1 days before each deadline, only those still ahead.
export function reminders(P, today, offsets = [30, 7, 1]) {
  const out = [];
  for (const e of P.events.filter((e) => e.kind === "deadline")) for (const o of offsets) {
    const d = addDays(e.date, -o);
    if (onOrAfter(d, today)) out.push({ date: d, of: e });
  }
  return out;
}
