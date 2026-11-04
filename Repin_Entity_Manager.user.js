// ==UserScript==
// @name         Repin Entity Manager
// @namespace    https://litychat.com/
// @version      3.0.3
// @description  리핀 개체 전용 관리자. JSON 가져오기, 개체 수정창 반영, 개체 일괄 교체, 다크 UI, AI 정리 지침 복사
// @match        https://litychat.com/*
// @match        https://repin.chat/*
// @updateURL    https://raw.githubusercontent.com/hanhena/TEMUP/main/Repin_Entity_Manager.user.js
// @downloadURL  https://raw.githubusercontent.com/hanhena/TEMUP/main/Repin_Entity_Manager.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  if (window.__REPIN_ENTITY_MANAGER_V2__) return;
  window.__REPIN_ENTITY_MANAGER_V2__ = true;

  const PREFIX = 'rem_v2_';
  const DEFAULT_ROOM = '기본 방';
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  const textOf = (el) => String(el?.textContent || '').replace(/\s+/g, ' ').trim();
  const normalizeLabel = (s) => String(s || '').replace(/[\s*＊:：]/g, '').trim();
  const storageKey = (room) => PREFIX + 'room_' + room;

  let room = localStorage.getItem(PREFIX + 'lastRoom') || DEFAULT_ROOM;
  let autoRoom = localStorage.getItem(PREFIX + 'autoRoom') === 'yes';
  let lastChatSignature = '';
  function currentChatSignature() {
    const overlay = document.querySelector('#chatOverlay');
    if (!overlay || overlay.classList.contains('chat-overlay--parked') || overlay.getAttribute('aria-hidden') === 'true') return null;
    const title = document.querySelector('#chatTitle')?.textContent?.trim();
    if (!title || title === '새 채팅') return null;
    const u = new URL(location.href);
    const id = ['chatId','chat_id','conversationId','conversation_id','roomId','room_id'].map(k => u.searchParams.get(k)).find(Boolean);
    const path = u.pathname.match(/(?:chat|conversation|room)\/([^/?#]+)/i)?.[1];
    const unique = id || path;
    return { key: unique ? '대화ID_' + unique : '제목_' + title, title, reliable: !!unique };
  }
  function syncAutoRoom() {
    if (!autoRoom || batchRunning) return;
    const sig = currentChatSignature();
    if (!sig || sig.key === lastChatSignature) return;
    lastChatSignature = sig.key;
    room = sig.key;
    data = loadData();
    selected = -1;
    saveData();
    if ($('#mask')?.classList.contains('open')) render();
  }
  let query = '';
  let selected = -1;
  let batchRunning = false;
  let stopRequested = false;

  function emptyData() {
    return { entity: [] };
  }

  function normalizeEntity(v) {
    return {
      title: String(v.title ?? v.name ?? ''),
      relation: String(v.relation ?? ''),
      traits: Array.isArray(v.traits) ? v.traits.map(String) : [],
      facts: Array.isArray(v.facts) ? v.facts.map(String) : []
    };
  }

  function normalizeData(raw) {
    const out = emptyData();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('JSON 객체가 필요합니다.');
    const list = raw.entity || raw.entities || [];
    if (!Array.isArray(list)) throw new Error('entity는 배열이어야 합니다.');
    out.entity = list.map(normalizeEntity);
    return out;
  }

  function loadData() {
    try {
      return normalizeData(JSON.parse(localStorage.getItem(storageKey(room)) || '{}'));
    } catch {
      return emptyData();
    }
  }

  let data = loadData();

  function saveData() {
    localStorage.setItem(storageKey(room), JSON.stringify(data));
    localStorage.setItem(PREFIX + 'lastRoom', room);
  }

  function copyText(s) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(s).then(() => alert('복사했어요.'));
    const ta = document.createElement('textarea');
    ta.value = s;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    alert('복사했어요.');
  }

  function entryText(o) {
    return [
      o.title,
      o.relation ? '관계: ' + o.relation : '',
      o.traits.length ? '특성: ' + o.traits.join(', ') : '',
      ...o.facts.map(f => '- ' + f)
    ].filter(Boolean).join('\n');
  }

  const host = document.createElement('div');
  host.id = 'repin-entity-manager-root';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
  <style>
    * { box-sizing: border-box; }
    button, input, textarea { font: inherit; }
    :host, #wrap { all: initial; }
    #triggerFallback {
      position: fixed; right: 18px; bottom: 100px; z-index: 2147483640;
      display: none; border: 0; border-radius: 999px; padding: 11px 15px;
      background: linear-gradient(135deg, #2c2f43, #12141d 68%);
      color: #f4f4f7; font: 600 13px/1 'Pretendard', system-ui, sans-serif;
      box-shadow: 0 10px 28px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08);
      letter-spacing: .02em;
    }
    #mask {
      position: fixed; inset: 0; background: rgba(4,6,10,.58); backdrop-filter: blur(6px);
      z-index: 2147483641; display: none;
    }
    #mask.open { display: block; }
    #panel {
      position: absolute; right: 18px; bottom: 18px; width: min(460px, calc(100vw - 20px));
      max-height: min(78vh, 900px); overflow: hidden; display: flex; flex-direction: column;
      color: #ececf1; background: linear-gradient(180deg, rgba(24,26,35,.96), rgba(13,15,22,.98));
      border: 1px solid rgba(255,255,255,.08); border-radius: 24px;
      box-shadow: 0 28px 60px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.05);
      font: 14px/1.48 'Pretendard', system-ui, sans-serif;
    }
    header {
      display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
      padding:16px 18px 12px; border-bottom: 1px solid rgba(255,255,255,.07);
      background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,0));
    }
    h3 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: .01em; }
    .sub { margin-top: 2px; color: #9ca1b6; font-size: 12px; }
    .close {
      border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.04); color: #d9dbe7;
      width: 34px; height: 34px; border-radius: 12px; cursor: pointer;
    }
    main { overflow: auto; padding: 14px 14px 2px; }
    .badgeRow { display:flex; gap:8px; margin-bottom: 12px; }
    .badge {
      padding: 7px 12px; border-radius: 999px; background: rgba(110,114,153,.15); color:#e8eaf5;
      border: 1px solid rgba(255,255,255,.08); font-size: 12px; font-weight: 700;
    }
    .hint {
      padding: 12px 13px; border-radius: 16px; background: rgba(255,255,255,.035); color:#b9bfd2;
      border: 1px solid rgba(255,255,255,.06); font-size: 12px; margin-bottom: 12px;
    }
    .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .grow { flex: 1 1 auto; }
    label { display:block; color:#b9bfd2; font-size: 12px; margin-bottom: 6px; }
    input, textarea {
      width:100%; border:1px solid rgba(255,255,255,.08); border-radius: 14px;
      background: rgba(255,255,255,.045); color: #f5f6fb; padding: 10px 12px; outline: none;
    }
    input::placeholder, textarea::placeholder { color: #7f869b; }
    input:focus, textarea:focus { border-color: rgba(130,137,255,.55); box-shadow: 0 0 0 3px rgba(87,98,255,.16); }
    textarea { min-height: 92px; resize: vertical; }
    .search { margin-bottom: 12px; }
    .btn {
      border:1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.04); color:#edf0fa;
      border-radius: 14px; padding: 10px 12px; cursor:pointer;
    }
    .btn:hover { background: rgba(255,255,255,.07); }
    .btn.primary {
      background: linear-gradient(135deg, #5d65ff, #4950db); border-color: rgba(122,129,255,.55); color: white;
      box-shadow: 0 10px 20px rgba(73,80,219,.26);
    }
    .btn.danger { color: #ffb1bd; }
    .btn.small { padding: 8px 10px; border-radius: 12px; }
    .list { display:flex; flex-direction:column; gap:10px; }
    .card {
      background: rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.065); border-radius:18px;
      padding: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,.035);
    }
    .titleRow { display:flex; gap:8px; align-items:flex-start; }
    .title { font-size: 16px; font-weight: 700; color:#f7f8fd; }
    .meta { margin-top:3px; color:#9fa5bb; font-size: 12px; }
    .chips { display:flex; flex-wrap:wrap; gap:6px; margin: 10px 0; }
    .chip { padding:4px 9px; border-radius:999px; background: rgba(255,255,255,.055); color:#e6e9f7; font-size:12px; }
    .facts { border-top:1px dashed rgba(255,255,255,.08); margin-top:10px; padding-top:10px; }
    .fact { color:#d8dcec; margin: 0 0 6px; white-space: pre-wrap; }
    .fact:before { content:'– '; color:#8990ff; }
    .tools { margin-top: 12px; display:flex; gap:8px; flex-wrap:wrap; }
    .editor {
      margin-top: 12px; padding: 14px; border-radius: 18px; background: rgba(255,255,255,.03);
      border:1px solid rgba(255,255,255,.065);
    }
    .editorTitle { font-weight: 700; margin-bottom: 10px; }
    .footer {
      padding: 12px 14px 14px; border-top:1px solid rgba(255,255,255,.07); display:flex; gap:8px; flex-wrap:wrap;
      background: linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.02));
    }

    #guideOverlay { position:absolute; inset:0; z-index:12; display:none; flex-direction:column; background:linear-gradient(180deg,#1c1f29,#11131b); border-radius:24px; overflow:hidden; }
    #guideOverlay.show { display:flex; }
    .guideHead { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:16px; border-bottom:1px solid rgba(255,255,255,.08); }
    .guideBody { padding:15px; overflow:auto; flex:1; display:flex; flex-direction:column; gap:10px; }
    .guideBody label { font-size:12px; }
    #guideText { min-height:300px; flex:1; line-height:1.65; font-size:12px; white-space:pre-wrap; }
    .guideBottom { display:flex; flex-wrap:wrap; gap:8px; padding:12px 15px; border-top:1px solid rgba(255,255,255,.08); }
    .guideNote {color:#aab1c5; font-size:12px; line-height:1.6;}
    .hidden { display:none !important; }
    .empty { color:#96a0b8; text-align:center; padding: 18px 8px; }
    @media (max-width: 640px) {
      #panel { right: 10px; left: 10px; width: auto; bottom: 10px; max-height: 82vh; }
    }
  </style>
  <button id="triggerFallback">기억 관리</button>
  <div id="mask">
    <section id="panel">
      <header>
        <div>
          <h3>Repin Entity Manager</h3>
          <div class="sub">개체만 관리 · JSON 가져오기 · 수정창 반영 · 일괄 교체</div>
        </div>
        <button class="close" id="closeBtn">✕</button>
      </header>
      <main id="main"></main>
      <div class="footer">
        <button class="btn" id="guideBtn">AI 정리 지침</button>
        <button class="btn" id="importBtn">JSON 가져오기</button>
        <button class="btn" id="exportBtn">JSON 백업</button>
        <button class="btn" id="diagnoseBtn">수정창 진단</button>
        <button class="btn primary" id="batchBtn">개체 일괄 동기화</button>
        <button class="btn" id="mergeDuplicateBtn">동명 개체 병합</button>
        <button class="btn" id="recoverAttemptsBtn">등록 시도 기록 복구</button>
        <button class="btn danger hidden" id="stopBtn">중단</button>
        <button class="btn primary grow" id="addBtn">+ 개체 추가</button>
        <input type="file" id="fileInput" class="hidden" accept=".json,application/json">
      </div>
      <div id="guideOverlay" aria-hidden="true">
        <div class="guideHead"><div><h3>AI 정리 지침</h3><div class="sub">ChatGPT · Claude · Gemini 공용</div></div><button class="close" id="guideClose" title="닫기">✕</button></div>
        <div class="guideBody">
          <div class="guideNote">현재 방의 진행도를 보존하거나, 새 방에서 시작할 기본 프로필을 추출할 수 있습니다. 선택한 모드가 복사·TXT·채팅 합치기 모두에 적용됩니다.</div>
          <label for="guideMode">정리 목적</label>
          <select id="guideMode" style="background:#252832;color:#f2f3fa;border:1px solid #3d4051;border-radius:12px;padding:12px;width:100%;">
            <option value="continue">기존 방 유지 · 기억 충돌 정리</option>
            <option value="new">새 방 시작 · 기본 설정 추출</option>
          </select>
          <label for="guideUserName">사용자 캐릭터 이름</label>
          <input id="guideUserName" value="한서린" placeholder="예: 한서린" />
          <label for="guideText">복사할 지침문</label>
          <textarea id="guideText" readonly spellcheck="false"></textarea>
        </div>
        <div class="guideBottom"><button class="btn primary grow" id="guideOneClick">지침 + 채팅 한번에 내보내기</button><button class="btn" id="guideMerge">받은 TXT 합치기</button><button class="btn" id="guideCopy">지침 복사</button><button class="btn" id="guideDownload">지침 TXT</button><input type="file" id="guideMergeInput" class="hidden" accept=".txt,text/plain"></div>
      </div>
    </section>
  </div>`;

  const $ = (sel) => root.querySelector(sel);
  const main = $('#main');

  function render() {
    const list = data.entity
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => JSON.stringify(o).toLowerCase().includes(query.toLowerCase()));

    main.innerHTML = `
      <div class="badgeRow">
        <div class="badge">개체 ${data.entity.length}</div>
        <div class="badge">보관함: ${esc(room)}</div>
      </div>
      <div class="hint">
        사건·요약·떡밥·월드는 제외하고 <b>개체만</b> 관리합니다.<br>
        현재 보관함은 <b>리핀 서버의 채팅방 자체가 아닌 로컬 데이터 공간</b>입니다. 자동 연결 시 고유 대화 ID가 없으면 제목별로 구분하며, 동명 채팅은 별도로 관리해야 합니다.
      </div>
      <div class="row" style="margin-bottom:12px;">
        <div class="grow">
          <label>방 이름</label>
          <input id="roomInput" value="${esc(room)}">
        </div>
        <button class="btn" id="switchRoomBtn" style="margin-top:18px;">보관함 전환</button>
        <button class="btn" id="autoRoomBtn" style="margin-top:18px;">${autoRoom ? "자동 연결 끄기" : "현재 채팅 연결"}</button>
      </div>
      <div class="search">
        <input id="searchInput" placeholder="이름·관계·특성·알려진 사실 검색" value="${esc(query)}">
      </div>
      <div class="list" id="list">
        ${list.length ? list.map(({ o, i }) => `
          <article class="card">
            <div class="titleRow">
              <div class="grow">
                <div class="title">${esc(o.title)}</div>
                ${o.relation ? `<div class="meta">${esc(o.relation)}</div>` : ''}
              </div>
              <button class="btn small" data-copy="${i}">복사</button>
              <button class="btn primary small" data-apply="${i}">반영·저장</button>
              <button class="btn small" data-edit="${i}">수정</button>
              <button class="btn danger small" data-del="${i}">삭제</button>
            </div>
            ${o.traits?.length ? `<div class="chips">${o.traits.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
            ${o.facts?.length ? `<div class="facts">${o.facts.map(f => `<div class="fact">${esc(f)}</div>`).join('')}</div>` : ''}
          </article>
        `).join('') : `<div class="empty">개체가 없습니다. JSON을 가져오거나 + 개체 추가를 눌러 주세요.</div>`}
      </div>
      <div id="editorArea"></div>
    `;

    // 입력 중에는 활성 보관함을 바꾸지 않음. 전환 버튼을 누를 때만 변경합니다.
    $('#switchRoomBtn').onclick = () => {
      if (batchRunning) return alert('일괄 작업 중 보관함을 변경할 수 없습니다.');
      autoRoom = false; localStorage.setItem(PREFIX + 'autoRoom','no');
      room = main.querySelector('#roomInput').value.trim() || DEFAULT_ROOM;
      data = loadData();
      selected = -1;
      saveData();
      render();
    };
    $('#autoRoomBtn').onclick = () => {
      if (batchRunning) return;
      if (autoRoom) { autoRoom = false; localStorage.setItem(PREFIX + 'autoRoom','no'); render(); return; }
      const sig = currentChatSignature();
      if (!sig) return alert('채팅방 안에서 실행해 주세요.');
      if (!sig.reliable && !confirm('현재 사이트 주소에서 고유 대화 ID를 찾지 못했습니다.\n따라서 채팅 제목으로만 구분하며, 이름이 같은 여러 방은 충돌할 수 있습니다.\n연결할까요?')) return;
      if (data.entity.length && room !== sig.key && confirm(`현재 보관함의 개체 ${data.entity.length}개를 새 방 보관함으로 복사할까요?`)) {
        const target = storageKey(sig.key);
        if (localStorage.getItem(target) && !confirm('대상 보관함에 이미 데이터가 있습니다. 덮어쓸까요?')) return;
        localStorage.setItem(target, JSON.stringify(data));
      }
      autoRoom = true; localStorage.setItem(PREFIX + 'autoRoom','yes');
      lastChatSignature = ''; syncAutoRoom(); render();
    };
    $('#searchInput').oninput = (e) => {
      query = e.target.value;
      render();
      const el = main.querySelector('#searchInput');
      el.focus();
      el.setSelectionRange(query.length, query.length);
    };

    main.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copyText(entryText(data.entity[+b.dataset.copy])));
    main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openEditor(+b.dataset.edit));
    main.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const i = +b.dataset.del;
      if (confirm(`'${data.entity[i].title}' 개체를 로컬 보관함에서 삭제할까요?`)) {
        data.entity.splice(i, 1);
        saveData();
        render();
      }
    });
    main.querySelectorAll('[data-apply]').forEach(b => b.onclick = async () => {
      const i = +b.dataset.apply;
      if (!confirm(`'${data.entity[i].title}'을 기존 사실을 보존하며 병합하고 자동 저장할까요?`)) return;
      const res = await applyToNative(data.entity[i], { quiet:true });
      if (!res.ok) return alert('반영 중단: ' + res.reason);
      const saved = await saveNativeEditor(data.entity[i]);
      alert(saved.ok ? '저장 창 닫힘을 확인했습니다. 리핀 목록에서 변경 내용도 확인해 주세요.' : '저장 중단: ' + saved.reason);
    });

    if (selected >= 0) openEditor(selected, true);
  }

  function openEditor(index, preserve = false) {
    selected = index;
    const o = index >= 0 && index < data.entity.length ? data.entity[index] : { title:'', relation:'', traits:[], facts:[] };
    const area = main.querySelector('#editorArea');
    if (!area) return;
    area.innerHTML = `
      <div class="editor">
        <div class="editorTitle">${index >= 0 && index < data.entity.length ? '개체 수정' : '개체 추가'}</div>
        <label>이름</label>
        <input id="edTitle" value="${esc(o.title)}">
        <label style="margin-top:10px;">관계</label>
        <input id="edRelation" value="${esc(o.relation)}">
        <label style="margin-top:10px;">특성 (쉼표로 구분)</label>
        <textarea id="edTraits">${esc((o.traits || []).join(', '))}</textarea>
        <label style="margin-top:10px;">알려진 사실 (한 줄에 하나씩)</label>
        <textarea id="edFacts" style="min-height:150px;">${esc((o.facts || []).join('\n'))}</textarea>
        <div class="tools">
          <button class="btn primary grow" id="saveEntityBtn">저장</button>
          <button class="btn" id="cancelEntityBtn">취소</button>
        </div>
      </div>`;
    area.querySelector('#saveEntityBtn').onclick = () => {
      const item = {
        title: area.querySelector('#edTitle').value.trim(),
        relation: area.querySelector('#edRelation').value.trim(),
        traits: area.querySelector('#edTraits').value.split(',').map(s => s.trim()).filter(Boolean),
        facts: area.querySelector('#edFacts').value.split('\n').map(s => s.trim().replace(/^[-–•]\s*/, '')).filter(Boolean)
      };
      if (!item.title) return alert('이름을 입력해 주세요.');
      if (index >= 0 && index < data.entity.length) data.entity[index] = item;
      else data.entity.push(item);
      selected = -1;
      saveData();
      render();
    };
    area.querySelector('#cancelEntityBtn').onclick = () => { selected = -1; render(); };
    if (!preserve) area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('#triggerFallback').onclick = () => { $('#mask').classList.add('open'); render(); };
  $('#closeBtn').onclick = () => $('#mask').classList.remove('open');
  $('#mask').addEventListener('click', (e) => { if (e.target === $('#mask')) $('#mask').classList.remove('open'); });
  $('#addBtn').onclick = () => { selected = data.entity.length; render(); };
  $('#importBtn').onclick = () => $('#fileInput').click();
  $('#exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `repin_entity_${room}_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1200);
  };
  $('#fileInput').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const incoming = normalizeData(JSON.parse(await file.text()));
      const count = incoming.entity.length;
      if (!confirm(`개체 ${count}개를 '${room}' 방에 가져올까요?\n확인 = 기존 로컬 데이터 교체`)) return;
      data = incoming;
      selected = -1;
      saveData();
      render();
      alert('가져왔어요.');
    } catch (err) {
      alert('가져오기 실패: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  // Two intentionally distinct extraction modes.
  // No conversation is sent to a third-party service by this script.
  function guideMode() { return $('#guideMode')?.value === 'new' ? 'new' : 'continue'; }
  function modeSuffix() { return guideMode() === 'new' ? '새방시작' : '기존방유지'; }
  function buildGuide(userName, mode = 'continue') {
    const name = (userName || '').trim() || '한서린';
    const common = [
      '당신은 리핀 캐릭터챗의 장기 대화 기록을 검토하는 개체 데이터 정리 담당자입니다.',
      '첨부된 전체 채팅 TXT를 처음부터 끝까지 검토하고, 주요 인물과 사용자 캐릭터의 개체 정보만 정확히 재구성하세요.',
      '',
      '[공통 원칙]',
      `- 사용자 캐릭터 이름은 ${name}입니다. 대화의 사용자 발화자도 반드시 독립 개체로 포함하세요.`,
      '- 반복 등장하는 주요 인물, 동료, 가족, 중요한 조연을 누락하지 마세요.',
      '- 사용자 직접 지시, 원문에서 확인되는 사실, NPC 서술, 소문/게시판의 추측을 구분하세요.',
      '- 추측이나 단발성 농담을 확정 사실로 만들지 말고, 근거 없는 외형·능력·나이·계급을 추가하지 마세요.',
      '- 동일 인물의 별명과 본명을 혼동하지 마세요. 성격은 반복 행동과 발화에서 분석하세요.',
      '- 특성(traits)은 4~10개의 짧은 성격·말투·행동 키워드로, 알려진 사실(facts)은 각각 별도 입력칸에 맞는 독립 문장으로 작성하세요.',
      '- relation은 사용자 캐릭터와의 현재 관계를 간결하게 쓰고, 다른 인물과의 중요한 관계는 facts에 쓰세요.',
      '- 원문에 충돌이 있으면 시간 순서와 실제 대화의 명시적 수정 지시를 확인하고, 확인할 수 없는 내용은 억지로 확정하지 마세요.',
      '- 유백과 한서린이 등장하는 경우, 사용자가 별도로 지정한 말투 원칙을 반영하세요: 유백은 서린에게 모욕적인 동물 별명이나 욕설 대신 한 중위/서린 중위 등 존중하는 호칭을 쓰려고 노력합니다. 연인이 된 뒤의 사적 호칭은 서린아입니다.',
      ''
    ];
    const ongoing = [
      '[선택 모드: 기존 방 유지 / 진행 중인 데이터 정리]',
      '- 이 작업은 새 방 초기화가 아닙니다. 기존 대화의 실제 진행과 현재 시점의 관계를 보존하세요.',
      '- 이전 연애·결혼·갈등·화해·가족관계·직책 변경 등 현재까지 유효한 중요한 사실은 임의로 삭제하거나 초기화하지 마세요.',
      '- 단발성 사건을 모두 개체 사실로 적지 말고, 현재에도 영향을 주는 상태·약속·제약·호칭 변경·관계 변화를 우선 반영하세요.',
      '- 특정 사건 이후 바뀐 관계는 시점과 조건을 명시하세요. 과거 상태를 현재 상태처럼 기재하지 마세요.',
      '- 마지막 턴의 유효한 설정이 무엇인지 확인하세요. 회상, OOC, 재시작, 분기 전환은 현재 시간선과 구분하세요.',
      '- 이전 기록의 사건 중 명백히 중복된 내용만 통합하세요. 다르게 해석될 수 있는 사실은 삭제하지 말고 근거를 비교하세요.',
      '- 대화의 강압적 행위나 소문이 있다면 그것을 당연한 사랑/성격으로 미화하지 말고 확인된 행동과 관계 변화만 객관적으로 기술하세요.',
      '- 현재 관계를 일괄적으로 연애 전이나 새 방 초기 상태로 되돌리지 마세요.',
      '- 이미 존재하는 개체를 교체할 수 있도록 이름은 안정적으로 유지하고 사실을 최신 상태로 갱신하세요.',
      ''
    ];
    const fresh = [
      '[선택 모드: 새 방 시작 / 초기 프로필 정리]',
      '- 새 방에서 다시 시작할 수 있는 인물의 기본 성격과 세계관상 고정 설정만 추출하세요.',
      '- 이전 방에서 새롭게 발생한 연애 진전, 결혼, 임신, 징계, 납치, 갈등, 상처, 특정 사건의 결과는 기본 프로필에 옮기지 마세요.',
      '- 처음부터 존재하는 가족관계, 소속, 계급, 능력, 습관, 기본 말투는 보존하세요.',
      '- 이전 방의 사건을 새 방 인물들이 이미 알고 있다고 가정하지 마세요.',
      '- 사용자가 새 방의 시작 관계나 시점을 명시했다면 그 기준을 따르세요. 별도 지정이 없으면 기존 사건에 근거한 연애 상태를 추정하지 마세요.',
      ''
    ];
    const output = [
      '[출력 형식: 매니저용 JSON]',
      '- 다른 설명, 마크다운 코드펜스, 주석 없이 유효한 JSON 객체 하나만 출력하세요.',
      '- 최상위 키는 entity 하나만 사용합니다. world/event/thread/summary는 출력하지 마세요.',
      '- 각 개체는 title, relation, traits, facts를 포함합니다. 모든 값은 한국어, traits와 facts는 문자열 배열입니다.',
      '- 사용자 캐릭터의 relation은 "본인, 사용자 캐릭터"로 쓰세요.',
      '- 형식 예시 (예시 내용은 실제 데이터가 아닙니다):',
      '{',
      '  "entity": [',
      `    {"title":"${name}","relation":"본인, 사용자 캐릭터","traits":["차분함"],"facts":["원문에서 확인한 정보."]}`, 
      '  ]',
      '}',
      '- 대화량이 많아 출력이 너무 길면 임의 생략하지 말고 여러 개의 유효한 JSON 파일로 나누어 순번을 붙여 주세요.'
    ];
    return [...common, ...(mode === 'new' ? fresh : ongoing), ...output].join('\n');
  }

  function showGuide() {
    const overlay = $('#guideOverlay');
    const input = $('#guideUserName');
    input.value = localStorage.getItem(PREFIX + 'guideUserName') || '한서린';
    $('#guideText').value = buildGuide(input.value, guideMode());
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
  }
  $('#guideBtn').onclick = showGuide;
  $('#guideClose').onclick = () => {
    $('#guideOverlay').classList.remove('show');
    $('#guideOverlay').setAttribute('aria-hidden', 'true');
  };
  $('#guideUserName').oninput = e => {
    localStorage.setItem(PREFIX + 'guideUserName', e.target.value);
    $('#guideText').value = buildGuide(e.target.value, guideMode());
  };
  $('#guideMode').value = localStorage.getItem(PREFIX + 'guideMode') === 'new' ? 'new' : 'continue';
  $('#guideMode').onchange = e => { localStorage.setItem(PREFIX + 'guideMode', e.target.value); $('#guideText').value = buildGuide(guideUsername(), guideMode()); };
  $('#guideCopy').onclick = () => copyText($('#guideText').value);
  $('#guideDownload').onclick = () => {
    const blob = new Blob([$('#guideText').value], { type:'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Repin_AI_개체정리지침_' + modeSuffix() + '.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ---------- Combined chat export: prompt + original chat in ONE local TXT ----------
  // Use the site's own export button; do not call private APIs or access credentials.
  // The site might use <a download> and Blob, or a different export mechanism.
  // If not interceptable, offer a deterministic TXT import/merge fallback.
  function combinedText(chatText, username, mode = guideMode()) {
    const cleanChat = String(chatText || '').replace(/^\uFEFF/, '');
    return [
      'REPIN — AI ENTITY DATA CLEANUP REQUEST',
      '============================================================',
      'The following instructions and exported conversation are provided together.',
      'Analyze the full conversation below, then output ONLY the requested JSON.',
      '',
      buildGuide(username, mode),
      '',
      '============================================================',
      '[BEGIN REPIN CHAT EXPORT — ORIGINAL TEXT]',
      '============================================================',
      cleanChat,
      '\n============================================================',
      '[END REPIN CHAT EXPORT]',
      ''
    ].join('\n');
  }
  function safeName(s) {
    return String(s || '채팅').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80);
  }
  function downloadTextFile(text, filename) {
    const blob = new Blob(['\uFEFF', text], { type:'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function guideUsername() {
    return ($('#guideUserName').value || localStorage.getItem(PREFIX + 'guideUserName') || '한서린').trim();
  }
  function mergeFile(file) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      alert('TXT가 100MB보다 큽니다. 파일을 나누어 주세요.');
      return;
    }
    file.text().then(t => {
      const output = combinedText(t, guideUsername());
      const base = (file.name || '리핀_채팅').replace(/\.txt$/i, '');
      downloadTextFile(output, safeName(base) + '_AI개체정리_' + modeSuffix() + '.txt');
      alert('지침과 채팅 내역을 한 개의 TXT로 합쳤습니다. 이 파일만 AI에게 전달하면 됩니다.');
    }).catch(err => alert('TXT 읽기에 실패했습니다: ' + err.message));
  }
  $('#guideMerge').onclick = () => $('#guideMergeInput').click();
  $('#guideMergeInput').onchange = e => {
    const file = e.target.files && e.target.files[0];
    mergeFile(file);
    e.target.value = '';
  };

  let exporting = false;
  async function autoCombinedExport() {
    if (exporting) return;
    exporting = true;
    const trigger = $('#guideOneClick');
    trigger.disabled = true;
    const originalText = trigger.textContent;
    trigger.textContent = '리핀 내보내기 연결 중…';
    const name = guideUsername();
    const selectedMode = guideMode();
    let restore = null;
    let captured = false;
    try {
      // Programmatic export may be initiated via a temporary <a download> click.
      // Hook only for the short duration of this explicitly requested action.
      const nativeClick = HTMLAnchorElement.prototype.click;
      let cancelTimeout;
      let onCapture;
      const capturePromise = new Promise((resolve, reject) => {
        onCapture = { resolve, reject };
      });
      // Prevent an unhandled rejection if native export controls are absent.
      capturePromise.catch(() => {});
      restore = () => {
        if (HTMLAnchorElement.prototype.click === hookedClick) HTMLAnchorElement.prototype.click = nativeClick;
        if (cancelTimeout) clearTimeout(cancelTimeout);
      };
      function hookedClick() {
        const downloadName = this.getAttribute('download') || '';
        const href = this.href || '';
        const resemblesExport = (/\.txt(\b|$)/i.test(downloadName) ||
          (downloadName && href.startsWith('blob:')) ||
          (href.startsWith('data:text/plain') && downloadName));
        if (resemblesExport && !captured) {
          captured = true;
          Promise.resolve().then(async () => {
            // Read only the browser-local download payload, not server-only data.
            const res = await fetch(href);
            if (!res.ok) throw new Error('내보내기 파일을 읽지 못함');
            const txt = await res.text();
            if (txt.length < 30) throw new Error('채팅 TXT 데이터가 비어 있음');
            onCapture.resolve({ txt, filename:downloadName });
          }).catch(onCapture.reject);
          return; // replace original site download with the combined TXT
        }
        return nativeClick.apply(this, arguments);
      }
      HTMLAnchorElement.prototype.click = hookedClick;
      cancelTimeout = setTimeout(() => onCapture.reject(new Error('리핀의 TXT 다운로드를 감지하지 못함')), 12000);

      // Close our overlays to avoid covering the native settings/export controls.
      $('#guideOverlay').classList.remove('show');
      $('#guideOverlay').setAttribute('aria-hidden', 'true');
      $('#mask').classList.remove('open');

      function locateExportButton() {
        return [...document.querySelectorAll('button,[role="button"],a')].find(el => {
          if (!visible(el) || el.closest('#repin-entity-manager-root')) return false;
          const t = textOf(el);
          return t === '채팅 내보내기' || t === '대화 내보내기' || t === '채팅 내보내기 TXT';
        });
      }
      let exportButton = locateExportButton();
      if (!exportButton) {
        const settingsButton = document.querySelector('#chatSettingsBtn');
        if (settingsButton && visible(settingsButton)) settingsButton.click();
        for (let i=0; i<20 && !exportButton; i++) {
          await wait(150);
          exportButton = locateExportButton();
        }
      }
      if (!exportButton) throw new Error('리핀의 ‘채팅 내보내기’ 버튼을 찾지 못했습니다. 설정 화면에서 TXT를 받은 뒤 ‘받은 TXT 합치기’를 이용하세요.');
      exportButton.click();
      const result = await capturePromise;
      const base = (result.filename || '리핀_전체대화').replace(/\.txt$/i,'');
      // Restore BEFORE creating our own download so we don't intercept ourselves.
      restore(); restore = null;
      downloadTextFile(combinedText(result.txt, name, selectedMode), safeName(base) + '_AI개체정리_' + (selectedMode === 'new' ? '새방시작' : '기존방유지') + '.txt');
      alert('완료: AI 지침 + 리핀 대화 내역을 한 개의 TXT로 저장했습니다.');
    } catch (err) {
      alert('원클릭 병합이 완료되지 않았습니다.\n' + err.message + '\n\n리핀에서 채팅 TXT를 받은 다음 매니저의 ‘받은 TXT 합치기’를 사용해 주세요.');
    } finally {
      if (restore) restore();
      exporting = false;
      trigger.disabled = false;
      trigger.textContent = originalText;
    }
  }
  $('#guideOneClick').onclick = autoCombinedExport;

  // ---------- Native UI integration (entity only) ----------
  const FIELD_LABELS = ['이름','유형','관계','복장','특성','알려진 사실'];

  function isControl(el) {
    return !!el && el.matches('input:not([type="hidden"]),textarea,select') && !el.disabled && visible(el);
  }

  function isAfter(a, b) {
    return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function findLabel(scope, label) {
    const matches = [...scope.querySelectorAll('label,span,div,p,strong,h4,h5')].filter(el => {
      if (!visible(el) || normalizeLabel(textOf(el)) !== normalizeLabel(label)) return false;
      return ![...el.children].some(ch => normalizeLabel(textOf(ch)) === normalizeLabel(label));
    });
    return matches.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0] || null;
  }

  function discoverEditor() {
    // 리핀 개체 수정창에는 '복장' 입력칸이 '관계'와 '특성' 사이에 있다.
    // 경계 레이블에 '복장'을 넣지 않으면 관계 입력칸이 둘로 집계되어
    // 기존 개체의 수정창이 아닌 것으로 오판할 수 있다.
    // 복장 필드는 보존하고 이번 매니저는 변경하지 않는다.
    // 추가창에서는 '복장' 및 '알려진 사실'이 생략될 수 있다.
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,div,span')].filter(el => {
      return visible(el) && /^개체\s*(수정|추가|등록|생성)$/.test(textOf(el)) && el.querySelectorAll('*').length < 4;
    });
    for (const heading of headings) {
      const isAdding = /추가|등록|생성/.test(textOf(heading));
      for (let p=heading, depth=0; p && depth<12; p=p.parentElement,depth++) {
        if(p.id==='repin-entity-manager-root')break;
        const controls=[...p.querySelectorAll('input,textarea,select')].filter(isControl);
        if(controls.length<3)continue;
        const anchors=FIELD_LABELS.map(label=>findLabel(p,label));
        if([0,1,2,4].some(i=>!anchors[i]))continue;
        if(!isAdding&&!anchors[5])continue;
        const fields={};
        for(let k=0;k<FIELD_LABELS.length;k++){
          if(!anchors[k]){fields[FIELD_LABELS[k]]=[];continue;}
          const end=anchors.slice(k+1).find(Boolean);
          fields[FIELD_LABELS[k]]=controls.filter(el=>isAfter(anchors[k],el)&&(!end||isAfter(el,end)));
        }
        if(fields['이름'].length===1&&fields['관계'].length===1){
          return {modal:p,heading,anchors,fields,isAdding};
        }
      }
    }
    return null;
  }

  function setNativeValue(el, value) {
    if (!el) return;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, String(value));
    else el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findLocalSection(anchor, fieldName) {
    let p = anchor;
    for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
      if (p.querySelectorAll('button').length && p.querySelectorAll('input,textarea').length && !FIELD_LABELS.some(x => x !== fieldName && !!findLabel(p, x))) {
        return p;
      }
    }
    return null;
  }

  function factsRows(editor) {
    return (editor.fields['알려진 사실'] || []).map(input => {
      let row = input.parentElement;
      for (let i = 0; i < 4 && row; i++, row = row.parentElement) {
        const ownInputs = [...row.querySelectorAll('input,textarea')].filter(visible);
        const buttons = [...row.querySelectorAll('button')].filter(visible);
        if (ownInputs.length === 1 && buttons.length === 1) {
          const b = buttons[0];
          const text = [b.getAttribute('aria-label'), b.title, textOf(b)].join(' ');
          const pathData = [...b.querySelectorAll('svg path')].map(x => x.getAttribute('d') || '').join(' ');
          const hasTrash = /삭제|제거|delete|remove|trash/i.test(text) || /M3 6|M4 7|M6 7|M9 3|M10 4|M5 7/.test(pathData);
          return { input, remove: hasTrash ? b : null };
        }
      }
      return { input, remove: null };
    });
  }

  function findFactsButtons(editor) {
    const label = editor.anchors[5];
    const section = (label ? findLocalSection(label, '알려진 사실') : null) || editor.modal;
    const buttons = [...section.querySelectorAll('button')].filter(visible);
    const addBtn = buttons.find(b => /사실\s*추가|추가\s*사실/i.test(textOf(b)) || /add.*fact/i.test([b.getAttribute('aria-label'), b.title].join(' ')));
    return { section, addBtn };
  }

  function describeEditor(editor) {
    if (!editor) return '개체 수정창을 찾지 못했습니다. 개체 수정 모달을 먼저 열어 주세요.';
    const lines = FIELD_LABELS.map(l => `${l}: 입력칸 ${editor.fields[l]?.length || 0}개`);
    lines.push(`이름 현재값: ${editor.fields['이름']?.[0]?.value || '(비어 있음)'}`);
    lines.push(`사실 추가 버튼: ${findFactsButtons(editor).addBtn ? '확인됨' : '찾지 못함'}`);
    return lines.join('\n');
  }

  $('#diagnoseBtn').onclick = () => alert('개체 수정창 진단\n\n' + describeEditor(discoverEditor()));

  async function applyToNative(entry, opts = {}) {
    const editor = discoverEditor();
    if (!editor) return { ok:false, reason:'개체 수정창을 찾지 못함' };
    const currentName = (editor.fields['이름'][0]?.value || '').trim();
    if (currentName !== entry.title) return { ok:false, reason:`열린 개체는 '${currentName || '(이름 없음)'}' 입니다. '${entry.title}' 수정창을 열어 주세요.` };
    if (!opts.quiet) {
      const ok = confirm(`'${entry.title}'의 관계 / 특성 / 알려진 사실을 교체할까요?\n리핀 저장 버튼은 직접 눌러 주세요.`);
      if (!ok) return { ok:false, reason:'사용자 취소' };
    }

    // 기존 관계가 있다면 보존하고, JSON 관계가 더 구체적인 경우에만 갱신.
    const currentRelation = editor.fields['관계'][0]?.value?.trim() || '';
    if (entry.relation && (opts.replaceRelation || !currentRelation || currentRelation === '본인, 사용자 캐릭터')) {
      setNativeValue(editor.fields['관계'][0], entry.relation);
    }

    const traitInput = editor.fields['특성']?.[0];
    if (traitInput) {
      const area = findLocalSection(editor.anchors[4], '특성');
      const existingText = area ? textOf(area) : '';
      for (const trait of entry.traits || []) {
        if (existingText.includes(trait)) continue;
        setNativeValue(traitInput, trait);
        traitInput.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true }));
        await wait(100);
      }
    }

    let fresh = discoverEditor();
    if (!fresh) return { ok:false, reason:'수정창이 사라짐' };
    let rows = factsRows(fresh);
    // 덮어쓰지 않고 원래 개체에 축적된 사실을 보존. 동일 문자열만 중복 제거.
    const oldFacts = opts.replaceFacts ? [] : rows.map(r => r.input.value.trim()).filter(Boolean);
    const mergedFacts = [...new Set([...oldFacts, ...(entry.facts || []).map(f => String(f).trim()).filter(Boolean)])];
    const targetCount = mergedFacts.length;

    if (rows.length > targetCount) {
      for (let i = rows.length - 1; i >= targetCount; i--) {
        fresh = discoverEditor();
        if (!fresh) return { ok:false, reason:'수정창이 사라짐' };
        rows = factsRows(fresh);
        if (rows.length <= targetCount) break;
        const row = rows[rows.length - 1];
        if (!row?.remove) return { ok:false, reason:'남는 알려진 사실 삭제 버튼을 찾지 못함' };
        const before = rows.length;
        row.remove.click();
        await wait(130);
        const after = (discoverEditor()?.fields['알려진 사실'] || []).length;
        if (after >= before) return { ok:false, reason:'알려진 사실 삭제 실패' };
      }
    }

    fresh = discoverEditor();
    if (!fresh) return { ok:false, reason:'수정창이 사라짐' };
    rows = factsRows(fresh);

    for (let i = 0; i < Math.min(targetCount, rows.length); i++) {
      setNativeValue(rows[i].input, mergedFacts[i]);
    }

    for (let i = rows.length; i < targetCount; i++) {
      fresh = discoverEditor();
      if (!fresh) return { ok:false, reason:'수정창이 사라짐' };
      const addBtn = findFactsButtons(fresh).addBtn;
      if (!addBtn) return { ok:false, reason:'알려진 사실 추가 버튼을 찾지 못함' };
      const before = fresh.fields['알려진 사실'].length;
      addBtn.click();
      await wait(140);
      const afterFields = discoverEditor()?.fields['알려진 사실'] || [];
      if (afterFields.length <= before) return { ok:false, reason:'알려진 사실 추가 실패' };
      setNativeValue(afterFields[before], mergedFacts[i]);
    }

    const verify = discoverEditor();
    if (!verify) return { ok:false, reason:'수정창이 사라짐' };
    const values = (verify.fields['알려진 사실'] || []).map(x => x.value.trim());
    if (values.length !== targetCount) return { ok:false, reason:'알려진 사실 개수 검증 실패' };
    for (let i = 0; i < targetCount; i++) {
      if (values[i] !== mergedFacts[i]) return { ok:false, reason:'알려진 사실 내용 검증 실패' };
    }
    return { ok:true };
  }

  function findNativeSave(editor) {
    if (!editor) return null;
    const candidates = [...editor.modal.querySelectorAll('button')]
      .filter(visible).filter(b => !b.disabled && /^(저장|수정 완료)$/.test(textOf(b)));
    return candidates.length === 1 ? candidates[0] : null;
  }

  async function saveNativeEditor(entry) {
    const editor = discoverEditor();
    if (!editor || editor.fields['이름']?.[0]?.value?.trim() !== entry.title)
      return { ok:false, reason:'다른 수정창이 열렸거나 이름 확인 실패' };
    const btn = findNativeSave(editor);
    if (!btn) return { ok:false, reason:'저장 버튼을 유일하게 식별하지 못함' };
    btn.click();
    for (let i = 0; i < 24; i++) {
      await wait(140);
      if (!discoverEditor()) {
        // Modal closing is not proof of a committed server write.
        return { ok:true };
      }
    }
    return { ok:false, reason:'저장 후 수정창이 닫히지 않음 (검증 불가)' };
  }

  // 실제 이름 표시 여부와 수정 아이콘 식별을 분리한다.
  // 수정 아이콘을 못 찾았다는 이유만으로 '미등록' 처리하지 않는다.
  function exactNativeNameNodes(name) {
    const scope = document.querySelector('#memoryContent');
    if (!scope) return [];
    const target = String(name).replace(/\s+/g, ' ').trim();
    return [...scope.querySelectorAll('div,span,strong,h3,h4,h5,b,p')].filter(el => {
      if (!visible(el) || textOf(el) !== target) return false;
      return ![...el.children].some(ch => textOf(ch) === target);
    });
  }
  function nativeCardFor(name) {
    const scope = document.querySelector('#memoryContent');
    if (!scope) return null;
    const nodes = exactNativeNameNodes(name);
    for (const node of nodes) {
      for (let p = node.parentElement, depth = 0; p && p !== scope && depth < 8; p = p.parentElement, depth++) {
        if (p.querySelectorAll('input,textarea').length) break;
        const buttons = [...p.querySelectorAll('button')].filter(visible);
        if (buttons.length < 1 || buttons.length > 6) continue;
        const editBtn = buttons.find(b => {
          const info = [b.getAttribute('aria-label'), b.title, b.getAttribute('data-action'), textOf(b)].join(' ');
          const pathData = [...b.querySelectorAll('svg path')].map(x => x.getAttribute('d') || '').join(' ');
          return /수정|편집|edit/i.test(info) || (/M12 20|M16 5|M4 20|M3 17/i.test(pathData) && !/삭제|trash|remove|delete/i.test(info));
        });
        if (editBtn) return { card: p, editBtn };
      }
    }
    return null;
  }
  // 동명이인 감지: 이름 텍스트에 가까운 개별 카드의 수정 버튼을 기준으로 유일성 확인.
  // 화면에 이름이 여러 번 중첩되어 출력되어도 동일 수정 버튼이면 같은 카드로 간주.
  function nativeCardsByName(name) {
    const scope=document.querySelector('#memoryContent');
    if(!scope)return [];
    const found=new Map();
    const nodes=exactNativeNameNodes(name);
    for(const node of nodes){
      for(let p=node.parentElement, depth=0; p&&p!==scope&&depth<9; p=p.parentElement,depth++){
        if(p.querySelectorAll('input,textarea').length)break;
        const buttons=[...p.querySelectorAll('button')].filter(visible);
        if(buttons.length<1||buttons.length>6)continue;
        const editBtn=buttons.find(b=>{
          const info=[b.getAttribute('aria-label'),b.title,b.getAttribute('data-action'),textOf(b)].join(' ');
          const path=[...b.querySelectorAll('svg path')].map(x=>x.getAttribute('d')||'').join(' ');
          return /수정|편집|edit/i.test(info)||(/M12 20|M16 5|M4 20|M3 17/i.test(path)&&!/삭제|trash|remove|delete/i.test(info));
        });
        if(editBtn){
          if(!found.has(editBtn)){
            // 헤더에는 턴이 없고 카드 하단 배지에만 T.002가 있으므로
            // 동일한 개체 카드 범위 안에서 턴 표시를 찾는다.
            let owner=p, turnMatch=textOf(owner).match(/T\.?\s*(\d+)/i);
            for(let j=0;!turnMatch&&j<5&&owner.parentElement&&owner.parentElement!==scope;j++){
              const parent=owner.parentElement;
              const otherNames=[...parent.querySelectorAll('div,span,strong,h3,h4,h5,b,p')].filter(el=>visible(el)&&textOf(el)===name);
              if(otherNames.length>1)break;
              owner=parent;turnMatch=textOf(owner).match(/T\.?\s*(\d+)/i);
            }
            found.set(editBtn,{card:owner,editBtn,turn:turnMatch?Number(turnMatch[1]):null});
          }
          break;
        }
      }
    }
    return [...found.values()];
  }
  function cancelCurrentEditor(){
    const ed=discoverEditor();
    if(!ed)return true;
    const b=[...ed.modal.querySelectorAll('button')].find(b=>visible(b)&&/^취소$/.test(textOf(b)));
    if(!b)return false;
    b.click();return true;
  }
  async function readNativeEntityCard(record, name){
    record.editBtn.click();
    const ed=await waitEditor(name);
    if(!ed||ed.isAdding)throw Error(name+': 기존 개체 수정창을 찾지 못함');
    const facts=(ed.fields['알려진 사실']||[]).map(x=>x.value.trim()).filter(Boolean);
    const relation=ed.fields['관계']?.[0]?.value?.trim()||'';
    if(!cancelCurrentEditor())throw Error('수정창을 안전하게 닫지 못함');
    await wait(230);
    return {facts,relation};
  }
  async function mergeSameName(name){
    if(batchRunning)return;
    const target=data.entity.find(x=>x.title.trim()===name);
    if(!target) return alert(`현재 JSON에 '${name}' 항목이 없습니다. 먼저 JSON을 가져와 주세요.`);
    try{
      await selectEntityTab(); await exhaustEntityList();
      const cards=nativeCardsByName(name);
      if(cards.length!==2)return alert(`${name}: 현재 확인된 카드 ${cards.length}개입니다. 정확히 2개가 확인될 때만 안전 병합을 실행합니다.`);
      if(cards.some(c=>c.turn==null)||cards[0].turn===cards[1].turn)return alert('카드 생성 턴을 구분할 수 없어 자동 병합을 중단합니다.');
      cards.sort((a,b)=>a.turn-b.turn);
      if(!confirm(`${name} 중복 개체 2개 확인\n원본: T.${cards[0].turn} (보존)\n신규: T.${cards[1].turn} (병합 후 제거)\n\n두 카드의 알려진 사실과 JSON을 하나로 합쳐 원본에 저장합니다. 먼저 리핀 데이터를 백업해 주세요.`))return;
      batchRunning=true;stopRequested=false;
      $('#mask').classList.remove('open');
      const original=await readNativeEntityCard(cards[0],name);
      const duplicate=await readNativeEntityCard(cards[1],name);
      const mergedFacts=[...new Set([...original.facts,...duplicate.facts,...target.facts].map(s=>String(s).trim()).filter(Boolean))];
      const merged={...target,relation:original.relation||target.relation, facts:mergedFacts};
      const first=nativeCardsByName(name).find(c=>c.turn===cards[0].turn);
      if(!first)throw Error('원본 개체를 다시 찾지 못함');
      first.editBtn.click();
      if(!await waitEditor(name))throw Error('원본 수정창을 열지 못함');
      const filled=await applyToNative(merged,{quiet:true,replaceFacts:true});
      if(!filled.ok)throw Error('원본 반영 실패: '+filled.reason);
      const saved=await saveNativeEditor(merged);
      if(!saved.ok)throw Error('원본 저장 실패: '+saved.reason);
      await wait(500);
      const originalAfter=nativeCardsByName(name).find(c=>c.turn===cards[0].turn);
      if(!originalAfter)throw Error('저장 후 원본 확인 실패; 중복 개체는 삭제하지 않음');
      const verified=await readNativeEntityCard(originalAfter,name);
      if(mergedFacts.some(f=>!verified.facts.includes(f)))throw Error('원본에 사실이 모두 저장됐는지 확인할 수 없음; 중복 개체는 삭제하지 않음');
      // 자동 삭제는 중복 카드의 삭제 버튼을 유일하게 찾은 경우에만 수행.
      const extra=nativeCardsByName(name).find(c=>c.turn===cards[1].turn);
      if(!extra)throw Error('신규 중복 카드가 이미 보이지 않음. 원본 병합은 완료됨');
      const deleteButtons=[...extra.card.querySelectorAll('button')].filter(b=>visible(b)&&b!==extra.editBtn).filter(b=>{
        const info=[b.title,b.getAttribute('aria-label'),textOf(b)].join(' ');
        const paths=[...b.querySelectorAll('svg path')].map(x=>x.getAttribute('d')||'').join(' ');
        return /삭제|delete|trash|remove/i.test(info)||/M3 6|M4 7|M6 7|M9 3|M10 4/.test(paths);
      });
      if(deleteButtons.length!==1){
        alert(`${name}: 원본 T.${cards[0].turn}에 특성·사실 병합을 마쳤습니다. 삭제 버튼을 확실하게 식별할 수 없어 T.${cards[1].turn} 카드 삭제는 진행하지 않았습니다.`);
        return;
      }
      if(!confirm(`${name} 원본 T.${cards[0].turn}의 저장과 사실 검증이 완료됐습니다.\n이제 중복 T.${cards[1].turn}을 삭제할까요?`))return;
      deleteButtons[0].click();
      await wait(450);
      const remaining=nativeCardsByName(name);
      alert(remaining.length===1?`${name}: 원본으로 병합하고 중복 카드를 제거했습니다. 새로고침 후 확인해 주세요.`:`${name}: 원본 병합 완료. 삭제 확인이 필요합니다 (현재 카드 ${remaining.length}개).`);
    }catch(e){alert('자동 병합 중단: '+e.message+'\n원본/중복 카드의 삭제를 추가로 실행하지 않습니다.');}
    finally{batchRunning=false;}
  }
  $('#mergeDuplicateBtn').onclick=()=>{
    const names=data.entity.map(x=>x.title).filter(Boolean);
    const name=prompt('병합할 중복 개체 이름을 입력해 주세요.\n예: 한여울',names.includes('한여울')?'한여울':'');
    if(name?.trim())mergeSameName(name.trim());
  };
  // 등록 시도 뒤 목록에 늦게 반영되는 경우, 새로고침/재실행으로
  // 중복 생성하지 않도록 해당 방의 시도 이력을 보존한다.
  const attemptedStorageKey = () => PREFIX + 'add_attempts_' + room + '_' + location.pathname;
  const readAttempts = () => { try { return JSON.parse(localStorage.getItem(attemptedStorageKey()) || '{}'); } catch { return {}; } };
  function markAttempt(name) { const x=readAttempts(); x[name]=new Date().toISOString(); localStorage.setItem(attemptedStorageKey(),JSON.stringify(x)); }
  function unmarkAttempt(name) { const x=readAttempts(); delete x[name]; localStorage.setItem(attemptedStorageKey(),JSON.stringify(x)); }

  // 이전 생성 시도가 남은 경우, 실제 개체 목록을 확인한 뒤
  // 사용자 확인을 받아 해당 이름의 보호 기록만 해제한다.
  // 기존 개체나 다른 이름의 생성 기록, JSON은 변경하지 않는다.
  async function recoverAttemptRecord() {
    if(batchRunning)return alert('동기화/병합 작업이 진행 중입니다. 먼저 작업을 끝내 주세요.');
    const attempts=readAttempts();
    const names=Object.keys(attempts).filter(n=>attempts[n]);
    if(!names.length)return alert('현재 보관함과 채팅 주소에 남아 있는 생성 시도 기록이 없습니다.');
    const suggested=names.includes('한여울')?'한여울':names[0];
    const name=prompt('복구할 생성 시도 기록의 이름을 입력해 주세요.\n\n기록된 이름: '+names.join(', ')+'\n\n※ 리핀 서버의 개체는 삭제하거나 수정하지 않습니다.',suggested)?.trim();
    if(!name)return;
    if(!Object.prototype.hasOwnProperty.call(attempts,name))return alert('해당 이름의 생성 시도 기록이 없습니다.');
    if(discoverEditor())return alert('리핀 개체 추가/수정창을 먼저 닫고 다시 실행해 주세요.');
    try{
      await selectEntityTab();
      if(!document.querySelector('#memoryContent'))throw Error('개체 목록을 찾지 못했습니다.');
      await exhaustEntityList();
      if(exactNativeNameNodes(name).length||nativeCardsByName(name).length)
        return alert("'"+name+"' 개체가 현재 리핀 목록에 있습니다.\n중복 생성을 막기 위해 기록을 해제하지 않았습니다.");
      const ok=confirm("'"+name+"'은 현재 표시된 개체 목록에서 확인되지 않습니다.\n\n이전에 남아 있던 생성 시도 기록 ("+attempts[name]+")만 해제할까요?\n\n※ 서버 반영이 지연되었거나 목록에 로드되지 않은 개체는 감지하지 못할 수 있습니다. 리핀 페이지를 새로고침하여 목록을 확인한 뒤 진행하는 것을 권장합니다.\n※ 개체 데이터와 리핀의 다른 기록은 삭제하지 않습니다.");
      if(!ok)return;
      unmarkAttempt(name);
      alert("'"+name+"'의 이전 생성 시도 기록을 해제했습니다.\n\n리핀에 동일 이름의 카드가 없는 것을 다시 확인한 뒤 개체 일괄 동기화를 실행하세요.");
    }catch(err){
      alert('생성 시도 기록을 해제하지 않았습니다.\n사유: '+err.message);
    }
  }
  $('#recoverAttemptsBtn').onclick=recoverAttemptRecord;

  // 신규 개체는 리핀 공개 UI의 '+' 버튼과 편집창만 사용합니다.
  // 저장 확인 실패 시 중단하며, 확인되지 않은 객체를 연속 생성하지 않습니다.
  const entryByName = name => data.entity.find(e => e.title === name);
  const entityTab = () => document.querySelector('#memoryPanel .memory-tab[data-tab="entity"]');
  async function selectEntityTab() {
    const tab = entityTab();
    if (!tab || !visible(tab)) throw Error('기억 패널에서 개체 탭을 먼저 열어 주세요.');
    if (!tab.classList.contains('active')) { tab.click(); await wait(350); }
    return tab;
  }
  async function waitEditor(expectedName=null, attempts=24) {
    for (let i=0;i<attempts;i++) {
      const editor=discoverEditor();
      if (editor && (expectedName===null || editor.fields['이름']?.[0]?.value?.trim()===expectedName)) return editor;
      await wait(130);
    }
    return null;
  }
  function nativeLoadMoreButton() {
    const scope=document.querySelector('#memoryContent');
    if(!scope)return null;
    return [...scope.querySelectorAll('button')].find(b=>visible(b)&&!b.disabled&&/^(더\s*보기|더\s*불러오기|더\s*로드|더보기)$/i.test(textOf(b)));
  }
  async function exhaustEntityList() {
    // 가상 목록 / 서버 페이지네이션 때문에 일부 인물만 보일 수 있음.
    // 더보기 버튼이 존재하면 최대 80회 확장해 확인.
    for(let i=0;i<80;i++) {
      if(stopRequested) throw Error('작업 중단');
      const more=nativeLoadMoreButton();
      if(!more)return;
      const before=document.querySelector('#memoryContent')?.textContent?.length||0;
      more.click(); await wait(250);
      const after=document.querySelector('#memoryContent')?.textContent?.length||0;
      if(after<=before)throw Error('더보기 결과를 확인하지 못했습니다. 중복 생성을 방지하기 위해 중단합니다.');
    }
    if(nativeLoadMoreButton())throw Error('개체 목록 전체를 아직 확인하지 못했습니다.');
  }
  function editorHeading(editor) { return textOf(editor?.heading||null); }
  async function openNativeAddEditor() {
    if(discoverEditor())return {ok:false,reason:'다른 개체 수정창이 열려 있습니다. 먼저 닫아 주세요.'};
    const fab=document.querySelector('#memoryFab');
    if(!fab||!visible(fab)||fab.disabled)return {ok:false,reason:'개체 추가(+) 버튼을 찾을 수 없습니다.'};
    fab.click();
    const editor=await waitEditor(null);
    if(!editor)return {ok:false,reason:'개체 추가창을 찾지 못했습니다.'};
    if(!/추가|등록|생성/.test(editorHeading(editor)))return {ok:false,reason:'추가창 대신 수정창이 열려 중단했습니다.'};
    if((editor.fields['이름']?.[0]?.value||'').trim())return {ok:false,reason:'새 개체 입력칸에 이미 이름이 있습니다.'};
    return {ok:true,editor};
  }
  async function fillNewNative(entry) {
    if (exactNativeNameNodes(entry.title).length) return {ok:false,reason:'목록에 같은 이름이 있어 신규 등록 중단'};
    const opened=await openNativeAddEditor();
    if(!opened.ok)return opened;
    let editor=opened.editor;
    const name=editor.fields['이름']?.[0];
    const relation=editor.fields['관계']?.[0];
    if(!name||!relation)return {ok:false,reason:'이름 또는 관계 입력칸 미발견'};
    setNativeValue(name,entry.title);
    setNativeValue(relation,entry.relation||'');
    if(name.value.trim()!==entry.title)return {ok:false,reason:'신규 이름 입력 검증 실패'};
    // 신규 폼은 알려진 사실이 없는 간단한 창이다. 먼저 생성한 뒤 수정창에서 사실을 추가한다.
    const traitInput=editor.fields['특성']?.[0];
    if((entry.traits||[]).length&&!traitInput)return {ok:false,reason:'특성 입력칸 미발견'};
    if(traitInput){
      for(const trait of entry.traits||[]){
        setNativeValue(traitInput,trait);
        traitInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
        await wait(130);
      }
    }
    editor=discoverEditor();
    if(!editor||!editor.isAdding||editor.fields['이름'][0]?.value.trim()!==entry.title)
      return {ok:false,reason:'신규 개체 추가창/이름 검증 실패'};
    const buttons=[...editor.modal.querySelectorAll('button')].filter(b=>visible(b)&&!b.disabled&&/^(추가|저장|등록|생성|완료|개체 추가)$/.test(textOf(b)));
    if(buttons.length!==1)return {ok:false,reason:'개체 추가 버튼을 유일하게 식별하지 못함'};
    buttons[0].click();
    let closed=false;
    for(let i=0;i<24;i++){
      await wait(160);
      if(!discoverEditor()){closed=true;break;}
    }
    if(!closed)return {ok:false,reason:'개체 추가 버튼 클릭 후 창이 닫히지 않음'};
    await wait(480);
    let card=nativeCardFor(entry.title);
    if(!card){
      // 카드가 아직 목록에 없으면 자동 재시도/중복 생성하지 않는다.
      return {ok:false,reason:`'${entry.title}' 생성창은 닫혔지만 새 카드가 확인되지 않음. 새로고침 후 중복 여부 확인 필요`};
    }
    // 생성 후 정식 수정창을 열어 알려진 사실까지 반영한다.
    card.editBtn.click();
    editor=await waitEditor(entry.title);
    if(!editor)return {ok:false,reason:'신규 생성 후 수정창 미발견. 개체가 생성됐을 수 있으니 재추가 금지'};
    const filled=await applyToNative(entry,{quiet:true});
    if(!filled.ok)return {ok:false,reason:'신규 생성 후 내용 입력 실패: '+filled.reason+' (재추가 금지)'};
    const saved=await saveNativeEditor(entry);
    if(!saved.ok)return {ok:false,reason:'신규 생성 후 수정 저장 실패: '+saved.reason+' (재추가 금지)'};
    await wait(280);
    return {ok:true};
  }

  async function batchReplaceEntities() {
    if(batchRunning)return;
    if(!data.entity.length)return alert('개체 데이터가 없습니다.');
    const duplicates=data.entity.map(e=>e.title.trim()).filter((v,i,a)=>v&&a.indexOf(v)!==i);
    if(duplicates.length)return alert('JSON에 동일한 이름이 중복됩니다: '+[...new Set(duplicates)].join(', '));
    await selectEntityTab().catch(err=>{alert(err.message);});
    if(!entityTab()?.classList.contains('active'))return;
    if(!confirm(`개체 ${data.entity.length}명을 동기화합니다.\n\n기존 인물: 수정 및 자동 저장\n미등록 인물: 새 개체 추가 및 자동 저장\n\n리핀 기억을 먼저 백업해 주세요. 저장 결과가 확인되지 않으면 중단합니다.`))return;
    batchRunning=true;stopRequested=false;
    $('#stopBtn').classList.remove('hidden');
    $('#mask').classList.remove('open');
    let edited=0,created=0,issue='';
    try{
      await exhaustEntityList();
      for(const entry of data.entity){
        if(stopRequested){issue='사용자가 중단함';break;}
        const cards=nativeCardsByName(entry.title);
        if(cards.length>1){issue=entry.title+': 동명이인 카드가 '+cards.length+'개입니다. [동명 개체 병합]을 먼저 사용해 주세요.';break;}
        const matches=exactNativeNameNodes(entry.title);
        let card=cards[0]||nativeCardFor(entry.title);
        if(matches.length && !card){issue=entry.title+': 이미 목록에 이름이 있지만 수정 버튼을 찾지 못함. 신규 등록하지 않음';break;}
        if(card){
          card.editBtn.click();
          const editor=await waitEditor(entry.title);
          if(!editor){issue=entry.title+': 기존 수정창 인식 실패';break;}
          const filled=await applyToNative(entry,{quiet:true});
          if(!filled.ok){issue=entry.title+': '+filled.reason;break;}
          const saved=await saveNativeEditor(entry);
          if(!saved.ok){issue=entry.title+': '+saved.reason;break;}
          await wait(260);
          if(nativeCardsByName(entry.title).length!==1){issue=entry.title+': 저장 후 개체 유일성을 확인하지 못함';break;}
          unmarkAttempt(entry.title);
          edited++;
        }else{
          // 목록 전체가 표시되었는지 다시 확인한 후 추가.
          // 생성 시도 이력이 있는데 카드가 안 보인다면 재생성을 절대 하지 않는다.
          await exhaustEntityList();
          const names=exactNativeNameNodes(entry.title);
          if(names.length||nativeCardsByName(entry.title).length){issue=entry.title+': 이미 목록에 이름이 존재함. 신규 등록 금지';break;}
          // 이전 생성 시도 기록은 '서버 등록 완료'의 증거가 아니다.
          // 완전한 목록 확인 후에도 이름이 없으면 명시적 확인을 받아 같은 실행에서 재시도한다.
          const attempts=readAttempts();
          if(attempts[entry.title]){
            // 이전 저장 요청이 뒤늦게 반영될 가능성을 한 번 더 확인한다.
            await wait(600);
            await exhaustEntityList();
            const found=exactNativeNameNodes(entry.title).length||nativeCardsByName(entry.title).length;
            if(found){
              issue=entry.title+': 이전 시도 후 리핀 목록에 개체가 나타났습니다. 중복 생성을 방지하기 위해 중단합니다.';break;
            }
            const approved=confirm(
              "'"+entry.title+"'의 이전 생성 시도 기록이 남아 있습니다.\\n"+
              "기록 시각: "+attempts[entry.title]+"\\n\\n"+
              "현재 로드된 리핀 개체 목록에는 같은 이름이 없습니다.\\n"+
              "이름이 실제로 삭제된 것을 확인했다면 기록을 해제하고 신규 등록을 재시도할까요?\\n\\n"+
              "취소하면 아무 것도 추가하지 않습니다."
            );
            if(!approved){issue=entry.title+': 사용자가 이전 생성 시도 기록 해제/재등록을 취소함';break;}
            // 확인 후 목록에 다시 나타난 경우에는 절대 생성하지 않는다.
            await exhaustEntityList();
            if(exactNativeNameNodes(entry.title).length||nativeCardsByName(entry.title).length){
              issue=entry.title+': 재확인 중 동일 이름이 발견되어 신규 생성을 중단함';break;
            }
            unmarkAttempt(entry.title);
          }
          markAttempt(entry.title);
          const result=await fillNewNative(entry);
          if(!result.ok){issue=entry.title+': '+result.reason;break;}
          unmarkAttempt(entry.title);
          created++;
        }
        await wait(250);
      }
    }catch(err){issue=err.message;}
    finally{batchRunning=false;$('#stopBtn').classList.add('hidden');}
    alert(`처리 결과\n기존 개체 수정: ${edited}명\n신규 개체 추가: ${created}명\n합계: ${edited+created}/${data.entity.length}명\n${issue?'중단 사유: '+issue:'전체 목록 처리 완료'}\n\n※ 화면상 저장을 확인한 수치입니다. 리핀 서버 최종 반영은 새로고침 후 확인하세요.`);
  }

  $('#batchBtn').onclick = batchReplaceEntities;
  $('#stopBtn').onclick = () => { stopRequested = true; alert('현재 단계가 끝나면 중단합니다.'); };

  // ---------- Trigger: immediately beside the actual chat profile / seal chip ----------
  const triggerFallback = $('#triggerFallback');
  let inlineTrigger = null;
  let memoryTrigger = null;
  function openManager(){
    syncAutoRoom();
    $('#mask').classList.add('open');
    render();
  }
  function mountMemoryTrigger(){
    // The native memory bottom-sheet covers the chat-input toolbar; put a second
    // launcher inside its own sheet so it remains clickable at all times.
    const sheet = document.querySelector('#memoryPanel .ps-sheet');
    if (!sheet) {
      if (memoryTrigger?.isConnected) memoryTrigger.remove();
      return;
    }
    if (!memoryTrigger) {
      memoryTrigger = document.createElement('button');
      memoryTrigger.type = 'button';
      memoryTrigger.id = 'remMemorySheetLauncher';
      memoryTrigger.textContent = '개체 관리';
      memoryTrigger.setAttribute('aria-label', '개체 관리 패널 열기');
      memoryTrigger.style.cssText = [
        'position:absolute','top:12px','right:14px','z-index:1005',
        'border:1px solid rgba(255,255,255,.16)',
        'border-radius:999px','background:#191b24','color:#f0f1f8',
        'padding:9px 13px','font:600 12px/1.2 Pretendard,system-ui,sans-serif',
        'box-shadow:0 3px 12px rgba(0,0,0,.24)','cursor:pointer'
      ].join(';');
      memoryTrigger.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation(); openManager();
      });
    }
    if (memoryTrigger.parentElement !== sheet) sheet.appendChild(memoryTrigger);
  }

  let previousUrl = location.href;
  function makeInlineTrigger() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '개체 관리';
    btn.title = 'Repin Entity Manager';
    btn.style.cssText = [
      'border:1px solid rgba(255,255,255,.12)',
      'background:linear-gradient(135deg,#333846,#171a23)',
      'color:#f3f4f8','border-radius:999px','padding:7px 10px',
      'font:600 12px/1 Pretendard,system-ui,sans-serif',
      'box-shadow:0 5px 14px rgba(0,0,0,.25)','cursor:pointer','white-space:nowrap'
    ].join(';');
    btn.onclick = openManager;
    return btn;
  }
  function mountTrigger() {
    mountMemoryTrigger();
    if (!inlineTrigger) inlineTrigger = makeInlineTrigger();
    const chip = document.querySelector('#chatProfileChip');
    const row = chip?.parentElement;
    if (chip && row && visible(chip)) {
      if (inlineTrigger.parentElement !== row || inlineTrigger.previousElementSibling !== chip)
        chip.insertAdjacentElement('afterend', inlineTrigger);
      triggerFallback.style.display = 'none';
    } else {
      if (inlineTrigger.isConnected) inlineTrigger.remove();
      triggerFallback.style.display = 'block';
    }
  }
  // Check only one known node rather than observing every chat message mutation.
  setInterval(() => {
    if (location.href !== previousUrl) { previousUrl = location.href; lastChatSignature = ''; }
    mountTrigger(); syncAutoRoom();
  }, 1800);
  setTimeout(mountTrigger, 450);
  setTimeout(mountTrigger, 1300);
  render();
})();