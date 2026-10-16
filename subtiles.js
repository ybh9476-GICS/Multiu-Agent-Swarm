// The first five groups mirror the IMPIX sidebar. The local sidebar has no
// logistics section, so its four labels come from the site's Logistics Agent tasks.
export const submenuGroups = [
  {
    agentId: 'quality', side: -1,
    items: [
      { id: 'quality-rate', label: '실시간 불량률 현황', icon: 'gauge' },
      { id: 'quality-vision', label: '비전검사 결과 뷰어', icon: 'scan' },
      { id: 'quality-types', label: '불량 유형 분석', icon: 'bars' },
      { id: 'quality-temperature', label: '온도-불량 상관분석', icon: 'thermometer' },
      { id: 'quality-history', label: '품질 이력 검색', icon: 'search' },
    ],
  },
  {
    agentId: 'equipment', side: -1,
    items: [
      { id: 'equipment-status', label: '설비 상태 종합', icon: 'monitor' },
      { id: 'equipment-trend', label: '진동/온도 추세', icon: 'activity' },
      { id: 'equipment-rul', label: 'RUL 잔여수명 예측', icon: 'hourglass' },
      { id: 'equipment-order', label: '보전 작업 오더', icon: 'clipboard' },
      { id: 'equipment-history', label: '보전 이력 조회', icon: 'history' },
    ],
  },
  {
    agentId: 'safety', side: -1,
    items: [
      { id: 'safety-fire', label: '지능형 CCTV 화재 감시', icon: 'camera' },
      { id: 'safety-amr', label: 'AMR 충돌 방지 시스템', icon: 'shield' },
      { id: 'safety-stop', label: '긴급 정지 및 알람 제어', icon: 'alert' },
    ],
  },
  {
    agentId: 'production', side: 1,
    items: [
      { id: 'production-line', label: '라인별 가동 현황', icon: 'factory' },
      { id: 'production-oee', label: 'OEE 대시보드', icon: 'gauge' },
      { id: 'production-takt', label: '택트타임 분석', icon: 'timer' },
      { id: 'production-batch', label: '배치별 생산 이력', icon: 'layers' },
      { id: 'production-plan', label: '생산 계획 대비 실적', icon: 'target' },
    ],
  },
  {
    agentId: 'energy', side: 1,
    items: [
      { id: 'energy-power', label: '전력 사용 현황', icon: 'bolt' },
      { id: 'energy-cost', label: '에너지 비용 분석', icon: 'coins' },
      { id: 'energy-peak', label: '피크 부하 관리', icon: 'peak' },
    ],
  },
  {
    agentId: 'logistics', side: 1,
    items: [
      { id: 'logistics-route', label: 'AMR 이송 경로 최적화', icon: 'route' },
      { id: 'logistics-buffer', label: '완제품 출하 버퍼 슬롯 배정', icon: 'package' },
      { id: 'logistics-dispatch', label: '자재 투입 배차 명령 하달', icon: 'truck' },
      { id: 'logistics-charge', label: 'AMR 충전 스케줄 조정', icon: 'battery' },
    ],
  },
];

export const submenuItems = submenuGroups.flatMap(group => group.items.map((item, index) => ({
  ...item, parentId: group.agentId, side: group.side, index, count: group.items.length,
})));

export const subtileRadius = 22;
const motionIndex = new Map(submenuItems.map((item, index) => [item.id, index]));
const subtileSize = subtileRadius * 2;
const clearance = 10;
const search = [];
for (let outward = 0; outward <= 12; outward++) {
  for (let tangent = -12; tangent <= 12; tangent++) {
    search.push({ outward: outward * 36, tangent: tangent * 36 });
  }
}
search.sort((a, b) => a.outward ** 2 + a.tangent ** 2 - b.outward ** 2 - b.tangent ** 2);

function collides(a, b) {
  return a.x < b.x + b.width + clearance && a.x + a.width + clearance > b.x &&
    a.y < b.y + b.height + clearance && a.y + a.height + clearance > b.y;
}

const midpoint = rect => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

function radialBasis(parent, supervisor, side) {
  const origin = midpoint(parent);
  const center = midpoint(supervisor);
  const dx = origin.x - center.x;
  const dy = origin.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  const radial = length === 1 && dx === 0 && dy === 0 ? { x: side, y: 0 } : { x: dx / length, y: dy / length };
  return { origin, radial, tangent: { x: -radial.y, y: radial.x } };
}

