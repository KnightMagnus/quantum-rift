"""0.9 browser check (fresh DATA_DIR, SEEDS_FILE=test/seeds_knight.json): KNIGHT starts a Station Holdout from the Defense section, fights in
space (target box shows level and odds), and the OPS tab shows directives and the weekly calendar."""
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8090/'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(URL); await pg.fill('#lname', 'KNIGHT'); await pg.fill('#lpass', '1234'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        await pg.click('#ltabs button[data-lt="station"]'); await pg.click('#landbody [data-act="stab"][data-k="defense"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + 'v09_defense.png')
        await pg.click('#landbody [data-act="holdout"]'); await pg.wait_for_timeout(9000)
        await pg.keyboard.press('KeyR'); await pg.wait_for_timeout(300); await pg.keyboard.down('Space'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT + 'v09_holdout.png'); await pg.keyboard.up('Space')
        await pg.click('#ctabs button[data-tab="ops"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'v09_ops.png')
        print('holdout:', await pg.evaluate("JSON.stringify(G.you.holdout)"), 'target lv text:', await pg.evaluate("document.getElementById('tg-dist').textContent"))
        print('\\n'.join(errs[:10]) or 'no page errors'); await b.close()
asyncio.run(main())
