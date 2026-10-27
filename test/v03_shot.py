"""0.3 browser test: first-login guide, click-to-target, KNIGHT's Concordance firing (coloured shots), tutorial panel. Server on :8090 with the KNIGHT seed."""
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
JS_SCREEN = """(id) => { const e = G.ents.get(id); const r = window.devicePixelRatio||1; const c = document.getElementById('view').getBoundingClientRect();
  const cam = window.__cam; return [ (e.rx - cam.cx) * cam.z / r + c.left + cam.W / 2 / r, (e.ry - cam.cy) * cam.z / r + c.top + cam.H / 2 / r ]; }"""
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
        await pg.goto('http://127.0.0.1:8090/'); await pg.fill('#lname', 'KNIGHT'); await pg.fill('#lpass', '1234'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        await pg.click('#optbtn'); await pg.wait_for_timeout(200); await pg.screenshot(path=OUT + 'v03_options.png'); await pg.click('#optclose'); await pg.wait_for_timeout(200)
        await pg.click('#depart'); await pg.wait_for_timeout(1500)
        await pg.evaluate("import('/client/render.js').catch(()=>null)")
        # expose the camera for picking
        await pg.evaluate("import('./render.js').then(m => window.__cam = m.cam)")
        await pg.wait_for_timeout(300)
        tid = 0
        for i in range(30):
            ids = await pg.evaluate("[...G.ents.values()].filter(e => e.id !== G.myId).sort((a,b)=>Math.hypot(a.rx-G.view.rx,a.ry-G.view.ry)-Math.hypot(b.rx-G.view.rx,b.ry-G.view.ry)).map(e=>e.id)")
            for cand in ids[:3]:
                x, y = await pg.evaluate(JS_SCREEN, cand)
                if 0 < x < 1240 and 0 < y < 900:
                    await pg.mouse.move(x, y); await pg.wait_for_timeout(80); await pg.mouse.click(x, y); await pg.wait_for_timeout(200)
                    t = await pg.evaluate('G.target')
                    if t == cand: tid = cand; break
            if tid: break
            await pg.keyboard.down('KeyD'); await pg.wait_for_timeout(250); await pg.keyboard.up('KeyD')
            await pg.keyboard.down('ArrowUp'); await pg.wait_for_timeout(300); await pg.keyboard.up('ArrowUp')
        print('click-targeted ship:', tid, 'cursor class:', await pg.evaluate("document.getElementById('view').className"))
        best = 0
        await pg.keyboard.down('Space')
        for i in range(30):
            await pg.wait_for_timeout(250)
            n = await pg.evaluate('G.shots.length')
            if n > best: best = n; await pg.screenshot(path=OUT + 'v03_fire.png')
            if n > 25: break
        cols = await pg.evaluate("import('/shared/rules.js').then(R => [...new Set(G.shots.map(s => R.weaponColor(G.A.weapons[s.w]) + ':' + R.weaponLook(G.A.weapons[s.w])))])")
        await pg.keyboard.up('Space')
        await pg.wait_for_timeout(800); await pg.screenshot(path=OUT + 'v03_after.png')
        print('shots on screen', best, 'colours/looks', cols)
        print('\n'.join(errs[:10]) or 'no page errors'); await b.close()
asyncio.run(main())
