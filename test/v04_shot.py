"""0.4 browser check: the 200-system map (zoomed, whole galaxy, search) and an asteroid field with mining. Start the server with
a fresh DATA_DIR and SEEDS_FILE=test/seeds_test.json (creates 'Prospector' at Longhaul with a Mining Laser)."""
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:8090/'); await pg.evaluate("localStorage.setItem('rift.seenIntro','1')")
        await pg.fill('#lname', 'Prospector'); await pg.fill('#lpass', 'secret'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        await pg.click('#depart'); await pg.wait_for_timeout(1200)
        await pg.keyboard.press('KeyM'); await pg.wait_for_timeout(500); await pg.screenshot(path=OUT + 'v04_map.png')
        await pg.click('#gfit'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'v04_map_all.png')
        await pg.fill('#gsearch', 'abyss'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'v04_search.png')
        await pg.keyboard.press('Escape'); await pg.keyboard.press('KeyM'); await pg.wait_for_timeout(300)
        # fly to the nearest rock, point at it and fire
        for i in range(400):
            st = await pg.evaluate("""(() => { const v = G.view; const k = (G.rocks||[]).filter(k=>k.hp).sort((a,b)=>Math.hypot(a.x-v.x,a.y-v.y)-Math.hypot(b.x-v.x,b.y-v.y))[0]; if (!k) return null;
                const W = (x) => Math.atan2(Math.sin(x), Math.cos(x)); const want = Math.atan2(k.x - v.x, -(k.y - v.y)), va = Math.atan2(v.vx, -v.vy), sp = Math.hypot(v.vx, v.vy);
                const retro = W(va + Math.PI - v.a);
                return [Math.hypot(k.x-v.x,k.y-v.y), W(want - v.a), sp, W(want - va), retro]; })()""")
            if not st: break
            dist, da, sp, off, retro = st
            for k in ('ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'ArrowDown'): await pg.keyboard.up(k)
            brake = sp > 30 and (abs(off) > 0.5 or dist < 260 or sp > 140)
            if brake:   # face against travel and thrust to bleed off speed
                await pg.keyboard.down('ArrowDown')
                if abs(retro) < 0.3: await pg.keyboard.down('ArrowUp')
            else:
                if abs(da) > 0.08: await pg.keyboard.down('ArrowRight' if da > 0 else 'ArrowLeft')
                if dist > 260 and abs(da) < 0.3: await pg.keyboard.down('ArrowUp')
                if dist < 320 and abs(da) < 0.2: await pg.keyboard.down('Space')
            await pg.wait_for_timeout(100)
            if i == 150: await pg.screenshot(path=OUT + 'v04_mining.png')
            cargo = await pg.evaluate("(G.you.cargo.ore||0)+(G.you.cargo.gas||0)+(G.you.cargo.shards||0)")
            if cargo >= 4: break
        await pg.screenshot(path=OUT + 'v04_mining2.png')
        print('mined', await pg.evaluate("JSON.stringify(G.you.cargo)"))
        print('\n'.join(errs[:10]) or 'no page errors'); await b.close()
asyncio.run(main())
