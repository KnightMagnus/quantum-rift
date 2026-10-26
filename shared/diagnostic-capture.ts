import type { TradePreviewInput } from './economy-preview.ts';
import type { GradeLots } from './cargo-contracts.ts';
import { RAW_COMMODITIES, RAW_GRADES } from './cargo-lots.ts';
import { utf8Bytes } from './health.ts';

/** Identifies an exported file as a Quantum Rift diagnostic capture. */
export const DIAGNOSTIC_CAPTURE_FORMAT = 'quantum-rift-diagnostic-capture';
/** Increment when a field is added, removed or reinterpreted. Older readers reject newer files. */
export const DIAGNOSTIC_CAPTURE_VERSION = 1;
export const DIAGNOSTIC_CAPTURE_LIMITS = Object.freeze({
  /** Oldest entries are discarded beyond this count. */
  maxEntries: 50,
  /** Recording stops, and older entries are discarded, after this many milliseconds. */
  maxAgeMs: 30 * 60 * 1000,
  /** A single entry larger than this is not kept. */
  maxEntryBytes: 2048,
  /** Files larger than this are rejected before parsing. */
  maxCaptureBytes: 128 * 1024,
  /** Delivery orders retained for the previewed commodity. */
  maxOrders: 16,
  /** Warning lines retained from one preview result. */
  maxWarnings: 4,
  /** Characters retained per warning line. */
  maxWarningLength: 160,
});

/** The only subsystem replayable by format version 1. */
export type DiagnosticSubsystem = 'trade-preview';
/** Allowlisted trade preview inputs, limited to the previewed commodity. */
export interface TradePreviewCaptureInput {
  /** Market row being previewed: commodity id, listed price and remaining buyer demand. */
  market: { id: string; price: number | null; sellCap?: number };
  /** Entered trade amount in tonnes. */
  amount: number;
  /** Hold total for the previewed commodity only. */
  cargo: Record<string, number>;
  /** Grade ledger for the previewed commodity only, when it is a graded raw commodity. */
  cargoLots: { version: 1; byCommodity: Record<string, GradeLots> };
  /** Wallet balance used for the purchase limit. */
  credits: number;
  /** Free hold tonnes used for the purchase limit. */
  freeHold: number;
  /** Port trade modifier in percent. */
  tradePct: number;
  /** Port sell multiplier. */
  sell: number;
  /** Whether the port is a site market without depth impact. */
  site: boolean;
  /** Delivery orders for the previewed commodity; other commodities are omitted. */
  orders: { cid: string; grade: string; qty: number }[];
}
/** Preview result as shown to the player. */
export interface TradePreviewCaptureResult {
  /** Whether the entered amount produced an estimate. */
  valid: boolean;
  /** Purchase estimate, or null when invalid. */
  buy: { tonnes: number; total: number } | null;
  /** Sale estimate, or null when invalid. */
  sale: { tonnes: number; total: number; grades: GradeLots } | null;
  /** Fixed advisory lines produced by the preview. */
  warnings: string[];
}
/** One recorded preview. */
export interface TradePreviewCaptureEntry {
  /** Subsystem that can replay this entry. */
  subsystem: DiagnosticSubsystem;
  /** Milliseconds since recording started; not a wall-clock time. */
  atMs: number;
  /** Milliseconds spent computing the preview on the recording device. */
  elapsedMs: number;
  /** Allowlisted inputs. */
  input: TradePreviewCaptureInput;
  /** Result observed on the recording device. */
  result: TradePreviewCaptureResult;
}
/** Exported capture file contents. */
export interface DiagnosticCapture {
  /** Always DIAGNOSTIC_CAPTURE_FORMAT. */
  format: typeof DIAGNOSTIC_CAPTURE_FORMAT;
  /** Capture format version. */
  version: typeof DIAGNOSTIC_CAPTURE_VERSION;
  /** Game version advertised by the host; not a fingerprint of cached browser code. */
  build: { game: string };
  /** Milliseconds between the start of recording and export. */
  durationMs: number;
  /** Retained entries, oldest first. */
  entries: TradePreviewCaptureEntry[];
}
/** Why a capture file was not accepted. */
export type DiagnosticCaptureRejection =
  | 'oversized'
  | 'corrupt'
  | 'unsupported-format'
  | 'unsupported-version'
  | 'invalid';
/** Result of reading a capture file. */
export type DiagnosticCaptureParse =
  | { ok: true; capture: DiagnosticCapture }
  | { ok: false; reason: DiagnosticCaptureRejection; detail: string };

