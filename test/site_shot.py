import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1]
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1700, 'height': 950})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:8090/'); await pg.evaluate("localStorage.setItem('rift.hud', '440')"); await pg.reload()
        await pg.fill('#lname', 'Builder'); await pg.fill('#lpass', 'secret'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT + 'r_site_landed.png')
        await pg.click('#depart'); await pg.wait_for_timeout(1500)
        await pg.keyboard.press('KeyX'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT + 'r_site_space.png')
        print(errs[:5]); await b.close()
asyncio.run(main())
