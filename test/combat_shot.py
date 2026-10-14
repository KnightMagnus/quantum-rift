import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1]
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:8090/'); await pg.fill('#lname', 'Raider'); await pg.fill('#lpass', 'secret'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        await pg.click('#depart'); await pg.wait_for_timeout(800)
        best = 0
        for i in range(40):
            await pg.keyboard.press('KeyR'); await pg.keyboard.down('Space'); await pg.keyboard.down('KeyF')
            await pg.wait_for_timeout(500)
            n = await pg.evaluate('G.shots.length + G.beams.length*3')
            if n > best:
                best = n; await pg.screenshot(path=OUT + 'r_combat.png')
            if n > 12: break
        await pg.keyboard.up('Space'); await pg.keyboard.up('KeyF')
        await pg.click('#ctabs button[data-tab="station"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'r_combat2.png')
        print('best', best, errs[:5]); await b.close()
asyncio.run(main())
