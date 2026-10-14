"""1.1 browser check: rival captains in space with gold name tags, hailing one (T), the ship and captain panel (I),
fleet order keys, full stop (Q), and multi-jump autopilot. Before starting the server, place rivals r7 and r21 in qgate
in DATA_DIR/world.json (see test notes in README)."""
import asyncio, sys, time
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8090/'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(URL); await pg.fill('#lname', 'Hailer'); await pg.fill('#lpass', 'test1234'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        print('news on overview:', await pg.evaluate("document.querySelectorAll('.newsit').length"))
        await pg.click('#depart'); await pg.wait_for_timeout(3000)
        rid = await pg.evaluate("(()=>{for(const e of G.ents.values()) if(e.fl & 64) return e.id; return 0})()")
        print('rival in system:', bool(rid), await pg.evaluate(f"(G.ents.get({rid})||{{}}).name"))
        await pg.evaluate(f"G.target={rid}"); await pg.keyboard.press('KeyT'); await pg.wait_for_timeout(600)
        print('hail:', (await pg.inner_text('#hailbox')).replace('\n', ' | ')[:220])
        await pg.screenshot(path=OUT + 'v11_hail.png')
        await pg.click('#hailopts button[data-k="praise"]'); await pg.wait_for_timeout(500); print('after praise:', (await pg.inner_text('#hailtext'))[:80])
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.keyboard.press('KeyI'); await pg.wait_for_timeout(800); await pg.screenshot(path=OUT + 'v11_info_ship.png')
        await pg.click('#itabs [data-it="captains"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'v11_info_captains.png')
        print('captains listed:', await pg.evaluate("document.querySelectorAll('#infobody tr').length - 1"))
        await pg.keyboard.press('KeyI'); await pg.wait_for_timeout(200)
        await pg.keyboard.press('KeyH'); await pg.wait_for_timeout(300); print('order:', await pg.evaluate("G.order"))
        await pg.keyboard.press('KeyH'); await pg.wait_for_timeout(300); print('order again:', await pg.evaluate("G.order"))
        await pg.keyboard.down('KeyW'); await pg.wait_for_timeout(2000); await pg.keyboard.up('KeyW')
        await pg.keyboard.press('KeyQ'); await pg.wait_for_timeout(6000); print('speed after full stop:', round(await pg.evaluate("Math.hypot(G.view.vx,G.view.vy)")))
        # multi-jump: a two-jump route
        await pg.evaluate("import('/shared/galaxy.js').then(g=>{const a=g.SYS[G.sys].links[0]; const b=g.SYS[a].links.find(l=>l!==G.sys); G.route=[a,b]})"); await pg.wait_for_timeout(200)
        dest = await pg.evaluate("G.route[1]"); await pg.keyboard.press('KeyJ'); t0 = time.time()
        while time.time() - t0 < 70 and await pg.evaluate("G.sys") != dest: await pg.wait_for_timeout(1000)
        print('multi-jump reached', dest, ':', await pg.evaluate("G.sys") == dest, round(time.time() - t0), 's')
        print('\n'.join(errs[:10]) or 'no page errors'); await b.close()
asyncio.run(main())
