interface TowObject {
  id: number;
  status: string;
  x: number;
  y: number;
  tug?: { x: number; y: number } | null;
  mass?: number | null;
  revealed?: boolean;
  ore: string;
  field: { label: string };
  ports: string[];
}
interface TowSnapshot {
  objects: TowObject[];
  attached?: number | null;
}
export interface TowingRenderState {
  towing?: TowSnapshot | null;
  you?: { towing?: TowSnapshot | null } | null;
  towTarget?: number;
  view?: { x: number; y: number } | null;
  opts: { cb?: boolean };
}
import { STELLARS } from '../shared/galaxy.ts';
import { motherlodeArt, TOW as towingRules } from '../shared/towing-rules.ts';
const images = new Map<string, HTMLImageElement>();
function image(name: string) {
  if (!images.has(name)) {
    const htmlImageElement = new Image();
    htmlImageElement.src = '/assets/objects/' + name;
    images.set(name, htmlImageElement);
  }
  return images.get(name);
}
export function drawTowing(
  towingRenderState: TowingRenderState,
  canvasRenderingContext2D: CanvasRenderingContext2D,
  screenX: (positionX: number) => number,
  screenY: (positionY: number) => number,
  positionZ: number,
  width: number,
  height: number,
) {
  const towSnapshot = towingRenderState.towing || towingRenderState.you?.towing;
  if (!towSnapshot) return;
  canvasRenderingContext2D.save();
  const pixelX = devicePixelRatio || 1;
  canvasRenderingContext2D.font = `bold ${14 * pixelX}px "Pixelify Sans", sans-serif`;
  canvasRenderingContext2D.textAlign = 'center';
  for (const towObject of towSnapshot.objects) {
    if (['delivered', 'destroyed'].includes(towObject.status)) continue;
    const positionX = screenX(towObject.x),
      positionY = screenY(towObject.y);
    if (positionX < -150 || positionX > width + 150 || positionY < -150 || positionY > height + 150)
      continue;
    const selected = towObject.id === towingRenderState.towTarget,
      owner = towObject.id === towSnapshot.attached,
      motherlodeArt2 = motherlodeArt(towObject),
      radius = 42 * positionZ;
    const tugEntity = owner && towingRenderState.view ? towingRenderState.view : towObject.tug;
    if (towObject.status === 'attached' && tugEntity) {
      const targetX = screenX(tugEntity.x),
        targetY = screenY(tugEntity.y);
      canvasRenderingContext2D.strokeStyle = towingRenderState.opts.cb
        ? '#fff0a0'
        : owner
          ? '#82e5e0'
          : '#c8c9d4';
      canvasRenderingContext2D.lineWidth = 2;
      canvasRenderingContext2D.setLineDash([8, 5]);
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(targetX, targetY);
      canvasRenderingContext2D.lineTo(positionX, positionY);
      canvasRenderingContext2D.stroke();
      canvasRenderingContext2D.setLineDash([]);
      canvasRenderingContext2D.strokeRect(targetX - 4, targetY - 4, 8, 8);
      canvasRenderingContext2D.fillStyle = canvasRenderingContext2D.strokeStyle;
      canvasRenderingContext2D.fillText(
        `TETHER ${Math.round(Math.hypot(tugEntity.x - towObject.x, tugEntity.y - towObject.y))}/320 · NO TRANSIT`,
        (targetX + positionX) / 2,
        (targetY + positionY) / 2 - 12 * pixelX,
      );
    }
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.beginPath();
    for (let index = 0; index < motherlodeArt2.sides; index++) {
      const firstValue = (index * Math.PI * 2) / motherlodeArt2.sides,
        radius2 = radius * (index % 2 ? 0.82 : 1);
      if (index)
        canvasRenderingContext2D.lineTo(
          positionX + Math.cos(firstValue) * radius2,
          positionY + Math.sin(firstValue) * radius2,
        );
      else
        canvasRenderingContext2D.moveTo(
          positionX + Math.cos(firstValue) * radius2,
          positionY + Math.sin(firstValue) * radius2,
        );
    }
    canvasRenderingContext2D.closePath();
    const htmlImageElement = motherlodeArt2.base ? image(motherlodeArt2.base) : null;
    if (htmlImageElement?.complete && htmlImageElement.naturalWidth)
      canvasRenderingContext2D.drawImage(
        htmlImageElement,
        positionX - radius,
        positionY - radius,
        radius * 2,
        radius * 2,
      );
    else {
      if (motherlodeArt2.kind === 'unknown') {
        const shade = canvasRenderingContext2D.createLinearGradient(
          positionX - radius,
          positionY - radius,
          positionX + radius,
          positionY + radius,
        );
        shade.addColorStop(0, '#b0b5bc');
        shade.addColorStop(0.4, '#747d88');
        shade.addColorStop(1, '#282f39');
        canvasRenderingContext2D.fillStyle = shade;
      } else canvasRenderingContext2D.fillStyle = '#333943';
      canvasRenderingContext2D.fill();
    }
    // Material geometry stays recognizable at flight zoom, even without rasters.
    canvasRenderingContext2D.translate(positionX, positionY);
    canvasRenderingContext2D.scale(radius, radius);
    canvasRenderingContext2D.strokeStyle = motherlodeArt2.color;
    canvasRenderingContext2D.fillStyle = motherlodeArt2.color;
    canvasRenderingContext2D.lineWidth = 0.045;
    canvasRenderingContext2D.setLineDash([]);
    if (motherlodeArt2.kind === 'unknown') {
      // Identical neutral geology: no resource-derived seeds or hues.
      for (let index = 0; index < 18; index++) {
        const firstValue = index * 2.39996,
          radius = 0.17 + (index % 5) * 0.13,
          deltaX = Math.cos(firstValue) * radius,
          deltaY = Math.sin(firstValue) * radius,
          portraitElement = 0.035 + (index % 3) * 0.018;
        canvasRenderingContext2D.fillStyle = '#424b57';
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.arc(deltaX, deltaY, portraitElement, 0, Math.PI * 2);
        canvasRenderingContext2D.fill();
        canvasRenderingContext2D.strokeStyle = '#929ba6';
        canvasRenderingContext2D.lineWidth = 0.014;
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.arc(deltaX, deltaY + 0.015, portraitElement, 0.15, 2.6);
        canvasRenderingContext2D.stroke();
      }
      canvasRenderingContext2D.strokeStyle = '#56616e';
      canvasRenderingContext2D.lineWidth = 0.022;
      canvasRenderingContext2D.beginPath();
      canvasRenderingContext2D.moveTo(-0.6, -0.4);
      canvasRenderingContext2D.lineTo(-0.25, -0.18);
      canvasRenderingContext2D.lineTo(-0.32, 0.14);
      canvasRenderingContext2D.lineTo(0.12, 0.42);
      canvasRenderingContext2D.stroke();
    } else if (motherlodeArt2.kind === 'ore') {
      for (const [deltaX, deltaY] of [
        [-0.4, -0.25],
        [0.12, 0.05],
        [-0.25, 0.4],
      ]) {
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.moveTo(deltaX - 0.18, deltaY + 0.12);
        canvasRenderingContext2D.lineTo(deltaX, deltaY - 0.12);
        canvasRenderingContext2D.lineTo(deltaX + 0.27, deltaY - 0.02);
        canvasRenderingContext2D.stroke();
      }
    } else if (motherlodeArt2.kind === 'gas') {
      for (const [deltaX, deltaY, radius] of [
        [-0.5, -0.35, 0.24],
        [0.4, 0.2, 0.3],
        [-0.2, 0.5, 0.2],
      ]) {
        canvasRenderingContext2D.globalAlpha = 0.3;
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.arc(deltaX, deltaY, radius, 0, Math.PI * 2);
        canvasRenderingContext2D.fill();
        canvasRenderingContext2D.globalAlpha = 1;
        canvasRenderingContext2D.stroke();
      }
    } else if (motherlodeArt2.kind === 'shards') {
      for (const [deltaX, deltaY, tilt] of [
        [-0.35, 0.1, -0.4],
        [0, -0.08, 0.1],
        [0.35, 0.2, 0.5],
      ]) {
        canvasRenderingContext2D.save();
        canvasRenderingContext2D.translate(deltaX, deltaY);
        canvasRenderingContext2D.rotate(tilt);
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.moveTo(0, -0.85);
        canvasRenderingContext2D.lineTo(0.16, -0.25);
        canvasRenderingContext2D.lineTo(0.12, 0.25);
        canvasRenderingContext2D.lineTo(-0.12, 0.25);
        canvasRenderingContext2D.lineTo(-0.16, -0.25);
        canvasRenderingContext2D.closePath();
        canvasRenderingContext2D.fillStyle = '#563973';
        canvasRenderingContext2D.fill();
        canvasRenderingContext2D.stroke();
        canvasRenderingContext2D.beginPath();
        canvasRenderingContext2D.moveTo(0, -0.85);
        canvasRenderingContext2D.lineTo(0, 0.2);
        canvasRenderingContext2D.stroke();
        canvasRenderingContext2D.restore();
      }
    }
    canvasRenderingContext2D.restore();
    canvasRenderingContext2D.strokeStyle = towingRenderState.opts.cb
      ? '#fff0a0'
      : motherlodeArt2.color;
    canvasRenderingContext2D.lineWidth = selected ? 3 : 1.5;
    canvasRenderingContext2D.setLineDash(towObject.status === 'detached' ? [2, 5] : [9, 4]);
    canvasRenderingContext2D.strokeRect(
      positionX - radius - 4,
      positionY - radius - 4,
      radius * 2 + 8,
      radius * 2 + 8,
    );
    canvasRenderingContext2D.setLineDash([]);
    canvasRenderingContext2D.fillStyle = '#fff1cb';
    canvasRenderingContext2D.strokeStyle = '#0b1019';
    canvasRenderingContext2D.lineWidth = 4;
    const text = `MOTHERLODE ${towObject.id} · ${towObject.status.toUpperCase()} · ${towObject.mass ?? '?'}t`;
    canvasRenderingContext2D.strokeText(text, positionX, positionY + radius + 20 * pixelX);
    canvasRenderingContext2D.fillText(text, positionX, positionY + radius + 20 * pixelX);
    if (towObject.revealed && selected) {
      canvasRenderingContext2D.fillText(
        `${towObject.ore.toUpperCase()} · ${towObject.field.label}`,
        positionX,
        positionY + radius + 36 * pixelX,
      );
      for (const port of towObject.ports) {
        const stellarBody = STELLARS[port];
        if (stellarBody) {
          canvasRenderingContext2D.save();
          canvasRenderingContext2D.globalAlpha = 0.35;
          canvasRenderingContext2D.beginPath();
          canvasRenderingContext2D.arc(
            screenX(stellarBody.x),
            screenY(stellarBody.y),
            (stellarBody.r + towingRules.deliveryApron) * positionZ,
            0,
            Math.PI * 2,
          );
          canvasRenderingContext2D.stroke();
          canvasRenderingContext2D.restore();
          canvasRenderingContext2D.strokeRect(
            screenX(stellarBody.x) - 15,
            screenY(stellarBody.y) - 15,
            30,
            30,
          );
          canvasRenderingContext2D.fillText(
            'ACCEPTS MOTHERLODE · AUTO DELIVERY',
            screenX(stellarBody.x),
            screenY(stellarBody.y) - 24 * pixelX,
          );
        }
      }
    }
  }
  canvasRenderingContext2D.restore();
}
