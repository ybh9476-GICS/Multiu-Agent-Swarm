// Artwork and base coordinates come from OpenPencil: Page 1 / Section 2.
export const agents = [
  { id: 'supervisor', x: 657, y: 571, amplitude: 5, period: 9.2, phase: 0.4 },
  { id: 'quality', x: 448, y: 470, amplitude: 10, period: 7.6, phase: 0.0 },
  { id: 'equipment', x: 448, y: 607, amplitude: 8, period: 8.8, phase: 1.8 },
  { id: 'safety', x: 448, y: 744, amplitude: 11, period: 8.1, phase: 3.5 },
  { id: 'production', x: 938, y: 470, amplitude: 9, period: 8.4, phase: 2.6 },
  { id: 'energy', x: 938, y: 607, amplitude: 10, period: 7.9, phase: 4.7 },
  { id: 'logistics', x: 938, y: 744, amplitude: 8, period: 9.6, phase: 5.6 },
];

const tileSize = agent => agent.id === 'supervisor' ? 142 : 70;
const outlineInset = 1;
const cornerRadius = 14;

function closestIntervalPoints(aMin, aMax, bMin, bMax) {
  if (aMax < bMin) return [aMax, bMin];
  if (bMax < aMin) return [aMin, bMax];
  const shared = (Math.max(aMin, bMin) + Math.min(aMax, bMax)) / 2;
  return [shared, shared];
}

function outlineCore(position, size) {
  const inset = outlineInset + cornerRadius;
  return {
    left: position.x + inset,
    right: position.x + size - inset,
    top: position.y + inset,
    bottom: position.y + size - inset,
  };
}

