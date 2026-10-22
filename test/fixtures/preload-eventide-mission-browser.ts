// Isolated production-runtime instrumentation used only by its owning regression test.
import { Game } from '../../server/game.ts';
const spawn = Reflect.get(Game.prototype, 'spawnPlayer') as typeof Game.prototype.spawnPlayer,
  finish = Reflect.get(Game.prototype, 'finishJump') as typeof Game.prototype.finishJump;
Game.prototype.spawnPlayer = function (session, ...args) {
  spawn.call(this, session, ...args);
  if (session.data.name === 'Eventide Supply' && session.data.sys === 'lantern-twins') {
    session.ent!.x = 0;
    session.ent!.y = -2400;
    session.ent!.vx = session.ent!.vy = 0;
  }
};
Game.prototype.finishJump = function (entity, space) {
  const session = entity.player?.s;
  finish.call(this, entity, space);
  if (session?.data.name === 'Eventide Supply' && session.data.sys === 'aureole') {
    session.ent!.x = -540;
    session.ent!.y = 410;
    session.ent!.vx = session.ent!.vy = 0;
  }
};
