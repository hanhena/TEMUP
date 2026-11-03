// ==UserScript==
// @name         트랜스허브 중량 오입력 방지
// @namespace    yammo.transhub.weightguard
// @version      1.1.0
// @description  도어오더상세 중량(Kg)/TW의 첫 번째 칸을 검사하고 브라우저 경고창으로 오입력을 방지합니다.
// @match        *://transhub.co.kr/*
// @match        *://www.transhub.co.kr/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__yammoTranshubWeightGuard11) return;
  window.__yammoTranshubWeightGuard11 = true;

  const REQUIRED = 20000;
  const MARK = 'data-yammo-weight-status';
  const STYLE_ID = 'yammo-weight-guard-css';
  const bound = new WeakSet();
  let current = null;
  let alertedValue = null;
  const clean = s => String(s ?? '').replace(/\s+/g, '').toLowerCase();
  const number = s => {
    const v = String(s ?? '').replace(/[\s,]/g, '');
    return /^\d+$/.test(v) ? Number(v) : NaN;
  };
  const format = n => Number.isFinite(n) ? n.toLocaleString('ko-KR') : '숫자 아님';
  const visible = el => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const isInput = el => el instanceof HTMLInputElement &&
    !['hidden','checkbox','radio','button','submit'].includes(el.type) && visible(el);

  function findInput(root = document) {
    const labels = [];
    const nodes = root.querySelectorAll('td,th,label,span,div,p,strong');
    for (const el of nodes) {
      if (!visible(el)) continue;
      const s = clean(el.textContent);
      if (!/중량\(?kg\)?\/tw/i.test(s)) continue;
      // 큰 컨테이너보다 실제 라벨(가장 작은 요소)을 우선.
      if (el.children.length && Array.from(el.children).some(child =>
          /중량\(?kg\)?\/tw/i.test(clean(child.textContent)))) continue;
      if (s.length > 45) continue;
      labels.push(el);
    }

    const inputs = Array.from(root.querySelectorAll('input')).filter(isInput);
    let best = null;
    let score = Infinity;
    for (const label of labels) {
      const a = label.getBoundingClientRect();
      const ly = (a.top + a.bottom) / 2;
      for (const input of inputs) {
        const b = input.getBoundingClientRect();
        const dx = b.left - a.right;
        const dy = Math.abs((b.top + b.bottom) / 2 - ly);
        // 중량 라벨의 바로 오른쪽에 있는 첫 입력칸만 선택.
        if (dx < -8 || dx > 380 || dy > 24) continue;
        const sc = dy * 10 + dx;
        if (sc < score) { score = sc; best = input; }
      }
    }
    return best;
  }

  function installStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      input[${MARK}="error"] {outline:3px solid #e02636!important;background:#fff0f0!important;}
      input[${MARK}="ok"] {outline:2px solid #248755!important;}
    `;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function validate(input, warn = false) {
    if (!input || !visible(input)) return true;
    const raw = input.value.trim();
    if (!raw) {
      input.removeAttribute(MARK);
      alertedValue = null;
      return true;
    }
    const n = number(raw);
    const valid = n === REQUIRED;
    input.setAttribute(MARK, valid ? 'ok' : 'error');
    if (valid) {
      alertedValue = null;
      return true;
    }
    if (warn && alertedValue !== raw) {
      alertedValue = raw;
      window.alert('중량 입력 오류!\n\n현재 입력: ' + (Number.isFinite(n) ? format(n) : raw) +
        ' kg\n정상 입력: ' + format(REQUIRED) +
        ' kg\n\n중량을 확인하고 수정해 주세요.');
    }
    return false;
  }

  function bind() {
    installStyle(document);
    const found = findInput();
    if (!found) return;
    if (found !== current) {
      if (current) current.removeAttribute(MARK);
      current = found;
      alertedValue = null;
    }
    if (bound.has(found)) return;
    bound.add(found);
    found.addEventListener('input', () => validate(found, false));
    // 숫자를 다 입력한 뒤 포커스를 벗어나거나 엔터를 누르면 크롬 기본 경고창.
    found.addEventListener('blur', () => validate(found, true));
    found.addEventListener('change', () => validate(found, true));
    found.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !validate(found, true)) {
        e.preventDefault(); e.stopImmediatePropagation();
      }
    }, true);
    validate(found, false);
  }

  function isSave(e) {
    if (e.type === 'keydown') return e.key === 'F8';
    const el = e.target instanceof Element
      ? e.target.closest('button,a,input[type="button"],input[type="submit"],[role="button"]') : null;
    if (!el) return false;
    const s = clean(el.innerText || el.value || el.title || el.getAttribute('aria-label'));
    return s.includes('저장');
  }

  function guard(e) {
    if (!isSave(e)) return;
    bind();
    if (!current || !visible(current)) return;
    const n = number(current.value);
    if (!current.value.trim() || n === REQUIRED) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    // 경고는 저장 이벤트 전에 출력. 이미 같은 값으로 경고했다면 다시 표시.
    alertedValue = null;
    validate(current, true);
    current.focus();
  }

  document.addEventListener('click', guard, true);
  document.addEventListener('keydown', guard, true);
  document.addEventListener('focusin', () => bind(), true);
  // 일부 사이트는 SPA 팝업을 나중에 생성하므로 DOM 갱신 감시.
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; bind(); }, 250);
  }).observe(document.documentElement, {subtree:true, childList:true});
  bind();
})();