export function nearestFreePosition(desired, size, occupied, clearance = 44) {
  const xs = [desired.x];
  const ys = [desired.y];
  for (const other of occupied) {
    xs.push(other.x - size - clearance, other.x + other.size + clearance);
    ys.push(other.y - size - clearance, other.y + other.size + clearance);
  }

  let best = null;
  let bestDistance = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const overlaps = occupied.some(other =>
        x < other.x + other.size + clearance &&
        x + size + clearance > other.x &&
        y < other.y + other.size + clearance &&
        y + size + clearance > other.y
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

export function connectionAt(agent, position, supervisor) {
  // A rounded rectangle is an inner rectangle expanded by its corner radius.
  // The nearest inner points give the shortest line between tile outlines.
  const from = outlineCore(position, tileSize(agent));
  const to = outlineCore(supervisor, tileSize({ id: 'supervisor' }));
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
    const dx = supervisor.x + 71 - position.x - tileSize(agent) / 2;
    const dy = supervisor.y + 71 - position.y - tileSize(agent) / 2;
    if (Math.abs(dx) >= Math.abs(dy)) {
      const right = dx >= 0;
      start = { x: right ? position.x + tileSize(agent) - outlineInset : position.x + outlineInset, y: fromY };
      end = { x: right ? supervisor.x + outlineInset : supervisor.x + 142 - outlineInset, y: toY };
    } else {
      const below = dy >= 0;
      start = { x: fromX, y: below ? position.y + tileSize(agent) - outlineInset : position.y + outlineInset };
      end = { x: toX, y: below ? supervisor.y + outlineInset : supervisor.y + 142 - outlineInset };
    }
  }
  return { start, end, path: `M ${start.x} ${start.y} L ${end.x} ${end.y}` };
}

if (typeof document !== 'undefined') {
  const canvas = document.querySelector('.graph-canvas');
  const svg = document.querySelector('.graph-resource');
  const controls = document.querySelector('.tile-controls');
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
  const bounds = agents.reduce((result, agent) => {
    const size = tileSize(agent);
    return {
      left: Math.min(result.left, agent.x),
      top: Math.min(result.top, agent.y),
      right: Math.max(result.right, agent.x + size),
      bottom: Math.max(result.bottom, agent.y + size),
    };
  }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  const camera = {
    x: (bounds.left + bounds.right - baseWidth) / 2,
    y: (bounds.top + bounds.bottom - baseHeight) / 2,
    width: baseWidth,
    height: baseHeight,
  };
  const views = agents.map(agent => {
    const connection = document.querySelector(`[data-connection="${agent.id}"]`);
    return {
      agent,
      tile: document.querySelector(`[data-agent="${agent.id}"]`),
      button: document.querySelector(`[data-tile-control="${agent.id}"]`),
      path: connection?.querySelector('path'),
      nodes: document.querySelector(`[data-nodes="${agent.id}"]`)?.querySelectorAll('circle'),
    };
  });
  let selectedTile = null;
  let drag = null;
  let tileDrag = null;

  function displayedPosition(agent, seconds) {
    return tileDrag?.agent === agent && tileDrag.moved
      ? tileDrag.position
      : positionAt(agent, seconds, preference.matches);
  }

  function worldAt(clientX, clientY) {
    const viewport = controls.getBoundingClientRect();
    return {
      x: camera.x + (clientX - viewport.left) / viewport.width * camera.width,
      y: camera.y + (clientY - viewport.top) / viewport.height * camera.height,
    };
  }

  function syncTileAppearance() {
    // A dashed connection means both endpoints are connected and keep their colors.
    const connected = views.filter(({ path }) => {
      const dash = path?.getAttribute('stroke-dasharray');
      return dash && dash !== 'none';
    }).map(({ agent }) => agent.id);
    for (const { agent, tile, path, nodes } of views) {
      const lineConnected = connected.includes(agent.id);
      if (path) path.parentElement.dataset.connected = String(lineConnected);
      if (nodes) nodes[0].parentElement.dataset.connected = String(lineConnected);
      const isConnected = agent.id === 'supervisor' ? connected.length > 0 : lineConnected;
      if (tile.dataset.connected === String(isConnected)) continue;
      tile.dataset.connected = String(isConnected);
      const image = tile.querySelector('image');
      const asset = `./assets/${agent.id}${isConnected ? '' : '-inactive'}.svg`;
      if (image.getAttribute('href') !== asset) image.setAttribute('href', asset);
      const color = isConnected ? activeColors[agent.id] : inactiveColor;
      tile.querySelector('.tile-outline').setAttribute('stroke', color);
      tile.style.setProperty('--tile-glow-color', color);
    }
  }

  syncTileAppearance();
  new MutationObserver(syncTileAppearance).observe(document.querySelector('.connections'), {
    subtree: true,
    attributes: true,
    attributeFilter: ['stroke-dasharray'],
  });

  function updateCamera() {
    svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
    draw(elapsed);
  }

  function selectTile(tile) {
    if (selectedTile) {
      selectedTile.dataset.selected = 'false';
      document.querySelector(`[data-tile-control="${selectedTile.dataset.agent}"]`).setAttribute('aria-pressed', 'false');
    }
    selectedTile = selectedTile === tile ? null : tile;
    if (selectedTile) {
      selectedTile.dataset.selected = 'true';
      document.querySelector(`[data-tile-control="${selectedTile.dataset.agent}"]`).setAttribute('aria-pressed', 'true');
    }
  }

  for (const { agent, tile, button } of views) {
    let suppressClick = false;
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || tileDrag) return;
      const viewport = controls.getBoundingClientRect();
      if (!viewport.width || !viewport.height) return;
      const pointer = worldAt(event.clientX, event.clientY);
      const position = displayedPosition(agent, elapsed);
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
      button.classList.add('is-dragging');
      const pointer = worldAt(event.clientX, event.clientY);
      tileDrag.position = { x: pointer.x - tileDrag.grabX, y: pointer.y - tileDrag.grabY };
      draw(elapsed);
      event.preventDefault();
    });

    function finishTileDrag(event) {
      if (!tileDrag || tileDrag.button !== button || tileDrag.pointerId !== event.pointerId) return;
      if (tileDrag.moved) {
        const occupied = views
          .filter(view => view.agent !== agent)
          .map(view => ({ ...displayedPosition(view.agent, elapsed), size: tileSize(view.agent) }));
        const position = nearestFreePosition(tileDrag.position, tileSize(agent), occupied);
        const floatingPosition = positionAt(agent, elapsed, preference.matches);
        agent.x += position.x - floatingPosition.x;
        agent.y += position.y - floatingPosition.y;
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
      selectTile(tile);
    });
    button.addEventListener('pointerenter', () => { tile.dataset.hover = 'true'; });
    button.addEventListener('pointerleave', () => { tile.dataset.hover = 'false'; });
    button.addEventListener('focus', () => { tile.dataset.hover = 'true'; });
    button.addEventListener('blur', () => { tile.dataset.hover = 'false'; });
    button.addEventListener('keydown', event => {
      if (event.key === 'Escape' && selectedTile) {
        selectTile(selectedTile);
      }
    });
  }

  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const viewport = controls.getBoundingClientRect();
    if (!viewport.width || !viewport.height) return;
    const x = Math.max(0, Math.min(1, (event.clientX - viewport.left) / viewport.width));
    const y = Math.max(0, Math.min(1, (event.clientY - viewport.top) / viewport.height));
    const distance = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1);
    const zoom = Math.max(0.5, Math.min(4, baseWidth / camera.width * Math.exp(-distance * 0.001)));
    const worldX = camera.x + x * camera.width;
    const worldY = camera.y + y * camera.height;
    camera.width = baseWidth / zoom;
    camera.height = baseHeight / zoom;
    camera.x = worldX - x * camera.width;
    camera.y = worldY - y * camera.height;
    updateCamera();
  }, { passive: false });

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('.tile-hit')) return;
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
    if (event.type === 'pointerup' && !drag.moved && selectedTile) {
      selectTile(selectedTile);
      if (document.activeElement?.classList.contains('tile-hit')) document.activeElement.blur();
    }
    drag = null;
    canvas.classList.remove('is-panning');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);
  canvas.addEventListener('lostpointercapture', finishDrag);
  let frame = 0;
  let elapsed = 0;
  let previousTime = null;

  function draw(seconds) {
    const supervisor = displayedPosition(agents[0], seconds);
    for (const { agent, tile, button, path, nodes } of views) {
      const position = displayedPosition(agent, seconds);
      tile.setAttribute('transform', `translate(${position.x} ${position.y})`);
      const size = tileSize(agent);
      button.style.left = `${(position.x - 4 - camera.x) / camera.width * 100}%`;
      button.style.top = `${(position.y - 4 - camera.y) / camera.height * 100}%`;
      button.style.width = `${(size + 8) / camera.width * 100}%`;
      button.style.height = `${(size + 8) / camera.height * 100}%`;
      if (!path) continue;
      const connection = connectionAt(agent, position, supervisor);
      path.setAttribute('d', connection.path);
      [connection.start, connection.end].forEach((point, index) => {
        nodes[index].setAttribute('cx', point.x);
        nodes[index].setAttribute('cy', point.y);
      });
    }
  }

  function animate(now) {
    if (previousTime !== null) elapsed += (now - previousTime) / 1000;
    previousTime = now;
    draw(elapsed);
    frame = requestAnimationFrame(animate);
  }

  function syncMotion() {
    cancelAnimationFrame(frame);
    previousTime = null;
    draw(elapsed);
    // Hidden tabs do no animation work; reduced-motion uses the static design.
    if (!preference.matches && !document.hidden) frame = requestAnimationFrame(animate);
  }

  preference.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  syncMotion();
}
