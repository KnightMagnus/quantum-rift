"""Original, short purchase confirmation; standard-library oscillators and envelope.

Usage: python3 tools/rift_purchase_audio.py client/assets/sfx/ui_buy.wav
No samples or third-party composition are used.
"""
import math
import pathlib
import struct
import sys
import wave


def purchase_samples():
    """Return 240 ms of mono PCM at 22050 Hz with a soft attack and short tail."""
    rate = 22050
    duration = 0.24
    samples = []
    for index in range(round(rate * duration)):
        time = index / rate
        attack = math.sin(min(1, time / 0.018) * math.pi / 2) ** 2
        decay = math.exp(-max(0, time - 0.018) / 0.038)
        release = min(1, (duration - time) / 0.025) ** 2
        tone = math.sin(2 * math.pi * 660 * time) + 0.22 * math.sin(2 * math.pi * 880 * time)
        samples.append(attack * decay * release * tone)
    scale = 0.18 / max(map(abs, samples))
    return rate, [round(value * scale * 32767) for value in samples]


def write_purchase(output):
    """Write the deterministic original confirmation without renormalizing its peak."""
    rate, samples = purchase_samples()
    with wave.open(str(output), 'wb') as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(rate)
        stream.writeframes(struct.pack('<' + 'h' * len(samples), *samples))


if __name__ == '__main__':
    write_purchase(pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'client/assets/sfx/ui_buy.wav'))