const COMMODITY_PATTERN = /^[a-z][a-z0-9_]{0,47}$/;
const BUILD_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/;
const MAX_MAGNITUDE = 1e15;

class CaptureShapeError extends Error {}

function fail(detail: string): never {
  throw new CaptureShapeError(detail);
}

function plainRecord(value: unknown, path: string, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path + ' is not a record');
  const unexpected = Object.keys(value).find((key) => !keys.includes(key));
  if (unexpected !== undefined) fail(`${path}.${unexpected} is not an allowed field`);
  return value as Record<string, unknown>;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_MAGNITUDE)
    fail(path + ' is not a bounded finite number');
  return value;
}

function nonNegative(value: unknown, path: string): number {
  const number = finite(value, path);
  if (number < 0) fail(path + ' is negative');
  return number;
}

function commodityId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !COMMODITY_PATTERN.test(value))
    fail(path + ' is not a commodity id');
  return value;
}

function gradeLots(value: unknown, path: string): GradeLots {
  const lots = plainRecord(value, path, RAW_GRADES);
  return {
    common: nonNegative(lots.common, path + '.common'),
    rich: nonNegative(lots.rich, path + '.rich'),
    pure: nonNegative(lots.pure, path + '.pure'),
  };
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path + ' is not a boolean');
  return value;
}

/** Copies only the fields the preview reads for the previewed commodity. */
function captureInput(source: unknown, strict: boolean): TradePreviewCaptureInput {
  const inputKeys = [
    'market',
    'amount',
    'cargo',
    'cargoLots',
    'credits',
    'freeHold',
    'tradePct',
    'sell',
    'site',
    'orders',
  ];
  const input = strict
    ? plainRecord(source, 'input', inputKeys)
    : (source as Record<string, unknown>);
  const market = strict
    ? plainRecord(input.market, 'input.market', ['id', 'price', 'sellCap'])
    : (input.market as Record<string, unknown>);
  if (!market) fail('input.market is missing');
  const id = commodityId(market.id, 'input.market.id');
  const price = market.price === null ? null : finite(market.price, 'input.market.price');
  const capturedMarket: TradePreviewCaptureInput['market'] = { id, price };
  if (market.sellCap !== undefined)
    capturedMarket.sellCap = nonNegative(market.sellCap, 'input.market.sellCap');

  const sourceCargo = strict
    ? plainRecord(input.cargo, 'input.cargo', [id])
    : (input.cargo as Record<string, unknown>);
  const cargo: Record<string, number> = {};
  if (sourceCargo?.[id] !== undefined) cargo[id] = nonNegative(sourceCargo[id], 'input.cargo');

  const sourceLedger = strict
    ? plainRecord(input.cargoLots, 'input.cargoLots', ['version', 'byCommodity'])
    : (input.cargoLots as Record<string, unknown>);
  if (sourceLedger?.version !== 1) fail('input.cargoLots.version is not 1');
  const sourceLots = strict
    ? plainRecord(sourceLedger.byCommodity, 'input.cargoLots.byCommodity', [id])
    : (sourceLedger.byCommodity as Record<string, unknown>);
  const byCommodity: Record<string, GradeLots> = {};
  if (RAW_COMMODITIES.includes(id) && sourceLots?.[id] !== undefined)
    byCommodity[id] = gradeLots(sourceLots[id], 'input.cargoLots.byCommodity.' + id);

  const sourceOrders = strict ? input.orders : (input.orders ?? []);
  if (!Array.isArray(sourceOrders)) fail('input.orders is not a list');
  const relevantOrders = sourceOrders.filter(
    (order) =>
      strict ||
      (order?.cid === id && (RAW_GRADES as readonly string[]).includes(order?.grade as string)),
  );
  if (relevantOrders.length > DIAGNOSTIC_CAPTURE_LIMITS.maxOrders)
    fail('input.orders has too many entries');
  const orders = relevantOrders.map((order: unknown, index: number) => {
    const path = `input.orders[${index}]`;
    const fields = strict
      ? plainRecord(order, path, ['cid', 'grade', 'qty'])
      : (order as Record<string, unknown>);
    if (fields.cid !== id) fail(path + '.cid is not the previewed commodity');
    if (!(RAW_GRADES as readonly string[]).includes(fields.grade as string))
      fail(path + '.grade is not a raw grade');
    return {
      cid: id,
      grade: fields.grade as string,
      qty: nonNegative(fields.qty, path + '.qty'),
    };
  });

  return {
    market: capturedMarket,
    amount: finite(input.amount, 'input.amount'),
    cargo,
    cargoLots: { version: 1, byCommodity },
    credits: finite(input.credits, 'input.credits'),
    freeHold: finite(input.freeHold, 'input.freeHold'),
    tradePct: finite(strict ? input.tradePct : (input.tradePct ?? 0), 'input.tradePct'),
    sell: finite(strict ? input.sell : (input.sell ?? 1), 'input.sell'),
    site: boolean(strict ? input.site : (input.site ?? false), 'input.site'),
    orders,
  };
}

