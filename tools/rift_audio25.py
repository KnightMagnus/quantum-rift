"""Quantum Rift 2.5 story sounds, synthesized from scratch.
  ui_quest   a story beat: a soft low swell under a three-note bell motif (plays with quest popups)
  ui_state   news of a troubled system: a two-tone beacon through a radio band
usage: python3 tools/rift_audio25.py client/assets/sfx      (needs numpy and scipy)"""
import sys, os, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/sfx'; os.makedirs(OUT, exist_ok=True)
SR = 44100; rng = np.random.default_rng(25)
def t(sec): return np.arange(int(sec * SR)) / SR
def env(n, a, d): x = np.arange(n) / SR; return np.minimum(1, x / max(a, 1e-4)) * np.exp(-np.maximum(0, x - a) / max(d, 1e-4))
def note(m): return 440 * 2 ** ((m - 69) / 12)
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f): return sosfilt(butter(2, f, 'lowpass', fs=SR, output='sos'), x)
def at(x, sec, total): o = np.zeros(int(total * SR)); i = int(sec * SR); o[i:i + len(x)] += x[:max(0, len(o) - i)]; return o
def verb(x, sec=2.0, wet=0.35):
    n = int(sec * SR); ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 4.5 / sec); ir = lp(ir, 6000)
    w = np.pad(fftconvolve(x, ir), (0, 1))[:len(x) + n]; w /= np.max(np.abs(w)) or 1; d = np.concatenate([x, np.zeros(n)]); return d * (1 - wet) + w * wet * np.max(np.abs(x))
def wav(name, x, peak=0.8):
    x = x / (np.max(np.abs(x)) or 1) * peak; d = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(d.tobytes())
def bell(f, sec):   # inharmonic partials, like a struck glass bell
    tt = t(sec); return sum(a * np.sin(2 * np.pi * f * k * tt) * np.exp(-tt * (2.5 + k * 1.5)) for k, a in [(1, 1), (2.76, 0.45), (5.4, 0.25), (8.9, 0.12)])
L = 2.2
swell = sum(np.sin(2 * np.pi * note(m) * t(L) + 0.3 * np.sin(2 * np.pi * 0.7 * t(L))) for m in (45, 52, 57)) / 3
swell *= np.sin(np.pi * np.clip(t(L) / L, 0, 1)) ** 2 * 0.5; swell = lp(swell, 1200)
motif = sum(at(bell(note(m), 1.4) * g, s, L) for m, s, g in [(76, 0.25, 0.8), (81, 0.55, 0.7), (79, 0.85, 0.9)])
wav('ui_quest', verb(swell + motif, 2.0, 0.4), 0.7)
L2 = 1.0
tone = lambda f, s: at(np.sign(np.sin(2 * np.pi * f * t(0.16))) * env(int(0.16 * SR), 0.004, 0.08), s, L2)
beacon = tone(988, 0.0) + tone(740, 0.2) + tone(988, 0.4) * 0.7
radio = bp(beacon + rng.standard_normal(len(beacon)) * 0.05, 400, 2800)
wav('ui_state', verb(radio, 0.8, 0.25), 0.55)
print('wrote ui_quest, ui_state to', OUT)
