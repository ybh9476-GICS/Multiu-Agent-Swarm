import test from 'node:test';
import assert from 'node:assert/strict';
import { agents, advanceMockTaskState, connectionAt, createMockTaskState, mockConnectionActive, mockFlowDirection, mockTileActive, nearestFreePosition, positionAt, resolveTilePositions, tileRect } from './graph.js';
import { layoutSubtiles, settleSubtilePositions, submenuGroups, submenuIconPaths, submenuItems, subtileConnection, subtileConnectionAt, subtileFloatAt, subtileMockFlow, subtileRadius } from './subtiles.js';

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

test('mock information flow includes both directions and reverses for the next task', () => {
  const specialists = agents.slice(1).map(agent => agent.id);
  assert.equal(mockFlowDirection('quality', 0), 'from-supervisor');
  assert.equal(mockFlowDirection('equipment', 0), 'to-supervisor');
  for (const id of specialists) {
    assert.notEqual(mockFlowDirection(id, 0), mockFlowDirection(id, 1));
    assert.equal(mockFlowDirection(id, 0), mockFlowDirection(id, 2));
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

test('selected tiles expand in place and ports follow the new outline', () => {
  const quality = tileRect({ id: 'quality' }, { x: 448, y: 470 }, true);
  const production = tileRect({ id: 'production' }, { x: 938, y: 470 }, true);
  const expandedSupervisor = tileRect({ id: 'supervisor' }, { x: 657, y: 571 }, true);
  assert.equal(quality.x + quality.width, 518);
  assert.equal(production.x, 938);
  assert.equal(expandedSupervisor.x + expandedSupervisor.width / 2, 728);
  assert.equal(quality.width, 340);
  assert.equal(quality.height, 140);
  assert.equal(quality.y, 420);
  assert.equal(expandedSupervisor.width, 330);
  assert.equal(expandedSupervisor.height, 165);
  assert.equal(expandedSupervisor.y, 549.5);

  const line = connectionAt({ id: 'quality' }, { x: 448, y: 470 }, { x: 657, y: 571 }, quality, expandedSupervisor);
  assert.ok(Math.abs(Math.hypot(
    line.start.x - (quality.x + quality.width - 15),
    line.start.y - (quality.y + quality.height - 15),
  ) - 14) < 1e-9);
  assert.ok(Math.abs(Math.hypot(
    line.end.x - (expandedSupervisor.x + 15),
    line.end.y - (expandedSupervisor.y + 15),
  ) - 14) < 1e-9);
});

test('expanded tile collision search uses the displayed rectangle', () => {
  const desired = { x: 100, y: 100 };
  const size = { width: 340, height: 140 };
  const occupied = [{ x: 500, y: 150, width: 70, height: 70 }];
  const placed = nearestFreePosition(desired, size, occupied, 0);
  const separated = placed.x + size.width <= occupied[0].x ||
    occupied[0].x + occupied[0].width <= placed.x ||
    placed.y + size.height <= occupied[0].y ||
    occupied[0].y + occupied[0].height <= placed.y;
  assert.ok(separated);
});

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

test('expanding a tile keeps it anchored and pushes other tiles out of its space', () => {
  const fixture = [
    { id: 'quality', x: 70, y: 100, amplitude: 0, period: 8, phase: 0 },
    { id: 'equipment', x: 70, y: 200, amplitude: 0, period: 8, phase: 0 },
    { id: 'supervisor', x: 270, y: 100, amplitude: 0, period: 8, phase: 0 },
  ];
  const positions = resolveTilePositions(fixture, 'quality', 0, true);
  assert.deepEqual(positions.get('quality'), { x: 70, y: 100 });
  assert.notDeepEqual(positions.get('equipment'), { x: 70, y: 200 });
  const rectangles = fixture.map(agent => tileRect(agent, positions.get(agent.id), agent.id === 'quality'));
  for (let i = 0; i < rectangles.length; i++) {
    for (let j = i + 1; j < rectangles.length; j++) assert.ok(!overlaps(rectangles[i], rectangles[j]));
  }
});

test('expanded tile stays fixed while compact tiles float without colliding', () => {
  for (const selected of agents) {
    const fixed = positionAt(selected, 7);
    const anchors = new Map([[selected.id, fixed]]);
    for (let seconds = 7; seconds <= 60; seconds += 0.5) {
      const positions = resolveTilePositions(agents, selected.id, seconds, false, null, anchors);
      assert.deepEqual(positions.get(selected.id), fixed);
      const rectangles = agents.map(agent => tileRect(agent, positions.get(agent.id), agent.id === selected.id));
      for (let i = 0; i < rectangles.length; i++) {
        for (let j = i + 1; j < rectangles.length; j++) {
          assert.ok(!overlaps(rectangles[i], rectangles[j]), `${selected.id} at ${seconds}s: ${agents[i].id} overlaps ${agents[j].id}`);
        }
      }
    }
  }
});

test('dragging an expanded tile pushes neighbors without moving the grabbed tile', () => {
  const dragged = { id: 'quality', position: { x: 650, y: 607 } };
  const positions = resolveTilePositions(agents, dragged.id, 12, false, dragged);
  assert.deepEqual(positions.get(dragged.id), dragged.position);
  const rectangles = agents.map(agent => tileRect(agent, positions.get(agent.id), agent.id === dragged.id));
  for (let i = 0; i < rectangles.length; i++) {
    for (let j = i + 1; j < rectangles.length; j++) {
      assert.ok(!overlaps(rectangles[i], rectangles[j]), `${agents[i].id} overlaps ${agents[j].id}`);
    }
  }
});

test('multiple expanded tiles stay anchored and never overlap while neighbors float', () => {
  const selected = new Set();
  const anchors = new Map();
  for (const agent of agents) {
    const before = resolveTilePositions(agents, selected, 7, false, null, anchors);
    anchors.set(agent.id, before.get(agent.id));
    selected.add(agent.id);
    const settled = resolveTilePositions(agents, selected, 7, false, null, anchors);
    for (const id of selected) anchors.set(id, settled.get(id));
    for (let seconds = 7; seconds <= 60; seconds += 1) {
      const positions = resolveTilePositions(agents, selected, seconds, false, null, anchors);
      for (const id of selected) {
        assert.ok(Math.abs(positions.get(id).x - anchors.get(id).x) < 1e-7);
        assert.ok(Math.abs(positions.get(id).y - anchors.get(id).y) < 1e-7);
      }
      const rectangles = agents.map(item => tileRect(item, positions.get(item.id), selected.has(item.id)));
      for (let i = 0; i < rectangles.length; i++) {
        for (let j = i + 1; j < rectangles.length; j++) {
          assert.ok(!overlaps(rectangles[i], rectangles[j]), `${selected.size} selected at ${seconds}s: ${agents[i].id} overlaps ${agents[j].id}`);
        }
      }
    }
  }
});

test('progress reaches 100%, holds during handoff, then starts the next task at zero', () => {
  const random = () => 0.5;
  const state = createMockTaskState(random);
  assert.equal(state.progress, 0);
  assert.equal(state.duration, 39);
  advanceMockTaskState(state, 19.5, random);
  assert.equal(state.progress, 50);
  assert.equal(mockConnectionActive(state), true);

  advanceMockTaskState(state, 19.5, random);
  assert.equal(state.progress, 100);
  assert.equal(state.phase, 'handoff');
  assert.equal(mockConnectionActive(state), false);
  assert.equal(mockTileActive(state), true);
  advanceMockTaskState(state, 3.25, random);
  assert.equal(state.taskIndex, 1);
  assert.equal(state.phase, 'working');
  assert.equal(state.progress, 0);
  assert.equal(mockConnectionActive(state), true);
});

test('rare offline interval pauses progress and connection until the agent returns', () => {
  const values = [0.5, 0.05, 0.5];
  const state = createMockTaskState(() => values.shift());
  assert.equal(state.offlineAt, 19.5);
  advanceMockTaskState(state, 19.5, () => 0.5);
  assert.equal(state.phase, 'offline');
  assert.equal(state.progress, 50);
  assert.equal(mockConnectionActive(state), false);
  assert.equal(mockTileActive(state), false);
  advanceMockTaskState(state, 5.5, () => 0.5);
  assert.equal(state.phase, 'working');
  assert.equal(state.progress, 50);
  assert.equal(mockConnectionActive(state), true);
  assert.equal(mockTileActive(state), true);
});

test('every IMPIX submenu and logistics task has a distinct circular icon tile', () => {
  assert.equal(submenuItems.length, 25);
  assert.equal(new Set(submenuItems.map(item => item.id)).size, 25);
  assert.deepEqual(submenuGroups.map(group => group.items.length), [5, 5, 3, 5, 3, 4]);
  for (const item of submenuItems) assert.ok(submenuIconPaths[item.icon], item.label);
});

test('third-level tiles have separate floating motion and honor reduced motion', () => {
  const first = submenuItems.find(item => item.id === 'quality-rate');
  const second = submenuItems.find(item => item.id === 'quality-vision');
  assert.deepEqual(subtileFloatAt(first, 0), { x: 0, y: 0 });
  assert.notDeepEqual(subtileFloatAt(first, 4), subtileFloatAt(second, 4));
  assert.notDeepEqual(subtileFloatAt(first, 4), subtileFloatAt(first, 8));
  assert.deepEqual(subtileFloatAt(first, 4, true), { x: 0, y: 0 });
});

test('nearby third-level tiles separate smoothly before their circles touch', () => {
  const goals = new Map([['first', { x: 0, y: 0 }], ['second', { x: 50, y: 0 }]]);
  let previous = new Map([['first', { x: 0, y: 0 }], ['second', { x: 78, y: 0 }]]);
  let movedBeforeContact = false;
  for (let frame = 0; frame < 60; frame++) {
    const next = settleSubtilePositions(goals, previous, new Map(), 1 / 60);
    const a = next.get('first');
    const b = next.get('second');
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    assert.ok(distance >= subtileRadius * 2, `frame ${frame}: circles overlap`);
    for (const id of goals.keys()) {
      const before = previous.get(id);
      const after = next.get(id);
      assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 5, `frame ${frame}: ${id} jumps`);
    }
    if (a.x < 0 && distance > subtileRadius * 2 + 10) movedBeforeContact = true;
    previous = next;
  }
  assert.ok(movedBeforeContact);
});

test('third-level circles avoid agent cards and each other in compact and expanded layouts', () => {
  const scenarios = [
    ...[null, ...agents.map(agent => agent.id)].map(id => ({ name: id, selected: id ? new Set([id]) : new Set() })),
    { name: 'all', selected: new Set(agents.map(agent => agent.id)) },
    { name: 'dragged', selected: new Set(['quality']), dragged: { id: 'quality', position: { x: 900, y: 610 } } },
  ];
  for (const { name, selected, dragged } of scenarios) {
    const positions = resolveTilePositions(agents, selected, 8, false, dragged);
    const frames = new Map(agents.map(agent => [agent.id,
      tileRect(agent, positions.get(agent.id), selected.has(agent.id))]));
    const children = layoutSubtiles(frames);
    assert.equal(children.size, 25);
    const circles = submenuItems.map(item => {
      const center = children.get(item.id);
      const parent = frames.get(item.parentId);
      assert.match(subtileConnection(parent, center, item.side), /^M .+ L .+$/);
      return { x: center.x - subtileRadius, y: center.y - subtileRadius,
        width: subtileRadius * 2, height: subtileRadius * 2 };
    });
    for (const circle of circles) {
      for (const frame of frames.values()) assert.ok(!overlaps(circle, frame), `${name}: child overlaps agent`);
    }
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        assert.ok(!overlaps(circles[i], circles[j]), `${name}: children overlap`);
      }
    }
  }
});

