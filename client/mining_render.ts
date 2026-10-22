interface MiningRock {
  id: number;
  down?: boolean;
  x: number;
  y: number;
  r: number;
  gas?: boolean;
  heat: number;
  stage: number;
  stages: number;
  ready?: boolean;
}
interface MiningReveal {
  id: number;
  seam: number;
  hazard: string;
}
export interface MiningRenderState {
  you?: { sys?: string } | null;
  opts: { scale?: number; cb?: boolean; motion?: boolean };
  miningRocks?: { version: number; rocks: MiningRock[] } | null;
  mining?: { revealed?: MiningReveal[]; revealUntil: number; now: number } | null;
  miningTarget?: number;
  view?: { rx: number; ry: number } | null;
  miningHazards?: Array<{ x: number; y: number; radius: number; detonateAt: number }>;
  miningPressure?: { warn?: boolean; noise: number } | null;
}
import { CORONA_BANDS } from '../shared/industrial-rules.ts';
// Presentation only: all heat/work/stage/reveal data comes from server snapshots.
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export function drawMining(
  miningRenderState: MiningRenderState,
  canvasRenderingContext2D: CanvasRenderingContext2D,
  screenX: (positionX: number) => number,
  screenY: (positionY: number) => number,
  positionZ: number,
  width: number,
  height: number,
  currentTime: number,
) {
  canvasRenderingContext2D.save();
  canvasRenderingContext2D.font = `bold ${14 * (devicePixelRatio || 1)}px "Pixelify Sans", sans-serif`;
  canvasRenderingContext2D.strokeStyle = '#ffcf8a';
  canvasRenderingContext2D.fillStyle = '#fff0cf';
  canvasRenderingContext2D.lineWidth = 3;
  canvasRenderingContext2D.setLineDash([10, 7]);
  for (const filter2 of CORONA_BANDS.filter(
    (secondValue) => secondValue.sys === miningRenderState.you?.sys,
  )) {
    for (const radius of [filter2.inner, filter2.outer]) {
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.arc(
        screenX(filter2.x),
        screenY(filter2.y),
        radius * positionZ,
        0,
        Math.PI * 2,
      );
      canvasRenderingContext2D.stroke();
    }
    const positionX = screenX(filter2.entry.x),
      positionY = screenY(filter2.entry.y);
    canvasRenderingContext2D.fillText(
      '☀ OPT-IN SHALLOW COLLECTOR — EXIT EAST →',
      positionX,
      positionY - 20,
    );
    canvasRenderingContext2D.strokeRect(positionX - 15, positionY - 15, 30, 30);
  }
  canvasRenderingContext2D.restore();
  const wire = miningRenderState.miningRocks;
  if (!wire || wire.version !== 1) return;
  const reveal = new Map(
    (miningRenderState.mining?.revealed || []).map((miningReveal) => [
      miningReveal.id,
      miningReveal,
    ]),
  );
  canvasRenderingContext2D.save();
  canvasRenderingContext2D.font = `bold ${Math.max(12, Math.min(17, 13 * (Number(miningRenderState.opts.scale) || 1)))}px "Pixelify Sans", sans-serif`;
  canvasRenderingContext2D.textAlign = 'center';
  for (const miningRock of wire.rocks) {
    if (miningRock.down) continue;
    const shown = reveal.get(miningRock.id),
      selected = miningRock.id === miningRenderState.miningTarget;
    if (!shown && !selected && miningRock.heat < 1) continue;
    const positionX = screenX(miningRock.x),
      positionY = screenY(miningRock.y),
      radius = miningRock.r * positionZ + 6;
    if (positionX < -100 || positionX > width + 100 || positionY < -100 || positionY > height + 100)
      continue;
    canvasRenderingContext2D.strokeStyle = miningRenderState.opts.cb ? '#fff0a0' : '#7de8ea';
    canvasRenderingContext2D.lineWidth = selected ? 3 : 2;
    canvasRenderingContext2D.setLineDash(shown ? [7, 4] : [2, 6]);
    canvasRenderingContext2D.beginPath();
    if (shown)
      canvasRenderingContext2D.arc(
        positionX,
        positionY,
        radius,
        shown.seam - 1.15,
        shown.seam + 1.15,
      );
    else canvasRenderingContext2D.arc(positionX, positionY, radius, 0, Math.PI * 2);
    canvasRenderingContext2D.stroke();
    canvasRenderingContext2D.setLineDash([]);
    if (selected || shown) {
      const text = `${miningRock.gas ? 'VENT' : 'SEAM'} ${miningRock.stage + 1}/${miningRock.stages} · ${miningRock.ready ? 'READY' : Math.round(miningRock.heat) + '°'}${shown ? ' · ' + (shown.hazard === 'volatile' ? 'VOLATILE' : 'SAFE') : ''}`;
      canvasRenderingContext2D.lineWidth = 4;
      canvasRenderingContext2D.strokeStyle = '#090d14';
      canvasRenderingContext2D.strokeText(text, positionX, positionY + radius + 18);
      canvasRenderingContext2D.fillStyle = '#fff1c9';
      canvasRenderingContext2D.fillText(text, positionX, positionY + radius + 18);
      if (shown) {
        canvasRenderingContext2D.font = '14px "Pixelify Sans", sans-serif';
        canvasRenderingContext2D.strokeText(
          'common / rich / pure potential',
          positionX,
          positionY + radius + 33,
        );
        canvasRenderingContext2D.fillText(
          'common / rich / pure potential',
          positionX,
          positionY + radius + 33,
        );
      }
    }
    if (miningRock.gas && shown) {
      canvasRenderingContext2D.fillStyle = '#b2f8df';
      for (let index = 0; index < 3; index++) {
        const firstValue =
          (index / 3) * Math.PI * 2 +
          (reduced() || miningRenderState.opts.motion === false ? 0 : currentTime * 0.0002);
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.arc(
          positionX + Math.cos(firstValue) * radius * 0.6,
          positionY + Math.sin(firstValue) * radius * 0.6,
          3,
          0,
          Math.PI * 2,
        );
        canvasRenderingContext2D.fill();
      }
    }
  }
  if (
    miningRenderState.mining &&
    miningRenderState.mining.revealUntil > miningRenderState.mining.now &&
    miningRenderState.view
  ) {
    canvasRenderingContext2D.strokeStyle = '#7de8ea55';
    canvasRenderingContext2D.setLineDash([12, 12]);
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(
      screenX(miningRenderState.view.rx),
      screenY(miningRenderState.view.ry),
      (reduced() || miningRenderState.opts.motion === false
        ? 120
        : 70 + (currentTime % 1000) * 0.07) * positionZ,
      0,
      Math.PI * 2,
    );
    canvasRenderingContext2D.stroke();
  }
  const devicePixelRatio2 = devicePixelRatio || 1;
  canvasRenderingContext2D.font = `bold ${14 * devicePixelRatio2}px "Pixelify Sans", sans-serif`;
  for (const height of miningRenderState.miningHazards || []) {
    const positionX = screenX(height.x),
      positionY = screenY(height.y);
    canvasRenderingContext2D.setLineDash([8, 5]);
    canvasRenderingContext2D.strokeStyle = miningRenderState.opts.cb ? '#fff' : '#ffb84a';
    canvasRenderingContext2D.lineWidth = 3;
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(positionX, positionY, height.radius * positionZ, 0, Math.PI * 2);
    canvasRenderingContext2D.stroke();
    canvasRenderingContext2D.setLineDash([]);
    canvasRenderingContext2D.fillStyle = '#fff';
    canvasRenderingContext2D.fillText(
      `VOLATILE — ${Math.max(0, height.detonateAt - (miningRenderState.mining?.now || 0)).toFixed(1)}s`,
      positionX,
      positionY - height.radius * positionZ - 16 * devicePixelRatio2,
    );
  }
  if (miningRenderState.miningPressure?.warn) {
    canvasRenderingContext2D.fillStyle = '#ffdf9e';
    canvasRenderingContext2D.textAlign = 'left';
    canvasRenderingContext2D.fillText(
      `MINING PRESSURE ${Math.round(miningRenderState.miningPressure.noise)}/100 — leave field to cool`,
      18 * devicePixelRatio2,
      90 * devicePixelRatio2,
    );
  }
  canvasRenderingContext2D.restore();
}
