"""Station meshes shared by flight sprites and high-resolution landing artwork.

Run: python3 tools/rift_station_variants.py (requires NumPy and Pillow)."""

from pathlib import Path
import math
import numpy as np
from PIL import Image
import rift_stations as station_mesh
import rift_render3d as renderer

hull = renderer.mat((0.69, 0.73, 0.75), metal=0.25, rough=0.75, panel=0.13, grime=0.08)
dark = renderer.mat((0.19, 0.25, 0.29), metal=0.3, rough=0.75, panel=0.1, grime=0.1)
ground = renderer.mat((0.19, 0.37, 0.24), metal=0.03, rough=0.9, panel=0, grime=0)
leaf = renderer.mat((0.18, 0.48, 0.24), metal=0, rough=0.9, panel=0, grime=0)
gold = renderer.mat((0.71, 0.53, 0.25), metal=0.35, rough=0.65, panel=0.1, grime=0)
blue = renderer.mat((0.19, 0.34, 0.51), metal=0.35, rough=0.65, panel=0.4, grime=0)


def shift(m, x, y, z=0):
    return m.tf(lambda v: v + np.array([x, y, z]))


def tree(x, y, z, height=0.12):
    return [
        station_mesh.zcyl((x, y, z + height * 0.4), 0.009, height * 0.4, gold),
        station_mesh.sphere((x, y, z + height), height * 0.34, leaf, squash=1.3),
    ]


def biodome():
    meshes = [
        station_mesh.zcyl((0, 0, -0.09), 0.68, 0.08, hull),
        station_mesh.zcyl((0, 0, 0.0), 0.61, 0.025, ground),
        station_mesh.flat_torus(0.64, 0.027, dark),
    ]
    # Dome ribs leave clear viewing bays; no false opaque shell hiding the forest.
    for k in range(6):
        angle = k * math.pi / 6
        for j in range(14):
            t0 = j * math.pi / 14
            t1 = (j + 1) * math.pi / 14
            p = np.array([0.63 * math.cos(t0), 0, 0.42 * math.sin(t0)])
            q = np.array([0.63 * math.cos(t1), 0, 0.42 * math.sin(t1)])
            # A slim loft follows the curved pressure-dome frame.
            rib = station_mesh.loft(
                [(p[0], 0, p[2], 0.008, 0.008, 2), (q[0], 0, q[2], 0.008, 0.008, 2)],
                hull,
                ring=6,
                axis="x",
            )
            meshes.append(station_mesh.rot_z(rib, angle))
    for i in range(37):
        angle = i * 2.39996
        radius = 0.51 * math.sqrt((i + 0.5) / 37)
        meshes += tree(
            radius * math.cos(angle),
            radius * math.sin(angle),
            0.035,
            0.09 + (i % 4) * 0.015,
        )
    meshes += [
        station_mesh.block((0.78, 0, -0.035), (0.17, 0.10, 0.04), hull),
        station_mesh.block((0.94, 0, -0.025), (0.03, 0.17, 0.035), dark),
    ]
    return meshes


def cylinder():
    meshes = [
        station_mesh.loft(
            [(-0.85, 0, 0, 0.23, 0.23, 2), (0.85, 0, 0, 0.23, 0.23, 2)],
            hull,
            ring=24,
            axis="x",
        )
    ]
    for x in (-0.68, 0.68):
        tor = station_mesh.flat_torus(0.36, 0.055, hull).tf(
            lambda v: np.column_stack([v[:, 2], v[:, 0], v[:, 1]])
        )
        meshes.append(shift(tor, x, 0))
    for angle in (0, math.pi * 0.67, math.pi * 1.33):
        meshes += [
            station_mesh.block(
                (0, 0.27 * math.cos(angle), 0.27 * math.sin(angle)),
                (0.64, 0.025, 0.025),
                gold,
            )
        ]
    meshes += [
        station_mesh.block((0, -0.49, 0), (0.25, 0.13, 0.07), dark),
        station_mesh.arm(-math.pi / 2, 0.2, 0.5, 0.035, hull),
    ]
    return meshes


def crescent():
    meshes = [
        station_mesh.flat_torus(0.70, 0.09, hull, arc=0.75),
        station_mesh.flat_torus(0.70, 0.025, gold, z=0.09, arc=0.75),
        station_mesh.zcyl((0, 0, 0), 0.16, 0.16, hull),
    ]
    for k in range(5):
        angle = k * math.pi / 3
        meshes += [
            station_mesh.arm(angle, 0.15, 0.63, 0.035, dark),
            station_mesh.rot_z(
                station_mesh.block((0.73, 0, 0.12), (0.10, 0.085, 0.07), hull), angle
            ),
        ]
    meshes += [
        station_mesh.block((0.45, -0.48, -0.02), (0.31, 0.035, 0.025), hull),
        station_mesh.block((0.45, -0.68, -0.02), (0.31, 0.035, 0.025), hull),
    ]
    return meshes


