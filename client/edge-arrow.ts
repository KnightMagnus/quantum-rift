// Placement for off-screen target arrows, kept clear of HUD cards drawn over the flight view.

/** A screen-space rectangle in canvas pixels. */
export interface ScreenRect {
  /** Left edge. */
  left: number;

  /** Top edge. */
  top: number;

  /** Right edge. */
  right: number;

  /** Bottom edge. */
  bottom: number;
}

/** Distance kept between an edge arrow and the screen border. */
export const EDGE_ARROW_MARGIN = 46;

// Room for the arrow head and the label drawn just inside it.
const OBSTACLE_PADDING = 24;

/** Extra room kept around HUD cards, in canvas pixels. */
export interface ArrowClearance {
  /** Horizontal room, usually half the label width. */
  x: number;

  /** Vertical room. */
  y: number;
}

/**
 * Finds where an edge arrow for an off-screen point sits. The arrow lies on the
 * ray from the screen centre toward the point. It stops at the screen border, or
 * earlier where the ray would otherwise end under a HUD card.
 * @param width Canvas width.
 * @param height Canvas height.
 * @param targetX Projected screen X of the target.
 * @param targetY Projected screen Y of the target.
 * @param obstacles HUD rectangles the arrow must not sit under.
 * @param clearance Room kept around each obstacle for the arrow and its label.
 * @returns Arrow position, or null when the target is on screen.
 */
export function edgeArrowAnchor(
  width: number,
  height: number,
  targetX: number,
  targetY: number,
  obstacles: ScreenRect[] = [],
  clearance: ArrowClearance = { x: OBSTACLE_PADDING, y: OBSTACLE_PADDING },
): { x: number; y: number } | null {
  const margin = EDGE_ARROW_MARGIN;
  if (targetX > margin && targetY > margin && targetX < width - margin && targetY < height - margin)
    return null;
  const centerX = width / 2,
    centerY = height / 2,
    deltaX = targetX - centerX || 1e-6,
    deltaY = targetY - centerY || 1e-6;
  let reach = Math.min(
    (width / 2 - margin) / Math.abs(deltaX),
    (height / 2 - margin) / Math.abs(deltaY),
  );
  for (const obstacle of obstacles) {
    const entry = rayEntry(centerX, centerY, deltaX, deltaY, padded(obstacle, clearance));
    if (entry && entry.enter > 0 && entry.enter < reach && entry.exit >= reach) reach = entry.enter;
  }
  return { x: centerX + deltaX * reach, y: centerY + deltaY * reach };
}

/**
 * Grows a rectangle by the arrow clearance on every side.
 * @param rect Rectangle to grow.
 * @param clearance Horizontal and vertical room.
 * @returns The padded rectangle.
 */
function padded(rect: ScreenRect, clearance: ArrowClearance): ScreenRect {
  return {
    left: rect.left - clearance.x,
    top: rect.top - clearance.y,
    right: rect.right + clearance.x,
    bottom: rect.bottom + clearance.y,
  };
}

/**
 * Intersects a ray with a rectangle (slab method).
 * @param originX Ray origin X.
 * @param originY Ray origin Y.
 * @param directionX Ray direction X.
 * @param directionY Ray direction Y.
 * @param rect Rectangle to test.
 * @returns Ray parameters where it enters and leaves the rectangle, or null on a miss.
 */
function rayEntry(
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  rect: ScreenRect,
): { enter: number; exit: number } | null {
  const leftHit = (rect.left - originX) / directionX,
    rightHit = (rect.right - originX) / directionX,
    topHit = (rect.top - originY) / directionY,
    bottomHit = (rect.bottom - originY) / directionY;
  const enter = Math.max(Math.min(leftHit, rightHit), Math.min(topHit, bottomHit)),
    exit = Math.min(Math.max(leftHit, rightHit), Math.max(topHit, bottomHit));
  return enter <= exit ? { enter, exit } : null;
}
