import { attachCompanionChat } from './companion-chat.js';

const host = document.querySelector('.companion-character');
const figure = host.querySelector('.companion-figure');
const closeButton = host.querySelector('.companion-close');
const reopenButton = document.querySelector('.companion-reopen');
const canvas = document.querySelector('.graph-canvas');
const graph = canvas.querySelector('.graph-resource');
const chat = attachCompanionChat(host, figure);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const pointer = { x: 0, y: 0, active: false };
let restartAnimation = () => {};

window.addEventListener('pointermove', (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.active = true;
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { pointer.active = false; });
window.addEventListener('blur', () => { pointer.active = false; });

let drag = null;
let movedByUser = false;
let summonFrame = 0;
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

function placeCharacter(left, top) {
  host.style.left = `${clamp(left, 0, Math.max(0, innerWidth - host.offsetWidth - 12))}px`;
  host.style.top = `${clamp(top, 8, Math.max(8, innerHeight - host.offsetHeight))}px`;
  host.style.right = 'auto';
  host.style.bottom = 'auto';
  chat.position();
}

function stopSummon() {
  cancelAnimationFrame(summonFrame);
  summonFrame = 0;
}

function summonEase(progress) {
  // 이동 경로의 마지막 10%에 이를 때까지 가속하고, 그 후 감속해 멈춥니다.
  const brakeFrom = 0.9;
  if (progress < brakeFrom) return progress * progress / brakeFrom;
  const remaining = (1 - progress) / (1 - brakeFrom);
  return 1 - (1 - brakeFrom) * remaining * remaining;
}

function summonCharacter(clientX, clientY) {
  stopSummon();
  if (host.hidden) {
    host.hidden = false;
    reopenButton.hidden = true;
    restartAnimation();
  }

  const start = host.getBoundingClientRect();
  const maxX = Math.max(0, innerWidth - host.offsetWidth - 12);
  const maxY = Math.max(8, innerHeight - host.offsetHeight);
  const targetX = clamp(clientX - host.offsetWidth / 2, 0, maxX);
  const targetY = clamp(clientY - host.offsetHeight / 2, 8, maxY);
  movedByUser = true;

  if (reducedMotion.matches) {
    placeCharacter(targetX, targetY);
    return;
  }

  const dx = targetX - start.left;
  const dy = targetY - start.top;
  const distance = Math.hypot(dx, dy);
  const overshoot = Math.min(12, distance * 0.12);
  const beyondX = clamp(targetX + dx / (distance || 1) * overshoot, 0, maxX);
  const beyondY = clamp(targetY + dy / (distance || 1) * overshoot, 8, maxY);
  const travelDuration = 260;
  const settleDuration = Math.hypot(beyondX - targetX, beyondY - targetY) > 0.5 ? 100 : 0;
  const startedAt = performance.now();
  function move(now) {
    const elapsed = now - startedAt;
    if (elapsed < travelDuration) {
      const eased = summonEase(elapsed / travelDuration);
      placeCharacter(start.left + (beyondX - start.left) * eased, start.top + (beyondY - start.top) * eased);
      summonFrame = requestAnimationFrame(move);
      return;
    }
    if (settleDuration) {
      const progress = Math.min(1, (elapsed - travelDuration) / settleDuration);
      const eased = progress ** 3 * (progress * (6 * progress - 15) + 10);
      placeCharacter(beyondX + (targetX - beyondX) * eased, beyondY + (targetY - beyondY) * eased);
      summonFrame = progress < 1 ? requestAnimationFrame(move) : 0;
    } else {
      placeCharacter(targetX, targetY);
      summonFrame = 0;
    }
  }
  summonFrame = requestAnimationFrame(move);
}

canvas.addEventListener('dblclick', event => {
  if (event.button !== 0 || (event.target !== canvas && event.target !== graph)) return;
  event.preventDefault();
  summonCharacter(event.clientX, event.clientY);
});

figure.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  stopSummon();
  const rect = host.getBoundingClientRect();
  drag = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    left: rect.left,
    top: rect.top,
    moved: false,
  };
});

window.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  if (event.buttons === 0) {
    finishDrag(event);
    return;
  }
  if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
  if (!drag.moved) {
    drag.moved = true;
    movedByUser = true;
    host.dataset.dragging = 'true';
    placeCharacter(drag.left, drag.top);
  }
  placeCharacter(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
});

function finishDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  if (!drag.moved && event.type === 'pointerup') {
    chat.toggle();
  }
  host.dataset.dragging = 'false';
  drag = null;
}

window.addEventListener('pointerup', finishDrag);
window.addEventListener('pointercancel', finishDrag);
window.addEventListener('blur', () => {
  drag = null;
  host.dataset.dragging = 'false';
});
figure.addEventListener('click', (event) => {
  if (event.detail === 0) {
    chat.toggle();
  }
});

window.addEventListener('resize', () => {
  if (!movedByUser || host.hidden) return;
  stopSummon();
  const rect = host.getBoundingClientRect();
  placeCharacter(rect.left, rect.top);
});

