import { advanceSubtileStatusState, createSubtileStatusState, expandedSubtileConnectionAt, layoutSubtiles, peerMockFlow, settleSubtilePositions, submenuIconPaths, submenuItems, subtileBounds, subtileDetailSize, subtileFloatAt, subtileMockFlow, subtilePeerConnectionAt, subtileRadius } from './subtiles.js';
import { createFourthLevelItems, fourthBounds, fourthConnectionAt, fourthDetailSize, fourthFloatAt, fourthRadius, layoutFourthLevelItems, settleFourthLevelPositions } from './fourth-tiles.js';

// Tile artwork follows OpenPencil: Page 1 / Section 2; positions form the three-level mock.
export const agents = [
  { id: 'supervisor', x: 657, y: 571, amplitude: 5, period: 9.2, phase: 0.4 },
  { id: 'quality', x: 555, y: 375, amplitude: 10, period: 7.6, phase: 0.0 },
  { id: 'equipment', x: 450, y: 607, amplitude: 8, period: 8.8, phase: 1.8 },
  { id: 'safety', x: 555, y: 795, amplitude: 11, period: 8.1, phase: 3.5 },
  { id: 'production', x: 830, y: 375, amplitude: 9, period: 8.4, phase: 2.6 },
  { id: 'energy', x: 935, y: 607, amplitude: 10, period: 7.9, phase: 4.7 },
  { id: 'logistics', x: 830, y: 795, amplitude: 8, period: 9.6, phase: 5.6 },
];

export function sameLevelPairs(items, parentOf) {
  const pairs = [];
  for (let first = 0; first < items.length; first++) {
    for (let second = first + 1; second < items.length; second++) {
      if (parentOf(items[first]) === parentOf(items[second])) {
        pairs.push([items[first], items[second]]);
      }
    }
  }
  return pairs;
}

export const specialistPeerPairs = sameLevelPairs(agents.slice(1), () => 'supervisor');
export const subtilePeerPairs = sameLevelPairs(submenuItems, item => item.parentId);

export function activeSpecialistPeer(pairs, states, seconds) {
  const available = pairs.filter(([first, second]) =>
    mockConnectionActive(states.get(first.id)) && mockConnectionActive(states.get(second.id)));
  return available.length ? available[Math.floor(seconds / 4) % available.length] : null;
}

const tileSize = agent => agent.id === 'supervisor' ? 142 : 70;
const outlineInset = 1;
const cornerRadius = 14;

function closestIntervalPoints(aMin, aMax, bMin, bMax) {
  if (aMax < bMin) return [aMax, bMin];
  if (bMax < aMin) return [aMin, bMax];
  const shared = (Math.max(aMin, bMin) + Math.min(aMax, bMax)) / 2;
  return [shared, shared];
}

function outlineCore(rect) {
  const inset = outlineInset + cornerRadius;
  return {
    left: rect.x + inset,
    right: rect.x + rect.width - inset,
    top: rect.y + inset,
    bottom: rect.y + rect.height - inset,
  };
}

export function tileRect(agent, position, expanded = false) {
  const size = tileSize(agent);
  if (!expanded) return { ...position, width: size, height: size };
  const width = agent.id === 'supervisor' ? 330 : 340;
  const height = agent.id === 'supervisor' ? 165 : 140;
  const x = agent.id === 'supervisor' ? position.x + (size - width) / 2
    : ['quality', 'equipment', 'safety'].includes(agent.id) ? position.x + size - width : position.x;
  // Keep the content's top edge in place; remove only the empty space below it.
  const y = position.y + (size - (agent.id === 'supervisor' ? 185 : 170)) / 2;
  return { x, y, width, height };
}

export function nearestFreePosition(desired, size, occupied, clearance = 44) {
  const width = typeof size === 'number' ? size : size.width;
  const height = typeof size === 'number' ? size : size.height;
  const xs = [desired.x];
  const ys = [desired.y];
  for (const other of occupied) {
    const otherWidth = other.width ?? other.size;
    const otherHeight = other.height ?? other.size;
    xs.push(other.x - width - clearance, other.x + otherWidth + clearance);
    ys.push(other.y - height - clearance, other.y + otherHeight + clearance);
  }

  let best = null;
  let bestDistance = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const overlaps = occupied.some(other =>
        x < other.x + (other.width ?? other.size) + clearance &&
        x + width + clearance > other.x &&
        y < other.y + (other.height ?? other.size) + clearance &&
        y + height + clearance > other.y
      );
      if (overlaps) continue;
      const distance = (x - desired.x) ** 2 + (y - desired.y) ** 2;
      if (distance < bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best;
}

export function positionAt(agent, seconds, reducedMotion = false) {
  if (reducedMotion) return { x: agent.x, y: agent.y };
  const angle = seconds * Math.PI * 2 / agent.period + agent.phase;
  // Start at the exact design coordinates, easing into small individual orbits.
  const entrance = Math.min(1, seconds / 2);
  const gain = entrance * entrance * (3 - 2 * entrance);
  return {
    x: agent.x + Math.sin(angle * 0.7) * agent.amplitude * 0.35 * gain,
    y: agent.y + Math.sin(angle) * agent.amplitude * gain,
  };
}

// Local-only activity mock: progress is measured in active working time.
// A rare outage pauses that progress; task handoff keeps 100% visible briefly.
export function createMockTaskState(random = Math.random) {
  const duration = 32 + random() * 14;
  const offlineAt = random() < 0.12 ? duration * (0.3 + random() * 0.4) : Infinity;
  return { phase: 'working', progress: 0, worked: 0, duration, offlineAt, remaining: 0, taskIndex: 0 };
}

export function advanceMockTaskState(state, seconds, random = Math.random) {
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  let remaining = seconds;
  let changed = false;
  while (remaining > 1e-9) {
    if (state.phase === 'working') {
      const step = Math.min(remaining, state.duration - state.worked, state.offlineAt - state.worked);
      state.worked += step;
      remaining -= step;
      state.progress = Math.min(100, state.worked / state.duration * 100);
      if (state.worked >= state.duration - 1e-9) {
        state.phase = 'handoff';
        state.progress = 100;
        state.remaining = 2.5 + random() * 1.5;
        changed = true;
      } else if (state.worked >= state.offlineAt - 1e-9) {
        state.phase = 'offline';
        state.offlineAt = Infinity;
        state.remaining = 4 + random() * 3;
        changed = true;
      }
    } else {
      const step = Math.min(remaining, state.remaining);
      state.remaining -= step;
      remaining -= step;
      if (state.remaining > 1e-9) continue;
      if (state.phase === 'offline') {
        state.phase = 'working';
      } else {
        const next = createMockTaskState(random);
        Object.assign(state, next, { taskIndex: state.taskIndex + 1 });
      }
      changed = true;
    }
  }
  return changed;
}

export const mockConnectionActive = state => state.phase === 'working';
export const mockTileActive = state => state.phase !== 'offline';

const outboundFirst = new Set(['quality', 'production', 'logistics']);
export function mockFlowDirection(agentId, taskIndex = 0) {
  const fromSupervisor = outboundFirst.has(agentId) !== (taskIndex % 2 === 1);
  return fromSupervisor ? 'from-supervisor' : 'to-supervisor';
}

// Expanded tiles stay anchored. Earlier expanded tiles and then compact tiles
// yield only when the newest expanded outline would collide with them.
export function resolveTilePositions(items, selectedIds, seconds, reducedMotion = false, dragged = null, fixedPositions = new Map()) {
  const positions = new Map(items.map(agent => [agent.id,
    dragged?.id === agent.id ? dragged.position : fixedPositions.get(agent.id) ?? positionAt(agent, seconds, reducedMotion)]));
  const selected = typeof selectedIds === 'string' ? [selectedIds] : [...(selectedIds ?? [])];
  const selectedSet = new Set(selected);
  if (!selectedSet.size) return positions;

  const expanded = selected.reverse().map(id => items.find(agent => agent.id === id)).filter(Boolean);
  if (dragged && selectedSet.has(dragged.id)) {
    const index = expanded.findIndex(agent => agent.id === dragged.id);
    if (index > 0) expanded.unshift(expanded.splice(index, 1)[0]);
  }
  const occupied = [];
  for (const agent of expanded) {
    const position = positions.get(agent.id);
    const rect = tileRect(agent, position, true);
    if (!occupied.length) {
      occupied.push(rect);
      continue;
    }
    const clear = nearestFreePosition(rect, rect, occupied, 22);
    if (clear.x !== rect.x || clear.y !== rect.y) {
      positions.set(agent.id, { x: position.x + clear.x - rect.x, y: position.y + clear.y - rect.y });
    }
    occupied.push({ x: clear.x, y: clear.y, width: rect.width, height: rect.height });
  }
  if (dragged && !selectedSet.has(dragged.id)) {
    const moving = items.find(agent => agent.id === dragged.id);
    if (moving) occupied.push(tileRect(moving, positions.get(moving.id)));
  }
  for (const agent of items) {
    if (selectedSet.has(agent.id) || agent.id === dragged?.id) continue;
    const position = positions.get(agent.id);
    const rect = tileRect(agent, position);
    // Leave room for both tiles' small orbits, so the pushed layout stays steady.
    const clear = nearestFreePosition(rect, rect, occupied, 22);
    positions.set(agent.id, { x: position.x + clear.x - rect.x, y: position.y + clear.y - rect.y });
    occupied.push({ x: clear.x, y: clear.y, width: rect.width, height: rect.height });
  }
  return positions;
}

// Keep the seven agent tiles apart during their own floating motion as well as
// while another tile is dragged nearby. The collision margin starts the nudge
// before the visible outlines touch; previous positions make the return smooth.
export function settleAgentPositions(targets, previous, items, selectedIds, deltaSeconds,
  draggedId = null, reducedMotion = false, approachingSubtile = null) {
  const selected = [...(typeof selectedIds === 'string' ? [selectedIds] : selectedIds ?? [])];
  const selectedSet = new Set(selected);
  const newestSelected = selectedSet.has(draggedId) ? draggedId : selected.at(-1);
  const blend = reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, deltaSeconds) * 8);
  const positions = new Map();
  for (const [id, target] of targets) {
    const last = previous.get(id);
    positions.set(id, !last || id === draggedId ? { ...target } : {
      x: last.x + (target.x - last.x) * blend,
      y: last.y + (target.y - last.y) * blend,
    });
  }

  const clearance = 26;
  for (let pass = 0; pass < 8; pass++) {
    if (approachingSubtile) {
      const approaching = Array.isArray(approachingSubtile) ? approachingSubtile : [approachingSubtile];
      for (const obstacle of approaching) {
        for (const agent of items) {
          if (selectedSet.has(agent.id)) continue;
          const position = positions.get(agent.id);
          const rect = tileRect(agent, position);
          const gapX = Math.min(rect.x + rect.width + clearance - obstacle.x,
            obstacle.x + obstacle.width + clearance - rect.x);
          const gapY = Math.min(rect.y + rect.height + clearance - obstacle.y,
            obstacle.y + obstacle.height + clearance - rect.y);
          if (gapX <= 0 || gapY <= 0) continue;
          const axis = gapX < gapY ? 'x' : 'y';
          const agentCenter = rect[axis] + rect[axis === 'x' ? 'width' : 'height'] / 2;
          const subtileCenter = obstacle[axis] + obstacle[axis === 'x' ? 'width' : 'height'] / 2;
          position[axis] += (agentCenter >= subtileCenter ? 1 : -1) * (axis === 'x' ? gapX : gapY);
        }
      }
    }
    for (let i = 0; i < items.length; i++) {
      const first = items[i];
      for (let j = i + 1; j < items.length; j++) {
        const second = items[j];
        const firstPosition = positions.get(first.id);
        const secondPosition = positions.get(second.id);
        const a = tileRect(first, firstPosition, selectedSet.has(first.id));
        const b = tileRect(second, secondPosition, selectedSet.has(second.id));
        const gapX = Math.min(a.x + a.width + clearance - b.x,
          b.x + b.width + clearance - a.x);
        const gapY = Math.min(a.y + a.height + clearance - b.y,
          b.y + b.height + clearance - a.y);
        if (gapX <= 0 || gapY <= 0) continue;
        const firstLocked = first.id === newestSelected ||
          (first.id === draggedId && (selectedSet.has(first.id) || !selectedSet.has(second.id))) ||
          (selectedSet.has(first.id) && !selectedSet.has(second.id));
        const secondLocked = second.id === newestSelected ||
          (second.id === draggedId && (selectedSet.has(second.id) || !selectedSet.has(first.id))) ||
          (selectedSet.has(second.id) && !selectedSet.has(first.id));
        if (firstLocked && secondLocked) continue;
        const axis = gapX < gapY ? 'x' : 'y';
        const firstCenter = a[axis] + a[axis === 'x' ? 'width' : 'height'] / 2;
        const secondCenter = b[axis] + b[axis === 'x' ? 'width' : 'height'] / 2;
        const sign = secondCenter >= firstCenter ? 1 : -1;
        const gap = axis === 'x' ? gapX : gapY;
        if (!firstLocked) firstPosition[axis] -= sign * gap * (secondLocked ? 1 : 0.5);
        if (!secondLocked) secondPosition[axis] += sign * gap * (firstLocked ? 1 : 0.5);
      }
    }
  }
  return positions;
}