/** Copies a preview result into its fixed shape, rejecting anything else. */
function captureResult(source: unknown): TradePreviewCaptureResult {
  const result = plainRecord(source, 'result', ['valid', 'buy', 'sale', 'warnings']);
  const valid = boolean(result.valid, 'result.valid');
  let buy: TradePreviewCaptureResult['buy'] = null;
  if (result.buy !== null) {
    const purchase = plainRecord(result.buy, 'result.buy', ['tonnes', 'total']);
    buy = {
      tonnes: nonNegative(purchase.tonnes, 'result.buy.tonnes'),
      total: nonNegative(purchase.total, 'result.buy.total'),
    };
  }
  let sale: TradePreviewCaptureResult['sale'] = null;
  if (result.sale !== null) {
    const sold = plainRecord(result.sale, 'result.sale', ['tonnes', 'total', 'grades']);
    sale = {
      tonnes: nonNegative(sold.tonnes, 'result.sale.tonnes'),
      total: nonNegative(sold.total, 'result.sale.total'),
      grades: gradeLots(sold.grades, 'result.sale.grades'),
    };
  }
  if (!Array.isArray(result.warnings)) fail('result.warnings is not a list');
  if (result.warnings.length > DIAGNOSTIC_CAPTURE_LIMITS.maxWarnings)
    fail('result.warnings has too many entries');
  const warnings = result.warnings.map((warning: unknown, index: number) => {
    if (typeof warning !== 'string' || warning.length > DIAGNOSTIC_CAPTURE_LIMITS.maxWarningLength)
      fail(`result.warnings[${index}] is not a bounded string`);
    return warning;
  });
  return { valid, buy, sale, warnings };
}

function captureEntry(source: unknown, index: number): TradePreviewCaptureEntry {
  const entry = plainRecord(source, `entries[${index}]`, [
    'subsystem',
    'atMs',
    'elapsedMs',
    'input',
    'result',
  ]);
  if (entry.subsystem !== 'trade-preview') fail(`entries[${index}].subsystem is not supported`);
  const captured: TradePreviewCaptureEntry = {
    subsystem: 'trade-preview',
    atMs: nonNegative(entry.atMs, `entries[${index}].atMs`),
    elapsedMs: nonNegative(entry.elapsedMs, `entries[${index}].elapsedMs`),
    input: captureInput(entry.input, true),
    result: captureResult(entry.result),
  };
  if (utf8Bytes(JSON.stringify(captured)) > DIAGNOSTIC_CAPTURE_LIMITS.maxEntryBytes)
    fail(`entries[${index}] exceeds the entry byte limit`);
  return captured;
}

/** Retains a bounded version label; other build values become unknown. */
export function captureBuild(version: unknown): string {
  return typeof version === 'string' && BUILD_PATTERN.test(version) ? version : 'unknown';
}

/** Opt-in, in-memory recorder. Nothing is recorded until start() and nothing is sent anywhere. */
export class DiagnosticRecorder {
  /** Monotonic millisecond clock supplied by the host. */
  readonly now: () => number;
  private entries: { recordedAt: number; entry: TradePreviewCaptureEntry }[] = [];
  private startedAt: number | null = null;
  private firstRecordedAt: number | null = null;
  private build = 'unknown';

  constructor(now: () => number) {
    this.now = now;
  }

  /** Whether new previews are being recorded. Recording ends on its own after maxAgeMs. */
  get recording(): boolean {
    this.expire();
    return this.startedAt !== null;
  }

  /** Number of entries available for export. */
  get size(): number {
    this.expire();
    return this.entries.length;
  }

  setBuild(version: unknown): void {
    this.build = captureBuild(version);
  }

  start(): void {
    if (this.recording) return;
    this.startedAt = this.now();
    this.firstRecordedAt ??= this.startedAt;
  }

  stop(): void {
    this.startedAt = null;
  }

  /** Stops recording and discards every retained entry. */
  clear(): void {
    this.stop();
    this.entries = [];
    this.firstRecordedAt = null;
  }

