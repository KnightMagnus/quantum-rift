// Player accounts and saves: one JSON file, written atomically. Passwords are scrypt-hashed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Persisted player account record and save file state.
 * @typedef {object} AccountCredentials
 * @property {string} name Captain display name.
 * @property {string} salt Cryptographic salt in hexadecimal.
 * @property {string} hash Scrypt password hash in hexadecimal.
 * @property {number} created Account creation timestamp in milliseconds.
 * @property {import('./game.js').PlayerData} [data] Associated player save state data.
 */

/** @typedef {import("./game.js").PlayerData & AccountCredentials} PlayerAccount */

/**
 * Persisted galaxy world state data.
 * @typedef {object} WorldData
 * @property {import("./industrial-contracts.js").IndustrialWorld} [industrial]
 * @property {Record<string, string>} sites World sites and player claim data.
 * @property {import("./mining-contracts.js").SavedMiningWorld} [mining]
 * @property {import("./refinery-contracts.js").SavedRefinery} [refinery]
 * @property {import("./mining-pressure-contracts.js").SavedMiningPressure} [miningPressure]
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
    this.wfile = path.join(dir, 'world.json');
    this.journal = path.join(dir, 'checkpoint.json');
    // Complete a committed checkpoint before exposing either half to Game.
    if (fs.existsSync(this.journal)) {
      const saved = JSON.parse(fs.readFileSync(this.journal, 'utf8'));
      if (
        saved.version !== 1 ||
        typeof saved.players !== 'string' ||
        typeof saved.world !== 'string'
      )
        throw new Error('Invalid committed database checkpoint');
      JSON.parse(saved.players);
      JSON.parse(saved.world);
      this.writeDurable(this.file + '.tmp', saved.players);
      fs.renameSync(this.file + '.tmp', this.file);
      this.writeDurable(this.wfile + '.tmp', saved.world);
      fs.renameSync(this.wfile + '.tmp', this.wfile);
      this.syncDirectory();
      fs.unlinkSync(this.journal);
      this.syncDirectory();
    }
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
    this.economicFrozen = false;
    this.dirty = false;
    setInterval(() => {
      if (!this.economicFrozen) this.flush();
    }, 15000).unref();
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
      if (!fs.existsSync(this.file) || fs.existsSync(this.journal)) return;
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
   * @param {import('./game.js').PlayerData} fresh Initial player state and save properties.
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
  /** @param {string} file @param {string} text */
  writeDurable(file, text) {
    const fd = fs.openSync(file, 'w');
    try {
      fs.writeFileSync(fd, text);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  syncDirectory() {
    const fd = fs.openSync(this.dir, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  flush() {
    if (this.economicFrozen)
      throw new Error('Database frozen; checkpoint requires recovery by restart');
    if (!this.dirty) return;
    // Journal commit point precedes both renames. Recovery rolls both halves forward.
    // Never overwrite a committed journal after a failed flush: require restart/recovery.
    if (fs.existsSync(this.journal))
      throw new Error('Pending database checkpoint requires recovery');
    const players = JSON.stringify(this.players),
      world = JSON.stringify(this.world);
    this.writeDurable(this.journal + '.tmp', JSON.stringify({ version: 1, players, world }));
    // Once journal installation is attempted its outcome may be uncertain, even
    // if an error arrives after unlink. Never roll memory back or autosave over it.
    try {
      fs.renameSync(this.journal + '.tmp', this.journal);
      this.syncDirectory();
      this.writeDurable(this.file + '.tmp', players);
      fs.renameSync(this.file + '.tmp', this.file);
      this.writeDurable(this.wfile + '.tmp', world);
      fs.renameSync(this.wfile + '.tmp', this.wfile);
      this.syncDirectory();
      fs.unlinkSync(this.journal);
      this.syncDirectory();
    } catch (error) {
      this.economicFrozen = true;
      throw error;
    }
    this.dirty = false;
  }
}