test('second-level agents and their circular children spread around the supervisor', () => {
  const supervisor = agents[0];
  const frames = new Map(agents.map(agent => [agent.id, tileRect(agent, agent)]));
  const children = layoutSubtiles(frames);
  const supervisorCenter = { x: supervisor.x + 71, y: supervisor.y + 71 };
  for (const agent of agents.slice(1)) {
    const center = { x: agent.x + 35, y: agent.y + 35 };
    assert.ok(Math.hypot(center.x - supervisorCenter.x, center.y - supervisorCenter.y) > 220);
    for (const item of submenuItems.filter(item => item.parentId === agent.id)) {
      const child = children.get(item.id);
      assert.ok(Math.hypot(child.x - supervisorCenter.x, child.y - supervisorCenter.y) >
        Math.hypot(center.x - supervisorCenter.x, center.y - supervisorCenter.y));
    }
  }
  for (const id of ['quality', 'equipment', 'production']) {
    const fan = submenuItems.filter(item => item.parentId === id).map(item => children.get(item.id));
    const spreadX = Math.max(...fan.map(point => point.x)) - Math.min(...fan.map(point => point.x));
    const spreadY = Math.max(...fan.map(point => point.y)) - Math.min(...fan.map(point => point.y));
    assert.ok(Math.max(spreadX, spreadY) > 170, `${id} children form an outward fan`);
  }
});

