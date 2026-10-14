"""0.7 browser check: found a colony and build on it, the exchange, the arena tab, mastery on the overview, and the
leaderboards. Start the server with a fresh DATA_DIR and SEEDS_FILE=test/seeds_test07.json."""
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8090/'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(URL); await pg.evaluate("localStorage.setItem('rift.seenIntro','1')")
        await pg.fill('#lname', 'Colonist'); await pg.fill('#lpass', 'secret'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        await pg.click('#ltabs button[data-lt="colony"]'); await pg.wait_for_timeout(300)
        await pg.click('#landbody [data-act="col"][data-op="found"]'); await pg.wait_for_timeout(500)
        for k in ('habitat', 'shieldgen'):
            el = await pg.query_selector(f'[data-act="col"][data-op="build"][data-kind="{k}"]')
            if el: await el.click(); await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT + 'v07_colony.png')
        await pg.click('#ltabs button[data-lt="exchange"]'); await pg.wait_for_timeout(300)
        await pg.select_option('#xitem', 'mat:alloy:2'); await pg.fill('#xqty', '3'); await pg.fill('#xprice', '42000'); await pg.click('#landbody [data-act="xplace"]'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT + 'v07_exchange.png')
        await pg.click('#ltabs button[data-lt="arena"]'); await pg.wait_for_timeout(300)
        await pg.click('#landbody [data-act="arena"][data-mode="1v1"]'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT + 'v07_arena.png')
        await pg.click('#ltabs button[data-lt="overview"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'v07_overview.png')
        print('colonies:', await pg.evaluate("JSON.stringify(G.you.colonies)"), 'orders:', await pg.evaluate("G.landed.exchange.mine.length"), 'queued:', await pg.evaluate("G.you.arena.queued"), 'touch hidden:', await pg.evaluate("document.getElementById('touch').classList.contains('hidden')"))
        print('\n'.join(errs[:10]) or 'no page errors'); await b.close()
asyncio.run(main())
