// ==UserScript==
// @name         트랜스허브 중량 입력 실수 방지
// @namespace    yammo.transhub.weightguard
// @version      1.0.0
// @description  도어오더상세의 중량(Kg)/TW 첫 번째 입력칸을 검사하고 잘못된 값 저장을 차단합니다.
// @match        https://www.transhub.co.kr/*
// @match        http://www.transhub.co.kr/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // 이 업무의 중량 입력 기준. 필요하면 숫자만 바꾸세요.
  const REQUIRED_WEIGHT = 20000;
  const LABEL = '중량(Kg)/TW';
  const DIALOG_TITLE = '도어오더상세';
  const STYLE_ID = 'yammo-weight-guard-style';
  const MARK = 'data-yammo-weight-guard';
  let weightInput = null;
  let lastNotified = '';

  const visible = el => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const digits = raw => String(raw ?? '').replace(/,/g, '').replace(/\s/g, '');
  const formatted = n => Number(n).toLocaleString('ko-KR');
  const numeric = raw => {
    const s = digits(raw);
    return /^\d+$/.test(s) ? Number(s) : NaN;
  };
  const exactText = (el, value) => {
    if (!visible(el)) return false;
    if (el.children.length && Array.from(el.children).some(c => c.textContent.trim() === value)) return false;
    return (el.textContent || '').trim().replace(/\s+/g, '') === value.replace(/\s+/g, '');
  };

  function findDialog() {
    const candidates = Array.from(document.querySelectorAll('div,span,td,strong,h1,h2,h3'))
      .filter(el => exactText(el, DIALOG_TITLE));
    for (const heading of candidates) {
      let node = heading.parentElement;
      for (let i = 0; i < 9 && node; i++, node = node.parentElement) {
        const rect = node.getBoundingClientRect();
        if (rect.width > 600 && rect.height > 350 && node.querySelectorAll('input').length >= 8) {
          if (Array.from(node.querySelectorAll('*')).some(el => exactText(el, LABEL))) return node;
        }
      }
    }
    return null;
  }

  function findWeightInput() {
    const dialog = findDialog();
    if (!dialog) return null;
    const labels = Array.from(dialog.querySelectorAll('label,td,span,div,th'))
      .filter(el => exactText(el, LABEL));
    const inputs = Array.from(dialog.querySelectorAll('input'))
      .filter(el => visible(el) && !el.disabled && el.type !== 'hidden');

    for (const label of labels) {
      const r = label.getBoundingClientRect();
      // '중량(Kg)/TW' 라벨 오른쪽의 첫 번째 입력칸을 선택합니다.
      const choices = inputs.map(input => {
        const a = input.getBoundingClientRect();
        const dx = a.left - r.right;
        const dy = Math.abs((a.top + a.bottom) / 2 - (r.top + r.bottom) / 2);
        return { input, dx, dy };
      }).filter(x => x.dx >= -5 && x.dx < 600 && x.dy < 28)
        .sort((a, b) => a.dx - b.dx || a.dy - b.dy);
      if (choices.length) return choices[0].input;
    }
    return null;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      input[${MARK}="error"] { outline: 3px solid #de3e42 !important; background:#fff1f1 !important; }
      input[${MARK}="ok"] { outline: 2px solid #22865a !important; }
      #yammo-weight-hint { position:fixed; z-index:2147483647; max-width:340px; padding:10px 13px; border-radius:8px;
        background:#fff9e8; color:#8d2828; border:1px solid #e3b38e; font:600 13px/1.5 sans-serif;
        box-shadow:0 4px 16px #0002; pointer-events:none; }
    `;
    document.head.appendChild(style);
  }

  function hint(input, message) {
    let el = document.getElementById('yammo-weight-hint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'yammo-weight-hint';
      document.body.appendChild(el);
    }
    el.textContent = message;
    const r = input.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - 355, r.left))}px`;
    el.style.top = `${Math.max(8, Math.min(window.innerHeight - 70, r.bottom + 7))}px`;
    el.hidden = false;
  }
  function hideHint() {
    const el = document.getElementById('yammo-weight-hint');
    if (el) el.hidden = true;
  }

  function check(input, showWarning = true) {
    const raw = input.value.trim();
    if (!raw) {
      input.removeAttribute(MARK);
      hideHint();
      return { valid: true, empty: true };
    }
    const value = numeric(raw);
    if (value === REQUIRED_WEIGHT) {
      input.setAttribute(MARK, 'ok');
      hideHint();
      lastNotified = '';
      return { valid: true, empty: false };
    }
    input.setAttribute(MARK, 'error');
    if (showWarning) {
      hint(input, `중량 확인: ${Number.isNaN(value) ? raw : formatted(value)}kg 입력됨. 이 업무의 기준은 ${formatted(REQUIRED_WEIGHT)}kg입니다.`);
    }
    return { valid: false, empty: false, value };
  }

  function bind() {
    ensureStyle();
    const found = findWeightInput();
    if (found === weightInput) return;
    if (weightInput) weightInput.removeAttribute(MARK);
    weightInput = found;
    hideHint();
    if (!weightInput) return;
    weightInput.addEventListener('input', () => check(weightInput), { passive: true });
    weightInput.addEventListener('change', () => check(weightInput));
    weightInput.addEventListener('blur', () => check(weightInput));
    check(weightInput, false);
  }

  function isSaveTrigger(event) {
    if (event.type === 'keydown') return event.key === 'F8';
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('button,input[type="button"],input[type="submit"],a,[role="button"]');
    if (!button) return false;
    const text = (button.innerText || button.value || button.getAttribute('title') || '').replace(/\s/g, '');
    return /저장/.test(text);
  }

  function guard(event) {
    if (!isSaveTrigger(event)) return;
    bind();
    if (!weightInput || !visible(weightInput)) return;
    const result = check(weightInput);
    if (result.valid) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    weightInput.focus();
    // 실수 저장은 차단하며, 값을 임의로 바꾸지는 않습니다.
    const message = `중량 입력 오류!\n현재: ${Number.isNaN(result.value) ? weightInput.value : formatted(result.value)}kg\n기준: ${formatted(REQUIRED_WEIGHT)}kg\n\n저장을 중단했습니다. 중량을 확인하세요.`;
    if (message !== lastNotified) {
      lastNotified = message;
      window.alert(message);
    }
  }

  document.addEventListener('click', guard, true);
  document.addEventListener('keydown', guard, true);
  // 비동기로 열리는 팝업 감지. 과도한 반복 탐색 방지를 위해 디바운스.
  let timer = null;
  new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; bind(); }, 300);
  }).observe(document.documentElement, { childList: true, subtree: true });
  bind();
})();