test('dragged third-level tile keeps its parent-relative position and avoids occupied tiles', () => {
  const frames = new Map(agents.map(agent => [agent.id, tileRect(agent, agent)]));
  const item = submenuItems.find(item => item.id === 'quality-rate');
  const desired = { x: 80, y: 210 };
  const dragged = layoutSubtiles(frames, new Map(), { id: item.id, center: desired });
  assert.deepEqual(dragged.get(item.id), desired);
  const parent = frames.get(item.parentId);
  const offset = { x: desired.x - parent.x - parent.width / 2, y: desired.y - parent.y - parent.height / 2 };
  const movedFrames = new Map(frames);
  movedFrames.set(item.parentId, { ...parent, x: parent.x + 45, y: parent.y + 20 });
  const moved = layoutSubtiles(movedFrames, new Map([[item.id, offset]]));
  assert.deepEqual(moved.get(item.id), { x: desired.x + 45, y: desired.y + 20 });
  const blocked = layoutSubtiles(frames, new Map(), { id: item.id,
    center: { x: parent.x + parent.width / 2, y: parent.y + parent.height / 2 } });
  const center = blocked.get(item.id);
  assert.ok(!overlaps({ x: center.x - subtileRadius, y: center.y - subtileRadius,
    width: subtileRadius * 2, height: subtileRadius * 2 }, parent));
  assert.match(subtileConnectionAt(parent, center).path, /^M .+ L .+$/);
});

test('third-level mock flow visits children in turn and reverses direction on the next task', () => {
  const first = submenuItems.find(item => item.id === 'quality-rate');
  const second = submenuItems.find(item => item.id === 'quality-vision');
  const state = { phase: 'working', progress: 10, taskIndex: 0 };
  assert.deepEqual(subtileMockFlow(first, state), { connected: true, progress: 50, direction: 'from-parent' });
  assert.equal(subtileMockFlow(second, state).connected, false);
  state.progress = 30;
  assert.equal(subtileMockFlow(first, state).connected, false);
  assert.equal(subtileMockFlow(second, state).direction, 'to-parent');
  assert.equal(subtileMockFlow(second, state).connected, true);
  state.taskIndex = 1;
  assert.equal(subtileMockFlow(second, state).direction, 'from-parent');
  state.phase = 'handoff';
  assert.equal(subtileMockFlow(second, state).connected, false);
});