export function connectionAt(agent, position, supervisor, fromRect = tileRect(agent, position), toRect = tileRect({ id: 'supervisor' }, supervisor)) {
  // A rounded rectangle is an inner rectangle expanded by its corner radius.
  // The nearest inner points give the shortest line between tile outlines.
  const from = outlineCore(fromRect);
  const to = outlineCore(toRect);
  const [fromX, toX] = closestIntervalPoints(from.left, from.right, to.left, to.right);
  const [fromY, toY] = closestIntervalPoints(from.top, from.bottom, to.top, to.bottom);
  const distance = Math.hypot(toX - fromX, toY - fromY);
  let start;
  let end;

  if (distance > 0) {
    const dx = (toX - fromX) / distance;
    const dy = (toY - fromY) / distance;
    start = { x: fromX + dx * cornerRadius, y: fromY + dy * cornerRadius };
    end = { x: toX - dx * cornerRadius, y: toY - dy * cornerRadius };
  } else {
    // During a drag tiles may briefly overlap; keep ports on facing edges.
    const dx = toRect.x + toRect.width / 2 - fromRect.x - fromRect.width / 2;
    const dy = toRect.y + toRect.height / 2 - fromRect.y - fromRect.height / 2;
    if (Math.abs(dx) >= Math.abs(dy)) {
      const right = dx >= 0;
      start = { x: right ? fromRect.x + fromRect.width - outlineInset : fromRect.x + outlineInset, y: fromY };
      end = { x: right ? toRect.x + outlineInset : toRect.x + toRect.width - outlineInset, y: toY };
    } else {
      const below = dy >= 0;
      start = { x: fromX, y: below ? fromRect.y + fromRect.height - outlineInset : fromRect.y + outlineInset };
      end = { x: toX, y: below ? toRect.y + outlineInset : toRect.y + toRect.height - outlineInset };
    }
  }
  return { start, end, path: `M ${start.x} ${start.y} L ${end.x} ${end.y}` };
}

