"""1.2 browser check (SEEDS_FILE=test/seeds_test12.json, fresh DATA_DIR): the black market at an outlaw world, a faction
arc pop-up at the Korrund capital, KNIGHT's crew tab with ranks, promotion and the lower deck, the bank, and map views."""
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8090/'
async def session(pw, name, pw_):
    b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    await pg.goto(URL); await pg.fill('#lname', name); await pg.fill('#lpass', pw_); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
    return b, pg, errs
async def main():
    async with async_playwright() as pw:
        b, pg, errs = await session(pw, 'Shady', 'secret')
        await pg.click('#ltabs button[data-lt="blackmarket"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'v12_blackmarket.png')
        await pg.click('#landbody [data-act="bm"][data-id="shard"]'); await pg.wait_for_timeout(500); print('commendations after buying one:', await pg.evaluate("G.you.shards"))
        print('Shady:', errs or 'no page errors'); await b.close()
        b, pg, errs = await session(pw, 'Envoy', 'secret')
        print('arc pop-up:', await pg.evaluate("!document.getElementById('storybox').classList.contains('hidden')"), (await pg.inner_text('#storybox'))[:120].replace('\n', ' | '))
        await pg.screenshot(path=OUT + 'v12_arc.png'); await pg.click('#storyyes'); await pg.wait_for_timeout(500)
        await pg.click('#ctabs button[data-tab="missions"]'); await pg.wait_for_timeout(300); print('missions:', (await pg.inner_text('#mlist'))[:140].replace('\n', ' | '))
        tabs = await pg.evaluate("[...document.querySelectorAll('#ltabs button')].map(b=>b.dataset.lt).join(',')"); print('tabs at the Korrund capital:', tabs)
        if 'bank' in tabs:
            await pg.click('#ltabs button[data-lt="bank"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'v12_bank.png')
            await pg.click('#landbody [data-act="bank"][data-op="borrow"]'); await pg.wait_for_timeout(400); print('loan:', await pg.evaluate("JSON.stringify(G.you.loan)"))
        print('Envoy:', errs or 'no page errors'); await b.close()
        b, pg, errs = await session(pw, 'KNIGHT', '1234')
        await pg.click('#ltabs button[data-lt="crew"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'v12_crew.png', full_page=False)
        btn = await pg.query_selector('#landbody [data-act="promote"]:not([disabled])')
        if btn: await btn.click(); await pg.wait_for_timeout(500)
        print('ranks:', await pg.evaluate("G.you.officers.map(o=>o.rank||0).join(',')"))
        await pg.evaluate("document.getElementById('landbody').scrollTop=99999"); await pg.wait_for_timeout(200); await pg.screenshot(path=OUT + 'v12_lower.png')
        await pg.keyboard.press('KeyM'); await pg.wait_for_timeout(500); await pg.click('#gmodes [data-mm="trade"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'v12_map_trade.png')
        await pg.click('#gmodes [data-mm="services"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT + 'v12_map_services.png')
        print('KNIGHT:', errs or 'no page errors'); await b.close()
asyncio.run(main())