def bastion():
    meshes = [
        station_mesh.zcyl((0, 0, 0), 0.48, 0.13, dark, ring=8),
        station_mesh.zcyl((0, 0, 0.17), 0.25, 0.07, hull, ring=8),
    ]
    for k in range(4):
        angle = k * math.pi / 2 + math.pi / 4
        meshes += [
            station_mesh.arm(angle, 0.4, 0.73, 0.065, hull),
            station_mesh.rot_z(
                station_mesh.block((0.72, 0, 0), (0.13, 0.15, 0.16), hull), angle
            ),
            station_mesh.light(angle, 0.72, 0.19, station_mesh.GAMBER, 0.025),
        ]
    meshes += [
        station_mesh.zcyl((0, 0, 0.29), 0.09, 0.06, dark),
        station_mesh.sphere((0, 0, 0.37), 0.06, blue),
    ]
    return meshes


def refinery():
    meshes = [
        station_mesh.block((0, 0, 0), (0.64, 0.13, 0.09), dark),
        station_mesh.block((-0.42, 0, 0.15), (0.20, 0.19, 0.10), hull),
    ]
    for x in (-0.1, 0.2, 0.5):
        for y in (-0.3, 0.3):
            meshes += [
                station_mesh.zcyl((x, y, 0.02), 0.12, 0.19, gold),
                station_mesh.block((x, y / 2, -0.05), (0.025, 0.15, 0.025), hull),
            ]
    meshes += [
        station_mesh.block((0.15, 0, 0.2), (0.44, 0.025, 0.025), hull),
        station_mesh.block((-0.65, 0, 0.29), (0.025, 0.1, 0.025), station_mesh.GORANGE),
    ]
    return meshes


def relay():
    meshes = [
        station_mesh.zcyl((0, 0, -0.12), 0.16, 0.28, hull),
        station_mesh.flat_torus(0.47, 0.025, dark, z=0.18, arc=0.75),
    ]
    for k in range(3):
        angle = k * 2 * math.pi / 3
        meshes += [
            station_mesh.arm(angle, 0.14, 0.78, 0.025, hull, z=-0.12),
            station_mesh.rot_z(
                station_mesh.block((0.60, 0, -0.1), (0.20, 0.17, 0.012), blue), angle
            ),
            station_mesh.light(angle, 0.81, -0.08, station_mesh.GTEAL, 0.025),
        ]
    for z in (0.20, 0.29, 0.38):
        meshes += [
            station_mesh.flat_torus(0.23 - (z - 0.2) * 0.55, 0.025, hull, z=z, arc=0.8)
        ]
    meshes += [station_mesh.sphere((0, 0, 0.43), 0.035, station_mesh.GTEAL)]
    return meshes


def luna():
    indigo = renderer.mat(
        (0.22, 0.19, 0.40), metal=0.25, rough=0.75, panel=0.13, grime=0.08
    )
    violet = renderer.mat((0.25, 0.13, 0.44), metal=0.3, rough=0.65, panel=0, grime=0)
    meshes = [
        station_mesh.flat_torus(0.74, 0.085, indigo),
        station_mesh.flat_torus(0.74, 0.025, violet, z=0.08),
        station_mesh.zcyl((0, 0, 0), 0.29, 0.15, indigo, ring=64),
        station_mesh.zcyl((0, 0, 0.18), 0.22, 0.04, violet, ring=64),
    ]
    for k in range(6):
        angle = k * math.pi / 3
        meshes += [
            station_mesh.arm(angle, 0.24, 0.69, 0.037, dark),
            station_mesh.rot_z(
                station_mesh.block((0.75, 0, -0.07), (0.12, 0.09, 0.06), indigo), angle
            ),
            station_mesh.light(angle, 0.74, 0.11, station_mesh.GAMBER, 0.016),
        ]
    for y in (-0.13, 0.13):
        meshes += [station_mesh.block((0.99, y, -0.08), (0.22, 0.025, 0.025), hull)]
    return meshes


DESIGNS = {
    "biodome": biodome,
    "cylinder": cylinder,
    "crescent": crescent,
    "bastion": bastion,
    "refinery": refinery,
    "relay": relay,
    "luna": luna,
}

if __name__ == "__main__":
    output = Path(__file__).resolve().parents[1] / "client/assets/stations"
    output.mkdir(parents=True, exist_ok=True)
    for key, make_meshes in DESIGNS.items():
        meshes = make_meshes()
        extent = np.linalg.norm(
            np.concatenate([mesh.vertices for mesh in meshes]), axis=1
        ).max()
        for size, suffix in [(360, ""), (800, "_landed")]:
            rgb, alpha = renderer.render(
                meshes, size, 25, size * 0.43 / extent, tilt=50, ss=3, density=10
            )[0]
            pixels = (
                np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(alpha, 0, 1) * 255])
                .round()
                .astype(np.uint8)
            )
            Image.fromarray(pixels).save(
                output / f"s_{key}{suffix}.webp", "WEBP", quality=92, method=6
            )
            print(key, size, flush=True)