if (typeof document !== 'undefined') {
  const canvas = document.querySelector('.graph-canvas');
  const svg = document.querySelector('.graph-resource');
  const inactiveNodeLayer = svg.querySelector('.inactive-nodes');
  function setNodePaintOrder(group, nodes, connected) {
    const layer = connected ? group : inactiveNodeLayer;
    for (const node of nodes) if (node.parentNode !== layer) layer.append(node);
  }
  const controls = document.querySelector('.tile-controls');
  const zoomControls = document.querySelector('.zoom-controls');
  const zoomSlider = zoomControls.querySelector('.zoom-controls__slider');
  const zoomIn = zoomControls.querySelector('.zoom-controls__in');
  const zoomOut = zoomControls.querySelector('.zoom-controls__out');
  const navigationOpen = document.querySelector('.navigation-open');
  const navigationPanel = document.querySelector('.navigation-panel');
  const navigationMap = navigationPanel.querySelector('.navigation-map');
  const navigationClose = navigationPanel.querySelector('.navigation-close');
  const tooltip = document.querySelector('.tile-tooltip');
  const detailsTemplate = document.querySelector('.agent-details');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const baseWidth = 1920;
  const baseHeight = 1080;
  const inactiveColor = '#4C4E53';
  const activeColors = {
    supervisor: '#9A69C7',
    quality: '#2CB4A8',
    production: '#4D84C7',
    equipment: '#C87945',
    safety: '#57B96A',
    energy: '#B9BD3E',
    logistics: '#C55F91',
  };
  // Information fields follow the IMPIX Control Structure mockup; graph colors stay here.
  const cardData = {
    supervisor: { title: 'AI 슈퍼바이저 에이전트', role: 'L0 핵심 관제탑 (Control Tower)' },
    quality: { title: 'AI 품질 에이전트', status: '승인 대기 1', tasks: ['불량 유형별 원인 추적 리포트 생성', '생산 라인 샘플 판정 분석'], models: 'Anomalib · YOLOv8', count: 28 },
    equipment: { title: 'AI 설비예지보전 에이전트', status: '승인 대기 1', tasks: ['메인 모터 베어링 잔여수명 예측', '펌프 진동 추세 분석'], models: 'LSTM · RUL Regressor', count: 30 },
    safety: { title: 'AI 안전 에이전트', status: '진행 중', tasks: ['C구역 화재·연기 영상 감시', '보호구 착용 영상 점검'], models: 'YOLOv8-Fire · Pose Estimation', count: 32 },
    production: { title: 'AI 생산 최적화 에이전트', status: '진행 중', tasks: ['라인 밸런싱 시뮬레이션', '라인별 작업 순서 최적화'], models: 'XGBoost · Bottleneck Detector', count: 34 },
    energy: { title: 'AI 에너지 에이전트', status: '진행 중', tasks: ['공조 설비 부하 이전 계획', '피크 시간대 전력 수요 예측'], models: 'Prophet · GRU', count: 37 },
    logistics: { title: 'AI 물류 에이전트', status: '진행 중', tasks: ['자재 투입 배차 명령 하달', '입고 자재 경로 재계획'], models: 'RL Path Planner · RTD / ACS', count: 39 },
  };
  let tooltipButton = null;
  let tooltipPointer = null;
  function positionTooltip(event) {
    if (!tooltipButton) return;
    if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      tooltipPointer = { x: event.clientX, y: event.clientY };
    }
    const button = tooltipButton.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const x = (tooltipPointer?.x ?? button.left + button.width / 2) - canvasRect.left;
    const y = (tooltipPointer?.y ?? button.top + button.height / 2) - canvasRect.top;
    const left = x + 12 + tooltip.offsetWidth > canvasRect.width - 4
      ? x - tooltip.offsetWidth - 12 : x + 12;
    const top = y + 16 + tooltip.offsetHeight > canvasRect.height - 4
      ? y - tooltip.offsetHeight - 12 : y + 16;
    tooltip.style.left = `${Math.max(4, Math.min(canvasRect.width - tooltip.offsetWidth - 4, left))}px`;
    tooltip.style.top = `${Math.max(4, Math.min(canvasRect.height - tooltip.offsetHeight - 4, top))}px`;
  }
  function showTileTooltip(button, label, event) {
    if (tileDrag?.moved || subtileDrag?.moved || fourthDrag?.moved) return;
    if (button.getAttribute('aria-expanded') === 'true') {
      hideTileTooltip();
      return;
    }
    if (tooltipButton !== button) tooltipPointer = null;
    tooltipButton = button;
    tooltip.textContent = label;
    tooltip.hidden = false;
    positionTooltip(event);
  }
  function hideTileTooltip(button) {
    if (button && tooltipButton !== button) return;
    tooltipButton = null;
    tooltipPointer = null;
    tooltip.hidden = true;
  }
  const bounds = agents.reduce((result, agent) => {
    const size = tileSize(agent);
    return {
      left: Math.min(result.left, agent.x),
      top: Math.min(result.top, agent.y),
      right: Math.max(result.right, agent.x + size),
      bottom: Math.max(result.bottom, agent.y + size),
    };
  }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  function cameraForViewport() {
    const viewport = controls.getBoundingClientRect();
    const width = viewport.width || window.innerWidth || 1;
    const height = viewport.height || window.innerHeight || 1;
    const zoom = Math.max(1, Math.min(1.32, height / width / (baseHeight / baseWidth))) * 0.9;
    const viewWidth = Math.max(baseWidth / zoom, 1200 * width / height);
    const viewHeight = viewWidth * height / width;
    return {
      x: (bounds.left + bounds.right - viewWidth) / 2,
      y: (bounds.top + bounds.bottom - viewHeight) / 2,
      width: viewWidth,
      height: viewHeight,
    };
  }
  const camera = cameraForViewport();
  const initialPositions = new Map(agents.map(agent => [agent.id, { x: agent.x, y: agent.y }]));
  const initialCamera = { ...camera };
  const views = agents.map(agent => {
    const connection = document.querySelector(`[data-connection="${agent.id}"]`);
    const nodeGroup = document.querySelector(`[data-nodes="${agent.id}"]`);
    const nodes = nodeGroup?.querySelectorAll('circle');
    let progressTrack = null;
    let progressRing = null;
    if (nodeGroup) {
      progressTrack = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      progressTrack.classList.add('node-progress-track');
      progressTrack.setAttribute('r', '8');
      progressRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      progressRing.classList.add('node-progress-ring');
      progressRing.setAttribute('r', '8');
      progressRing.setAttribute('pathLength', '100');
      progressRing.setAttribute('stroke-dasharray', '100');
      progressRing.setAttribute('stroke-dashoffset', '100');
      nodeGroup.style.setProperty('--node-progress-color', activeColors[agent.id]);
      nodeGroup.prepend(progressTrack, progressRing);
    }
    const details = detailsTemplate.cloneNode(true);
    details.id = `agent-details-${agent.id}`;
    const detailFrame = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    detailFrame.classList.add('tile-detail-frame');
    detailFrame.append(details);
    return {
      agent,
      tile: document.querySelector(`[data-agent="${agent.id}"]`),
      button: document.querySelector(`[data-tile-control="${agent.id}"]`),
      path: connection?.querySelector('path'),
      nodeGroup,
      nodes,
      progressTrack,
      progressRing,
      details,
      detailFrame,
      progressBar: details.querySelector('.agent-details__progress'),
      progressFill: details.querySelector('.agent-details__progress span'),
    };
  });
  detailsTemplate.remove();
  const mockStates = new Map(agents.slice(1).map(agent => [agent.id, createMockTaskState()]));
  const subtileLinks = document.querySelector('.subtile-links');
  const subtileLayer = document.querySelector('.subtiles');
  const selectedSubtiles = new Set();
  const fixedSubtilePositions = new Map();
  const manualSubtileOffsets = new Map();
  const suppressedSubtileClicks = new Set();
  const subtileStatusStates = new Map(submenuItems.map(item =>
    [item.id, createSubtileStatusState(item.id)]));
  const subtileViews = submenuItems.map(item => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.dataset.subtileLink = item.id;
    line.style.setProperty('--subtile-color', activeColors[item.parentId]);
    subtileLinks.append(line);
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.dataset.subtile = item.id;
    group.dataset.selected = 'false';
    group.style.setProperty('--subtile-color', activeColors[item.parentId]);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.classList.add('subtile-circle');
    circle.setAttribute('r', String(subtileRadius));
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    icon.classList.add('subtile-icon');
    icon.setAttribute('transform', 'translate(-12 -12)');
    icon.innerHTML = submenuIconPaths[item.icon];
    const detailFrame = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    detailFrame.classList.add('subtile-detail-frame');
    detailFrame.setAttribute('x', String(-subtileDetailSize.width / 2));
    detailFrame.setAttribute('y', String(-subtileDetailSize.height / 2));
    detailFrame.setAttribute('width', String(subtileDetailSize.width));
    detailFrame.setAttribute('height', String(subtileDetailSize.height));
    const detail = document.createElement('div');
    detail.className = 'subtile-details';
    const header = document.createElement('div');
    header.className = 'subtile-details__header';
    const emblem = document.createElement('span');
    emblem.className = 'subtile-details__emblem';
    const detailIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    detailIcon.setAttribute('viewBox', '0 0 24 24');
    detailIcon.setAttribute('aria-hidden', 'true');
    detailIcon.innerHTML = submenuIconPaths[item.icon];
    emblem.append(detailIcon);
    const heading = document.createElement('span');
    heading.className = 'subtile-details__heading';
    const parentLabel = document.createElement('span');
    parentLabel.className = 'subtile-details__parent';
    parentLabel.textContent = cardData[item.parentId].title;
    const title = document.createElement('strong');
    title.className = 'subtile-details__title';
    title.textContent = item.label;
    heading.append(parentLabel, title);
    header.append(emblem, heading);
    const status = document.createElement('div');
    status.className = 'subtile-details__status';
    const statusText = document.createElement('strong');
    statusText.className = 'subtile-details__status-value';
    statusText.textContent = subtileStatusStates.get(item.id).text;
    const statusMeta = document.createElement('small');
    statusMeta.className = 'subtile-details__status-meta';
    status.append(statusText, statusMeta);
    detail.append(header, status);
    detailFrame.append(detail);
    group.append(circle, icon, detailFrame);
    subtileLayer.append(group);
    const ports = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    ports.classList.add('subtile-ports');
    ports.style.setProperty('--subtile-color', activeColors[item.parentId]);
    const parentNode = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const childNode = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    parentNode.setAttribute('r', '3');
    childNode.setAttribute('r', '3');
    const progressTrack = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progressTrack.classList.add('subtile-progress-track');
    progressTrack.setAttribute('r', '8');
    const progressRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progressRing.classList.add('subtile-progress-ring');
    progressRing.setAttribute('r', '8');
    progressRing.setAttribute('pathLength', '100');
    progressRing.setAttribute('stroke-dasharray', '100');
    ports.append(progressTrack, progressRing, parentNode, childNode);
    subtileLayer.append(ports);
    const button = document.createElement('button');
    button.className = 'subtile-hit';
    button.type = 'button';
    button.dataset.subtileControl = item.id;
    button.dataset.label = item.label;
    button.setAttribute('aria-label', `${cardData[item.parentId].title} · ${item.label}`);
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-expanded', 'false');
    controls.append(button);
    button.addEventListener('click', event => {
      if (suppressedSubtileClicks.has(item.id)) {
        event.preventDefault();
        return;
      }
      const selected = !selectedSubtiles.has(item.id);
      if (selected) {
        fixedSubtilePositions.set(item.id, { ...lastSubtilePositions.get(item.id) });
        selectedSubtiles.add(item.id);
      } else {
        selectedSubtiles.delete(item.id);
        fixedSubtilePositions.delete(item.id);
        const center = lastSubtilePositions.get(item.id);
        const parent = lastParentAnchorFrames.get(item.parentId);
        if (center && parent) manualSubtileOffsets.set(item.id, {
          x: center.x - parent.x - parent.width / 2,
          y: center.y - parent.y - parent.height / 2,
        });
      }
      group.dataset.selected = String(selected);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-expanded', String(selected));
      draw(elapsed);
    });
    button.addEventListener('pointerenter', event => { group.dataset.hover = 'true'; showTileTooltip(button, item.label, event); });
    button.addEventListener('pointermove', event => { if (tooltipButton === button) positionTooltip(event); });
    button.addEventListener('pointerleave', () => { group.dataset.hover = 'false'; hideTileTooltip(button); });
    button.addEventListener('focus', () => { group.dataset.hover = 'true'; showTileTooltip(button, item.label); });
    button.addEventListener('blur', () => { button.classList.remove('is-pointer-focused'); group.dataset.hover = 'false'; hideTileTooltip(button); });
    button.addEventListener('keydown', () => button.classList.remove('is-pointer-focused'));
    return { item, line, group, button, ports, parentNode, childNode, progressTrack, progressRing,
      statusText, statusMeta };
  });
  const fourthItems = createFourthLevelItems(submenuItems);
  const fourthLinks = document.querySelector('.fourth-links');
  const fourthLayer = document.querySelector('.fourth-tiles');
  const selectedFourthTiles = new Set();
  const fixedFourthPositions = new Map();
  const manualFourthOffsets = new Map();
  const suppressedFourthClicks = new Set();
  const fourthViews = fourthItems.map(item => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.dataset.fourthLink = item.id;
    line.dataset.connected = 'false';
    fourthLinks.append(line);
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.dataset.fourth = item.id;
    group.dataset.parent = item.parentId;
    group.dataset.connected = 'false';
    group.dataset.selected = 'false';
    group.dataset.hover = 'false';
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.classList.add('fourth-circle');
    circle.setAttribute('r', String(fourthRadius));
    const detail = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    detail.classList.add('fourth-detail');
    detail.setAttribute('x', String(-fourthDetailSize.width / 2));
    detail.setAttribute('y', String(-fourthDetailSize.height / 2));
    detail.setAttribute('width', String(fourthDetailSize.width));
    detail.setAttribute('height', String(fourthDetailSize.height));
    detail.setAttribute('rx', '8');
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.classList.add('fourth-detail-label');
    label.textContent = 'unknown';
    group.append(circle, detail, label);
    fourthLayer.append(group);
    const button = document.createElement('button');
    button.className = 'fourth-hit';
    button.type = 'button';
    button.dataset.fourthControl = item.id;
    button.setAttribute('aria-label', 'unknown');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-expanded', 'false');
    controls.append(button);
    button.addEventListener('click', event => {
      if (suppressedFourthClicks.has(item.id)) {
        event.preventDefault();
        return;
      }
      const selected = !selectedFourthTiles.has(item.id);
      const center = lastFourthPositions.get(item.id);
      if (selected) {
        if (center) fixedFourthPositions.set(item.id, { ...center });
        selectedFourthTiles.add(item.id);
      } else {
        selectedFourthTiles.delete(item.id);
        fixedFourthPositions.delete(item.id);
        const parent = lastSubtilePositions.get(item.parentId);
        if (center && parent) manualFourthOffsets.set(item.id, {
          x: center.x - parent.x, y: center.y - parent.y,
        });
      }
      group.dataset.selected = String(selected);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-expanded', String(selected));
      draw(elapsed);
    });
    button.addEventListener('pointerenter', event => { group.dataset.hover = 'true'; showTileTooltip(button, 'unknown', event); });
    button.addEventListener('pointermove', event => { if (tooltipButton === button) positionTooltip(event); });
    button.addEventListener('pointerleave', () => { group.dataset.hover = 'false'; hideTileTooltip(button); });
    button.addEventListener('focus', () => { group.dataset.hover = 'true'; showTileTooltip(button, 'unknown'); });
    button.addEventListener('blur', () => { group.dataset.hover = 'false'; hideTileTooltip(button); });
    return { item, line, group, button };
  });
  const peerLinksLayer = document.querySelector('.peer-links');
  const peerNodesLayer = document.querySelector('.peer-nodes');
  const peerMask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
  peerMask.id = 'peer-link-mask';
  peerMask.setAttribute('maskUnits', 'userSpaceOnUse');
  peerMask.setAttribute('maskContentUnits', 'userSpaceOnUse');
  for (const [key, value] of Object.entries({ x: -10000, y: -10000, width: 20000, height: 20000 })) {
    peerMask.setAttribute(key, String(value));
  }
  const peerMaskArea = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  for (const [key, value] of Object.entries({ x: -10000, y: -10000, width: 20000, height: 20000 })) {
    peerMaskArea.setAttribute(key, String(value));
  }
  peerMaskArea.setAttribute('fill', '#fff');
  peerMask.append(peerMaskArea);
  const peerAgentMasks = new Map(agents.map(agent => {
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    shape.setAttribute('fill', '#000');
    shape.setAttribute('rx', '12');
    shape.setAttribute('ry', '12');
    peerMask.append(shape);
    return [agent.id, shape];
  }));
  const peerSubtileMasks = new Map(submenuItems.map(item => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', String(subtileRadius - 1));
    circle.setAttribute('fill', '#000');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('rx', '12');
    rect.setAttribute('ry', '12');
    rect.setAttribute('fill', '#000');
    rect.style.display = 'none';
    peerMask.append(circle, rect);
    return [item.id, { circle, rect }];
  }));
  const peerMaskDefinitions = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  peerMaskDefinitions.append(peerMask);
  svg.insertBefore(peerMaskDefinitions, peerLinksLayer);
  peerLinksLayer.setAttribute('mask', 'url(#peer-link-mask)');
  function createPeerView(pair, level, parentId, index, count) {
    const [first, second] = pair;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.dataset.peerLevel = String(level);
    line.dataset.peerFirst = first.id;
    line.dataset.peerSecond = second.id;
    line.dataset.peerParent = parentId;
    line.dataset.connected = 'false';
    peerLinksLayer.append(line);
    const ports = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    ports.classList.add('peer-ports');
    ports.dataset.peerLevel = String(level);
    const firstNode = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const secondNode = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    firstNode.setAttribute('r', '2.5');
    secondNode.setAttribute('r', '2.5');
    const progressTrack = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progressTrack.classList.add('peer-progress-track');
    progressTrack.setAttribute('r', '8');
    const progressRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progressRing.classList.add('peer-progress-ring');
    progressRing.setAttribute('r', '8');
    progressRing.setAttribute('pathLength', '100');
    progressRing.setAttribute('stroke-dasharray', '100');
    ports.append(progressTrack, progressRing, firstNode, secondNode);
    peerNodesLayer.append(ports);
    return { pair, first, second, level, parentId, index, count, line, ports,
      firstNode, secondNode, progressTrack, progressRing };
  }
  const specialistPeerViews = specialistPeerPairs.map((pair, index) =>
    createPeerView(pair, 2, 'supervisor', index, specialistPeerPairs.length));
  const subtilePairsByParent = new Map();
  for (const pair of subtilePeerPairs) {
    const parentId = pair[0].parentId;
    if (!subtilePairsByParent.has(parentId)) subtilePairsByParent.set(parentId, []);
    subtilePairsByParent.get(parentId).push(pair);
  }
  const subtilePeerViews = [...subtilePairsByParent].flatMap(([parentId, pairs]) =>
    pairs.map((pair, index) => createPeerView(pair, 3, parentId, index, pairs.length)));
  function placePeerView(view, connection) {
    const { line, firstNode, secondNode, progressTrack, progressRing } = view;
    line.setAttribute('d', connection.path);
    firstNode.setAttribute('cx', connection.start.x);
    firstNode.setAttribute('cy', connection.start.y);
    secondNode.setAttribute('cx', connection.end.x);
    secondNode.setAttribute('cy', connection.end.y);
    const receiver = line.dataset.direction === 'reverse' ? connection.start : connection.end;
    for (const ring of [progressTrack, progressRing]) {
      ring.setAttribute('cx', receiver.x);
      ring.setAttribute('cy', receiver.y);
    }
  }
  for (const { button, details } of views) {
    button.setAttribute('aria-controls', details.id);
    button.setAttribute('aria-expanded', 'false');
  }
  const selectedTiles = new Set();
  const fixedSelectedPositions = new Map();
  let drag = null;
  let tileDrag = null;
  let subtileDrag = null;
  let fourthDrag = null;
  let lastAgentPositions = new Map();
  let lastAgentDrawSeconds = null;
  let lastSubtilePositions = new Map();
  let lastParentAnchorFrames = new Map();
  let lastSubtileDrawSeconds = null;
  let lastFourthPositions = new Map();
  let lastFourthDrawSeconds = null;
  let frame = 0;
  let mockTimer = 0;
  let elapsed = 0;
  let previousTime = null;

  function displayedPositions(seconds, deltaSeconds = 0) {
    const dragged = tileDrag?.moved ? { id: tileDrag.agent.id, position: tileDrag.position } : null;
    const targets = resolveTilePositions(agents, selectedTiles, seconds, preference.matches, dragged, fixedSelectedPositions);
    const subtileObstacles = [
      ...(subtileDrag?.moved ? [subtileBounds(subtileDrag.center,
        selectedSubtiles.has(subtileDrag.item.id))] : []),
      ...[...selectedFourthTiles].map(id => fixedFourthPositions.get(id))
        .filter(Boolean).map(center => fourthBounds(center, true)),
      ...(fourthDrag?.moved && !selectedFourthTiles.has(fourthDrag.item.id)
        ? [fourthBounds(fourthDrag.center)] : []),
    ];
    return settleAgentPositions(targets, lastAgentPositions, agents, selectedTiles,
      deltaSeconds, dragged?.id, preference.matches, subtileObstacles);
  }

  function worldAt(clientX, clientY) {
    const viewport = controls.getBoundingClientRect();
    return {
      x: camera.x + (clientX - viewport.left) / viewport.width * camera.width,
      y: camera.y + (clientY - viewport.top) / viewport.height * camera.height,
    };
  }

  function syncSupervisorStats() {
    const active = views.filter(view => view.agent.id !== 'supervisor' && mockConnectionActive(mockStates.get(view.agent.id)));
    const pending = active.filter(view => cardData[view.agent.id].status.startsWith('승인 대기')).length;
    const supervisorView = views.find(view => view.agent.id === 'supervisor');
    const details = supervisorView.details;
    details.querySelector('[data-stat="running"]').textContent = active.length;
    details.querySelector('[data-stat="pending"]').textContent = pending;
    details.querySelector('.agent-details__summary').textContent = active.length === 6
      ? `전 에이전트 정상 작업 중 · 승인 대기 ${pending}`
      : `${active.length}개 에이전트 연결 중 · 승인 대기 ${pending}`;
    const compact = document.querySelector('.supervisor-compact-stats');
    for (const stat of details.querySelectorAll('[data-stat]')) {
      compact.querySelector(`[data-compact-stat="${stat.dataset.stat}"]`).textContent = stat.textContent;
    }
    supervisorView.button.setAttribute('aria-label',
      `슈퍼바이저 에이전트 타일, 진행 중 ${active.length}, 승인 대기 ${pending}, 병목 ${details.querySelector('[data-stat="bottleneck"]').textContent}, 해결됨 ${details.querySelector('[data-stat="resolved"]').textContent}`);
  }

  function syncTileAppearance() {
    const flowing = views.filter(({ path }) => {
      const dash = path?.getAttribute('stroke-dasharray');
      return dash && dash !== 'none';
    }).map(({ agent }) => agent.id);
    for (const { agent, tile, path, nodeGroup, nodes } of views) {
      const lineFlowing = flowing.includes(agent.id);
      if (path) path.parentElement.dataset.connected = String(lineFlowing);
      if (nodeGroup) {
        nodeGroup.dataset.connected = String(lineFlowing);
        setNodePaintOrder(nodeGroup, nodes, lineFlowing);
      }
      tile.dataset.flowing = String(agent.id === 'supervisor' ? flowing.length > 0 : lineFlowing);
      const online = agent.id === 'supervisor' || mockTileActive(mockStates.get(agent.id));
      if (tile.dataset.connected === String(online)) continue;
      tile.dataset.connected = String(online);
      const image = tile.querySelector('image');
      const asset = agent.id === 'supervisor' ? './assets/supervisor-compact.svg'
        : `./assets/${agent.id}${online ? '' : '-inactive'}.svg`;
      if (image.getAttribute('href') !== asset) image.setAttribute('href', asset);
      const color = online ? activeColors[agent.id] : inactiveColor;
      tile.querySelector('.tile-outline').setAttribute('stroke', color);
      tile.style.setProperty('--tile-glow-color', color);
    }
    for (const { item, group } of subtileViews) {
      const online = mockTileActive(mockStates.get(item.parentId));
      group.dataset.connected = String(online);
    }
    syncSupervisorStats();
    for (const view of views) if (selectedTiles.has(view.agent.id)) renderAgentDetails(view);
  }

  syncTileAppearance();
  new MutationObserver(syncTileAppearance).observe(document.querySelector('.connections'), {
    subtree: true,
    attributes: true,
    attributeFilter: ['stroke-dasharray'],
  });

  function syncMockConnections() {
    for (const { agent, path } of views) {
      if (!path) continue;
      const state = mockStates.get(agent.id);
      path.parentElement.dataset.direction = mockFlowDirection(agent.id, state.taskIndex);
      const dash = mockConnectionActive(state) ? '4 8' : 'none';
      if (path.getAttribute('stroke-dasharray') !== dash) path.setAttribute('stroke-dasharray', dash);
    }
    syncTileAppearance();
  }

  function syncSubtileFlows() {
    for (const { item, line, group, ports, parentNode, childNode, progressRing } of subtileViews) {
      const state = mockStates.get(item.parentId);
      const flow = subtileMockFlow(item, state);
      const connected = String(flow.connected);
      if (line.dataset.connected !== connected) line.dataset.connected = connected;
      if (line.dataset.direction !== flow.direction) line.dataset.direction = flow.direction;
      const dash = flow.connected ? '4 8' : 'none';
      if (line.getAttribute('stroke-dasharray') !== dash) line.setAttribute('stroke-dasharray', dash);
      if (ports.dataset.connected !== connected) {
        ports.dataset.connected = connected;
        setNodePaintOrder(ports, [parentNode, childNode], flow.connected);
      }
      if (group.dataset.flowing !== connected) group.dataset.flowing = connected;
      progressRing.setAttribute('stroke-dashoffset', String(100 - flow.progress));
    }
  }

  function syncSubtileStatuses(seconds = 0) {
    for (const { item, statusText, statusMeta } of subtileViews) {
      const online = mockTileActive(mockStates.get(item.parentId));
      const state = subtileStatusStates.get(item.id);
      const updated = online && advanceSubtileStatusState(state, seconds);
      if (updated) statusText.textContent = state.text;
      if (!updated && statusMeta.dataset.online === String(online)) continue;
      statusMeta.dataset.online = String(online);
      statusMeta.textContent = online
        ? `목업 · ${new Date(state.receivedAt).toLocaleTimeString('ko-KR', {
          hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
        })}`
        : '목업 · 연결 끊김';
    }
  }

  function setPeerFlow(view, connected, direction, progress, color) {
    const active = String(connected);
    if (view.line.dataset.connected !== active) view.line.dataset.connected = active;
    if (view.ports.dataset.connected !== active) {
      view.ports.dataset.connected = active;
      setNodePaintOrder(view.ports, [view.firstNode, view.secondNode], connected);
    }
    if (view.line.dataset.direction !== direction) view.line.dataset.direction = direction;
    const dash = connected ? '4 8' : 'none';
    if (view.line.getAttribute('stroke-dasharray') !== dash) view.line.setAttribute('stroke-dasharray', dash);
    view.ports.style.setProperty('--peer-progress-color', color);
    view.progressRing.setAttribute('stroke-dashoffset', String(100 - progress));
  }

  function syncPeerFlows() {
    const selected = activeSpecialistPeer(specialistPeerPairs, mockStates, elapsed);
    const cycle = Math.floor(elapsed / 4);
    for (const view of specialistPeerViews) {
      const firstState = mockStates.get(view.first.id);
      const secondState = mockStates.get(view.second.id);
      const direction = (cycle + view.index + firstState.taskIndex + secondState.taskIndex) % 2 === 0
        ? 'forward' : 'reverse';
      const receiver = direction === 'forward' ? view.second : view.first;
      setPeerFlow(view, view.pair === selected, direction, elapsed % 4 / 4 * 100, activeColors[receiver.id]);
    }
    const flowingSubtiles = new Set();
    for (const view of subtilePeerViews) {
      const flow = peerMockFlow(view.index, view.count, mockStates.get(view.parentId));
      setPeerFlow(view, flow.connected, flow.direction, flow.progress, activeColors[view.parentId]);
      if (flow.connected) {
        flowingSubtiles.add(view.first.id);
        flowingSubtiles.add(view.second.id);
      }
    }
    for (const { item, line, group } of subtileViews) {
      group.dataset.flowing = String(line.dataset.connected === 'true' || flowingSubtiles.has(item.id));
    }
  }

  syncMockConnections();
  syncSubtileFlows();
  syncSubtileStatuses();
  syncPeerFlows();

  function updateCamera() {
    svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
    const zoom = baseWidth / camera.width;
    const percent = Math.round(zoom * 100);
    zoomSlider.value = String(Math.max(50, Math.min(400, percent)));
    zoomSlider.setAttribute('aria-valuetext', `${percent}%`);
    zoomIn.disabled = zoom >= 4 - 0.001;
    zoomOut.disabled = zoom <= 0.5 + 0.001;
    draw(elapsed);
  }

  function zoomTo(nextZoom, x = 0.5, y = 0.5) {
    const viewport = controls.getBoundingClientRect();
    if (!viewport.width || !viewport.height) return;
    const zoom = Math.max(0.5, Math.min(4, nextZoom));
    const worldX = camera.x + x * camera.width;
    const worldY = camera.y + y * camera.height;
    camera.width = baseWidth / zoom;
    camera.height = camera.width * viewport.height / viewport.width;
    camera.x = worldX - x * camera.width;
    camera.y = worldY - y * camera.height;
    updateCamera();
  }

  zoomControls.addEventListener('pointerdown', event => event.stopPropagation());
  zoomControls.addEventListener('wheel', event => {
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
  zoomIn.addEventListener('click', () => zoomTo(baseWidth / camera.width * 1.25));
  zoomOut.addEventListener('click', () => zoomTo(baseWidth / camera.width / 1.25));
  zoomSlider.addEventListener('input', () => zoomTo(Number(zoomSlider.value) / 100));

  let navigationTransform = null;
  let navigationDrag = null;

  function renderNavigation(parentFrames, childPositions, fourthPositions) {
    if (navigationPanel.hidden) return;
    const rect = navigationMap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(rect.width * ratio));
    const pixelHeight = Math.max(1, Math.round(rect.height * ratio));
    if (navigationMap.width !== pixelWidth || navigationMap.height !== pixelHeight) {
      navigationMap.width = pixelWidth;
      navigationMap.height = pixelHeight;
    }
    const context = navigationMap.getContext('2d');
    if (!context) return;
    context.setTransform(pixelWidth / rect.width, 0, 0, pixelHeight / rect.height, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);

    const bounds = navigationDrag?.bounds || (() => {
      const area = {
        left: Math.min(initialCamera.x, camera.x),
        top: Math.min(initialCamera.y, camera.y),
        right: Math.max(initialCamera.x + initialCamera.width, camera.x + camera.width),
        bottom: Math.max(initialCamera.y + initialCamera.height, camera.y + camera.height),
      };
      const include = frame => {
        area.left = Math.min(area.left, frame.x);
        area.top = Math.min(area.top, frame.y);
        area.right = Math.max(area.right, frame.x + frame.width);
        area.bottom = Math.max(area.bottom, frame.y + frame.height);
      };
      for (const frame of parentFrames.values()) include(frame);
      for (const item of submenuItems) include(subtileBounds(childPositions.get(item.id), selectedSubtiles.has(item.id)));
      for (const item of fourthItems) include(fourthBounds(fourthPositions.get(item.id), selectedFourthTiles.has(item.id)));
      return { left: area.left - 120, top: area.top - 120, right: area.right + 120, bottom: area.bottom + 120 };
    })();
    const scale = Math.min((rect.width - 20) / (bounds.right - bounds.left),
      (rect.height - 20) / (bounds.bottom - bounds.top));
    const offsetX = (rect.width - (bounds.right - bounds.left) * scale) / 2 - bounds.left * scale;
    const offsetY = (rect.height - (bounds.bottom - bounds.top) * scale) / 2 - bounds.top * scale;
    navigationTransform = { bounds, scale, offsetX, offsetY };
    const point = center => ({ x: center.x * scale + offsetX, y: center.y * scale + offsetY });
    const frameCenter = frame => ({ x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 });
    const link = (start, end) => {
      const a = point(start);
      const b = point(end);
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
    };

    context.beginPath();
    context.strokeStyle = 'rgba(138, 156, 175, 0.45)';
    context.lineWidth = 1;
    const supervisorCenter = frameCenter(parentFrames.get('supervisor'));
    for (const agent of agents.slice(1)) link(supervisorCenter, frameCenter(parentFrames.get(agent.id)));
    for (const item of submenuItems) link(frameCenter(parentFrames.get(item.parentId)), childPositions.get(item.id));
    for (const item of fourthItems) link(childPositions.get(item.parentId), fourthPositions.get(item.id));
    context.stroke();

    for (const agent of agents) {
      const frame = parentFrames.get(agent.id);
      context.fillStyle = activeColors[agent.id];
      context.globalAlpha = 0.65;
      context.fillRect(frame.x * scale + offsetX, frame.y * scale + offsetY,
        Math.max(3, frame.width * scale), Math.max(3, frame.height * scale));
      context.globalAlpha = 1;
    }
    for (const item of submenuItems) {
      const center = point(childPositions.get(item.id));
      context.beginPath();
      context.arc(center.x, center.y, Math.max(2.5, subtileRadius * scale), 0, Math.PI * 2);
      context.fillStyle = activeColors[item.parentId];
      context.fill();
    }
    for (const item of fourthItems) {
      const center = point(fourthPositions.get(item.id));
      context.beginPath();
      context.arc(center.x, center.y, Math.max(1.8, fourthRadius * scale), 0, Math.PI * 2);
      context.fillStyle = '#5b6470';
      context.fill();
    }
    context.fillStyle = 'rgba(187, 220, 255, 0.08)';
    context.strokeStyle = '#c5e1ff';
    context.lineWidth = 1.5;
    context.fillRect(camera.x * scale + offsetX, camera.y * scale + offsetY,
      camera.width * scale, camera.height * scale);
    context.strokeRect(camera.x * scale + offsetX, camera.y * scale + offsetY,
      camera.width * scale, camera.height * scale);
  }

  function moveCameraFromNavigation(event) {
    if (!navigationTransform) return;
    const rect = navigationMap.getBoundingClientRect();
    const { bounds, scale, offsetX, offsetY } = navigationTransform;
    const centerX = Math.max(bounds.left, Math.min(bounds.right, (event.clientX - rect.left - offsetX) / scale));
    const centerY = Math.max(bounds.top, Math.min(bounds.bottom, (event.clientY - rect.top - offsetY) / scale));
    camera.x = centerX - camera.width / 2;
    camera.y = centerY - camera.height / 2;
    updateCamera();
  }

  function setNavigationOpen(open, keyboard = false) {
    navigationPanel.hidden = !open;
    navigationOpen.setAttribute('aria-expanded', String(open));
    navigationOpen.setAttribute('aria-label', open ? '네비게이션 닫기' : '네비게이션 열기');
    if (open) {
      draw(elapsed);
      if (keyboard) navigationMap.focus();
    } else {
      navigationTransform = null;
      if (keyboard) navigationOpen.focus();
    }
  }

  navigationOpen.addEventListener('click', event => setNavigationOpen(navigationPanel.hidden, event.detail === 0));
  navigationClose.addEventListener('click', event => setNavigationOpen(false, event.detail === 0));
  navigationPanel.addEventListener('pointerdown', event => event.stopPropagation());
  navigationPanel.addEventListener('wheel', event => {
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
  navigationMap.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !navigationTransform) return;
    event.preventDefault();
    navigationDrag = { pointerId: event.pointerId, bounds: navigationTransform.bounds };
    navigationMap.dataset.dragging = 'true';
    navigationMap.setPointerCapture(event.pointerId);
    moveCameraFromNavigation(event);
  });
  navigationMap.addEventListener('pointermove', event => {
    if (navigationDrag?.pointerId === event.pointerId) moveCameraFromNavigation(event);
  });
  function finishNavigationDrag(event) {
    if (navigationDrag?.pointerId !== event.pointerId) return;
    navigationDrag = null;
    delete navigationMap.dataset.dragging;
    if (navigationMap.hasPointerCapture(event.pointerId)) navigationMap.releasePointerCapture(event.pointerId);
    draw(elapsed);
  }
  navigationMap.addEventListener('pointerup', finishNavigationDrag);
  navigationMap.addEventListener('pointercancel', finishNavigationDrag);
  navigationMap.addEventListener('lostpointercapture', finishNavigationDrag);
  navigationMap.addEventListener('keydown', event => {
    const direction = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    }[event.key];
    if (event.key === 'Escape') {
      event.preventDefault();
      setNavigationOpen(false, true);
    } else if (direction) {
      event.preventDefault();
      camera.x += direction[0] * camera.width * 0.1;
      camera.y += direction[1] * camera.height * 0.1;
      updateCamera();
    }
  });

  function updateProgress(view) {
    const state = mockStates.get(view.agent.id);
    if (!state) return;
    const progress = Math.round(state.progress * 10) / 10;
    view.progressBar.setAttribute('aria-valuenow', String(Math.round(progress)));
    view.progressFill.style.width = `${progress}%`;
    view.progressRing.setAttribute('stroke-dashoffset', String(100 - progress));
  }

  function renderAgentDetails(view) {
    const { agent, tile, details } = view;
    if (!selectedTiles.has(agent.id)) {
      details.hidden = true;
      return;
    }
    const id = agent.id;
    const data = cardData[id];
    const state = mockStates.get(id);
    const connected = tile.dataset.connected === 'true';
    const color = connected ? activeColors[id] : inactiveColor;
    details.dataset.agent = id;
    details.style.setProperty('--card-accent', color);
    details.querySelector('.agent-details__icon').src = id === 'supervisor' ? './assets/supervisor-detail.svg'
      : `./assets/${id}${connected ? '' : '-inactive'}.svg`;
    details.querySelector('.agent-details__title').textContent = data.title;
    const role = details.querySelector('.agent-details__role');
    role.hidden = id !== 'supervisor';
    role.textContent = data.role || '';
    const status = details.querySelector('.agent-details__status');
    status.hidden = id === 'supervisor';
    status.textContent = id === 'supervisor' ? '' : !connected ? '비활성'
      : state.phase === 'handoff' ? '다음 과업 대기' : data.status;
    const specialist = details.querySelector('.agent-details__specialist');
    const supervisor = details.querySelector('.agent-details__supervisor');
    specialist.hidden = id === 'supervisor';
    supervisor.hidden = id !== 'supervisor';
    if (id === 'supervisor') {
      syncSupervisorStats();
    } else {
      details.querySelector('.agent-details__task').textContent = data.tasks[state.taskIndex % data.tasks.length];
      updateProgress(view);
      details.querySelector('.agent-details__models').textContent = data.models;
      details.querySelector('.agent-details__count').textContent = `◷ ${data.count}`;
    }
    details.hidden = false;
  }

  function toggleTile(view) {
    const { agent, tile, button, detailFrame } = view;
    if (selectedTiles.has(agent.id)) {
      const fixed = fixedSelectedPositions.get(agent.id);
      const floating = positionAt(agent, elapsed, preference.matches);
      agent.x += fixed.x - floating.x;
      agent.y += fixed.y - floating.y;
      fixedSelectedPositions.delete(agent.id);
      selectedTiles.delete(agent.id);
      tile.dataset.selected = 'false';
      detailFrame.remove();
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-expanded', 'false');
    } else {
      fixedSelectedPositions.set(agent.id, displayedPositions(elapsed).get(agent.id));
      selectedTiles.add(agent.id);
      const settled = displayedPositions(elapsed);
      for (const id of selectedTiles) fixedSelectedPositions.set(id, settled.get(id));
      tile.dataset.selected = 'true';
      tile.insertBefore(detailFrame, tile.querySelector('.tile-outline'));
      button.setAttribute('aria-pressed', 'true');
      button.setAttribute('aria-expanded', 'true');
    }
    renderAgentDetails(view);
    draw(elapsed);
  }

  function clearSelections(restorePositions = true) {
    if (!selectedTiles.size) return;
    for (const view of views) {
      if (!selectedTiles.has(view.agent.id)) continue;
      if (restorePositions) {
        const fixed = fixedSelectedPositions.get(view.agent.id);
        const floating = positionAt(view.agent, elapsed, preference.matches);
        view.agent.x += fixed.x - floating.x;
        view.agent.y += fixed.y - floating.y;
      }
      view.tile.dataset.selected = 'false';
      view.detailFrame.remove();
      view.button.setAttribute('aria-pressed', 'false');
      view.button.setAttribute('aria-expanded', 'false');
      view.details.hidden = true;
    }
    selectedTiles.clear();
    fixedSelectedPositions.clear();
    draw(elapsed);
  }

  document.querySelector('.reset-layout').addEventListener('click', () => {
    hideTileTooltip();
    if (tileDrag) {
      const { button, pointerId } = tileDrag;
      tileDrag = null;
      button.classList.remove('is-dragging');
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    }
    if (drag) {
      const { pointerId } = drag;
      drag = null;
      canvas.classList.remove('is-panning');
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    }
    for (const agent of agents) {
      const position = initialPositions.get(agent.id);
      agent.x = position.x;
      agent.y = position.y;
    }
    Object.assign(camera, initialCamera);
    selectedSubtiles.clear();
    fixedSubtilePositions.clear();
    manualSubtileOffsets.clear();
    if (subtileDrag) {
      const { button, pointerId } = subtileDrag;
      subtileDrag = null;
      button.classList.remove('is-dragging');
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    }
    for (const { group, button } of subtileViews) {
      group.dataset.selected = 'false';
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-expanded', 'false');
    }
    selectedFourthTiles.clear();
    fixedFourthPositions.clear();
    manualFourthOffsets.clear();
    if (fourthDrag) {
      const { button, pointerId } = fourthDrag;
      fourthDrag = null;
      button.classList.remove('is-dragging');
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    }
    for (const { group, button } of fourthViews) {
      group.dataset.selected = 'false';
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-expanded', 'false');
    }
    clearSelections(false);
    elapsed = 0;
    previousTime = null;
    lastSubtilePositions = new Map();
    lastSubtileDrawSeconds = null;
    lastFourthPositions = new Map();
    lastFourthDrawSeconds = null;
    lastAgentPositions = new Map();
    lastAgentDrawSeconds = null;
    updateCamera();
  });

  for (const view of views) {
    const { agent, tile, button } = view;
    let suppressClick = false;
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || tileDrag || subtileDrag || fourthDrag) return;
      const viewport = controls.getBoundingClientRect();
      if (!viewport.width || !viewport.height) return;
      const pointer = worldAt(event.clientX, event.clientY);
      const position = displayedPositions(elapsed).get(agent.id);
      tileDrag = {
        agent,
        button,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        grabX: pointer.x - position.x,
        grabY: pointer.y - position.y,
        position,
        moved: false,
      };
      button.setPointerCapture(event.pointerId);
      button.focus({ preventScroll: true });
    });
    button.addEventListener('pointermove', event => {
      if (!tileDrag || tileDrag.button !== button || tileDrag.pointerId !== event.pointerId) return;
      if (!tileDrag.moved && Math.hypot(event.clientX - tileDrag.startClientX, event.clientY - tileDrag.startClientY) < 4) return;
      tileDrag.moved = true;
      hideTileTooltip(button);
      button.classList.add('is-dragging');
      const pointer = worldAt(event.clientX, event.clientY);
      tileDrag.position = { x: pointer.x - tileDrag.grabX, y: pointer.y - tileDrag.grabY };
      draw(elapsed);
      event.preventDefault();
    });

    function finishTileDrag(event) {
      if (!tileDrag || tileDrag.button !== button || tileDrag.pointerId !== event.pointerId) return;
      if (tileDrag.moved) {
        let position = tileDrag.position;
        const positions = displayedPositions(elapsed);
        if (!selectedTiles.has(agent.id)) {
          const occupied = views.filter(view => view.agent !== agent).map(view =>
            tileRect(view.agent, positions.get(view.agent.id), selectedTiles.has(view.agent.id)));
          const currentRect = tileRect(agent, tileDrag.position);
          const clearRect = nearestFreePosition(currentRect, currentRect, occupied);
          position = {
            x: tileDrag.position.x + clearRect.x - currentRect.x,
            y: tileDrag.position.y + clearRect.y - currentRect.y,
          };
        }
        const floatingPosition = positionAt(agent, elapsed, preference.matches);
        agent.x += position.x - floatingPosition.x;
        agent.y += position.y - floatingPosition.y;
        if (selectedTiles.has(agent.id)) {
          for (const id of selectedTiles) fixedSelectedPositions.set(id, positions.get(id));
        }
        // A drag commits the pushed layout, so collapsing the selected tile
        // cannot put its neighbors back on top of the dropped tile.
        if (selectedTiles.size) {
          for (const view of views) {
            if (view.agent === agent) continue;
            const visible = positions.get(view.agent.id);
            const orbit = positionAt(view.agent, elapsed, preference.matches);
            view.agent.x += visible.x - orbit.x;
            view.agent.y += visible.y - orbit.y;
          }
        }
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
      }
      tileDrag = null;
      button.classList.remove('is-dragging');
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      draw(elapsed);
    }

    button.addEventListener('pointerup', finishTileDrag);
    button.addEventListener('pointercancel', finishTileDrag);
    button.addEventListener('lostpointercapture', finishTileDrag);
    button.addEventListener('click', event => {
      if (suppressClick) {
        event.preventDefault();
        return;
      }
      toggleTile(view);
    });
    button.addEventListener('pointerenter', event => { tile.dataset.hover = 'true'; showTileTooltip(button, cardData[agent.id].title, event); });
    button.addEventListener('pointermove', event => { if (tooltipButton === button) positionTooltip(event); });
    button.addEventListener('pointerleave', () => { tile.dataset.hover = 'false'; hideTileTooltip(button); });
    button.addEventListener('focus', () => { tile.dataset.hover = 'true'; showTileTooltip(button, cardData[agent.id].title); });
    button.addEventListener('blur', () => { tile.dataset.hover = 'false'; hideTileTooltip(button); });
    button.addEventListener('keydown', event => {
      if (event.key === 'Escape' && selectedTiles.size) {
        clearSelections();
      }
    });
  }

  for (const { item, button } of subtileViews) {
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || subtileDrag || tileDrag || fourthDrag) return;
      const center = lastSubtilePositions.get(item.id);
      if (!center) return;
      button.classList.add('is-pointer-focused');
      const pointer = worldAt(event.clientX, event.clientY);
      subtileDrag = {
        item, button, pointerId: event.pointerId,
        startClientX: event.clientX, startClientY: event.clientY,
        grabX: pointer.x - center.x, grabY: pointer.y - center.y,
        center, moved: false,
      };
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove', event => {
      if (!subtileDrag || subtileDrag.button !== button || subtileDrag.pointerId !== event.pointerId) return;
      if (!subtileDrag.moved && Math.hypot(event.clientX - subtileDrag.startClientX,
        event.clientY - subtileDrag.startClientY) < 4) return;
      subtileDrag.moved = true;
      hideTileTooltip(button);
      button.classList.add('is-dragging');
      const pointer = worldAt(event.clientX, event.clientY);
      subtileDrag.center = { x: pointer.x - subtileDrag.grabX, y: pointer.y - subtileDrag.grabY };
      if (selectedSubtiles.has(item.id)) fixedSubtilePositions.set(item.id, subtileDrag.center);
      draw(elapsed);
      event.preventDefault();
    });
    function finishSubtileDrag(event) {
      if (!subtileDrag || subtileDrag.button !== button || subtileDrag.pointerId !== event.pointerId) return;
      if (subtileDrag.moved) {
        const center = lastSubtilePositions.get(item.id);
        const parent = lastParentAnchorFrames.get(item.parentId);
        manualSubtileOffsets.set(item.id, {
          x: center.x - parent.x - parent.width / 2,
          y: center.y - parent.y - parent.height / 2,
        });
        // Keep the space made by the dragged child after pointer release.
        for (const agent of agents) {
          if (selectedTiles.has(agent.id)) continue;
          const displayed = lastAgentPositions.get(agent.id);
          const floating = positionAt(agent, elapsed, preference.matches);
          agent.x += displayed.x - floating.x;
          agent.y += displayed.y - floating.y;
        }
        suppressedSubtileClicks.add(item.id);
        setTimeout(() => suppressedSubtileClicks.delete(item.id), 0);
      }
      subtileDrag = null;
      button.classList.remove('is-dragging');
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      draw(elapsed);
    }
    button.addEventListener('pointerup', finishSubtileDrag);
    button.addEventListener('pointercancel', finishSubtileDrag);
    button.addEventListener('lostpointercapture', finishSubtileDrag);
  }

  for (const { item, button } of fourthViews) {
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || tileDrag || subtileDrag || fourthDrag) return;
      const center = lastFourthPositions.get(item.id);
      if (!center) return;
      button.classList.add('is-pointer-focused');
      const pointer = worldAt(event.clientX, event.clientY);
      fourthDrag = {
        item, button, pointerId: event.pointerId,
        startClientX: event.clientX, startClientY: event.clientY,
        grabX: pointer.x - center.x, grabY: pointer.y - center.y,
        center: { ...center }, moved: false,
      };
      button.setPointerCapture(event.pointerId);
    });
    window.addEventListener('pointermove', event => {
      if (!fourthDrag || fourthDrag.button !== button || fourthDrag.pointerId !== event.pointerId) return;
      if (!fourthDrag.moved && Math.hypot(event.clientX - fourthDrag.startClientX,
        event.clientY - fourthDrag.startClientY) < 4) return;
      fourthDrag.moved = true;
      hideTileTooltip(button);
      button.classList.add('is-dragging');
      const pointer = worldAt(event.clientX, event.clientY);
      fourthDrag.center = { x: pointer.x - fourthDrag.grabX, y: pointer.y - fourthDrag.grabY };
      if (selectedFourthTiles.has(item.id)) fixedFourthPositions.set(item.id, fourthDrag.center);
      draw(elapsed);
      event.preventDefault();
    });
    function finishFourthDrag(event) {
      if (!fourthDrag || fourthDrag.button !== button || fourthDrag.pointerId !== event.pointerId) return;
      if (fourthDrag.moved) {
        const center = lastFourthPositions.get(item.id);
        const parent = lastSubtilePositions.get(item.parentId);
        if (center && parent) manualFourthOffsets.set(item.id, {
          x: center.x - parent.x, y: center.y - parent.y,
        });
        // Retain the space made by the dragged child after releasing it.
        for (const agent of agents) {
          if (selectedTiles.has(agent.id)) continue;
          const visible = lastAgentPositions.get(agent.id);
          const floating = positionAt(agent, elapsed, preference.matches);
          agent.x += visible.x - floating.x;
          agent.y += visible.y - floating.y;
        }
        suppressedFourthClicks.add(item.id);
        setTimeout(() => suppressedFourthClicks.delete(item.id), 0);
      }
      fourthDrag = null;
      button.classList.remove('is-dragging');
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      draw(elapsed);
    }
    window.addEventListener('pointerup', finishFourthDrag);
    window.addEventListener('pointercancel', finishFourthDrag);
    button.addEventListener('lostpointercapture', finishFourthDrag);
  }

  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const viewport = controls.getBoundingClientRect();
    if (!viewport.width || !viewport.height) return;
    const x = Math.max(0, Math.min(1, (event.clientX - viewport.left) / viewport.width));
    const y = Math.max(0, Math.min(1, (event.clientY - viewport.top) / viewport.height));
    const distance = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1);
    zoomTo(baseWidth / camera.width * Math.exp(-distance * 0.001), x, y);
  }, { passive: false });

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    canvas.classList.add('is-panning');
    const viewport = controls.getBoundingClientRect();
    if (!viewport.width || !viewport.height) return;
    camera.x = drag.cameraX - dx * camera.width / viewport.width;
    camera.y = drag.cameraY - dy * camera.height / viewport.height;
    updateCamera();
  });

  function finishDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    canvas.classList.remove('is-panning');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);
  canvas.addEventListener('lostpointercapture', finishDrag);
  function draw(seconds) {
    if (tooltipButton?.getAttribute('aria-expanded') === 'true') hideTileTooltip();
    const agentDelta = lastAgentDrawSeconds === null ? 0 : Math.min(0.05, Math.max(0, seconds - lastAgentDrawSeconds));
    const positions = displayedPositions(seconds, agentDelta);
    lastAgentPositions = positions;
    lastAgentDrawSeconds = seconds;
    for (const id of selectedTiles) fixedSelectedPositions.set(id, { ...positions.get(id) });
    const parentFrames = new Map();
    const anchorFrames = new Map();
    const supervisor = positions.get(agents[0].id);
    const supervisorRect = tileRect(agents[0], supervisor, selectedTiles.has('supervisor'));
    for (const { agent, tile, button, path, nodes, progressTrack, progressRing, detailFrame } of views) {
      const position = positions.get(agent.id);
      const expanded = selectedTiles.has(agent.id);
      const rect = tileRect(agent, position, expanded);
      parentFrames.set(agent.id, rect);
      const peerMaskShape = peerAgentMasks.get(agent.id);
      peerMaskShape.setAttribute('x', rect.x + 2);
      peerMaskShape.setAttribute('y', rect.y + 2);
      peerMaskShape.setAttribute('width', rect.width - 4);
      peerMaskShape.setAttribute('height', rect.height - 4);
      const orbit = positionAt(agent, seconds, preference.matches);
      const anchored = expanded || (tileDrag?.moved && tileDrag.agent.id === agent.id) ? position : {
        x: position.x - (orbit.x - agent.x),
        y: position.y - (orbit.y - agent.y),
      };
      anchorFrames.set(agent.id, tileRect(agent, anchored, expanded));
      tile.setAttribute('transform', `translate(${position.x} ${position.y})`);
      const outline = tile.querySelector('.tile-outline');
      outline.setAttribute('x', rect.x - position.x + outlineInset);
      outline.setAttribute('y', rect.y - position.y + outlineInset);
      outline.setAttribute('width', rect.width - outlineInset * 2);
      outline.setAttribute('height', rect.height - outlineInset * 2);
      if (expanded) {
        detailFrame.setAttribute('x', rect.x - position.x);
        detailFrame.setAttribute('y', rect.y - position.y);
        detailFrame.setAttribute('width', rect.width);
        detailFrame.setAttribute('height', rect.height);
      }
      button.style.left = `${(rect.x - 4 - camera.x) / camera.width * 100}%`;
      button.style.top = `${(rect.y - 4 - camera.y) / camera.height * 100}%`;
      button.style.width = `${(rect.width + 8) / camera.width * 100}%`;
      button.style.height = `${(rect.height + 8) / camera.height * 100}%`;
      if (!path) continue;
      const connection = connectionAt(agent, position, supervisor, rect, supervisorRect);
      path.setAttribute('d', connection.path);
      [connection.start, connection.end].forEach((point, index) => {
        nodes[index].setAttribute('cx', point.x);
        nodes[index].setAttribute('cy', point.y);
      });
      const receivingNode = mockFlowDirection(agent.id, mockStates.get(agent.id).taskIndex) === 'from-supervisor'
        ? connection.start : connection.end;
      for (const ring of [progressTrack, progressRing]) {
        ring.setAttribute('cx', receivingNode.x);
        ring.setAttribute('cy', receivingNode.y);
      }
    }
    for (const view of specialistPeerViews) {
      const firstPosition = positions.get(view.first.id);
      const secondPosition = positions.get(view.second.id);
      placePeerView(view, connectionAt(view.first, firstPosition, secondPosition,
        parentFrames.get(view.first.id), parentFrames.get(view.second.id)));
    }
    const baseChildren = layoutSubtiles(anchorFrames, manualSubtileOffsets,
      subtileDrag?.moved ? { id: subtileDrag.item.id, center: subtileDrag.center } : null);
    const targets = new Map(submenuItems.map(item => {
      const base = baseChildren.get(item.id);
      const drift = subtileDrag?.moved && subtileDrag.item.id === item.id ? { x: 0, y: 0 }
        : subtileFloatAt(item, seconds, preference.matches);
      const dragged = subtileDrag?.moved && subtileDrag.item.id === item.id;
      return [item.id, dragged ? { ...subtileDrag.center } : selectedSubtiles.has(item.id)
        ? { ...fixedSubtilePositions.get(item.id) } : { x: base.x + drift.x, y: base.y + drift.y }];
    }));
    const delta = lastSubtileDrawSeconds === null ? 0 : Math.min(0.05, Math.max(0, seconds - lastSubtileDrawSeconds));
    const subtileObstacles = new Map(parentFrames);
    for (const id of selectedFourthTiles) {
      const center = fixedFourthPositions.get(id);
      if (center) subtileObstacles.set(`fourth-${id}`, fourthBounds(center, true));
    }
    if (fourthDrag?.moved && !selectedFourthTiles.has(fourthDrag.item.id)) {
      subtileObstacles.set('fourth-drag', fourthBounds(fourthDrag.center));
    }
    const childPositions = settleSubtilePositions(targets, lastSubtilePositions, subtileObstacles, delta,
      subtileDrag?.moved ? subtileDrag.item.id : null, preference.matches, selectedSubtiles);
    for (const id of selectedSubtiles) fixedSubtilePositions.set(id, { ...childPositions.get(id) });
    lastSubtileDrawSeconds = seconds;
    lastSubtilePositions = childPositions;
    lastParentAnchorFrames = anchorFrames;
    for (const [id, center] of childPositions) {
      const { circle, rect } = peerSubtileMasks.get(id);
      const expanded = selectedSubtiles.has(id);
      circle.style.display = expanded ? 'none' : '';
      rect.style.display = expanded ? '' : 'none';
      circle.setAttribute('cx', center.x);
      circle.setAttribute('cy', center.y);
      if (expanded) {
        const bounds = subtileBounds(center, true);
        rect.setAttribute('x', bounds.x + 2);
        rect.setAttribute('y', bounds.y + 2);
        rect.setAttribute('width', bounds.width - 4);
        rect.setAttribute('height', bounds.height - 4);
      }
    }
    for (const { item, line, group, button, ports, parentNode, childNode, progressTrack, progressRing } of subtileViews) {
      const center = childPositions.get(item.id);
      group.setAttribute('transform', `translate(${center.x} ${center.y})`);
      const expanded = selectedSubtiles.has(item.id);
      const connection = expandedSubtileConnectionAt(parentFrames.get(item.parentId), center, expanded);
      line.setAttribute('d', connection.path);
      for (const [node, point] of [[parentNode, connection.start], [childNode, connection.end]]) {
        node.setAttribute('cx', point.x);
        node.setAttribute('cy', point.y);
      }
      const receiving = line.dataset.direction === 'from-parent' ? connection.end : connection.start;
      for (const ring of [progressTrack, progressRing]) {
        ring.setAttribute('cx', receiving.x);
        ring.setAttribute('cy', receiving.y);
      }
      const bounds = subtileBounds(center, expanded);
      button.style.left = `${(bounds.x - 4 - camera.x) / camera.width * 100}%`;
      button.style.top = `${(bounds.y - 4 - camera.y) / camera.height * 100}%`;
      button.style.width = `${(bounds.width + 8) / camera.width * 100}%`;
      button.style.height = `${(bounds.height + 8) / camera.height * 100}%`;
      button.style.borderRadius = expanded ? '14px' : '50%';
    }
    for (const view of subtilePeerViews) {
      placePeerView(view, subtilePeerConnectionAt(childPositions.get(view.first.id), childPositions.get(view.second.id),
        selectedSubtiles.has(view.first.id), selectedSubtiles.has(view.second.id)));
    }
    const fourthObstacles = [
      ...parentFrames.values(),
      ...submenuItems.map(item => subtileBounds(childPositions.get(item.id), selectedSubtiles.has(item.id))),
    ];
    const fourthBase = layoutFourthLevelItems(fourthItems, childPositions, selectedSubtiles,
      fourthObstacles, { x: supervisorRect.x + supervisorRect.width / 2,
        y: supervisorRect.y + supervisorRect.height / 2 });
    const fourthTargets = new Map(fourthItems.map(item => {
      const base = fourthBase.get(item.id);
      const parent = childPositions.get(item.parentId);
      const offset = manualFourthOffsets.get(item.id);
      const drift = fourthFloatAt(item, seconds, preference.matches);
      const dragged = fourthDrag?.moved && fourthDrag.item.id === item.id;
      const fixed = fixedFourthPositions.get(item.id);
      return [item.id, dragged ? { ...fourthDrag.center }
        : selectedFourthTiles.has(item.id) && fixed ? { ...fixed }
          : offset ? { x: parent.x + offset.x + drift.x, y: parent.y + offset.y + drift.y }
            : { x: base.x + drift.x, y: base.y + drift.y }];
    }));
    const fourthDelta = lastFourthDrawSeconds === null ? 0
      : Math.min(0.05, Math.max(0, seconds - lastFourthDrawSeconds));
    const fourthPositions = settleFourthLevelPositions(fourthTargets, lastFourthPositions,
      fourthObstacles, fourthDelta, fourthDrag?.moved ? fourthDrag.item.id : null,
      preference.matches, selectedFourthTiles);
    for (const id of selectedFourthTiles) fixedFourthPositions.set(id, { ...fourthPositions.get(id) });
    lastFourthPositions = fourthPositions;
    lastFourthDrawSeconds = seconds;
    for (const { item, line, group, button } of fourthViews) {
      const center = fourthPositions.get(item.id);
      const parent = childPositions.get(item.parentId);
      const expanded = selectedFourthTiles.has(item.id);
      const bounds = fourthBounds(center, expanded);
      group.setAttribute('transform', `translate(${center.x} ${center.y})`);
      line.setAttribute('d', fourthConnectionAt(parent, center,
        selectedSubtiles.has(item.parentId), expanded).path);
      button.style.left = `${(bounds.x - 4 - camera.x) / camera.width * 100}%`;
      button.style.top = `${(bounds.y - 4 - camera.y) / camera.height * 100}%`;
      button.style.width = `${(bounds.width + 8) / camera.width * 100}%`;
      button.style.height = `${(bounds.height + 8) / camera.height * 100}%`;
      button.style.borderRadius = expanded ? '8px' : '50%';
    }
    renderNavigation(parentFrames, childPositions, fourthPositions);
    positionTooltip();
  }

  function tick(seconds) {
    elapsed += seconds;
    let changed = false;
    for (const state of mockStates.values()) {
      if (advanceMockTaskState(state, seconds)) changed = true;
    }
    if (changed) syncMockConnections();
    syncSubtileFlows();
    syncSubtileStatuses(seconds);
    syncPeerFlows();
    for (const view of views) updateProgress(view);
    draw(elapsed);
  }

  function animate(now) {
    const delta = previousTime === null ? 0 : Math.min(1, Math.max(0, (now - previousTime) / 1000));
    previousTime = now;
    tick(delta);
    frame = requestAnimationFrame(animate);
  }

  function syncMotion() {
    cancelAnimationFrame(frame);
    clearInterval(mockTimer);
    previousTime = null;
    draw(elapsed);
    // Hidden tabs pause the mock. Reduced motion keeps progress without floating.
    if (document.hidden) return;
    if (preference.matches) mockTimer = window.setInterval(() => tick(0.25), 250);
    else frame = requestAnimationFrame(animate);
  }

  preference.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  window.addEventListener('resize', () => {
    const center = { x: camera.x + camera.width / 2, y: camera.y + camera.height / 2 };
    const relativeZoom = initialCamera.width / camera.width;
    Object.assign(initialCamera, cameraForViewport());
    camera.width = initialCamera.width / relativeZoom;
    camera.height = camera.width * initialCamera.height / initialCamera.width;
    camera.x = center.x - camera.width / 2;
    camera.y = center.y - camera.height / 2;
    updateCamera();
  });
  updateCamera();
  syncMotion();
}
