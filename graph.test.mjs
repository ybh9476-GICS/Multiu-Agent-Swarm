import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSpecialistPeer, agents, advanceMockTaskState, connectionAt, createMockTaskState, mockConnectionActive, mockFlowDirection, mockTileActive, nearestFreePosition, positionAt, resolveTilePositions, sameLevelPairs, settleAgentPositions, specialistPeerPairs, subtilePeerPairs, tileRect } from './graph.js';
import { advanceSubtileStatusState, circleConnectionAt, createSubtileStatusState, expandedSubtileConnectionAt, layoutSubtiles, peerMockFlow, settleSubtilePositions, submenuGroups, submenuIconPaths, submenuItems, subtileBounds, subtileConnection, subtileConnectionAt, subtileDetailSize, subtileFloatAt, subtileMockFlow, subtilePeerConnectionAt, subtileRadius, subtileStatusProfiles } from './subtiles.js';
import { createFourthLevelItems, fourthBounds, fourthConnectionAt, fourthConnectionGap, fourthDetailSize, fourthFloatAt, fourthRadius, layoutFourthLevelItems, settleFourthLevelPositions } from './fourth-tiles.js';

const supervisor = { x: 200, y: 200 };

test('each third-level tile gets one to five stable unknown children', () => {
  const samples = [0, 0.2, 0.4, 0.6, 0.999999];
  let next = 0;
  const fourth = createFourthLevelItems(submenuItems, () => samples[next++ % samples.length]);
  assert.equal(fourth.length, 75);
  assert.equal(new Set(fourth.map(item => item.id)).size, fourth.length);
  for (const [index, parent] of submenuItems.entries()) {
    const children = fourth.filter(item => item.parentId === parent.id);
    assert.equal(children.length, index % 5 + 1);
    assert.ok(children.every((item, childIndex) => item.index === childIndex &&
      item.count === children.length && !('icon' in item)));
  }
});

test('fourth-level counts and connections stay fixed across fresh page builds', () => {
  const first = createFourthLevelItems(submenuItems);
  const second = createFourthLevelItems(submenuItems);
  assert.deepEqual(second, first);
  for (const parent of submenuItems) {
    const children = first.filter(item => item.parentId === parent.id);
    assert.ok(children.length >= 1 && children.length <= 5);
    assert.ok(children.every((item, index) => item.id === `${parent.id}-unknown-${index + 1}`));
  }
  const reordered = createFourthLevelItems([...submenuItems].reverse());
  for (const parent of submenuItems) {
    assert.equal(reordered.filter(item => item.parentId === parent.id).length,
      first.filter(item => item.parentId === parent.id).length);
  }
});

test('fourth-level circles stay clear of tiles and their gray links end at circle edges', () => {
  const frames = new Map(agents.map(agent => [agent.id, tileRect(agent, agent)]));
  const third = layoutSubtiles(frames);
  const fourth = createFourthLevelItems(submenuItems, () => 0.999999);
  const expanded = new Set(['quality-rate']);
  const obstacles = [...frames.values(), ...submenuItems.map(item =>
    subtileBounds(third.get(item.id), expanded.has(item.id)))];
  const supervisorCenter = { x: agents[0].x + 71, y: agents[0].y + 71 };
  const positions = layoutFourthLevelItems(fourth, third, expanded, obstacles, supervisorCenter);
  assert.equal(positions.size, 125);
  const circles = fourth.map(item => {
    const child = positions.get(item.id);
    const parent = third.get(item.parentId);
    const link = fourthConnectionAt(parent, child, expanded.has(item.parentId));
    assert.ok(Math.abs(Math.hypot(link.end.x - child.x, link.end.y - child.y) - fourthRadius) < 1e-8);
    return { x: child.x - fourthRadius, y: child.y - fourthRadius,
      width: fourthRadius * 2, height: fourthRadius * 2 };
  });
  for (let i = 0; i < circles.length; i++) {
    for (const obstacle of obstacles) assert.equal(overlaps(circles[i], obstacle), false);
    for (let j = i + 1; j < circles.length; j++) assert.equal(overlaps(circles[i], circles[j]), false);
  }
});

