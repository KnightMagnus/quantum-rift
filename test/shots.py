"""Browser test: logs in, visits every landing tab, flies, fights, opens the map; saves screenshots. Needs the server on :8090."""
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8090/'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []
        pg.on('console', lambda m: errs.append(f'console {m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
        await pg.goto(URL); await pg.evaluate("localStorage.setItem('rift.seenIntro','1')"); await pg.wait_for_timeout(800)
        await pg.screenshot(path=OUT + 'r_login.png')
        await pg.fill('#lname', 'Shotty'); await pg.fill('#lpass', 'secret'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT + 'r_landed.png')
        for tab in ('overview', 'trade', 'yard', 'outfit', 'jobs'):
            el = await pg.query_selector(f'#ltabs button[data-lt="{tab}"]')
            if el: await el.click(); await pg.wait_for_timeout(400); await pg.screenshot(path=OUT + f'r_land_{tab}.png')
        await pg.click('#ltabs button[data-lt="community"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + 'r_land_community.png')
        await pg.click('#depart'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT + 'r_hub.png')
        await pg.keyboard.down('ArrowUp'); await pg.wait_for_timeout(1500); await pg.keyboard.up('ArrowUp')
        await pg.keyboard.press('Tab'); await pg.wait_for_timeout(300)
        await pg.keyboard.down('Space'); await pg.wait_for_timeout(700)
        await pg.screenshot(path=OUT + 'r_space.png'); await pg.keyboard.up('Space')
        await pg.click('#ctabs button[data-tab="codex"]'); await pg.wait_for_timeout(300)
        await pg.click('#clist .it >> nth=20'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT + 'r_codex.png')
        await pg.keyboard.press('KeyM'); await pg.wait_for_timeout(500); await pg.mouse.click(700, 300); await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT + 'r_map.png'); await pg.keyboard.press('KeyM')
        await pg.keyboard.press('KeyX'); await pg.keyboard.press('KeyX'); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT + 'r_space2.png')
        print('\n'.join(errs[:30]) or 'no console errors')
        await b.close()
asyncio.run(main())
