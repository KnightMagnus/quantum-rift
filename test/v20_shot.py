"""2.0 browser check: HUD numbers and speed, edge arrows for target/nav/mission objectives, damage vignette, styled toasts,
credits floater, landing tab hotkeys and remembered tabs."""
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8090/'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(URL); await pg.fill('#lname', 'Polish'); await pg.fill('#lpass', 'test1234'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        await pg.keyboard.press('Digit3'); await pg.wait_for_timeout(300); print('key 3 tab:', await pg.evaluate("G.ltab"))
        await pg.click('#landbody [data-act="trade"][data-c="food"]:has-text("MAX")'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT + 'v20_floater.png')
        await pg.keyboard.press('KeyL'); await pg.wait_for_timeout(1500)
        await pg.keyboard.down('KeyW'); await pg.wait_for_timeout(2500); await pg.keyboard.up('KeyW')
        far = await pg.evaluate("(()=>{let best=0,bd=0;for(const e of G.ents.values()){if(e.id===G.myId)continue;const d=Math.hypot(e.rx-G.view.x,e.ry-G.view.y);if(d>bd){bd=d;best=e.id}}return best})()")
        await pg.evaluate(f"G.target={far}"); await pg.evaluate("G.navStellar='qstation'")
        await pg.evaluate("G._hurtT=performance.now()"); await pg.wait_for_timeout(120)
        await pg.screenshot(path=OUT + 'v20_space.png')
        print('speed readout:', await pg.inner_text('#spd'), '| shield text:', await pg.inner_text('#v-sh'))
        await pg.keyboard.press('KeyL'); await pg.wait_for_timeout(12000)
        print('landed:', await pg.evaluate("!!G.landed"), '| remembered tab:', await pg.evaluate("G.ltab"))
        print('\n'.join(errs[:10]) or 'no page errors'); await b.close()
asyncio.run(main())
