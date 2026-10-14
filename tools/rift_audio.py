"""Quantum Rift 2.0 audio: synthesizes the interface sounds, ambient loops and the login-screen theme from scratch
(oscillators, filtered noise, envelopes, a synthetic reverb), so every clip is original.
usage: python3 tools/rift_audio.py client/assets/sfx      (needs numpy, scipy and ffmpeg for the mp3s)"""
import sys, os, subprocess, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/sfx'
os.makedirs(OUT, exist_ok=True)
SR = 22050
rng = np.random.default_rng(7)

def t(sec, sr=SR): return np.arange(int(sec * sr)) / sr
def env(n, a=0.005, d=0.1, sr=SR, curve=4.0):
    """attack then exponential-ish decay over n samples"""
    x = np.arange(n) / sr; e = np.minimum(1, x / max(a, 1e-4)) * np.exp(-np.maximum(0, x - a) * curve / max(d, 1e-4)); return e
def adsr(n, a, d, s, r, sr=SR):
    A, D, R = int(a * sr), int(d * sr), int(r * sr); S = max(0, n - A - D - R)
    return np.concatenate([np.linspace(0, 1, A, False), np.linspace(1, s, D, False), np.full(S, s), np.linspace(s, 0, R)])[:n]
def sine(f, sec, sr=SR, ph=0): return np.sin(2 * np.pi * np.cumsum(np.broadcast_to(f, (int(sec * sr),)) / sr) + ph)
def tri(f, sec, sr=SR): p = np.cumsum(np.broadcast_to(f, (int(sec * sr),)) / sr) % 1; return 4 * np.abs(p - 0.5) - 1
def saw(f, sec, sr=SR): p = np.cumsum(np.broadcast_to(f, (int(sec * sr),)) / sr) % 1; return 2 * p - 1
def noise(sec, sr=SR): return rng.standard_normal(int(sec * sr))
def bp(x, lo, hi, sr=SR, order=2): return sosfilt(butter(order, [lo, hi], 'bandpass', fs=sr, output='sos'), x)
def lp(x, f, sr=SR, order=2): return sosfilt(butter(order, f, 'lowpass', fs=sr, output='sos'), x)
def hp(x, f, sr=SR, order=2): return sosfilt(butter(order, f, 'highpass', fs=sr, output='sos'), x)
def norm(x, peak=0.9): m = np.max(np.abs(x)) or 1; return x / m * peak
def pad(x, sec, sr=SR): return np.concatenate([x, np.zeros(int(sec * sr))])
def mix(*xs):
    n = max(len(x) for x in xs); o = np.zeros(n)
    for x in xs: o[:len(x)] += x
    return o
def at(x, sec, total, sr=SR): o = np.zeros(int(total * sr)); i = int(sec * sr); o[i:i + len(x)] += x[:max(0, len(o) - i)]; return o
def verb(x, sec=1.2, wet=0.25, sr=SR, bright=5000):
    ir = lp(noise(sec, sr), bright, sr) * np.exp(-t(sec, sr) * 5 / sec); ir /= np.sqrt(np.sum(ir ** 2))
    y = fftconvolve(x, ir)[:len(x) + int(sec * sr * 0.6)]; return mix(x * (1 - wet), y * wet * 0.6)
def wav(name, x, sr=SR, peak=0.85):
    x = norm(x, peak); d = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(d.tobytes())
