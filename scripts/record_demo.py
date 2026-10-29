"""Records a captioned screen demo of Renewal Clock (no sound) to docs/demo.webm.
The captions follow VIDEO_SCRIPT.md, so a voice-over can be laid on top.
Run: python3 scripts/record_demo.py   (needs playwright and Chrome, like browser_check.py)
Then: ffmpeg -i docs/demo.webm -c:v libx264 -pix_fmt yuv420p -crf 23 docs/demo-captioned.mp4
"""
import asyncio, functools, http.server, os, shutil, socketserver, threading
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/"

CAPTION_JS = """(t) => {
  let c = document.getElementById('cap');
  if (!c) { c = document.createElement('div'); c.id = 'cap';
    Object.assign(c.style, {position:'fixed',left:'50%',bottom:'26px',transform:'translateX(-50%)',maxWidth:'1040px',width:'calc(100% - 80px)',
      background:'rgba(1,20,60,.94)',color:'#fff',font:'600 24px/1.35 system-ui,sans-serif',padding:'14px 22px',borderRadius:'14px',
      border:'1px solid #e8b4b4',zIndex:99999,textAlign:'center',boxShadow:'0 10px 30px rgba(0,0,0,.45)'});
    document.body.appendChild(c); }
  c.textContent = t; c.style.display = t ? 'block' : 'none';
}"""

async def main():
    httpd, url = serve()
    async with async_playwright() as p:
        chrome = shutil.which("google-chrome")
        b = await (p.chromium.launch(executable_path=chrome, args=["--disable-gpu", "--disable-dev-shm-usage"]) if chrome else p.chromium.launch())
        ctx = await b.new_context(viewport={"width": 1280, "height": 720}, record_video_dir=f"{ROOT}/docs/_video", record_video_size={"width": 1280, "height": 720}, bypass_csp=True)
        pg = await ctx.new_page()
        cap = lambda t: pg.evaluate(CAPTION_JS, t)
        wait = lambda ms: pg.wait_for_timeout(int(ms * 0.85) if ms >= 3000 else ms)
        scroll = lambda sel, off=0: pg.evaluate(f"(() => {{ const e = document.querySelector({sel!r}); window.scrollTo({{top: e.getBoundingClientRect().top + scrollY - 20 + {off}, behavior: 'smooth'}}); }})()")
        clear = lambda: pg.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())")
        await pg.goto(url + "?today=2026-10-29"); await pg.wait_for_selector("body[data-ready]"); await wait(600)
        await cap("Your lease ends January 31. When is the last day to tell your landlord? It is December 2, two months earlier."); await wait(7500)
        await cap("Every contract has a day like that: a phone promo that ends, a gym that renews itself, an alarm contract with 60 days' notice."); await wait(7500)
        await cap("Miss it and you pay. Renewal Clock finds that day for each one, using Ontario and Canadian rules."); await wait(6500)
        await pg.hover(".lock"); await cap("Leases and contracts are private. Everything stays on your device, and a security policy stops the page from sending anything anywhere."); await wait(7000)
        await pg.click("#tryBtn"); await wait(300); await clear()
        await cap("Here is a made up Toronto household with five contracts."); await wait(4000)
        await scroll("#next", -10); await wait(600)
        await cap("The next deadline sits on top. The gym membership signed five days ago can still be cancelled, for any reason, until November 3."); await wait(8000)
        await scroll("#boardH", -10); await wait(700)
        await cap("Each contract gets a countdown to its last day to act, sorted soonest first. Red is this week."); await wait(6500)
        await cap("It also adds up what is at stake: $1,920 a year in price jumps and renewals."); await wait(5500)
        await pg.click("#list button[data-id='s-lease']"); await wait(900)
        await cap("The lease. Ontario tenants give 60 days' notice on Form N9, ending on the last day of a rental period."); await wait(7500)
        await cap("So January 31 means notice by December 2. February and March have their own exceptions, and it knows them."); await wait(7500)
        await scroll(".missed", -40); await wait(600)
        await cap("It says what happens if you miss it, in plain words, then the steps, and a cover note ready to send."); await wait(7000)
        await scroll("#msg", -120); await wait(4000)
        await pg.click("#list button[data-id='s-phone']"); await wait(900)
        await cap("The phone plan. The promo ends November 20 and the bill goes from $55 to $80. That is $300 a year."); await wait(7500)
        await cap("Under the CRTC Wireless Code, the cancellation fee falls every month. Leave today and the most they can charge is $140."); await wait(8000)
        await scroll("#detail .grid2", -20); await wait(600)
        await cap("The dates on the way, with a nudge to call about the promo three weeks before it ends."); await wait(6000)
        await scroll("#timeline", -80); await wait(800)
        await cap("The whole year on one line. Red dots are deadlines."); await wait(5500)
        await pg.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})"); await wait(400)
        await pg.click("#addBtn"); await wait(700)
        await cap("Adding a contract takes one paste. Here is a gym agreement."); await wait(4000)
        await pg.click(".ex[data-ex='gym']"); await wait(800); await scroll("#readOut", -10); await wait(600)
        await cap("It reads the wording on your device and highlights every fact it used: the dates, auto renewal, 30 days' notice, the $600 paid up front."); await wait(9000)
        await cap("Nothing is hidden. Check each one, fix anything in the form, and save."); await wait(5500)
        await scroll("#form", -10); await wait(500)
        await pg.fill("#f-name", "Climbing gym"); await wait(500)
        await pg.click("#saveBtn"); await wait(900); await clear()
        await cap("Ontario law protects gym members: 10 days to cancel, a one year limit, and a renewal notice 30 to 90 days before the end."); await wait(8500)
        await scroll("#detail .head", -10); await wait(500)
        await cap("Add to calendar gives you a file with every deadline and reminders a week and a day before. It works with Google, Apple and Outlook."); await wait(8000)
        await pg.click("details.about summary"); await scroll("details.about", -10); await wait(700)
        await cap("Every rule links its source: the Landlord and Tenant Board, the CRTC codes and Ontario's consumer rules. And it says what it cannot do."); await wait(8500)
        await cap("Plain JavaScript, no server, no account, free on GitHub Pages. 16 tests and a browser check."); await wait(6500)
        await pg.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})"); await wait(700)
        await cap("Renewal Clock. Know the last day, before it passes. Made by John Khan in Toronto, Ontario."); await wait(5500)
        path = await pg.video.path()
        await ctx.close(); await b.close()
    httpd.shutdown()
    os.replace(path, f"{ROOT}/docs/demo.webm")
    shutil.rmtree(f"{ROOT}/docs/_video", ignore_errors=True)
    print("saved docs/demo.webm")

asyncio.run(main())