test('fourth-level default links keep the same generous gap around compact and expanded parents', () => {
  const [item] = createFourthLevelItems(submenuItems.slice(0, 1), () => 0);
  const parent = { x: 100, y: 0 };
  const centers = new Map([[item.parentId, parent]]);
  for (const expanded of [false, true]) {
    const expandedIds = new Set(expanded ? [item.parentId] : []);
    const positions = layoutFourthLevelItems([item], centers, expandedIds,
      [subtileBounds(parent, expanded)], { x: 0, y: 0 });
    const link = fourthConnectionAt(parent, positions.get(item.id), expanded);
    assert.ok(Math.abs(link.end.x - link.start.x - fourthConnectionGap) < 1e-8);
  }
});

test('fourth-level tiles float independently and ease toward a changed layout', () => {
  const [first, second] = createFourthLevelItems(submenuItems.slice(0, 2), () => 0);
  assert.notDeepEqual(fourthFloatAt(first, 4), fourthFloatAt(second, 4));
  assert.deepEqual(fourthFloatAt(first, 4, true), { x: 0, y: 0 });
  const previous = new Map([[first.id, { x: 0, y: 0 }]]);
  const targets = new Map([[first.id, { x: 100, y: 0 }]]);
  const next = settleFourthLevelPositions(targets, previous, [], 1 / 60);
  assert.ok(next.get(first.id).x > 0 && next.get(first.id).x < 20);
  assert.deepEqual(settleFourthLevelPositions(targets, next, [], 0).get(first.id), next.get(first.id));
});

test('dragged and selected fourth-level cards keep their position while neighbors yield', () => {
  const first = 'first';
  const second = 'second';
  const targets = new Map([[first, { x: 0, y: 0 }], [second, { x: 5, y: 0 }]]);
  const settled = settleFourthLevelPositions(targets, new Map(), [], 0, first, false, new Set([first]));
  assert.deepEqual(settled.get(first), { x: 0, y: 0 });
  assert.equal(overlaps(fourthBounds(settled.get(first), true), fourthBounds(settled.get(second))), false);
  const link = fourthConnectionAt({ x: -100, y: 0 }, settled.get(first), false, true);
  assert.equal(link.end.x, -fourthDetailSize.width / 2);
});

test('a selected fourth-level card also pushes an unselected upper agent', () => {
  const quality = agents.find(agent => agent.id === 'quality');
  const original = { x: quality.x, y: quality.y };
  const targets = new Map([[quality.id, original]]);
  const obstacle = fourthBounds({ x: quality.x + 19, y: quality.y + 19 }, true);
  const positions = settleAgentPositions(targets, targets, [quality], new Set(), 1 / 60,
    null, false, [obstacle]);
  assert.notDeepEqual(positions.get(quality.id), original);
  assert.equal(overlaps(tileRect(quality, positions.get(quality.id)), obstacle), false);
});

test('same-level links connect every sibling pair and never cross parents', () => {
  assert.equal(specialistPeerPairs.length, 15);
  assert.equal(subtilePeerPairs.length, 42);
  assert.deepEqual(sameLevelPairs(agents.slice(1), () => 'supervisor'), specialistPeerPairs);
  for (const [first, second] of subtilePeerPairs) {
    assert.equal(first.parentId, second.parentId);
  }
  assert.equal(subtilePeerPairs.some(([first, second]) =>
    first.parentId === 'quality' && second.parentId === 'production'), false);
});

test('peer lines attach to both circle edges and follow moved circles', () => {
  const horizontal = circleConnectionAt({ x: 0, y: 0 }, { x: 100, y: 0 });
  assert.deepEqual(horizontal.start, { x: 22, y: 0 });
  assert.deepEqual(horizontal.end, { x: 78, y: 0 });
  const diagonal = circleConnectionAt({ x: 20, y: 30 }, { x: 120, y: 130 });
  assert.ok(Math.abs(Math.hypot(diagonal.start.x - 20, diagonal.start.y - 30) - subtileRadius) < 1e-9);
  assert.ok(Math.abs(Math.hypot(diagonal.end.x - 120, diagonal.end.y - 130) - subtileRadius) < 1e-9);
});

