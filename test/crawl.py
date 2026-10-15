"""2.0.2 UI crawler: logs in captains landed at many kinds of world (hub, shipyard planet, outlaw world, Farside, moon,
station, a capital, Earth, and KNIGHT's maxed Personal Station), clicks every landing tab, every station section, every
companion tab, and opens every overlay and map view. Fails on page errors and on content spilling out of its frame.
Start the server with SEEDS_FILE=test/seeds_crawl.json and a fresh DATA_DIR."""
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8090/'
WHO = [('KNIGHT', '1234'), ('CrawlHub', 'secret'), ('CrawlYard', 'secret'), ('CrawlOutlaw', 'secret'), ('CrawlFar', 'secret'), ('CrawlMoon', 'secret'), ('CrawlStation', 'secret'), ('CrawlCap', 'secret'), ('CrawlEarth', 'secret')]
SPILL = """(()=>{const out=[];for(const box of document.querySelectorAll('.landbox,.gbox,.loginbox')){if(!box.offsetParent)continue;const b=box.getBoundingClientRect();
  for(const e of box.querySelectorAll('*')){if(!e.offsetParent||e.closest('.landbody,.infobody,#mlist,.tbl,#gresults'))continue;const r=e.getBoundingClientRect();if(r.width&&(r.right>b.right+2||r.left<b.left-2)&&getComputedStyle(e).position!=='fixed')out.push((e.id||e.className||e.tagName)+'@'+Math.round(r.right-b.right))}}
  for(const body of document.querySelectorAll('.landbody')){if(!body.offsetParent)continue;if(body.scrollWidth>body.clientWidth+4)out.push('landbody horizontal scroll '+(body.scrollWidth-body.clientWidth))}
  return out.slice(0,6)})()"""
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); problems = []
        for who, pwd in WHO:
            pg = await b.new_page(viewport={'width': 1366, 'height': 768}); errs = []
            pg.on('pageerror', lambda e, w=who: errs.append(f'{w}: {e}')); pg.on('console', lambda m, w=who: errs.append(f'{w}: {m.text}') if m.type == 'error' else None)
            pg.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
            await pg.goto(URL); await pg.fill('#lname', who); await pg.fill('#lpass', pwd); await pg.click('#lbtn'); await pg.wait_for_timeout(2200)
            if await pg.evaluate("!document.getElementById('storybox').classList.contains('hidden')"): await pg.click('#storybox button'); await pg.wait_for_timeout(200)
            tabs = await pg.evaluate("[...document.querySelectorAll('#ltabs button')].map(b=>b.dataset.lt)")
            for t in tabs:
                await pg.click(f'#ltabs button[data-lt="{t}"]'); await pg.wait_for_timeout(250)
                sp = await pg.evaluate(SPILL)
                if sp: problems.append(f'{who}/{t}: spill {sp}')
                if t == 'station':
                    for k in await pg.evaluate("[...document.querySelectorAll('#landbody [data-act=stab]')].map(b=>b.dataset.k)"):
                        await pg.click(f'#landbody [data-act="stab"][data-k="{k}"]'); await pg.wait_for_timeout(200); sp = await pg.evaluate(SPILL)
                        if sp: problems.append(f'{who}/station/{k}: spill {sp}')
                if t == 'yard':   # click through a few ships
                    n = min(4, await pg.locator('#landbody .card[data-act="sel"]').count())
                    for i in range(n): await pg.locator('#landbody .card[data-act="sel"]').nth(i).click(); await pg.wait_for_timeout(120)
            await pg.screenshot(path=OUT + f'crawl_{who}.png')
            if await pg.query_selector('#storesbtn'):
                await pg.click('#storesbtn'); await pg.wait_for_timeout(250)
                n = min(3, await pg.locator('#storebox [data-act="sfac"]').count())
                for i in range(n): await pg.locator('#storebox [data-act="sfac"]').nth(i).click(); await pg.wait_for_timeout(120)
                await pg.keyboard.press('Escape')
            for t in ['radio', 'codex', 'missions', 'station', 'ops', 'captains', 'log']:
                await pg.click(f'#ctabs button[data-tab="{t}"]'); await pg.wait_for_timeout(150)
                if t == 'captains':   # 2.6: every ALLIES sub-tab
                    for cs in ['friends', 'dm', 'armada', 'trade']: await pg.click(f'#capview [data-cs="{cs}"]'); await pg.wait_for_timeout(120)
            if who in ('CrawlHub', 'KNIGHT'):
                await pg.click('#cbmap'); await pg.wait_for_timeout(300)
                for m in ['trade', 'services', 'standing', 'danger', 'factions']: await pg.click(f'#gmodes [data-mm="{m}"]'); await pg.wait_for_timeout(150)
                await pg.keyboard.press('Escape'); await pg.click('#cbhelp'); await pg.wait_for_timeout(200); await pg.keyboard.press('Escape')
                await pg.click('#optbtn'); await pg.wait_for_timeout(200); await pg.keyboard.press('Escape')
                await pg.click('#depart'); await pg.wait_for_timeout(900); await pg.keyboard.press('KeyI'); await pg.wait_for_timeout(400)
                for t in ['ship', 'fleet', 'captains']: await pg.click(f'#itabs [data-it="{t}"]'); await pg.wait_for_timeout(200)
                await pg.keyboard.press('KeyI'); await pg.keyboard.press('KeyR'); await pg.wait_for_timeout(200); await pg.keyboard.press('KeyT'); await pg.wait_for_timeout(400); await pg.keyboard.press('Escape')
            problems += errs; await pg.close()
        print('\n'.join(problems) or 'CRAWL CLEAN'); await b.close()
asyncio.run(main())
