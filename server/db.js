// Player accounts and saves: one JSON file, written atomically. Passwords are scrypt-hashed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class DB {
  constructor(dir) {
    this.dir = dir; fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'players.json');
    this.players = Object.create(null);   // 2.0.2: no prototype, so names like __proto__ can never reach object internals
    try { Object.assign(this.players, JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch {}
    this.wfile = path.join(dir, 'world.json'); this.world = { sites: {} };
    try { this.world = JSON.parse(fs.readFileSync(this.wfile, 'utf8')); } catch {}
    this.dirty = false;
    setInterval(() => this.flush(), 15000).unref();
    setInterval(() => this.backup(), 30 * 60000).unref(); setTimeout(() => this.backup(), 60000).unref();
  }
  // rolling backups: data/backups/<time>/players.json + world.json, the newest 12 kept
  backup() {
    try {
      if (!fs.existsSync(this.file)) return;
      const root = path.join(this.dir, 'backups'), stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19), dst = path.join(root, stamp);
      fs.mkdirSync(dst, { recursive: true }); fs.copyFileSync(this.file, path.join(dst, 'players.json')); if (fs.existsSync(this.wfile)) fs.copyFileSync(this.wfile, path.join(dst, 'world.json'));
      const all = fs.readdirSync(root).sort(); for (const old of all.slice(0, Math.max(0, all.length - 12))) fs.rmSync(path.join(root, old), { recursive: true, force: true });
    } catch (e) { console.error('backup failed', e.message); }
  }
  key(name) { return String(name).trim().toLowerCase(); }
  get(name) { const k = this.key(name); return Object.prototype.hasOwnProperty.call(this.players, k) ? this.players[k] : null; }
  create(name, pass, fresh) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pass, salt, 32).toString('hex');
    const p = { name: String(name).trim(), salt, hash, created: Date.now(), ...fresh };
    this.players[this.key(name)] = p; this.dirty = true; this.flush(); return p;
  }
  check(p, pass) {
    const h = crypto.scryptSync(pass, p.salt, 32);
    return crypto.timingSafeEqual(h, Buffer.from(p.hash, 'hex'));
  }
  touch() { this.dirty = true; }
  flush() {
    if (!this.dirty) return; this.dirty = false;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.players)); fs.renameSync(tmp, this.file);
    fs.writeFileSync(this.wfile + '.tmp', JSON.stringify(this.world)); fs.renameSync(this.wfile + '.tmp', this.wfile);
  }
}
