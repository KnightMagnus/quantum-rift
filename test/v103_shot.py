"""1.0.3 browser check (fresh DATA_DIR, default seeds): jobs show jumps and refuse loads that won't fit, trade MAX and
SELL ALL CARGO, outfitter stats and disabled buttons, the career card in MISSIONS, L to depart, autopilot landing and jumping."""
import asyncio, sys, time
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8090/'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(URL); await pg.fill('#lname', 'Tester'); await pg.fill('#lpass', 'abc'); await pg.click('#lbtn'); await pg.wait_for_timeout(1200)
        print('login status after a failed login:', await pg.inner_text('#lstat'))
        await pg.fill('#lpass', 'test1234'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        print('first companion tab:', await pg.evaluate("G.ctab"), '| missions:', (await pg.inner_text('#mlist'))[:90].replace('\n', ' | '))
        await pg.click('#ltabs button[data-lt="jobs"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'v103_jobs.png')
        print('jobs: warnings', await pg.evaluate("document.querySelectorAll('.jwarn').length"), 'disabled accepts', await pg.evaluate("document.querySelectorAll('[data-act=accept]:disabled').length"))
        await pg.click('#ltabs button[data-lt="trade"]'); await pg.wait_for_timeout(300)
        await pg.click('[data-act="trade"][data-c="food"]:has-text("MAX")'); await pg.wait_for_timeout(500)
        print('after MAX food, hold:', await pg.evaluate("G.you.cargoUsed"), '/', await pg.evaluate("G.you.shipStats.cargo"))
        await pg.screenshot(path=OUT + 'v103_trade.png')
        await pg.click('[data-act="sellall"]'); await pg.wait_for_timeout(500); print('after SELL ALL CARGO, hold:', await pg.evaluate("G.you.cargoUsed"))
        await pg.click('#ltabs button[data-lt="outfit"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'v103_outfit.png')
        print('outfitter disabled buys:', await pg.evaluate("document.querySelectorAll('[data-act=outfit]:disabled').length"))
        await pg.keyboard.press('KeyL'); await pg.wait_for_timeout(1200); print('L departed:', await pg.evaluate("!G.landed && !!G.view"))
        await pg.keyboard.down('KeyW'); await pg.wait_for_timeout(3000); await pg.keyboard.up('KeyW')
        await pg.keyboard.press('KeyL'); t0 = time.time()
        while time.time() - t0 < 40 and not await pg.evaluate("!!G.landed"): await pg.wait_for_timeout(500)
        print('autopilot landed:', await pg.evaluate("!!G.landed"), round(time.time() - t0, 1), 's')
        print('\n'.join(errs[:10]) or 'no page errors'); await b.close()
asyncio.run(main())