def mp3(name, x, sr=SR, stereo=False, kbps=64, peak=0.8):
    x = norm(x, peak); tmp = os.path.join(OUT, name + '.tmp.wav'); d = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(tmp, 'wb') as w: w.setnchannels(2 if stereo else 1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(d.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', f'{kbps}k', os.path.join(OUT, name + '.mp3')], check=True); os.remove(tmp)
def blip(f, sec, kind='sine', a=0.002, d=None, f2=None):
    fr = np.linspace(f, f2 or f, int(sec * SR)); osc = {'sine': sine, 'tri': tri, 'saw': saw}[kind](fr, sec)
    return osc * env(len(osc), a, d or sec * 0.5)
def note(m): return 440 * 2 ** ((m - 69) / 12)

# ------------------------------------------------------------------ interface
wav('ui_click', mix(bp(noise(0.03), 2500, 7000) * env(int(0.03 * SR), 0.0005, 0.008), blip(1850, 0.05, 'tri', d=0.012) * 0.5))
wav('ui_hover', bp(noise(0.02), 4000, 9000) * env(int(0.02 * SR), 0.0005, 0.004), peak=0.35)
wav('ui_tab', mix(blip(880, 0.06, 'tri', d=0.02), at(blip(1320, 0.06, 'tri', d=0.025), 0.045, 0.12)) * 0.8)
wav('ui_open', mix(bp(noise(0.28), 300, 3000) * adsr(int(0.28 * SR), 0.12, 0.08, 0.3, 0.08), blip(300, 0.28, 'sine', a=0.1, d=0.15, f2=900) * 0.4))
wav('ui_close', mix(bp(noise(0.22), 300, 2500) * adsr(int(0.22 * SR), 0.01, 0.08, 0.3, 0.12), blip(800, 0.22, 'sine', d=0.1, f2=250) * 0.4))
wav('ui_error', mix(blip(140, 0.12, 'saw', d=0.08), at(blip(110, 0.14, 'saw', d=0.1), 0.13, 0.3)) * 0.7)
wav('ui_buy', verb(mix(blip(1568, 0.25, 'sine', d=0.12), blip(2093, 0.3, 'sine', d=0.15) * 0.6, at(blip(2637, 0.3, 'sine', d=0.18) * 0.5, 0.06, 0.4)), 0.6, 0.2))
wav('ui_sell', verb(mix(blip(2093, 0.2, 'sine', d=0.1), at(blip(1568, 0.25, 'sine', d=0.12), 0.07, 0.35), at(blip(1319, 0.3, 'sine', d=0.15), 0.14, 0.45)), 0.6, 0.2))
wav('ui_toast', verb(mix(blip(1046, 0.3, 'sine', d=0.18), blip(1568, 0.3, 'sine', d=0.12) * 0.35), 0.8, 0.25), peak=0.6)
wav('ui_accept', verb(mix(*[at(blip(note(m), 0.25, 'tri', d=0.12), i * 0.08, 0.6) for i, m in enumerate([72, 76, 79])]), 0.8, 0.3))
wav('ui_complete', verb(mix(*[at(blip(note(m), 0.5, 'tri', d=0.3) * (1 if i < 3 else 1.2), i * 0.1, 1.2) for i, m in enumerate([67, 72, 76, 84])],
                            at(bp(noise(0.8), 5000, 10000) * env(int(0.8 * SR), 0.2, 0.4) * 0.15, 0.3, 1.2)), 1.4, 0.35))
wav('ui_levelup', verb(mix(*[at(blip(note(84 + k), 0.18, 'sine', d=0.08) * (0.8 - i * 0.07), i * 0.05, 0.9) for i, k in enumerate([0, 4, 7, 12, 16, 19, 24])]), 1.0, 0.35))
wav('ui_alert', mix(*[at(mix(blip(660, 0.18, 'saw', a=0.01, d=0.15), blip(662, 0.18, 'saw', a=0.01, d=0.15)) * 0.5, i * 0.4, 0.85) for i in range(2)],
                    *[at(mix(blip(495, 0.18, 'saw', a=0.01, d=0.15), blip(497, 0.18, 'saw', a=0.01, d=0.15)) * 0.5, i * 0.4 + 0.2, 0.85) for i in range(2)]))
wav('ui_lock', mix(blip(2200, 0.05, 'sine', d=0.02), at(blip(2800, 0.07, 'sine', d=0.03), 0.07, 0.15)), peak=0.55)
wav('ui_ping', verb(blip(1400, 0.6, 'sine', a=0.002, d=0.25), 1.2, 0.4), peak=0.5)
wav('ui_chat', mix(blip(1200, 0.04, 'sine', d=0.02), at(blip(1600, 0.05, 'sine', d=0.02), 0.035, 0.1)), peak=0.45)
wav('ui_dock', verb(mix(lp(noise(0.15), 400) * env(int(0.15 * SR), 0.001, 0.05) * 1.5, blip(70, 0.25, 'sine', d=0.12) * 1.2,
                        at(hp(noise(0.7), 2000) * adsr(int(0.7 * SR), 0.05, 0.2, 0.4, 0.4) * 0.35, 0.2, 1.0)), 0.8, 0.25))
wav('ui_undock', verb(mix(hp(noise(0.6), 1800) * adsr(int(0.6 * SR), 0.02, 0.2, 0.5, 0.3) * 0.4, at(lp(noise(0.12), 500) * env(int(0.12 * SR), 0.001, 0.04) * 1.4, 0.45, 0.8),
                          at(blip(90, 0.2, 'sine', d=0.1), 0.45, 0.8)), 0.8, 0.25))
jt = t(1.6); wav('ui_jump', verb(mix(sine(np.linspace(60, 900, len(jt)) ** 1.0, 1.6) * adsr(len(jt), 1.1, 0.2, 0.6, 0.3) * 0.6,
                                    bp(noise(1.6), 200, 4000) * adsr(len(jt), 1.2, 0.1, 0.7, 0.3) * 0.5, at(lp(noise(0.4), 300) * env(int(0.4 * SR), 0.005, 0.2) * 1.5, 1.3, 1.6)), 1.0, 0.3))
wav('ui_arrive', verb(mix(lp(noise(0.9), 600) * env(int(0.9 * SR), 0.003, 0.4) * 1.2, blip(900, 0.8, 'sine', d=0.3, f2=80) * 0.5), 1.2, 0.35))
wav('ui_autopilot', mix(blip(988, 0.12, 'tri', d=0.05), at(blip(1319, 0.16, 'tri', d=0.07), 0.1, 0.3)) * 0.7, peak=0.6)
wav('ui_lowshield', mix(blip(1760, 0.1, 'square' if False else 'tri', d=0.06), at(blip(1760, 0.1, 'tri', d=0.06), 0.15, 0.3)), peak=0.6)
wav('ui_pickup', verb(mix(blip(2349, 0.12, 'sine', d=0.05), at(blip(3136, 0.14, 'sine', d=0.06), 0.04, 0.2)), 0.5, 0.2), peak=0.5)
wav('ui_hail', mix(blip(1500, 0.06, 'sine', d=0.03, f2=2200), at(bp(noise(0.35), 800, 3500) * adsr(int(0.35 * SR), 0.02, 0.1, 0.3, 0.15) * 0.4, 0.06, 0.45), at(blip(2200, 0.06, 'sine', d=0.03, f2=1500), 0.38, 0.45)))
wav('ui_type', bp(noise(0.015), 1500, 5000) * env(int(0.015 * SR), 0.0005, 0.004), peak=0.3)

# ------------------------------------------------------------------ ambient loops (seamless: the tail is cross-faded into the head)
def loopify(x, xf=2.0, sr=SR):
    n = int(xf * sr); head, body, tail = x[:n], x[n:-n], x[-n:]; w = np.linspace(0, 1, n)
    return np.concatenate([tail * (1 - w) + head * w, body])
L = 32.0
tt = t(L + 2.0)
space = mix(sine(41.2 + 0.3 * np.sin(2 * np.pi * tt * 0.05), L + 2) * 0.5, sine(61.7, L + 2) * 0.25 * (0.6 + 0.4 * np.sin(2 * np.pi * tt * 0.031)),
            sine(82.4 * 1.003, L + 2) * 0.12, lp(np.cumsum(noise(L + 2)) * 0.02, 180) * 0.6, bp(noise(L + 2), 300, 900) * 0.02 * (0.5 + 0.5 * np.sin(2 * np.pi * tt * 0.07)))
for k in range(5):   # faint distant pings
    p = verb(blip(note(76 + [0, 3, 7, 10, 12][k]), 1.5, 'sine', a=0.01, d=0.8) * 0.06, 2.5, 0.6); space = mix(space, at(p, 3 + k * 6.1, L + 2))
mp3('amb_space', loopify(space), kbps=64)
station = mix(sine(60, L + 2) * 0.18, sine(120, L + 2) * 0.12, sine(180, L + 2) * 0.05, bp(noise(L + 2), 150, 1200) * 0.18, lp(noise(L + 2), 90) * 0.5)
for k in range(9):   # distant clanks and murmurs
    when = 1.5 + k * 3.4 + rng.uniform(-0.6, 0.6)
    if k % 3 == 0: ev = verb(lp(noise(0.12), 900) * env(int(0.12 * SR), 0.001, 0.04) * 0.5, 1.5, 0.6)
    else: ev = bp(noise(1.2), 300 + 80 * k, 900 + 60 * k) * adsr(int(1.2 * SR), 0.2, 0.3, 0.5, 0.5) * 0.12 * (0.6 + 0.4 * np.sin(2 * np.pi * t(1.2) * (5 + k)))
    station = mix(station, at(ev, when, L + 2))
mp3('amb_station', loopify(station), kbps=64)
eng = mix(bp(noise(L + 2), 40, 220, order=3) * 1.2, sine(55, L + 2) * 0.25, sine(110 * 1.002, L + 2) * 0.12, bp(noise(L + 2), 600, 1600) * 0.06)
mp3('amb_engine', loopify(eng * (0.85 + 0.15 * np.sin(2 * np.pi * tt * 0.4))), kbps=64)

# ------------------------------------------------------------------ login theme: a slow, spacious original piece (about 80 s, loops)
MSR = 32000
def T(sec): return t(sec, MSR)
def pad_chord(ms, sec):
    o = np.zeros(int(sec * MSR))
    for m in ms:
        f = note(m)
        for det in (-0.07, 0.0, 0.06): o += saw(np.full(len(o), f * 2 ** (det / 12)), sec, MSR)
    o = lp(o, 950, MSR, 4) * adsr(len(o), 1.5, 1.0, 0.8, 2.0, MSR); return o / (3 * len(ms))
BAR = 5.0
prog = [[50, 57, 60, 64, 69], [46, 53, 57, 62, 65], [43, 50, 55, 58, 62], [45, 52, 57, 61, 64], [50, 57, 60, 65, 69], [48, 55, 59, 62, 67], [46, 53, 58, 62, 65], [45, 52, 56, 59, 64]]
total = BAR * len(prog) * 2
music = np.zeros(int((total + 6) * MSR)); musR = np.zeros_like(music)
for rep in range(2):
    for i, ch in enumerate(prog):
        st = (rep * len(prog) + i) * BAR
        pc = pad_chord(ch, BAR + 2.5); s0 = int(st * MSR); music[s0:s0 + len(pc)] += pc * 0.9; musR[s0:s0 + len(pc)] += pc * 0.9
        bass = sine(np.full(int((BAR + 1) * MSR), note(ch[0] - 12)), BAR + 1, MSR) * adsr(int((BAR + 1) * MSR), 0.3, 1.0, 0.6, 1.0, MSR) * 0.35
        music[s0:s0 + len(bass)] += bass; musR[s0:s0 + len(bass)] += bass
        arp = ch[1:] + [ch[2] + 12, ch[3] + 12]
        for k in range(8 if rep else 6):   # a soft plucked arpeggio, panned side to side
            m = arp[(k * 3 + i) % len(arp)] + 12; ps = int((st + 0.4 + k * BAR / 8) * MSR); nl = int(1.4 * MSR)
            pl = (tri(np.full(nl, note(m)), 1.4, MSR) * 0.6 + sine(np.full(nl, note(m) * 2), 1.4, MSR) * 0.25) * env(nl, 0.003, 0.5, MSR) * 0.32
            pan = 0.5 + 0.4 * np.sin(k * 1.3 + i)
            music[ps:ps + nl] += pl * (1 - pan); musR[ps:ps + nl] += pl * pan
air = lp(noise(len(music) / MSR, MSR), 2500, MSR) * 0.012
music += air; musR += np.roll(air, 1234)
def verbS(x, sec=3.5, wet=0.45):
    ir = lp(noise(sec, MSR), 6000, MSR) * np.exp(-T(sec) * 4.5 / sec); ir /= np.sqrt(np.sum(ir ** 2)); y = fftconvolve(x, ir)[:len(x)]; return x * (1 - wet) + y * wet * 0.5
L2, R2 = verbS(music), verbS(np.roll(musR, 300))
n = int(total * MSR); xf = int(5 * MSR)
L2 = np.concatenate([L2[n:n + xf] * np.linspace(1, 0, xf) + L2[:xf] * np.linspace(0, 1, xf), L2[xf:n]]); R2 = np.concatenate([R2[n:n + xf] * np.linspace(1, 0, xf) + R2[:xf] * np.linspace(0, 1, xf), R2[xf:n]])
st = np.stack([L2, R2], 1).reshape(-1)
mp3('music_login', st, sr=MSR, stereo=True, kbps=96, peak=0.75)
print('wrote', len(os.listdir(OUT)), 'files to', OUT)