closeButton.addEventListener('click', () => {
  stopSummon();
  chat.close();
  host.hidden = true;
  reopenButton.hidden = false;
  restartAnimation();
  reopenButton.focus();
});

reopenButton.addEventListener('click', () => {
  host.hidden = false;
  if (movedByUser) {
    const rect = host.getBoundingClientRect();
    placeCharacter(rect.left, rect.top);
  }
  reopenButton.hidden = true;
  restartAnimation();
  figure.focus();
});

const response = await fetch('./assets/companion.svg');
if (!response.ok) {
  console.warn('캐릭터 벡터를 불러오지 못했습니다.');
} else {
  const documentSvg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
  const svg = documentSvg.documentElement;
  if (svg.localName === 'svg') {
    figure.append(document.importNode(svg, true));
    restartAnimation = animateCompanion();
  }
}

function animateCompanion() {
  const gaze = host.querySelector('#companion-gaze');
  const rightEye = host.querySelector('#companion-right-eye');
  const mouth = host.querySelector('#companion-mouth');
  const eyes = host.querySelectorAll('.companion-eye');
  if (!gaze || !rightEye || !mouth || eyes.length !== 2) return () => {};

  // 정면과 상하좌우, 대각선 방향을 순회합니다.
  const directions = [
    [0, 0], [-0.8, -0.65], [0, -1], [0.9, -0.5],
    [1, 0], [0.65, 0.7], [0, 1], [-0.9, 0.6], [-1, 0],
  ];
  const position = { x: 0, y: 0 };
  let frame = 0;
  let previousTime = 0;
  let lastDirection = -1;
  let target = directions[0];
  let nextDirectionAt = 0;
  let nextBlinkAt = performance.now() + 3200;
  let blinkStart = -Infinity;

  function draw(x, y, eyeHeight = 1) {
    // OpenPencil의 정면·좌·우·상·하 시선 좌표를 섞어 대각선에서도 부드럽게 움직입니다.
    const total = Math.max(1, Math.abs(x) + Math.abs(y));
    const left = Math.max(0, -x) / total;
    const right = Math.max(0, x) / total;
    const up = Math.max(0, -y) / total;
    const down = Math.max(0, y) / total;
    gaze.setAttribute('transform', `translate(${(214 - 86 * left + 162 * right).toFixed(2)}, ${(358.14 - 83 * up + 138 * down).toFixed(2)})`);
    rightEye.setAttribute('transform', `translate(${(265 - 59 * left - 55 * right).toFixed(2)}, 0)`);
    mouth.setAttribute('transform', `translate(${(122.52 - 49.52 * left - 20.52 * right).toFixed(2)}, ${(156.37 + 2.63 * right + 4.63 * up - 54.37 * down).toFixed(2)})`);
    const verticalEyeScale = eyeHeight * (1 - 18 / 138 * down);
    eyes[0].style.transform = `scale(${(1 - 20 / 86 * left).toFixed(3)}, ${verticalEyeScale.toFixed(3)})`;
    eyes[1].style.transform = `scale(${(1 - 20 / 86 * right).toFixed(3)}, ${verticalEyeScale.toFixed(3)})`;
  }

  function tick(now) {
    if (reducedMotion.matches || document.hidden || host.hidden) {
      frame = 0;
      draw(0, 0);
      return;
    }

    const elapsed = Math.min(64, Math.max(0, now - (previousTime || now)));
    previousTime = now;
    if (now >= nextDirectionAt) {
      lastDirection = (lastDirection + 1) % directions.length;
      target = directions[lastDirection];
      nextDirectionAt = now + 2200;
    }

    const rect = host.getBoundingClientRect();
    const dx = pointer.x - (rect.left + rect.width / 2);
    const dy = pointer.y - (rect.top + rect.height * 0.45);
    const distance = Math.hypot(dx, dy);
    const strength = Math.min(1, distance / 85);
    const goalX = pointer.active ? dx / (distance || 1) * strength : target[0];
    const goalY = pointer.active ? dy / (distance || 1) * strength : target[1];
    const ease = 1 - Math.exp(-elapsed / 300);
    position.x += (goalX - position.x) * ease;
    position.y += (goalY - position.y) * ease;

    if (now >= nextBlinkAt) {
      blinkStart = now;
      nextBlinkAt = now + 3300 + Math.random() * 1800;
    }
    const blinkPhase = (now - blinkStart) / 170;
    const eyeHeight = blinkPhase >= 0 && blinkPhase <= 1
      ? 1 - 0.91 * Math.sin(Math.PI * blinkPhase)
      : 1;
    draw(position.x, position.y, eyeHeight);
    frame = requestAnimationFrame(tick);
  }

  function start() {
    cancelAnimationFrame(frame);
    previousTime = 0;
    if (reducedMotion.matches || document.hidden || host.hidden) {
      draw(0, 0);
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  reducedMotion.addEventListener('change', start);
  document.addEventListener('visibilitychange', start);
  start();
  return start;
}
