"""1.0.1 browser check: command bar and controls card, MISSIONS tab with the story target, the map marker, planets in space.
Run against a server with SEEDS_FILE=test/seeds_test10.json and a fresh DATA_DIR."""
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8090/'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(URL); await pg.fill('#lname', 'Seeker'); await pg.fill('#lpass', 'secret'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        await pg.click('#storyyes'); await pg.wait_for_timeout(400); await pg.click('#depart'); await pg.wait_for_timeout(1500)
        await pg.click('#ctabs button[data-tab="missions"]'); await pg.wait_for_timeout(300)
        print('missions tab:', (await pg.inner_text('#mlist'))[:160].replace('\n', ' | '))
        await pg.wait_for_timeout(2500); await pg.screenshot(path=OUT + 'v101_space.png')
        await pg.click('#mlist [data-plot]'); await pg.wait_for_timeout(600); await pg.screenshot(path=OUT + 'v101_map.png')
        print('route:', await pg.evaluate("G.route.join(' > ')"))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.click('#cbhelp'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'v101_controls.png')
        await pg.click('#ctrlkeys'); await pg.wait_for_timeout(300); print('options open at keys:', await pg.evaluate("!document.getElementById('opts').classList.contains('hidden')"))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.click('#cchan button[data-ch="sys"]'); await pg.keyboard.type('hello system'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500)
        print('chat log:', (await pg.inner_text('#chatlog'))[-80:].replace('\n', ' | '))
        print('\n'.join(errs[:10]) or 'no page errors'); await b.close()
asyncio.run(main())
async def planets():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.fill('#lname', 'Wayfarer'); await pg.fill('#lpass', 'secret'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        await pg.click('#depart'); await pg.wait_for_timeout(500)
        for k in ('KeyX', 'KeyX', 'KeyX'): await pg.keyboard.press(k)
        await pg.wait_for_timeout(4000); await pg.screenshot(path=OUT + 'v101_planets.png')
        await pg.wait_for_timeout(6000); await pg.screenshot(path=OUT + 'v101_planets2.png')
        print('planets:', errs or 'no page errors'); await b.close()
asyncio.run(planets())
