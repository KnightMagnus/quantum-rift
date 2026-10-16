// Player accounts and saves: one JSON file, written atomically. Passwords are scrypt-hashed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Persisted player account record and save file state.
 * @typedef {object} PlayerAccount
 * @property {string} name Captain display name.
 * @property {string} salt Cryptographic salt in hexadecimal.
 * @property {string} hash Scrypt password hash in hexadecimal.
 * @property {number} created Account creation timestamp in milliseconds.
 * @property {Record<string, any>} [key: string] Additional save properties and player progress fields.
 */

/**
 * Persisted galaxy world state data.
 * @typedef {object} WorldData
 * @property {Record<string, any>} sites World sites and player claim data.
 */

/**
 * Player account and world state persistence engine managing JSON files, atomic writes,
 * and rolling backups. Passwords are scrypt-hashed with unique salts.
 */
export class DB {
  /**
   * Initializes the database in the target directory and loads existing data from disk.
   * @param {string} dir Storage directory path for player and world database files.
   */
  constructor(dir) {
    /** @type {string} */
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    /** @type {string} */
    this.file = path.join(dir, 'players.json');
    /** @type {Record<string, PlayerAccount>} */
    this.players = Object.create(null); // 2.0.2: no prototype, so names like __proto__ can never reach object internals
    try {
      Object.assign(this.players, JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch {}
    /** @type {string} */
    this.wfile = path.join(dir, 'world.json');
    /** @type {WorldData} */
    this.world = { sites: {} };
    try {
      this.world = JSON.parse(fs.readFileSync(this.wfile, 'utf8'));
    } catch {}
    /** @type {boolean} */
    this.dirty = false;
    setInterval(() => this.flush(), 15000).unref();
    setInterval(() => this.backup(), 30 * 60000).unref();
    setTimeout(() => this.backup(), 60000).unref();
  }

  /**
   * Generates rolling timestamped backups of player and world database files, retaining the 12 most recent.
   * Backups are saved under data/backups/<timestamp>/players.json + world.json.
   * @returns {void}
   */
  backup() {
    try {
      if (!fs.existsSync(this.file)) return;
      const root = path.join(this.dir, 'backups'),
        stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19),
        dst = path.join(root, stamp);
      fs.mkdirSync(dst, { recursive: true });
      fs.copyFileSync(this.file, path.join(dst, 'players.json'));
      if (fs.existsSync(this.wfile)) fs.copyFileSync(this.wfile, path.join(dst, 'world.json'));
      const all = fs.readdirSync(root).sort();
      for (const old of all.slice(0, Math.max(0, all.length - 12)))
        fs.rmSync(path.join(root, old), { recursive: true, force: true });
    } catch (e) {
      console.error('backup failed', e.message);
    }
  }

  /**
   * Normalizes a captain name into a trimmed, lowercase account lookup key.
   * @param {string} name Captain name.
   * @returns {string} Lowercase normalized lookup key.
   */
  key(name) {
    return String(name).trim().toLowerCase();
  }

  /**
   * Retrieves an existing player account by captain name.
   * @param {string} name Captain name.
   * @returns {PlayerAccount | null} Player account record or null if not found.
   */
  get(name) {
    const k = this.key(name);
    return Object.prototype.hasOwnProperty.call(this.players, k) ? this.players[k] : null;
  }

  /**
   * Creates, persists, and returns a new player account with a hashed password and initial save data.
   * @param {string} name Captain name.
   * @param {string} pass Plaintext password.
   * @param {Record<string, any>} fresh Initial player state and save properties.
   * @returns {PlayerAccount} Newly created player account record.
   */
  create(name, pass, fresh) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pass, salt, 32).toString('hex');
    const p = { name: String(name).trim(), salt, hash, created: Date.now(), ...fresh };
    this.players[this.key(name)] = p;
    this.dirty = true;
    this.flush();
    return p;
  }

  /**
   * Verifies a plaintext password against a player's stored scrypt hash using timing-safe comparison.
   * @param {PlayerAccount} p Stored player account record.
   * @param {string} pass Plaintext password to verify.
   * @returns {boolean} True if the password matches the stored hash, false otherwise.
   */
  check(p, pass) {
    const h = crypto.scryptSync(pass, p.salt, 32);
    return crypto.timingSafeEqual(h, Buffer.from(p.hash, 'hex'));
  }

  /**
   * Marks the database as dirty to ensure changes are flushed on the next sync interval.
   * @returns {void}
   */
  touch() {
    this.dirty = true;
  }

  /**
   * Atomically flushes dirty in-memory player and world state to disk via temporary files.
   * @returns {void}
   */
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.players));
    fs.renameSync(tmp, this.file);
    fs.writeFileSync(this.wfile + '.tmp', JSON.stringify(this.world));
    fs.renameSync(this.wfile + '.tmp', this.wfile);
  }
}
