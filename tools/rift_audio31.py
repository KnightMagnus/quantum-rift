"""Original 3.1 login composition: synthesized French-horn-like brass and bowed strings.
No recordings, samples or third-party compositions. Redistribution with Quantum Rift.
Run: python3 tools/rift_audio31.py (numpy, ffmpeg). Does not touch other audio.
"""
import os
import subprocess
import wave
import numpy as np
# Harmonic rolloff provides the acoustic low-pass envelope without external DSP.

SR = 32000
BAR = 4.0
DURATION = 64
out = 'client/assets/sfx/music_login31.mp3'
rng = np.random.default_rng(31)
mix = np.zeros((int((DURATION + 5) * SR), 2))

def note(midi):
    return 440 * 2 ** ((midi - 69) / 12)

def voice(midi, seconds, horn=False):
    t = np.arange(int(seconds * SR)) / SR
    f = note(midi)
    vibrato = (0.0018 if horn else 0.003) * np.sin(2 * np.pi * 4.8 * t)
    phase = 2 * np.pi * np.cumsum(f * (1 + vibrato)) / SR
    sound = np.zeros(len(t))
    for h in range(1, 10 if horn else 15):
        amplitude = np.exp(-h / (3.1 if horn else 6.0)) / h ** (0.65 if horn else 1.0)
        sound += amplitude * np.sin(h * phase)
        if not horn:
            sound += amplitude * 0.45 * np.sin(h * phase * 1.003 + 0.7)
    if not horn:
        sound += rng.standard_normal(len(t)) * 0.012
    # Harmonic amplitudes above already suppress harsh upper partials.
    attack = 0.22 if horn else 0.65
    envelope = np.minimum(1, t / attack) * np.minimum(1, (seconds-t) / 0.65)
    envelope *= 0.85 + 0.15 * np.sin(np.pi*t/seconds)
    return sound * envelope * (0.15 if horn else 0.055)

def add(midi, start, seconds, pan, horn=False):
    v = voice(midi, seconds, horn)
    offset = int(start * SR)
    mix[offset:offset+len(v),0] += v * np.sqrt(1-pan)
    mix[offset:offset+len(v),1] += v * np.sqrt(pan)

# Original sixteen-bar D-minor journey; restrained horn call over moving strings.
chords = [(50,57,62,65),(46,53,58,62),(48,55,60,64),(45,52,57,61)] * 4
melody = [62,65,69,67,65,62,60,61,62,69,72,70,69,65,64,62]
for bar, chord in enumerate(chords):
    for index, pitch in enumerate(chord):
        add(pitch, bar*BAR, BAR+0.8, 0.2+index*0.2)
    add(melody[bar], bar*BAR+0.3, 2.6 if bar%4!=3 else 3.2, 0.46, True)
    if bar >= 8:
        add(chord[2]+12, bar*BAR+2.4, 1.5, 0.7)
# Quiet stereo early reflections; wrap tails for a continuous loop.
for delay, gain in [(0.11,0.12),(0.23,0.09),(0.41,0.06),(0.73,0.04)]:
    shift=int(delay*SR)
    mix[shift:] += mix[:-shift,::-1].copy()*gain
n=int(DURATION*SR)
mix[:len(mix)-n] += mix[n:]
mix=mix[:n]
mix *= 0.62 / np.max(np.abs(mix))
os.makedirs(os.path.dirname(out),exist_ok=True)
tmp=out+'.wav'
with wave.open(tmp,'wb') as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR)
    f.writeframes((mix*32767).astype('<i2').tobytes())
subprocess.run(['ffmpeg','-y','-loglevel','error','-i',tmp,'-codec:a','libmp3lame','-b:a','128k',out],check=True)
os.remove(tmp)
print(out, '64s, original synthesized horn/strings, peak 0.62')
