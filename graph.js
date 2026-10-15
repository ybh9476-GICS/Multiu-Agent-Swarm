// Artwork and base coordinates come from OpenPencil: Page 1 / Section 2.
export const agents = [
  { id: 'supervisor', x: 657, y: 571, amplitude: 5, period: 9.2, phase: 0.4 },
  { id: 'quality', x: 448, y: 470, amplitude: 10, period: 7.6, phase: 0.0, side: 'left', portY: 48 },
  { id: 'equipment', x: 448, y: 607, amplitude: 8, period: 8.8, phase: 1.8, side: 'left', portY: 71 },
  { id: 'safety', x: 448, y: 744, amplitude: 11, period: 8.1, phase: 3.5, side: 'left', portY: 94 },
  { id: 'production', x: 938, y: 470, amplitude: 9, period: 8.4, phase: 2.6, side: 'right', portY: 48 },
  { id: 'energy', x: 938, y: 607, amplitude: 10, period: 7.9, phase: 4.7, side: 'right', portY: 71 },
  { id: 'logistics', x: 938, y: 744, amplitude: 8, period: 9.6, phase: 5.6, side: 'right', portY: 94 },
];

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
  const left = agent.side === 'left';
  const start = { x: position.x + (left ? 69 : 1), y: position.y + 35 };
  const end = { x: supervisor.x + (left ? 1 : 141), y: supervisor.y + agent.portY };
  // Full-width control handles preserve the original S-shaped connections.
  return { start, end, path: `M ${start.x} ${start.y} C ${end.x} ${start.y} ${start.x} ${end.y} ${end.x} ${end.y}` };
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
    const size = agent.id === 'supervisor' ? 142 : 70;
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

  for (const { tile, button } of views) {
    // Keep the moving tile as the click target until the pointer is released.
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      button.setPointerCapture(event.pointerId);
      button.focus({ preventScroll: true });
    });
    button.addEventListener('click', () => { selectTile(tile); });
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
    const supervisor = positionAt(agents[0], seconds, preference.matches);
    for (const { agent, tile, button, path, nodes } of views) {
      const position = positionAt(agent, seconds, preference.matches);
      tile.setAttribute('transform', `translate(${position.x} ${position.y})`);
      const size = agent.id === 'supervisor' ? 142 : 70;
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
