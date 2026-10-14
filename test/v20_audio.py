"""2.0 audio check: the login theme starts on the first interaction and fades out on entering, interface sounds and
ambience load without errors, ambience switches between station and space, and the mixer has every bus."""
import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8090/'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required']); pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        bad = []; pg.on('response', lambda r: bad.append(r.url) if r.status >= 400 and '/assets/' in r.url else None)
        await pg.goto(URL); await pg.wait_for_timeout(500)
        await pg.click('#lname'); await pg.wait_for_timeout(2500)
        print('login:', await pg.evaluate('JSON.stringify(RiftAudio.debug())'))
        await pg.fill('#lname', 'Listener2'); await pg.fill('#lpass', 'test1234'); await pg.click('#lbtn'); await pg.wait_for_timeout(2500)
        await pg.click('#ltabs button[data-lt="trade"]'); await pg.wait_for_timeout(200)
        await pg.click('#depart'); await pg.wait_for_timeout(2500)
        print('in space:', await pg.evaluate('JSON.stringify(RiftAudio.debug())'))
        await pg.keyboard.down('KeyW'); await pg.wait_for_timeout(800); await pg.keyboard.up('KeyW')
        await pg.keyboard.press('KeyO'); await pg.wait_for_timeout(300)
        print('mixer sliders:', await pg.evaluate("['opt-vol','opt-sfx','opt-ui','opt-amb','opt-music','opt-radio'].every(id=>!!document.getElementById(id))"))
        await pg.keyboard.press('Escape'); await pg.keyboard.press('KeyL'); await pg.wait_for_timeout(9000)
        print('landed again:', await pg.evaluate("!!G.landed"), await pg.evaluate('JSON.stringify(RiftAudio.debug())'))
        print('missing assets:', bad or 'none'); print('\n'.join(errs[:10]) or 'no page errors'); await b.close()
asyncio.run(main())
