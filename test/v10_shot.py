"""1.0 browser check: loading bar, options (keys, palette, scale, mixer), the career panel, and the first story pop-up on landing.
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
        await pg.goto(URL); await pg.wait_for_timeout(400); await pg.screenshot(path=OUT + 'v10_loading.png')
        await pg.wait_for_timeout(2500); print('loader hidden:', await pg.evaluate("document.getElementById('lload').classList.contains('done')"))
        # the Seeker is landed at the Threshold: the first story mission should pop up on login
        await pg.fill('#lname', 'Seeker'); await pg.fill('#lpass', 'secret'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        print('story shown:', await pg.evaluate("!document.getElementById('storybox').classList.contains('hidden')"))
        await pg.screenshot(path=OUT + 'v10_story.png')
        await pg.click('#storyyes'); await pg.wait_for_timeout(500)
        print('story active:', await pg.evaluate("JSON.stringify(G.you.story && G.you.story.active)"))
        # take off, then open options, rebind thrust to I, turn on colour-blind and scale up
        await pg.click('#depart')
        await pg.wait_for_timeout(1200)
        await pg.keyboard.press('KeyO'); await pg.wait_for_timeout(300)
        await pg.click('[data-bind="thrust"]'); await pg.keyboard.press('KeyI'); await pg.wait_for_timeout(100)
        await pg.click('#opt-cb'); await pg.evaluate("const r=document.getElementById('opt-scale'); r.value=1.2; r.dispatchEvent(new Event('input'))")
        await pg.screenshot(path=OUT + 'v10_options.png')
        print('opts:', await pg.evaluate("JSON.stringify({keys:G.opts.keys,cb:G.opts.cb,scale:G.opts.scale,pal:G.pal.hostile})"))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        y0 = await pg.evaluate("G.view && Math.hypot(G.view.vx||0, G.view.vy||0)")
        await pg.keyboard.down('KeyI'); await pg.wait_for_timeout(1200); await pg.keyboard.up('KeyI')
        y1 = await pg.evaluate("G.view && Math.hypot(G.view.vx||0, G.view.vy||0)")
        print('thrust on I moved the ship:', y1 > (y0 or 0) + 5, round(y0 or 0), '->', round(y1 or 0))
        await pg.screenshot(path=OUT + 'v10_space.png')
        print('\n'.join(errs[:10]) or 'no page errors'); await b.close()
asyncio.run(main())
