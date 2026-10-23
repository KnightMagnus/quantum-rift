import assert from 'node:assert/strict';
import { attentionPayload } from '../server/attention.ts';
import { mockEntity, mockSpace, mockSession, mockPlayerReference } from './helpers/mocks.ts';
const recipient = mockEntity({ id: 1, dead: false, state: 'fly' });
const source = mockEntity({ id: 2, dead: false, state: 'fly', player: null, fireAt: recipient });
const space = mockSpace({
  id: 'meridian',
  ships: new Map([
    [1, recipient],
    [2, source],
  ]),
  isHostile: () => true,
});
const session = mockSession({ ent: recipient, data: { sys: 'meridian', stellar: null } });
const read = () => attentionPayload(session, space, 1000);
assert.deepEqual(read(), { targeted: true, scanned: false });
source.fireAt = null;
assert.equal(read().targeted, false, 'NPC target cancellation clears');
source.target = recipient;
assert.equal(read().targeted, false, 'Unprocessed NPC AI selection is not current weapon intent');
source.player = mockPlayerReference({});
assert.equal(read().targeted, true, 'Hostile manual selection');
space.isHostile = () => false;
assert.equal(read().targeted, false, 'Friendly selection alone is not combat');
source.inp = { fire1: 1 };
assert.equal(read().targeted, true, 'Actual manual fire intent');
source.inp = {};
source.autoCombat = true;
source.combatTarget = recipient;
assert.equal(read().targeted, true, 'Automated actual target is authoritative');
source.disabled = true;
assert.equal(read().targeted, false, 'Disabled source cannot sustain a combat alert');
source.disabled = false;
source.dead = true;
assert.equal(read().targeted, false, 'Source death clears');
source.dead = false;
source.state = 'jumpout';
assert.equal(read().targeted, false, 'Source system departure clears');
source.state = 'fly';
space.ships.delete(source.id);
assert.equal(read().targeted, false, 'Removed source clears');
space.ships.set(source.id, source);
recipient.dead = true;
assert.equal(read().targeted, false, 'Recipient death clears');
recipient.dead = false;
session.data.stellar = 'meridian-yards';
assert.deepEqual(read(), { targeted: false, scanned: false });
session.data.stellar = null;
session.attentionScan = { system: 'meridian', entity: 1, until: 4000 };
assert.deepEqual(
  read(),
  { targeted: true, scanned: true },
  'Both facts retained; presentation gives combat precedence',
);
assert.equal(attentionPayload(session, space, 4000).scanned, false, 'Recent scan expires exactly');
session.attentionScan.system = 'other';
assert.equal(read().scanned, false, 'No scan crosses systems');
session.attentionScan.system = 'meridian';
session.attentionScan.entity = 99;
assert.equal(read().scanned, false, 'No scan crosses respawn entities');
assert.deepEqual(
  Object.keys(read()).sort(),
  ['scanned', 'targeted'],
  'No source/target identities in private projection',
);
console.log(
  'Authoritative attention: selection, cancellation, death, departure, scan expiry, privacy passed.',
);