function clearCenter(desired, occupied, basis, pinned = false) {
  for (const candidate of search) {
    for (const sign of pinned && candidate.outward ? [1, -1] : [1]) {
      const x = desired.x + basis.radial.x * candidate.outward * sign + basis.tangent.x * candidate.tangent;
      const y = desired.y + basis.radial.y * candidate.outward * sign + basis.tangent.y * candidate.tangent;
      const rect = { x: x - subtileRadius, y: y - subtileRadius, width: subtileSize, height: subtileSize };
      if (occupied.every(other => !collides(rect, other))) return { x, y };
    }
  }
  for (let outward = 13; ; outward++) {
    const x = desired.x + basis.radial.x * outward * 36;
    const y = desired.y + basis.radial.y * outward * 36;
    const rect = { x: x - subtileRadius, y: y - subtileRadius, width: subtileSize, height: subtileSize };
    if (occupied.every(other => !collides(rect, other))) return { x, y };
  }
}

export function layoutSubtiles(parentFrames, manualOffsets = new Map(), dragged = null) {
  const occupied = [...parentFrames.values()];
  const positions = new Map();
  const ordered = [
    ...submenuItems.filter(item => item.id === dragged?.id),
    ...submenuItems.filter(item => item.id !== dragged?.id && manualOffsets.has(item.id)),
    ...submenuItems.filter(item => item.id !== dragged?.id && !manualOffsets.has(item.id)),
  ];
  for (const item of ordered) {
    const parent = parentFrames.get(item.parentId);
    if (!parent) continue;
    const basis = radialBasis(parent, parentFrames.get('supervisor'), item.side);
    const offset = manualOffsets.get(item.id);
    const radius = item.count >= 5 ? 190 : item.count === 4 ? 184 : 174;
    const spread = (item.count >= 5 ? 27 : item.count === 4 ? 36 : 48) * Math.PI / 180;
    const angle = (item.index - (item.count - 1) / 2) * spread;
    const outward = {
      x: basis.radial.x * Math.cos(angle) + basis.tangent.x * Math.sin(angle),
      y: basis.radial.y * Math.cos(angle) + basis.tangent.y * Math.sin(angle),
    };
    const desired = dragged?.id === item.id ? dragged.center : offset
      ? { x: basis.origin.x + offset.x, y: basis.origin.y + offset.y }
      : { x: basis.origin.x + outward.x * radius, y: basis.origin.y + outward.y * radius };
    const center = clearCenter(desired, occupied, basis, !!offset || dragged?.id === item.id);
    positions.set(item.id, center);
    occupied.push({ x: center.x - subtileRadius, y: center.y - subtileRadius, width: subtileSize, height: subtileSize });
  }
  return positions;
}

export function subtileFloatAt(item, seconds, reducedMotion = false) {
  if (reducedMotion) return { x: 0, y: 0 };
  const index = motionIndex.get(item.id);
  const entrance = Math.min(1, Math.max(0, seconds / 2));
  const gain = entrance * entrance * (3 - 2 * entrance);
  const phase = index * 1.37;
  return {
    x: Math.sin(seconds * Math.PI * 2 / (7.5 + index % 5 * 0.65) + phase) * (5 + index % 3) * gain,
    y: Math.sin(seconds * Math.PI * 2 / (9 + (index * 2) % 7 * 0.55) + phase * 1.71) * (6 + (index + 1) % 3) * gain,
  };
}

// Start separating nearby circles before their visible outlines meet. The
// spring keeps reflow targets from jumping when a parent tile moves or expands.
export function settleSubtilePositions(targets, previous, obstacles, deltaSeconds, draggedId = null, reducedMotion = false) {
  const blend = reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, deltaSeconds) * 8);
  const positions = new Map();
  for (const [id, target] of targets) {
    const last = previous.get(id);
    positions.set(id, !last || id === draggedId ? { ...target } : {
      x: last.x + (target.x - last.x) * blend,
      y: last.y + (target.y - last.y) * blend,
    });
  }

  const ids = [...positions.keys()];
  const circleDistance = subtileSize + 24;
  const tileDistance = subtileRadius + 24;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = positions.get(ids[i]);
        const b = positions.get(ids[j]);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= circleDistance) continue;
        const angle = (i * 17 + j * 31) * 0.7;
        const ux = distance ? dx / distance : Math.cos(angle);
        const uy = distance ? dy / distance : Math.sin(angle);
        const gap = circleDistance - distance;
        const aLocked = ids[i] === draggedId;
        const bLocked = ids[j] === draggedId;
        if (!aLocked) {
          a.x -= ux * gap * (bLocked ? 1 : 0.5);
          a.y -= uy * gap * (bLocked ? 1 : 0.5);
        }
        if (!bLocked) {
          b.x += ux * gap * (aLocked ? 1 : 0.5);
          b.y += uy * gap * (aLocked ? 1 : 0.5);
        }
      }
    }
    for (const [id, point] of positions) {
      if (id === draggedId) continue;
      for (const rect of obstacles.values()) {
        const nearestX = Math.max(rect.x, Math.min(rect.x + rect.width, point.x));
        const nearestY = Math.max(rect.y, Math.min(rect.y + rect.height, point.y));
        const dx = point.x - nearestX;
        const dy = point.y - nearestY;
        const distance = Math.hypot(dx, dy);
        if (distance >= tileDistance) continue;
        if (distance) {
          point.x += dx / distance * (tileDistance - distance);
          point.y += dy / distance * (tileDistance - distance);
        } else {
          const sides = [
            { gap: point.x - rect.x, x: rect.x - tileDistance, y: point.y },
            { gap: rect.x + rect.width - point.x, x: rect.x + rect.width + tileDistance, y: point.y },
            { gap: point.y - rect.y, x: point.x, y: rect.y - tileDistance },
            { gap: rect.y + rect.height - point.y, x: point.x, y: rect.y + rect.height + tileDistance },
          ];
          const side = sides.reduce((best, candidate) => candidate.gap < best.gap ? candidate : best);
          point.x = side.x;
          point.y = side.y;
        }
      }
    }
  }
  return positions;
}

