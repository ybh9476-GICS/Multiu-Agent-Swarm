const greeting = '안녕하세요! AI 슈퍼바이저 어시스턴트입니다. 무엇을 도와드릴까요?';

function sampleReply(question) {
  if (question.includes('불량률')) {
    return '현재 전체 라인의 평균 불량률은 3.2%입니다. B라인의 도금 공정에서 미세한 변동이 감지되었으나, 허용 범위 내에 있습니다.';
  }
  if (question.includes('가동률') || question.toUpperCase().includes('OEE')) {
    return '오늘의 종합 설비 효율(OEE)은 87.5%로 목표치(85%)를 상회하고 있습니다. 특히 조립 라인의 성능 지표가 전일 대비 4% 향상되었습니다.';
  }
  if (question.includes('안전')) {
    return '현재 모든 안전 센서가 정상 작동 중입니다. 구역 C에서 작업자 1명이 보호구 미착용으로 경고 조치되었으며, 현재는 시정 완료되었습니다.';
  }
  return '요청하신 내용을 분석 중입니다. Supervisor 에이전트가 관련 데이터를 취합하여 최적의 답변을 준비하고 있습니다.';
}

export function attachCompanionChat(host, figure) {
  const panel = document.querySelector('.companion-chat');
  const messages = panel.querySelector('.companion-chat__messages');
  const form = panel.querySelector('.companion-chat__form');
  const textarea = form.querySelector('textarea');
  const sendButton = form.querySelector('.companion-chat__send');
  const closeButton = panel.querySelector('.companion-chat__close');
  let replying = false;

  function scrollToLatest() {
    messages.scrollTop = messages.scrollHeight;
  }

  function appendMessage(role, content) {
    const row = document.createElement('div');
    row.className = `companion-chat__message companion-chat__message--${role}`;
    const avatar = document.createElement('span');
    avatar.className = 'companion-chat__message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = role === 'assistant' ? '✦' : '●';
    const body = document.createElement('div');
    const bubble = document.createElement('p');
    bubble.className = 'companion-chat__message-bubble';
    bubble.textContent = content;
    const time = document.createElement('time');
    time.className = 'companion-chat__message-time';
    const now = new Date();
    time.dateTime = now.toISOString();
    time.textContent = now.toLocaleTimeString('ko-KR');
    body.append(bubble, time);
    row.append(avatar, body);
    messages.append(row);
    scrollToLatest();
    return row;
  }

  function updateSendButton() {
    sendButton.disabled = replying || !textarea.value.trim();
  }

  function position() {
    if (panel.hidden || host.hidden) return;
    const character = host.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const gap = 18;
    const margin = 12;
    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
    let placement = 'left';
    let left = character.left - width - gap;
    let top = clamp(character.bottom - height, margin, Math.max(margin, innerHeight - height - margin));

    if (left < margin) {
      if (character.right + gap + width <= innerWidth - margin) {
        placement = 'right';
        left = character.right + gap;
      } else {
        placement = 'above';
        left = clamp(character.right - width, margin, Math.max(margin, innerWidth - width - margin));
        top = clamp(character.top - height - gap, margin, Math.max(margin, innerHeight - height - margin));
      }
    }
    panel.dataset.placement = placement;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.setProperty('--tail-top', `${clamp(character.top + character.height * 0.5 - top, 24, height - 24)}px`);
    panel.style.setProperty('--tail-left', `${clamp(character.left + character.width * 0.5 - left, 24, width - 24)}px`);
  }

  function close({ restoreFocus = false } = {}) {
    if (panel.hidden) return;
    panel.hidden = true;
    figure.setAttribute('aria-expanded', 'false');
    if (restoreFocus && !host.hidden) figure.focus();
  }

  function toggle() {
    if (!panel.hidden) {
      close();
      return;
    }
    panel.hidden = false;
    figure.setAttribute('aria-expanded', 'true');
    position();
    scrollToLatest();
    textarea.focus();
  }

  appendMessage('assistant', greeting);
  panel.addEventListener('pointerdown', (event) => event.stopPropagation());
  panel.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
  closeButton.addEventListener('click', () => close({ restoreFocus: true }));
  for (const button of panel.querySelectorAll('.companion-chat__suggestions button')) {
    button.addEventListener('click', () => {
      textarea.value = button.textContent;
      updateSendButton();
      textarea.focus();
    });
  }
  textarea.addEventListener('input', updateSendButton);
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = textarea.value.trim();
    if (!question || replying) return;
    appendMessage('user', question);
    textarea.value = '';
    replying = true;
    updateSendButton();
    const typing = document.createElement('p');
    typing.className = 'companion-chat__typing';
    typing.textContent = '답변 작성 중…';
    messages.append(typing);
    scrollToLatest();
    window.setTimeout(() => {
      typing.remove();
      appendMessage('assistant', sampleReply(question));
      replying = false;
      updateSendButton();
    }, 1500);
  });
  window.addEventListener('resize', position);

  return { toggle, close, position };
}
