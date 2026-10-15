import test from 'node:test';
import assert from 'node:assert/strict';
import { agents, connectionAt, nearestFreePosition } from './graph.js';

const supervisor = { x: 200, y: 200 };

test('straight connections attach to the nearest facing edges', () => {
  const left = connectionAt({ id: 'quality' }, { x: 0, y: 230 }, supervisor);
  assert.deepEqual(left.start, { x: 69, y: 265 });
  assert.deepEqual(left.end, { x: 201, y: 265 });
  assert.equal(left.path, 'M 69 265 L 201 265');

  const right = connectionAt({ id: 'production' }, { x: 500, y: 230 }, supervisor);
  assert.deepEqual(right.start, { x: 501, y: 265 });
  assert.deepEqual(right.end, { x: 341, y: 265 });

  const above = connectionAt({ id: 'quality' }, { x: 240, y: 0 }, supervisor);
  assert.deepEqual(above.start, { x: 275, y: 69 });
  assert.deepEqual(above.end, { x: 275, y: 201 });
});

test('diagonal connections touch the rounded corners', () => {
  const { start, end } = connectionAt({ id: 'quality' }, { x: 0, y: 0 }, supervisor);
  assert.ok(Math.abs(Math.hypot(start.x - 55, start.y - 55) - 14) < 1e-9);
  assert.ok(Math.abs(Math.hypot(end.x - 215, end.y - 215) - 14) < 1e-9);
  assert.ok(start.x < end.x && start.y < end.y);
});

test('every initial connection runs from its agent toward the supervisor', () => {
  for (const agent of agents.slice(1)) {
    const { start, end, path } = connectionAt(agent, agent, agents[0]);
    assert.match(path, /^M .+ L .+$/);
    assert.ok(Math.abs(end.x - (agents[0].x + 71)) < Math.abs(start.x - (agents[0].x + 71)));
  }
});

test('a dropped tile stays put when free and moves to the nearest clear spot when blocked', () => {
  const occupied = [
    { x: 190, y: 190, size: 142 },
    { x: 420, y: 190, size: 70 },
  ];
  assert.deepEqual(nearestFreePosition({ x: 0, y: 0 }, 70, occupied), { x: 0, y: 0 });

  const desired = { x: 200, y: 200 };
  const placed = nearestFreePosition(desired, 70, occupied);
  assert.ok(Math.hypot(placed.x - desired.x, placed.y - desired.y) <= 124);
  for (const other of occupied) {
    const separated =
      placed.x + 70 + 44 <= other.x ||
      other.x + other.size + 44 <= placed.x ||
      placed.y + 70 + 44 <= other.y ||
      other.y + other.size + 44 <= placed.y;
    assert.ok(separated);
  }
});
