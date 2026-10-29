"""Saves docs/social-preview.png (1280 x 640) from the page with the sample household loaded."""
import asyncio, functools, http.server, os, shutil, socketserver, threading
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
async def main():
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Q, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{httpd.server_address[1]}/"
    async with async_playwright() as p:
        chrome = shutil.which("google-chrome")
        b = await (p.chromium.launch(executable_path=chrome, args=["--disable-gpu"]) if chrome else p.chromium.launch())
        pg = await b.new_page(viewport={"width": 1280, "height": 640})
        await pg.goto(url + "?today=2026-10-29&sample"); await pg.wait_for_selector("body[data-ready]")
        await pg.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove()); window.scrollTo(0, 0)"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f"{ROOT}/docs/social-preview.png")
        await b.close()
    httpd.shutdown()
asyncio.run(main())
