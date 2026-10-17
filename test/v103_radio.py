"""1.0.3 radio check with the station directory mocked: a click starts the stream in-game (no embed), the on-air panel shows the song,
and the mixer's Radio slider and mute change the stream's volume."""
import asyncio, sys, json
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8090/'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required']); pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        async def search(route): await route.fulfill(content_type='application/json', body=json.dumps({'results': {'stations': [{'id': 1469, 'name': 'Test FM', 'callLetters': 'KTST', 'description': 'Hits all day', 'imageUrl': ''}]}}))
        async def station(route): await route.fulfill(content_type='application/json', body=json.dumps({'name': 'Test FM', 'streams': {'secure_pls_stream': 'https://x/y.pls', 'shoutcast_stream': URL + 'assets/sounds/10100.wav'}}))
        async def meta(route): await route.fulfill(content_type='application/json', body=json.dumps({'artist': 'The Rifters', 'title': 'Escape Velocity'}))
        await pg.route('**/api/radio?q=*', search); await pg.route('**/api/radio/station*', station); await pg.route('**/api/radio/meta*', meta)
        await pg.goto(URL); await pg.fill('#lname', 'Listener'); await pg.fill('#lpass', 'test1234'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        await pg.click('#depart'); await pg.wait_for_timeout(800)
        await pg.click('#ctabs button[data-tab="radio"]'); await pg.fill('#rq', 'test'); await pg.click('#rgo'); await pg.wait_for_timeout(500)
        await pg.click('#rlist .it'); await pg.wait_for_timeout(2500)
        print('panel:', (await pg.inner_text('#rnow')).replace('\n', ' | '), '| iframe:', await pg.evaluate("!!document.querySelector('#rnow iframe')"))
        await pg.screenshot(path=OUT + 'v103_radio.png')
        await pg.evaluate("const r=document.getElementById('rvol'); r.value=0.3; r.dispatchEvent(new Event('input'))"); await pg.wait_for_timeout(100)
        print('opts.radio:', await pg.evaluate("G.opts.radio"), 'vol', await pg.evaluate("G.opts.vol"))
        await pg.keyboard.press('KeyO'); await pg.click('#opt-mute'); await pg.wait_for_timeout(100); print('muted:', await pg.evaluate("G.opts.mute")); await pg.click('#opt-mute'); await pg.keyboard.press('Escape')
        await pg.click('#rstop'); await pg.wait_for_timeout(200); print('after OFF:', (await pg.inner_text('#rnow')).replace('\n', ' | '))
        print('\n'.join(errs[:5]) or 'no page errors'); await b.close()
asyncio.run(main())
