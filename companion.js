const host = document.querySelector('.companion-character');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const response = await fetch('./assets/companion.svg');
if (!response.ok) {
  console.warn('캐릭터 벡터를 불러오지 못했습니다.');
} else {
  const documentSvg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
  const svg = documentSvg.documentElement;
  if (svg.localName === 'svg') {
    host.append(document.importNode(svg, true));
    animateCompanion();
  }
}

function animateCompanion() {
  const head = host.querySelector('#companion-head');
  const gaze = host.querySelector('#companion-gaze');
  const eyes = host.querySelectorAll('.companion-eye');
  if (!head || !gaze || eyes.length !== 2) return;

  // 정면, 위, 아래, 좌측과 대각선 시선을 순회합니다. 우측은 같은 벡터를 반전해 사용합니다.
  const directions = [
    [0, 0], [-0.8, -0.65], [0, -1], [0.9, -0.5],
    [1, 0], [0.65, 0.7], [0, 1], [-0.9, 0.6], [-1, 0],
  ];
  const position = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0, at: -Infinity };
  let frame = 0;
  let previousTime = 0;
  let lastDirection = -1;
  let target = directions[0];
  let nextDirectionAt = 0;
  let nextBlinkAt = performance.now() + 3200;
  let blinkStart = -Infinity;

  window.addEventListener('pointermove', (event) => {
    pointer.x = Math.max(-1, Math.min(1, event.clientX / window.innerWidth * 2 - 1));
    pointer.y = Math.max(-1, Math.min(1, event.clientY / window.innerHeight * 2 - 1));
    pointer.at = performance.now();
  }, { passive: true });

  function draw(x, y, eyeHeight = 1) {
    gaze.setAttribute('transform', `translate(${(214 + x * 21).toFixed(2)}, ${(358.14 + y * 18).toFixed(2)})`);
    const headWidth = 1 - Math.abs(x) * 0.055;
    head.setAttribute('transform', `translate(${(390.5 + x * 7).toFixed(2)} ${(480 + y * 5).toFixed(2)}) rotate(${(x * 6).toFixed(2)}) scale(${headWidth.toFixed(3)} 1) translate(-390.5 -480)`);
    for (const eye of eyes) eye.style.transform = `scaleY(${eyeHeight.toFixed(3)})`;
  }

  function tick(now) {
    if (reducedMotion.matches || document.hidden) {
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

    const trackingPointer = now - pointer.at < 2500;
    const goalX = trackingPointer ? pointer.x : target[0];
    const goalY = trackingPointer ? pointer.y : target[1];
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
    if (reducedMotion.matches || document.hidden) {
      draw(0, 0);
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  reducedMotion.addEventListener('change', start);
  document.addEventListener('visibilitychange', start);
  start();
}