test('every level-three menu has a concise mock status and keeps the original card width', () => {
  assert.equal(submenuItems.length, 25);
  for (const item of submenuItems) {
    const profile = subtileStatusProfiles[item.id];
    assert.ok(profile && profile.interval > 0 && profile.samples.length > 1, item.label);
    assert.ok(profile.samples.every(sample => sample.length <= 36), item.label);
  }
  assert.equal(subtileDetailSize.width, 224);
  assert.ok(subtileDetailSize.width < tileRect(agents[1], agents[1], true).width);
  assert.ok(subtileDetailSize.height < tileRect(agents[1], agents[1], true).height);
});

test('mock status changes only when its simulated reading or event interval arrives', () => {
  const reading = createSubtileStatusState('quality-rate', 1000);
  assert.equal(advanceSubtileStatusState(reading, 5, 2000), false);
  assert.equal(reading.receivedAt, 1000);
  assert.equal(advanceSubtileStatusState(reading, 1, 3000), true);
  assert.equal(reading.receivedAt, 3000);
  assert.equal(reading.text, subtileStatusProfiles['quality-rate'].samples[1]);
  const history = createSubtileStatusState('equipment-history', 1000);
  assert.equal(advanceSubtileStatusState(history, 25, 2000), false);
  assert.equal(advanceSubtileStatusState(history, 1, 3000), true);
});

test('expanded level-three links end on card edges', () => {
  const parent = { x: 0, y: 0, width: 70, height: 70 };
  const center = { x: 280, y: 35 };
  const link = expandedSubtileConnectionAt(parent, center, true);
  assert.deepEqual(link.start, { x: 69, y: 35 });
  assert.deepEqual(link.end, { x: center.x - subtileDetailSize.width / 2 + 1, y: 35 });
  const peer = subtilePeerConnectionAt(center, { x: 600, y: 35 }, true, true);
  assert.equal(peer.start.x, center.x + subtileDetailSize.width / 2 - 1);
  assert.equal(peer.end.x, 600 - subtileDetailSize.width / 2 + 1);
});

test('expanded third-level cards move clear of an expanded parent and reserve room for later selections', () => {
  const parent = new Map([['quality', { x: 190, y: 0, width: 340, height: 140 }]]);
  const targets = new Map([
    ['quality-rate', { x: 300, y: 70 }],
    ['quality-vision', { x: 430, y: 70 }],
  ]);
  const settled = settleSubtilePositions(targets, new Map(), parent, 0.05, null, false,
    new Set(['quality-rate']));
  const card = subtileBounds(settled.get('quality-rate'), true);
  const parentRect = parent.get('quality');
  assert.equal(card.x < parentRect.x + parentRect.width && card.x + card.width > parentRect.x &&
    card.y < parentRect.y + parentRect.height && card.y + card.height > parentRect.y, false);
  const nextCard = subtileBounds(settled.get('quality-vision'), true);
  assert.equal(card.x < nextCard.x + nextCard.width && card.x + card.width > nextCard.x &&
    card.y < nextCard.y + nextCard.height && card.y + card.height > nextCard.y, false);
});

test('peer information flow rotates only through working siblings', () => {
  const states = new Map(agents.slice(1).map(agent => [agent.id, { phase: 'working' }]));
  assert.deepEqual(activeSpecialistPeer(specialistPeerPairs, states, 0), specialistPeerPairs[0]);
  assert.deepEqual(activeSpecialistPeer(specialistPeerPairs, states, 4), specialistPeerPairs[1]);
  states.get('quality').phase = 'offline';
  const selected = activeSpecialistPeer(specialistPeerPairs, states, 0);
  assert.equal(selected.some(agent => agent.id === 'quality'), false);
  for (const state of states.values()) state.phase = 'handoff';
  assert.equal(activeSpecialistPeer(specialistPeerPairs, states, 0), null);

  const working = { phase: 'working', progress: 50, taskIndex: 0 };
  assert.deepEqual(peerMockFlow(1, 3, working), { connected: true, progress: 50, direction: 'reverse' });
  assert.equal(peerMockFlow(0, 3, working).connected, false);
  assert.equal(peerMockFlow(1, 3, { ...working, phase: 'handoff' }).connected, false);
});

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

