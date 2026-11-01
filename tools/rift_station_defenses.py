"""Render the Triad Sentinel with the native station mesh and material pipeline.

Usage: python tools/rift_station_defenses.py client/assets/ships
"""
import argparse
import math
from pathlib import Path
import numpy as np
from PIL import Image
import rift_stations as station
from rift_render3d import render, mat, block, sphere

SILVER = mat((.69, .71, .75), metal=.7, panel=1.4, rough=.3, grime=.6)
TRIM = mat((.23, .25, .29), metal=.8, panel=1.2, grime=.5)
VIOLET = mat((.7, .35, 1), emissive=(.65, .25, 1))
BLUE = mat((.12, .19, .43), metal=.8, panel=4, rough=.2, grime=.3)


def turret(x, y, angle):
    meshes = [station.zcyl((0, 0, .14), .105, .055, TRIM),
              sphere((0, 0, .195), .11, SILVER, squash=.5)]
    for side in [-1, 1]:
        meshes += [block((side * .04, -.16, .205), (.018, .15, .018), TRIM),
                   block((side * .04, -.28, .205), (.024, .025, .023), station.GUNM)]
    return [station.rot_z(mesh, angle).tf(lambda vertices: vertices + np.array([x, y, 0]))
            for mesh in meshes]


def triad_sentinel():
    """Three armed pods around the Personal Station's silver ring and violet core."""
    meshes = [station.zcyl((0, 0, 0), .23, .12, SILVER),
              station.zcyl((0, 0, .16), .13, .05, TRIM),
              station.zcyl((0, 0, .22), .045, .045, VIOLET),
              station.flat_torus(.28, .035, SILVER, n=30)]
    for index in range(3):
        angle = index * math.pi * 2 / 3 - math.pi / 2
        meshes += [station.arm(angle, .19, .57, .055, SILVER)]
        x, y = .52 * math.cos(angle), .52 * math.sin(angle)
        meshes += [station.zcyl((x, y, .03), .16, .085, SILVER, ring=12)]
        meshes += turret(x, y, angle - math.pi / 2)
        meshes += [station.rot_z(block((.33, .13, -.04), (.16, .075, .018), BLUE), angle),
                   station.light(angle, .69, .06, station.LGREEN if index % 2 else station.LRED, .018)]
    return meshes


def frame(size, heading):
    meshes = triad_sentinel()
    vertices = np.concatenate([mesh.V for mesh in meshes])
    radius = np.linalg.norm(vertices, axis=1).max()
    rgb, alpha = render(meshes, size, heading, size * .43 / radius,
                        tilt=50, density=10, ss=2)[0]
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 1) * 255, alpha * 255])
                           .round().astype(np.uint8), 'RGBA')


def generate(output):
    output.mkdir(parents=True, exist_ok=True)
    sheet = Image.new('RGBA', (176 * 12, 176 * 3))
    for heading in range(36):
        sheet.paste(frame(176, heading * 10), ((heading % 12) * 176, (heading // 12) * 176))
    sheet.save(output / '940.webp', 'WEBP', quality=88, method=6)
    frame(256, 25).save(output / '940_yard.png')
    print('Rendered Triad Sentinel: 36 level headings and yard view.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output_directory', type=Path)
    generate(parser.parse_args().output_directory)
