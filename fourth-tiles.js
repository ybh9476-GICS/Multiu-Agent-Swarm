import { subtileBounds, subtileRadius } from './subtiles.js';

export const fourthRadius = 13;
export const fourthDetailSize = { width: 88, height: 40 };
export const fourthConnectionGap = 112;

function stableSample(parentId) {
  let hash = 2166136261;
  for (let index = 0; index < parentId.length; index++) {
    hash ^= parentId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

export function createFourthLevelItems(parents, sampleForParent = parent => stableSample(parent.id)) {
  return parents.flatMap((parent, parentIndex) => {
    const sample = sampleForParent(parent);
    const count = 1 + Math.floor(Math.max(0, Math.min(0.999999, sample)) * 5);
    return Array.from({ length: count }, (_, index) => ({
      id: `${parent.id}-unknown-${index + 1}`,
      parentId: parent.id,
      index,
      count,
      motionIndex: parentIndex * 5 + index,
    }));
  });
}

export const fourthBounds = (center, expanded = false) => ({
  x: center.x - (expanded ? fourthDetailSize.width / 2 : fourthRadius),
  y: center.y - (expanded ? fourthDetailSize.height / 2 : fourthRadius),
  width: expanded ? fourthDetailSize.width : fourthRadius * 2,
  height: expanded ? fourthDetailSize.height : fourthRadius * 2,
});

function overlaps(a, b) {
  const gap = 8;
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

export function layoutFourthLevelItems(items, parentCenters, expandedIds, obstacles, supervisorCenter) {
  const occupied = [...obstacles];
  const positions = new Map();
  for (const item of items) {
    const parent = parentCenters.get(item.parentId);
    if (!parent) continue;
    const dx = parent.x - supervisorCenter.x;
    const dy = parent.y - supervisorCenter.y;
    const length = Math.hypot(dx, dy);
    const radial = length ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
    const tangent = { x: -radial.y, y: radial.x };
    const angle = (item.index - (item.count - 1) / 2) * 0.43;
    const direction = {
      x: radial.x * Math.cos(angle) + tangent.x * Math.sin(angle),
      y: radial.y * Math.cos(angle) + tangent.y * Math.sin(angle),
    };
    const expanded = expandedIds.has(item.parentId);
    const bounds = subtileBounds(parent, expanded);
    const edge = expanded
      ? Math.min(direction.x ? bounds.width / 2 / Math.abs(direction.x) : Infinity,
        direction.y ? bounds.height / 2 / Math.abs(direction.y) : Infinity)
      : subtileRadius;
    let distance = edge + fourthRadius + fourthConnectionGap;
    let center;
    let box;
    for (;;) {
      center = { x: parent.x + direction.x * distance, y: parent.y + direction.y * distance };
      box = fourthBounds(center);
      const blocking = occupied.find(other => overlaps(box, other));
      if (!blocking) break;
      const exitX = direction.x > 0
        ? (blocking.x + blocking.width + 8 - box.x) / direction.x
        : direction.x < 0 ? (box.x + box.width + 8 - blocking.x) / -direction.x : Infinity;
      const exitY = direction.y > 0
        ? (blocking.y + blocking.height + 8 - box.y) / direction.y
        : direction.y < 0 ? (box.y + box.height + 8 - blocking.y) / -direction.y : Infinity;
      distance += Math.min(exitX, exitY) + 0.1;
    }
    positions.set(item.id, center);
    occupied.push(box);
  }
  return positions;
}

export function fourthConnectionAt(parent, child, expanded = false, childExpanded = false) {
  const dx = child.x - parent.x;
  const dy = child.y - parent.y;
  const length = Math.hypot(dx, dy) || 1;
  const unit = { x: dx / length, y: dy / length };
  const bounds = subtileBounds(parent, expanded);
  const parentEdge = expanded
    ? Math.min(unit.x ? bounds.width / 2 / Math.abs(unit.x) : Infinity,
      unit.y ? bounds.height / 2 / Math.abs(unit.y) : Infinity)
    : subtileRadius;
  const start = { x: parent.x + unit.x * parentEdge, y: parent.y + unit.y * parentEdge };
  const childEdge = childExpanded
    ? Math.min(unit.x ? fourthDetailSize.width / 2 / Math.abs(unit.x) : Infinity,
      unit.y ? fourthDetailSize.height / 2 / Math.abs(unit.y) : Infinity) : fourthRadius;
  const end = { x: child.x - unit.x * childEdge, y: child.y - unit.y * childEdge };
  return { start, end, path: `M ${start.x} ${start.y} L ${end.x} ${end.y}` };
}

export function fourthFloatAt(item, seconds, reducedMotion = false) {
  if (reducedMotion) return { x: 0, y: 0 };
  const phase = item.motionIndex * 1.73;
  const gain = Math.min(1, Math.max(0, seconds / 2));
  return {
    x: Math.sin(seconds * 0.68 + phase) * 3.5 * gain,
    y: Math.sin(seconds * 0.53 + phase * 1.37) * 4 * gain,
  };
}

// Keep each child near its last displayed position while targets and blockers move.
// Resolve actual overlap after interpolation, with selected and dragged cards taking priority.
export function settleFourthLevelPositions(targets, previous, obstacles, deltaSeconds,
  draggedId = null, reducedMotion = false, expandedIds = new Set()) {
  const blend = reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, deltaSeconds) * 8);
  const positions = new Map([...targets].map(([id, target]) => {
    const last = previous.get(id);
    if (!last || id === draggedId || reducedMotion) return [id, { ...target }];
    const dx = (target.x - last.x) * blend;
    const dy = (target.y - last.y) * blend;
    const distance = Math.hypot(dx, dy);
    const limit = Math.max(1.5, deltaSeconds * 130);
    const scale = distance > limit ? limit / distance : 1;
    return [id, { x: last.x + dx * scale, y: last.y + dy * scale }];
  }));
  const ids = [...positions.keys()];
  const gap = 9;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < ids.length; i++) {
      const a = positions.get(ids[i]);
      for (let j = i + 1; j < ids.length; j++) {
        const b = positions.get(ids[j]);
        if (!expandedIds.has(ids[i]) && !expandedIds.has(ids[j])) {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy);
          const minimum = fourthRadius * 2 + gap;
          if (distance >= minimum) continue;
          const angle = (i * 17 + j * 31) * 0.7;
          const ux = distance ? dx / distance : Math.cos(angle);
          const uy = distance ? dy / distance : Math.sin(angle);
          const separation = minimum - distance;
          const aLocked = ids[i] === draggedId;
          const bLocked = ids[j] === draggedId;
          if (!aLocked) {
            a.x -= ux * separation * (bLocked ? 1 : 0.5);
            a.y -= uy * separation * (bLocked ? 1 : 0.5);
          }
          if (!bLocked) {
            b.x += ux * separation * (aLocked ? 1 : 0.5);
            b.y += uy * separation * (aLocked ? 1 : 0.5);
          }
          continue;
        }
        const aBox = fourthBounds(a, expandedIds.has(ids[i]));
        const bBox = fourthBounds(b, expandedIds.has(ids[j]));
        const overlapX = Math.min(aBox.x + aBox.width + gap - bBox.x,
          bBox.x + bBox.width + gap - aBox.x);
        const overlapY = Math.min(aBox.y + aBox.height + gap - bBox.y,
          bBox.y + bBox.height + gap - aBox.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        const axis = overlapX < overlapY ? 'x' : 'y';
        const sign = b[axis] >= a[axis] ? 1 : -1;
        const distance = axis === 'x' ? overlapX : overlapY;
        const aLocked = ids[i] === draggedId || (expandedIds.has(ids[i]) && !expandedIds.has(ids[j]));
        const bLocked = ids[j] === draggedId || (expandedIds.has(ids[j]) && !expandedIds.has(ids[i]));
        if (!aLocked) a[axis] -= sign * distance * (bLocked ? 1 : 0.5);
        if (!bLocked) b[axis] += sign * distance * (aLocked ? 1 : 0.5);
      }
    }
    for (const id of ids) {
      if (id === draggedId) continue;
      const point = positions.get(id);
      for (const rect of obstacles) {
        if (!expandedIds.has(id)) {
          const nearestX = Math.max(rect.x, Math.min(rect.x + rect.width, point.x));
          const nearestY = Math.max(rect.y, Math.min(rect.y + rect.height, point.y));
          const dx = point.x - nearestX;
          const dy = point.y - nearestY;
          const distance = Math.hypot(dx, dy);
          const minimum = fourthRadius + gap;
          if (distance >= minimum) continue;
          if (distance) {
            point.x += dx / distance * (minimum - distance);
            point.y += dy / distance * (minimum - distance);
          } else {
            const sides = [
              { distance: point.x - rect.x, x: rect.x - minimum, y: point.y },
              { distance: rect.x + rect.width - point.x, x: rect.x + rect.width + minimum, y: point.y },
              { distance: point.y - rect.y, x: point.x, y: rect.y - minimum },
              { distance: rect.y + rect.height - point.y, x: point.x, y: rect.y + rect.height + minimum },
            ];
            const nearest = sides.reduce((best, side) => side.distance < best.distance ? side : best);
            point.x = nearest.x;
            point.y = nearest.y;
          }
          continue;
        }
        const box = fourthBounds(point, expandedIds.has(id));
        const overlapX = Math.min(box.x + box.width + gap - rect.x,
          rect.x + rect.width + gap - box.x);
        const overlapY = Math.min(box.y + box.height + gap - rect.y,
          rect.y + rect.height + gap - box.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        const axis = overlapX < overlapY ? 'x' : 'y';
        const center = rect[axis] + rect[axis === 'x' ? 'width' : 'height'] / 2;
        point[axis] += (point[axis] >= center ? 1 : -1) * (axis === 'x' ? overlapX : overlapY);
      }
    }
  }
  return positions;
}
