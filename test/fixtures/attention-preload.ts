import fileSystem from 'node:fs';
import { Space } from '../../server/space.ts';
import type { Entity } from '../../server/space.ts';
const control = process.env.RIFT_ATTENTION_CONTROL;
if (!control) throw Error('Attention fixture requires its private control file');
// oxlint-disable-next-line typescript/unbound-method -- Retain production tick with explicit receiver.
const originalTick = Space.prototype.tick;
Space.prototype.tick = function () {
  originalTick.call(this);
  const state: { targeted?: boolean; scanned?: boolean; disconnect?: boolean } = JSON.parse(
    fileSystem.readFileSync(control, 'utf8'),
  );
  const recipient = [...this.ships.values()].find(
    (entity) => entity.player?.name === 'Mining Alpha',
  );
  if (!recipient?.player?.s) return;
  const identifier = 990001;
  this.ships.delete(identifier);
  if (state.targeted) {
    const source: Entity = {
      ...recipient,
      id: identifier,
      player: null,
      owner: null,
      name: 'Attention fixture',
      guns: [],
      target: null,
      fireAt: recipient,
      dead: false,
      state: 'fly',
    };
    this.ships.set(identifier, source);
  }
  const session = recipient.player.s;
  if (state.disconnect) {
    session.sock.close();
    return;
  }
  if (!state.scanned) delete session.attentionScan;
  if (state.scanned && !session.attentionScan)
    session.attentionScan = { system: this.id, entity: recipient.id, until: Date.now() + 3000 };
};
