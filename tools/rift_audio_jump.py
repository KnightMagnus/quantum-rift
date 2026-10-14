"""Quantum Rift 2.1 hyperspace sounds, synthesized from scratch (replaces the 2.0 jump and arrival clips).
  ui_jump    your jump: the drive spools up (detuned low saws through an opening filter, rising air and a shimmer),
             then releases with a sub-bass drop and a pressure wave
  ui_arrive  your arrival: a hard transient, a deep boom and a descending shimmer wash
  ui_jumpfast  the same for ships with the fast hyperdrive (0.6 s jumps)
  jumpfar    another ship jumping in or out nearby: a distant thump and whoosh (played positionally)
usage: python3 tools/rift_audio_jump.py client/assets/sfx      (needs numpy and scipy)"""
import sys, os, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/sfx'
SR = 32000
rng = np.random.default_rng(21)

def T(sec): return np.arange(int(sec * SR)) / SR
def noise(sec): return rng.standard_normal(int(sec * SR))
def osc(freq, kind='sine'):
    ph = np.cumsum(freq / SR)
    if kind == 'saw': return 2 * (ph % 1) - 1
    return np.sin(2 * np.pi * ph)
def lp(x, f, order=2): return sosfilt(butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def hp(x, f, order=2): return sosfilt(butter(order, f, 'highpass', fs=SR, output='sos'), x)
def bp(x, lo, hi, order=2): return sosfilt(butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def sweep_lp(x, f0, f1, curve=2.0):
    """a resonant-ish one-pole lowpass (two in series) whose cutoff moves from f0 to f1 over the clip"""
    n = len(x); fc = f0 + (f1 - f0) * (np.linspace(0, 1, n) ** curve); a = 1 - np.exp(-2 * np.pi * fc / SR)
    y1 = np.zeros(n); y2 = np.zeros(n); s1 = s2 = 0.0
    for i in range(n): s1 += a[i] * (x[i] - s1); s2 += a[i] * (s1 - s2); y1[i] = s1; y2[i] = s2
    return y2
def sweep_bp(x, f0, f1, q=0.35):
    """band of noise sweeping from f0 to f1, done in short overlapping blocks"""
    n = len(x); out = np.zeros(n); blk = 1024; hop = 512; win = np.hanning(blk)
    for s in range(0, n - blk, hop):
        k = s / max(1, n - blk); fc = f0 * (f1 / f0) ** k; lo, hi = max(40, fc * (1 - q)), min(SR / 2 - 100, fc * (1 + q))
        out[s:s + blk] += bp(x[s:s + blk] * win, lo, hi) * 0.6
    return out
def env_ar(n, a, r, curve=3.0):
    x = np.arange(n) / SR; return np.minimum(1, x / max(a, 1e-4)) * np.exp(-np.maximum(0, x - a) * curve / max(r, 1e-4))
def ramp(n, p=2.0): return np.linspace(0, 1, n) ** p
def at(x, sec, total): o = np.zeros(int(total * SR)); i = int(sec * SR); o[i:i + len(x)] += x[:max(0, len(o) - i)]; return o
def mix(*xs):
    n = max(len(x) for x in xs); o = np.zeros(n)
    for x in xs: o[:len(x)] += x
    return o
def verb(x, sec=1.6, wet=0.3, bright=6000):
    ir = lp(noise(sec), bright) * np.exp(-T(sec) * 5 / sec); ir /= np.sqrt(np.sum(ir ** 2))
    y = fftconvolve(x, ir)[:len(x) + int(sec * SR * 0.7)]; return mix(x * (1 - wet), y * wet * 0.7)
def soft(x, drive=1.6): return np.tanh(x * drive) / np.tanh(drive)
def fade(x, sec=0.05): n = int(sec * SR); x = x.copy(); x[-n:] *= np.linspace(1, 0, n); return x
def wav(name, x, peak=0.85):
    x = x / (np.max(np.abs(x)) or 1) * peak; d = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(d.tobytes())

# ---- your jump: 1.45 s of spool, then the release (the client starts it as the jump begins; the ship leaves at ~1.6 s)
def make_jump(name, SP):
  L = SP + 1.15; n = int(SP * SR)
  pitch = 41.2 * (1 + 0.5 * ramp(n, 2.2))                     # E1 rising a fifth: the drive winding up, not a whistle
  drive = sum(osc(pitch * m * (1 + dt), 'saw') for m, dt in [(1, 0), (1, 0.006), (1.5, -0.004), (2, 0.003), (3, 0.0)]) / 5
  drive = sweep_lp(drive, 120, 2600, 2.4) * ramp(n, 1.4) * 1.3
  air = sweep_bp(noise(SP), 300, 5200) * ramp(n, 2.5) * 0.9     # rising pressure, like a reversed wave
  trem = 0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(4 + 26 * ramp(n, 1.5)) / SR)
  shimmer = sum(osc(np.full(n, f)) for f in (1975, 2637, 3322, 3951)) / 4 * trem * ramp(n, 3.2) * 0.22
  spool = soft(mix(drive, air, shimmer), 1.4)
  rel_t = T(1.15)
  sub = osc(np.linspace(78, 26, len(rel_t)) ** 1.0) * env_ar(len(rel_t), 0.004, 0.55, 3.2) * 1.4            # the drop
  thud = lp(noise(0.5), 260) * env_ar(int(0.5 * SR), 0.002, 0.16, 4) * 1.6
  whoosh = hp(noise(0.9), 900) * env_ar(int(0.9 * SR), 0.01, 0.35, 3.5) * 0.45
  crack = hp(noise(0.06), 3500) * env_ar(int(0.06 * SR), 0.0005, 0.02, 5) * 0.8
  release = mix(sub, thud, whoosh, crack)
  jump = mix(at(spool, 0, L), at(release, SP - 0.02, L))
  wav(name, fade(verb(jump, 2.0, 0.32)[:int(L * SR)]))

make_jump('ui_jump', 1.45)
make_jump('ui_jumpfast', 0.55)   # ships with the fast hyperdrive

# ---- your arrival: transient, boom, and a shimmer that falls away as the stars settle
A = 2.0
boom = osc(np.linspace(62, 30, int(1.2 * SR))) * env_ar(int(1.2 * SR), 0.003, 0.7, 3) * 1.3
punch = lp(noise(0.35), 400) * env_ar(int(0.35 * SR), 0.001, 0.12, 4) * 1.5
snap = hp(noise(0.05), 3000) * env_ar(int(0.05 * SR), 0.0004, 0.018, 5) * 0.9
wash = sweep_bp(noise(1.4), 5200, 260) * np.linspace(1, 0, int(1.4 * SR)) ** 1.6 * 0.8
nfall = int(1.3 * SR); fall = sum(osc(np.linspace(f, f * 0.55, nfall)) for f in (1760, 2217, 2637)) / 3 * np.linspace(1, 0, nfall) ** 2.2 * 0.18
settle = lp(sum(osc(np.full(int(1.6 * SR), f), 'saw') for f in (82.4, 82.9, 123.5)) / 3, 500) * (np.sin(np.linspace(0, np.pi, int(1.6 * SR))) ** 2) * 0.35
arrive = mix(at(snap, 0, A), at(punch, 0, A), at(boom, 0, A), at(wash, 0.02, A), at(fall, 0.05, A), at(settle, 0.15, A))
wav('ui_arrive', fade(verb(soft(arrive, 1.3), 1.8, 0.33)[:int(A * SR)]))

# ---- someone else's jump, heard from a distance (played positionally, quieter with range)
F = 1.3
far = mix(lp(noise(0.6), 180) * env_ar(int(0.6 * SR), 0.004, 0.25, 3.5) * 1.4,
          osc(np.linspace(70, 34, int(0.8 * SR))) * env_ar(int(0.8 * SR), 0.004, 0.4, 3) * 0.9,
          at(sweep_bp(noise(0.7), 2400, 500) * np.linspace(1, 0, int(0.7 * SR)) ** 2 * 0.4, 0.0, F))
wav('jumpfar', fade(verb(lp(far, 3000), 1.4, 0.4)[:int(F * SR)]), peak=0.7)
print('wrote ui_jump, ui_arrive, jumpfar to', OUT)