  /**
   * Records one preview while recording is on. Only allowlisted fields of the
   * previewed commodity are copied; unsafe or oversized inputs are skipped.
   */
  recordTradePreview(input: TradePreviewInput, result: unknown, elapsedMs: number): boolean {
    if (!this.recording) return false;
    let entry: TradePreviewCaptureEntry;
    try {
      const recordedAt = this.now();
      entry = {
        subsystem: 'trade-preview',
        atMs: roundMs(recordedAt - this.firstRecordedAt!),
        elapsedMs: roundMs(Math.max(0, elapsedMs)),
        input: captureInput(input, false),
        result: captureResult(result),
      };
      if (utf8Bytes(JSON.stringify(entry)) > DIAGNOSTIC_CAPTURE_LIMITS.maxEntryBytes) return false;
      this.entries.push({ recordedAt, entry });
    } catch (error) {
      if (error instanceof CaptureShapeError) return false;
      throw error;
    }
    if (this.entries.length > DIAGNOSTIC_CAPTURE_LIMITS.maxEntries) this.entries.shift();
    return true;
  }

  exportCapture(): DiagnosticCapture {
    this.expire();
    return {
      format: DIAGNOSTIC_CAPTURE_FORMAT,
      version: DIAGNOSTIC_CAPTURE_VERSION,
      build: { game: this.build },
      durationMs: this.firstRecordedAt === null ? 0 : roundMs(this.now() - this.firstRecordedAt),
      entries: this.entries.map((retained) => retained.entry),
    };
  }

  private expire(): void {
    const now = this.now();
    if (this.startedAt !== null && now - this.startedAt >= DIAGNOSTIC_CAPTURE_LIMITS.maxAgeMs)
      this.startedAt = null;
    this.entries = this.entries.filter(
      (retained) => now - retained.recordedAt < DIAGNOSTIC_CAPTURE_LIMITS.maxAgeMs,
    );
    if (!this.entries.length && this.startedAt === null) this.firstRecordedAt = null;
  }
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Serializes a capture for export. */
export function serializeDiagnosticCapture(capture: DiagnosticCapture): string {
  // Entries are bounded in this compact encoding; indentation can exceed the file cap.
  return JSON.stringify(capture) + '\n';
}

/** Reads a capture file, rejecting oversized, corrupt, unknown or newer files without throwing. */
export function parseDiagnosticCapture(text: string): DiagnosticCaptureParse {
  if (typeof text !== 'string') return { ok: false, reason: 'corrupt', detail: 'not text' };
  if (
    text.length > DIAGNOSTIC_CAPTURE_LIMITS.maxCaptureBytes ||
    utf8Bytes(text) > DIAGNOSTIC_CAPTURE_LIMITS.maxCaptureBytes
  )
    return {
      ok: false,
      reason: 'oversized',
      detail: `larger than ${DIAGNOSTIC_CAPTURE_LIMITS.maxCaptureBytes} bytes`,
    };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'corrupt', detail: 'not valid JSON' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return { ok: false, reason: 'corrupt', detail: 'not a JSON object' };
  const root = parsed as Record<string, unknown>;
  if (root.format !== DIAGNOSTIC_CAPTURE_FORMAT)
    return { ok: false, reason: 'unsupported-format', detail: 'not a Quantum Rift capture' };
  if (root.version !== DIAGNOSTIC_CAPTURE_VERSION)
    return {
      ok: false,
      reason: 'unsupported-version',
      detail: `version ${JSON.stringify(root.version)} is not supported; expected ${DIAGNOSTIC_CAPTURE_VERSION}`,
    };
  try {
    plainRecord(root, 'capture', ['format', 'version', 'build', 'durationMs', 'entries']);
    const build = plainRecord(root.build, 'build', ['game']);
    if (captureBuild(build.game) !== build.game) fail('build.game is not a build identifier');
    if (!Array.isArray(root.entries)) fail('entries is not a list');
    if (root.entries.length > DIAGNOSTIC_CAPTURE_LIMITS.maxEntries)
      fail('entries has too many entries');
    return {
      ok: true,
      capture: {
        format: DIAGNOSTIC_CAPTURE_FORMAT,
        version: DIAGNOSTIC_CAPTURE_VERSION,
        build: { game: build.game as string },
        durationMs: nonNegative(root.durationMs, 'durationMs'),
        entries: root.entries.map(captureEntry),
      },
    };
  } catch (error) {
    if (error instanceof CaptureShapeError)
      return { ok: false, reason: 'invalid', detail: error.message };
    throw error;
  }
}
