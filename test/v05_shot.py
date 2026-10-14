"""0.5 browser check: KNIGHT's fully upgraded station (research trees, materials), the hangar (shuttles, job board,
drydock), the crew screen, and a shuttle launch seen in space. Start the server with a fresh DATA_DIR (SEEDS_FILE=test/seeds_knight.json)."""
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
        await pg.click('#ltabs button[data-lt="crew"]'); await pg.wait_for_timeout(400); await pg.screenshot(path=OUT + 'v05_crew.png')
        await pg.click('#ltabs button[data-lt="station"]'); await pg.wait_for_timeout(300)
        await pg.click('#landbody [data-act="stab"][data-k="research"]'); await pg.click('#landbody [data-act="rtree"][data-t="Shuttles"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + 'v05_research.png')
        await pg.click('#landbody [data-act="stab"][data-k="hangar"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'v05_hangar.png')
        btn = await pg.query_selector('#landbody [data-act="sh"][data-op="send"]')
        if btn: await btn.click(); await pg.wait_for_timeout(500)
        out = await pg.evaluate("G.you.shuttles.filter(s=>s.state==='out').length")
        print('shuttles out:', out)
        await pg.screenshot(path=OUT + 'v05_launched.png')
        await pg.click('#depart'); await pg.wait_for_timeout(600)
        await pg.click('#ltabs button[data-lt="hangar"]') if False else None
        btn = await pg.evaluate("""(() => { const sh = G.you.shuttles.find(s => s.state==='idle'); const j = G.you.board[0]; return sh && j ? [sh.id, j.id] : null; })()""")
        if btn: await pg.evaluate(f"window.__send && 0"); 
        await pg.wait_for_timeout(1500); await pg.screenshot(path=OUT + 'v05_space.png')
        print('\n'.join(errs[:10]) or 'no page errors'); await b.close()
asyncio.run(main())
