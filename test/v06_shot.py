"""0.6 browser check: the OPS tab (event, invasion, goals, fleet), the FLEET and STORE screens, and the galaxy map with
claims, anomalies and an invasion. Start the server with a fresh DATA_DIR and INVASION_NOW=1."""
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8090/'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(URL); await pg.evaluate("localStorage.setItem('rift.seenIntro','1')")
        await pg.fill('#lname', 'KNIGHT'); await pg.fill('#lpass', '1234'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        await pg.click('#ltabs button[data-lt="fleet"]'); await pg.wait_for_timeout(300)
        await pg.fill('#ftag', 'KOR'); await pg.fill('#fname', 'Knights of the Rift'); await pg.click('#landbody [data-act="fcreate"]'); await pg.wait_for_timeout(500)
        await pg.fill('#famt', '15000000'); await pg.click('#landbody [data-act="fdep"]'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT + 'v06_fleet.png')
        st = await pg.query_selector('#ltabs button[data-lt="store"]')
        await pg.click('#ctabs button[data-tab="ops"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + 'v06_ops.png')
        await pg.click('#depart'); await pg.wait_for_timeout(800)
        await pg.keyboard.press('KeyM'); await pg.wait_for_timeout(400); await pg.click('#gfit'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT + 'v06_map.png')
        await pg.keyboard.press('Escape')
        print('fleet:', await pg.evaluate("JSON.stringify(G.you.fleet && [G.you.fleet.tag, G.you.fleet.bank])"), 'invasion:', await pg.evaluate("JSON.stringify(G.world && G.world.invasion)"))
        print('\n'.join(errs[:10]) or 'no page errors'); await b.close()
asyncio.run(main())
