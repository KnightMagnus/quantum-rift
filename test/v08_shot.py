"""0.8 browser check (fresh DATA_DIR, SEEDS_FILE=test/seeds_knight.json): KNIGHT's station sections and the Specialists screen, building a
specialist, the faction store menu, options, Sol and the wormhole in space, and the map with the Gateway region."""
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8090/'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(URL); await pg.wait_for_timeout(500)
        print('version:', await pg.evaluate("document.getElementById('lver').textContent"))
        await pg.fill('#lname', 'KNIGHT'); await pg.fill('#lpass', '1234'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        await pg.click('#ltabs button[data-lt="station"]'); await pg.wait_for_timeout(300)
        for k in ('ops', 'research', 'academy', 'specialists'):
            await pg.click(f'#landbody [data-act="stab"][data-k="{k}"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + f'v08_st_{k}.png')
        await pg.click('#landbody [data-act="spec"][data-op="build"][data-id="807"]'); await pg.wait_for_timeout(600)
        print('flying:', await pg.evaluate("G.A.ships[G.you.ship.hull].name"))
        await pg.screenshot(path=OUT + 'v08_built.png')
        await pg.click('#storesbtn'); await pg.wait_for_timeout(300); await pg.click('#storebox [data-act="sfac"][data-f="korrund"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + 'v08_stores.png'); await pg.keyboard.press('Escape')
        await pg.click('#optbtn'); await pg.wait_for_timeout(200); await pg.screenshot(path=OUT + 'v08_options.png'); await pg.click('#optclose')
        await pg.click('#depart'); await pg.wait_for_timeout(1000)
        await pg.keyboard.press('KeyM'); await pg.wait_for_timeout(400); await pg.click('#gfit'); await pg.wait_for_timeout(400); await pg.screenshot(path=OUT + 'v08_map.png')
        await pg.fill('#gsearch', 'ninefold'); await pg.wait_for_timeout(300); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        print('route to Ninefold:', await pg.evaluate("G.route.join(' > ')"))
        await pg.keyboard.press('Escape'); await pg.keyboard.press('KeyM'); await pg.wait_for_timeout(200)
        print('\\n'.join(errs[:10]) or 'no page errors'); await b.close()
asyncio.run(main())
