import filesystem from 'node:fs';
import virtualMachine from 'node:vm';
import assert from 'node:assert/strict';
import { LandingFeedback, landingRefusal } from '../client/landing-feedback.ts';
const feedback = new LandingFeedback();
feedback.situation('captain-a:sol:luna:far:fast:allowed');
for (let attempt = 0; attempt < 10; attempt++)
  assert.equal(feedback.notice('Landing started'), attempt === 0);
assert.equal(feedback.notice('Slow down to land.'), true);
assert.equal(feedback.notice('Slow down to land.'), false);
assert.equal(feedback.notice('Luna refuses you permission to land. Hail them (T) to talk.'), true);
feedback.situation('captain-a:sol:luna:near:slow:allowed');
assert.equal(feedback.notice('Slow down to land.'), true, 'Eligibility boundary rearms a notice');
feedback.situation('captain-b:sol:luna:near:slow:allowed');
assert.equal(
  feedback.notice('Slow down to land.'),
  true,
  'Another captain never inherits suppression',
);
feedback.reset();
assert.equal(feedback.notice('Slow down to land.'), true, 'Explicit cancellation permits retry');
for (const message of [
  'Slow down to land.',
  'Your ship is disabled.',
  'Too far from Luna to land.',
  'Luna refuses you permission to land. Hail them (T) to talk.',
  'Deliver or detach the motherlode before landing.',
  'Luna has nowhere to land.',
])
  assert.equal(landingRefusal(message), true, message);
for (const message of ['Trading complete.', 'Not enough credits.', 'Luna refuses your trade.'])
  assert.equal(
    landingRefusal(message),
    false,
    'Unrelated identical toasts remain outside landing suppression',
  );
console.log(
  'Landing situation, repeated attempts, changed reason/eligibility/captain, cancellation and scoped refusal recognition passed.',
);

// Exercise the actual message adapter: jump and land share a refusal string.
const mainSource = filesystem.readFileSync('client/main.ts', 'utf8');
const firstCase = mainSource.indexOf("    case 'toast':");
const lastCase = mainSource.indexOf("    case 'armadaContract':", firstCase);
const notices: string[] = [];
const routeFeedback = new LandingFeedback();
routeFeedback.situation('captain:sol:luna');
const routeState: { auto: { mode: string; sent: boolean } | null } = {
  auto: { mode: 'land', sent: true },
};
const context = virtualMachine.createContext({
  clientGameState: routeState,
  landingFeedback: routeFeedback,
  landingRefusal,
  setAuto: () => {
    routeState.auto = null;
  },
  toast: (message: string) => notices.push(message),
});
virtualMachine.runInContext(
  'function receiveToast(serverMessage) { switch (serverMessage.t) {' +
    mainSource.slice(firstCase, lastCase) +
    '} }',
  context,
);
const receive = () =>
  virtualMachine.runInContext(
    "receiveToast({ t: 'toast', msg: 'Your ship is disabled.' })",
    context,
  );
receive();
assert.equal(notices.length, 1, 'First actual pending landing refusal is shown');
receive();
receive();
assert.equal(
  notices.length,
  3,
  'Unrelated repeated jump refusals remain visible after a landing refusal',
);
routeState.auto = { mode: 'land', sent: true };
receive();
assert.equal(
  notices.length,
  3,
  'Another unchanged landing attempt suppresses only its own refusal',
);
routeFeedback.situation('captain:sol:another-port');
routeState.auto = { mode: 'land', sent: true };
receive();
assert.equal(notices.length, 4, 'Changed target rearms the production landing adapter');