test('compact first- and second-level tiles ease apart before their outlines meet', () => {
  const fixture = [
    { id: 'quality', x: 0, y: 0 },
    { id: 'equipment', x: 94, y: 0 },
  ];
  const close = new Map(fixture.map(agent => [agent.id, { x: agent.x, y: agent.y }]));
  const separated = settleAgentPositions(close, new Map(), fixture, new Set(), 0.016);
  assert.ok(separated.get('quality').x < 0);
  assert.ok(separated.get('equipment').x > 94);
  assert.ok(tileRect(fixture[0], separated.get('quality')).x + 70 + 24 <=
    tileRect(fixture[1], separated.get('equipment')).x);

  const far = new Map([['quality', { x: 0, y: 0 }], ['equipment', { x: 200, y: 0 }]]);
  const returning = settleAgentPositions(far, separated, fixture, new Set(), 0.016);
  assert.ok(returning.get('equipment').x > separated.get('equipment').x);
  assert.ok(returning.get('equipment').x < 200);
});

test('selected agent remains anchored while an approaching tile yields', () => {
  const fixture = [
    { id: 'supervisor', x: 0, y: 0 },
    { id: 'quality', x: 230, y: 50 },
  ];
  const targets = new Map(fixture.map(agent => [agent.id, { x: agent.x, y: agent.y }]));
  const selected = new Set(['supervisor']);
  const positions = settleAgentPositions(targets, new Map(), fixture, selected, 0.016);
  assert.deepEqual(positions.get('supervisor'), { x: 0, y: 0 });
  assert.notDeepEqual(positions.get('quality'), targets.get('quality'));
  assert.equal(overlaps(tileRect(fixture[0], positions.get('supervisor'), true),
    tileRect(fixture[1], positions.get('quality'))), false);
});

test('dragged agent stays under the pointer and pushes an unselected neighbor', () => {
  const fixture = [
    { id: 'quality', x: 0, y: 0 },
    { id: 'equipment', x: 80, y: 0 },
  ];
  const targets = new Map(fixture.map(agent => [agent.id, { x: agent.x, y: agent.y }]));
  const positions = settleAgentPositions(targets, new Map(), fixture, new Set(), 0.016, 'quality');
  assert.deepEqual(positions.get('quality'), targets.get('quality'));
  assert.ok(positions.get('equipment').x > 80);
});

test('an agent dragged toward a selected card yields while the selected card stays fixed', () => {
  const fixture = [
    { id: 'supervisor', x: 0, y: 0 },
    { id: 'quality', x: 100, y: 60 },
  ];
  const targets = new Map(fixture.map(agent => [agent.id, { x: agent.x, y: agent.y }]));
  const positions = settleAgentPositions(targets, new Map(), fixture, new Set(['supervisor']),
    0.016, 'quality');
  assert.deepEqual(positions.get('supervisor'), targets.get('supervisor'));
  assert.notDeepEqual(positions.get('quality'), targets.get('quality'));
  assert.equal(overlaps(tileRect(fixture[0], positions.get('supervisor'), true),
    tileRect(fixture[1], positions.get('quality'))), false);
});

test('a dragged third-level tile pushes both first- and second-level tiles before contact', () => {
  const fixture = [
    { id: 'supervisor', x: 0, y: 0 },
    { id: 'equipment', x: 280, y: 0 },
  ];
  const targets = new Map(fixture.map(agent => [agent.id, { x: agent.x, y: agent.y }]));
  for (const [agent, center] of [[fixture[0], { x: 70, y: 70 }],
    [fixture[1], { x: 315, y: 35 }]]) {
    const child = subtileBounds(center);
    const placed = settleAgentPositions(targets, new Map(), fixture, new Set(),
      0.016, null, false, child);
    assert.notDeepEqual(placed.get(agent.id), targets.get(agent.id));
    assert.equal(overlaps(tileRect(agent, placed.get(agent.id)), child), false);
  }
});

test('an expanded third-level tile uses its full card shape to push an upper tile', () => {
  const fixture = [{ id: 'supervisor', x: 0, y: 0 }];
  const targets = new Map([['supervisor', { x: 0, y: 0 }]]);
  const child = subtileBounds({ x: 200, y: 70 }, true);
  const placed = settleAgentPositions(targets, new Map(), fixture, new Set(),
    0.016, null, false, child);
  assert.notDeepEqual(placed.get('supervisor'), targets.get('supervisor'));
  assert.equal(overlaps(tileRect(fixture[0], placed.get('supervisor')), child), false);
});

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
