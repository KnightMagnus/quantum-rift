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
    """Return the warm two-note confirmation: 320 ms of mono PCM at 22050 Hz."""
    rate = 22050
    duration = 0.32
    sample_count = round(rate * duration)
    remaining_duration = (sample_count - 1) / rate
    samples = []
    for index in range(sample_count):
        time = index / rate
        value = 0.0
        for onset, frequency in ((0.0, 349.23), (0.135, 440.0)):
            note_time = time - onset
            if 0 <= note_time < 0.18:
                envelope = soft_window(note_time, 0.18, 0.024, 0.080)
                value += math.sin(2 * math.pi * frequency * note_time) * envelope * math.exp(-note_time / 0.09)
        samples.append(value * soft_window(time, remaining_duration))
    rms = math.sqrt(sum(value * value for value in samples) / len(samples))
    scale = min(0.16 / max(map(abs, samples)), 0.040 / rms)
    return rate, [round(value * scale * 32767) for value in samples]


def soft_window(time, duration, attack=0.012, release=0.035):
    """Round each note's attack and release with a smooth taper."""
    rise = math.sin(min(1.0, max(0.0, time / attack)) * math.pi / 2) ** 2
    fall = math.sin(min(1.0, max(0.0, (duration - time) / release)) * math.pi / 2) ** 2
    return rise * fall


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