export function subtileConnectionAt(parent, center) {
  const origin = midpoint(parent);
  const dx = center.x - origin.x;
  const dy = center.y - origin.y;
  const scale = Math.min((parent.width / 2 - 1) / (Math.abs(dx) || Infinity),
    (parent.height / 2 - 1) / (Math.abs(dy) || Infinity));
  const start = { x: origin.x + dx * scale, y: origin.y + dy * scale };
  const length = Math.hypot(center.x - start.x, center.y - start.y) || 1;
  const end = { x: center.x - (center.x - start.x) / length * subtileRadius,
    y: center.y - (center.y - start.y) / length * subtileRadius };
  return { start, end, path: `M ${start.x} ${start.y} L ${end.x} ${end.y}` };
}

export const subtileConnection = (parent, center) => subtileConnectionAt(parent, center).path;

export function subtileMockFlow(item, parentState) {
  const connected = parentState.phase === 'working' &&
    Math.min(item.count - 1, Math.floor(parentState.progress / 100 * item.count)) === item.index;
  const progress = connected ? Math.min(100, (parentState.progress / 100 * item.count - item.index) * 100) : 0;
  return { connected, progress, direction: (item.index + parentState.taskIndex) % 2 === 0 ? 'from-parent' : 'to-parent' };
}

// Small, consistent line pictograms keep the menu legible without text inside the circles.
export const submenuIconPaths = {
  gauge: '<path d="M4 17a8 8 0 0 1 16 0"/><path d="m12 15 4-4"/><circle cx="12" cy="15" r="1"/>',
  scan: '<path d="M4 8V4h4M16 4h4v4M4 16v4h4M20 16v4h-4"/><path d="M7 12s2-3 5-3 5 3 5 3-2 3-5 3-5-3-5-3Z"/><circle cx="12" cy="12" r="1"/>',
  bars: '<path d="M4 20h16M6 17v-5h3v5M11 17V7h3v10M16 17V4h3v13"/>',
  thermometer: '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0Z"/><path d="M12 9v8"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  monitor: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3M6 11h3l2-3 2 6 2-3h3"/>',
  activity: '<path d="M3 16h4l2-7 4 10 2-7h6"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 2 6 5 9-3 3-5 4-5 9M17 3c0 5-2 6-5 9 3 3 5 4 5 9"/>',
  clipboard: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3h6v2M8 11h8M8 15h6"/>',
  history: '<path d="M4 8V4l3 3a8 8 0 1 1-2 9M4 8h5M12 8v5l3 2"/>',
  camera: '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M8 6 9 4h6l1 2"/>',
  shield: '<path d="M12 2 20 6v6c0 5-3 8-8 10-5-2-8-5-8-10V6Z"/><path d="m8 12 3 3 5-6"/>',
  alert: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8Z"/><path d="M12 7v7M12 17h.01"/>',
  factory: '<path d="M3 21V9l6 3V9l6 3V4h5v17Z"/><path d="M7 17h2M12 17h2M17 17h2"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 9v4l3 2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  bolt: '<path d="m13 2-9 11h7l-1 9 10-12h-7l1-8Z"/>',
  coins: '<circle cx="9" cy="9" r="5"/><path d="M14 6a5 5 0 1 1-1 9M9 6v6M7 7h3M7 11h3"/>',
  peak: '<path d="M3 20h18M5 16l5-6 4 3 5-8M15 5h4v4"/>',
  route: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h4a4 4 0 0 0 0-8h2a4 4 0 0 0 4-4"/>',
  package: '<path d="m12 2 9 5v10l-9 5-9-5V7Z"/><path d="m3 7 9 5 9-5M12 12v10M8 4l9 5"/>',
  truck: '<path d="M3 6h12v11H3ZM15 10h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  battery: '<rect x="3" y="7" width="17" height="10" rx="2"/><path d="M20 10h2v4h-2M8 10v4M11 12h4"/>',
};
