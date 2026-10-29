"""Browser check for Renewal Clock.

Serves the site, loads it in headless Chrome on a fixed day (?today=2026-10-29) and checks:
  * the sample household shows five deadlines, soonest first,
  * the lease plan gives the Form N9 deadline and what happens if it is missed,
  * the phone plan shows today's early cancellation fee,
  * the contract reader finds the dates and terms and highlights them,
  * a contract added by hand is saved and survives a reload,
  * the calendar file downloads,
  * the page cannot reach any outside server (the network lock),
  * there are no console errors.
With --shots it also saves the gallery screenshots into docs/.

Needs: pip install playwright, then either Chrome installed or `playwright install chromium`.
Run:  python3 scripts/browser_check.py [--shots]
"""
import asyncio, functools, http.server, os, shutil, socketserver, sys, threading
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = "--shots" in sys.argv

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/"

async def main():
    httpd, url = serve()
    failures = []
    def check(ok, what):
        print(("PASS " if ok else "FAIL ") + what)
        if not ok: failures.append(what)
    async def shot(name, sel=None, up=16):
        if not SHOTS: return
        if sel: await pg.evaluate(f"document.querySelector('{sel}').scrollIntoView()"); await pg.evaluate(f"window.scrollBy(0,-{up})")
        else: await pg.evaluate("window.scrollTo(0,0)")
        await pg.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=f"{ROOT}/docs/{name}.png")
    async with async_playwright() as p:
        chrome = shutil.which("google-chrome")
        b = await (p.chromium.launch(executable_path=chrome, args=["--disable-gpu", "--disable-dev-shm-usage"]) if chrome else p.chromium.launch())
        ctx = await b.new_context(viewport={"width": 1400, "height": 960}, accept_downloads=True)
        pg = await ctx.new_page()
        errors = []
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        await pg.goto(url + "?today=2026-10-29"); await pg.wait_for_selector("body[data-ready]")
        check(await pg.is_visible("#empty"), "a new visitor sees the start card")
        await shot("gallery-8-start")
        await pg.click("#tryBtn"); await pg.wait_for_timeout(300)
        days = await pg.eval_on_selector_all("#list .days", "els => els.map(e => parseInt(e.textContent))")
        check(days == [5, 22, 34, 65, 93], f"sample household sorted soonest first {days}")
        check("Cooling off period ends" in await pg.inner_text("#next"), "the next deadline is the gym cooling off period")
        check((await pg.inner_text("#sMoney")) == "$1,920", "money at stake adds up")
        await shot("gallery-1-dashboard")
        await pg.click("#list button[data-id='s-lease']"); await pg.wait_for_timeout(500)
        d = await pg.inner_text("#detail")
        check("Wednesday, December 2, 2026" in d and "Form N9" in d, "lease: Form N9 by December 2 for January 31")
        check("If you miss it" in d and "continues" in d, "lease: says what happens if you miss it")
        await shot("gallery-2-lease", "#detail")
        await pg.click("#list button[data-id='s-phone']"); await pg.wait_for_timeout(500)
        d = await pg.inner_text("#detail")
        check("$140" in d, "phone: early cancellation fee today is $140")
        await shot("gallery-4-phone", "#detail")
        await shot("gallery-5-timeline", "#list", 40)
        async with pg.expect_download() as dl: await pg.click("#icsAll")
        path = await (await dl.value).path(); ics = open(path).read()
        check(ics.startswith("BEGIN:VCALENDAR") and ics.count("BEGIN:VEVENT") >= 8, f"calendar file has every deadline ({ics.count('BEGIN:VEVENT')} events)")
        # The reader
        await pg.click("#addBtn"); await pg.click(".ex[data-ex='gym']"); await pg.wait_for_timeout(300)
        found = await pg.inner_text("#found")
        check("Notice: 30 days" in found and "Each renewal: 12 months" in found and "Ends: Oct 23, 2027" in found, "reader finds the gym's dates and terms")
        check(await pg.locator("#marked mark").count() >= 4, "reader highlights its evidence")
        await shot("gallery-3-reader", "#add")
        await pg.fill("#f-name", "Climbing gym"); await pg.click("#saveBtn"); await pg.wait_for_timeout(400)
        check(await pg.locator("#list li").count() == 6, "the read contract is saved")
        await pg.reload(); await pg.wait_for_selector("body[data-ready]")
        check(await pg.locator("#list li").count() == 6, "contracts survive a reload (kept on this device)")
        await pg.click("details.about summary"); await shot("gallery-7-rules", "details.about", 10)
        blocked = await pg.evaluate("""async () => { try { await fetch('https://example.com/collect', {method: 'POST', body: 'lease'}); return false } catch (e) { return true } }""")
        check(blocked, "network lock: a request to an outside server is blocked")
        errors = [e for e in errors if "Content Security Policy" not in e and "Refused to connect" not in e and "Failed to fetch" not in e]
        check(not errors, "no console errors" + (f": {errors}" if errors else ""))
        # Phone sized
        m = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        mp = await m.new_page(); await mp.goto(url + "?today=2026-10-29&sample"); await mp.wait_for_selector("body[data-ready]")
        await mp.wait_for_timeout(300)
        wide = await mp.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        check(wide, "phone layout has no sideways scroll")
        if SHOTS:
            await mp.evaluate("document.querySelector('#list').scrollIntoView()"); await mp.evaluate("window.scrollBy(0,-12)"); await mp.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())"); await mp.wait_for_timeout(300)
            await mp.screenshot(path=f"{ROOT}/docs/gallery-6-phone.png")
        await b.close()
    httpd.shutdown()
    print(f"\n{'ALL PASSED' if not failures else str(len(failures)) + ' FAILED'}")
    sys.exit(1 if failures else 0)

asyncio.run(main())
