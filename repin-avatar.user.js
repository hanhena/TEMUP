// ==UserScript==
// @name         RE:PIN 인장 커스터마이저 · 대본-개편 (PC/모바일)
// @namespace    https://repin.chat/
// @version      1.8.4
// @description  대본-개편 사각 인장 · 모바일 성능 개선 · 공용 인장 보관함 · 백업 JSON (PC/모바일).
// @homepageURL   https://github.com/hanhena/TEMUP
// @updateURL     https://raw.githubusercontent.com/hanhena/TEMUP/main/repin-avatar.user.js
// @downloadURL   https://raw.githubusercontent.com/hanhena/TEMUP/main/repin-avatar.user.js
// @match        https://repin.chat/*
// @match        https://*.repin.chat/*
// @match        https://litychat.com/*
// @match        https://*.litychat.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  // Do not run two Tampermonkey copies in the same page.
  if (window.__repinTampermonkeyV18Loaded) return;
  window.__repinTampermonkeyV18Loaded = true;

  const KEYS = ['repinAvatarSwitcher_v1','repinScriptTheme_v1','repinNativePortraitCache_v1'];
  const bottomMenuTheme = {isEnabled:null, toggle:null, isGlobal:null, toggleGlobal:null};
  const BACKUP_FORMAT = 'repin-avatar-switcher-backup';
  const callbacks = new Set();
  const messageHandlers = new Set();
  const notify = (key, value) => {
    const changes = {[key]: {newValue: value}};
    for (const fn of callbacks) {
      try {fn(changes,'local');} catch (e) {console.warn('[RE:PIN TM] 갱신 알림 실패', e);}
    }
  };
  // This lexical adapter reuses the exact PC extension logic without using
  // Chrome's extension API; it writes to Tampermonkey's private local storage.
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          const list = typeof keys === 'string' ? [keys]
            : Array.isArray(keys) ? keys
            : keys && typeof keys === 'object' ? Object.keys(keys) : KEYS;
          const result = {};
          for (const key of list) {
            const defaultValue = keys && typeof keys === 'object' && !Array.isArray(keys) ? keys[key] : undefined;
            const stored = GM_getValue(key, defaultValue);
            if (stored !== undefined) result[key] = stored;
          }
          return result;
        },
        async set(values) {
          for (const [key,value] of Object.entries(values)) {
            GM_setValue(key,value);
            notify(key,value);
          }
        }
      },
      onChanged: {addListener(callback) {callbacks.add(callback);}}
    },
    runtime: {onMessage: {addListener(callback) {messageHandlers.add(callback);}}}
  };

  function sendCommand(command) {
    if (!document.getElementById('chatOverlay')) {
      alert('리핀 채팅 화면을 열고 다시 시도해 주세요.');
      return;
    }
    const message = {source:'repin-avatar-popup',command};
    for (const fn of messageHandlers) {
      try {fn(message,{},()=>{});} catch(e) {console.error('[RE:PIN TM] 메뉴 실행 실패',e);}
    }
  }
  function downloadJSON(name,value) {
    const file = new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(file);
    const a=document.createElement('a');
    a.href=url;
    a.download=name;
    document.documentElement.appendChild(a);
    a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),15000);
  }
  async function exportBackup() {
    const data = await chrome.storage.local.get(KEYS);
    const backup = {format:BACKUP_FORMAT,version:1,createdAt:new Date().toISOString(),data};
    downloadJSON('REPIN_인장설정_백업.json',backup);
    return true;
  }
  function normalizeBackup(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('JSON 파일의 구조가 올바르지 않습니다.');
    if (raw.format && raw.format !== BACKUP_FORMAT) throw new Error('지원하지 않는 백업 형식입니다.');
    const data = raw.format === BACKUP_FORMAT ? raw.data
      : raw.data && typeof raw.data === 'object' && KEYS.some(k=>raw.data[k]) ? raw.data
      : raw;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('리핀 백업 데이터가 없습니다.');
    const valid = {};
    for (const key of KEYS) {
      const item = data[key];
      if (item == null) continue;
      if (!item || typeof item !== 'object' || Array.isArray(item) ||
          !item.works || typeof item.works !== 'object' || Array.isArray(item.works)) {
        throw new Error(`백업의 ${key} 항목이 손상되었습니다.`);
      }
      valid[key]=item;
    }
    if (!Object.keys(valid).length) throw new Error('리핀 인장 설정 JSON이 아닙니다.');
    return valid;
  }
  function includeCurrentDomainAliases(settings) {
    // Work keys contain the site's origin. PC/phone may use the two RE:PIN
    // hostnames interchangeably. Copy matching work settings to this site,
    // without removing the originals or overwriting an existing exact match.
    const current=location.origin;
    if (!/^https:\/\/(?:[a-z0-9-]+\.)?(?:repin\.chat|litychat\.com)$/i.test(current)) return settings;
    for (const item of Object.values(settings)) {
      if (!item.works || typeof item.works !== 'object') continue;
      for (const [key,value] of Object.entries(item.works)) {
        const boundary=key.indexOf('::');
        if (boundary < 1) continue;
        const from=key.slice(0,boundary);
        const title=key.slice(boundary+2);
        if (!/^https:\/\/(?:[a-z0-9-]+\.)?(?:repin\.chat|litychat\.com)$/i.test(from) || !title) continue;
        const alias=`${current}::${title}`;
        if (!Object.prototype.hasOwnProperty.call(item.works,alias)) item.works[alias]=value;
      }
    }
    return settings;
  }
  async function importBackupFile(file) {
    if (!file) return false;
    if (file.size > 50*1024*1024) throw new Error('백업 JSON은 50MB 이하만 가져올 수 있습니다.');
    const parsed=JSON.parse(await file.text());
    const settings=includeCurrentDomainAliases(normalizeBackup(parsed));
    const sections=Object.keys(settings).length;
    if(!confirm(`PC 확장프로그램 백업의 ${sections}개 설정 항목을 가져올까요? 동일한 항목은 현재 템퍼몽키 설정을 덮어씁니다.`))return false;
    await chrome.storage.local.set(settings);
    return true;
  }
  function importBackupPicker() {
    const picker=document.createElement('input');
    picker.type='file';picker.accept='.json,application/json';picker.style.display='none';
    document.documentElement.appendChild(picker);
    picker.addEventListener('change',async()=>{
      try {
        const ok=await importBackupFile(picker.files?.[0]);
        if(ok){alert('리핀 인장 설정을 불러왔습니다. 대화 화면에 바로 반영됩니다.');}
      }catch(e){alert('백업 가져오기 실패: '+(e?.message||String(e)));}
      finally{picker.remove();}
    },{once:true});
    picker.click();
  }
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('RE:PIN · 인장 설정 열기',()=>sendCommand('OPEN_SETTINGS'));
    GM_registerMenuCommand('RE:PIN · 대화에서 인장 선택',()=>sendCommand('PICK_AVATAR'));
    GM_registerMenuCommand('RE:PIN · 설정 백업 다운로드',()=>{exportBackup().catch(e=>alert(e.message));});
    GM_registerMenuCommand('RE:PIN · PC 백업 JSON 가져오기',importBackupPicker);
  }
  if (typeof GM_addValueChangeListener === 'function') {
    for (const key of KEYS) {
      try {GM_addValueChangeListener(key, (_key,_old,value,remote)=>{if(remote) notify(key,value);});}
      catch(e){console.warn('[RE:PIN TM] 다른 탭 데이터 변경 감지 실패',e);}
    }
  }

(() => {
  'use strict';
  if (window.__repinAvatarSwitcherLoaded) return;
  window.__repinAvatarSwitcherLoaded = true;

  const STORE_KEY = 'repinAvatarSwitcher_v1';
  const DEFAULT_DB = {works:{}};
  const MAX_NAME = 40;
  const AVATAR_SELECTOR = '[class*="avatar" i], [class*="portrait" i], [class*="profile-image" i], [data-avatar]';
  const NAME_SELECTOR = [
    '.message-sender', '.message-name', '.speaker-name', '.character-name',
    '.sender-name', '.avatar-name', '.name-label', '.message-author',
    '[class*="speaker-name" i]', '[class*="sender-name" i]',
    '[class*="character-name" i]', '[class*="message-name" i]',
    '[class*="author-name" i]', '[data-speaker]', '[data-character-name]'
  ].join(',');

  let db = structuredClone(DEFAULT_DB);
  let ready = false, updateScheduled = false, scanning = false, picking = false;
  let avatarTimer = null;
  const mobilePerformanceMode = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || matchMedia('(pointer:coarse)').matches;
  let panelOpen = false, formImage = null, pickFingerprint = null, pendingCropObjectUrl = null, cropImageNatural = null;
  let cropState = { scale: 1, minScale: 1, maxScale: 4, x: 0, y: 0, dragging: false, dragStartX: 0, dragStartY: 0, startX: 0, startY: 0 };
  let root, shadow, panel, workLabel, entries, statusText, nameInput, fileInput, previewImg, previewPlaceholder;
  let cropModal, cropStage, cropImg, cropZoom, cropZoomValue, cropConfirmBtn, cropCancelBtn, recropBtn, shareCheckbox, sharedEntries;
  const trackedImages = new WeakMap();
  const trackedAvatars = new WeakMap();
  const safeText = value => String(value || '').replace(/\s+/g, ' ').trim();
  const norm = value => safeText(value).normalize('NFC');

  const chat = () => document.getElementById('chatOverlay');
  const messageArea = () => document.getElementById('messagesContainer');
  function inChat() {
    const el = chat();
    return !!el && !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true' && !el.classList.contains('chat-overlay--parked');
  }
  function getWorkName() {
    const title = safeText(document.getElementById('chatTitle')?.textContent);
    return title && !['새 채팅','새로운 채팅','New Chat'].includes(title) ? title : '현재 채팅';
  }
  function getWorkKey() { return `${location.origin}::${getWorkName()}`; }
  function getWork(create = false) {
    const key = getWorkKey();
    if(create && !db.works[key]) db.works[key] = {avatars:{}, sources:{}};
    return db.works[key] || null;
  }
  // 공용 인장은 이름 일치 시 다른 작품에서도 재사용합니다.
  // 해당 방에 따로 등록한 인장이 언제나 우선합니다.
  function sharedAvatars(){return db.sharedAvatars || {};}
  function imageFor(name){return getWork()?.avatars?.[name]?.image || sharedAvatars()[name]?.image || '';}
  function allKnownNames(){return new Set([...Object.keys(sharedAvatars()),...Object.keys(getWork()?.avatars || {})]);}
  function isManagedUi(target) { return root?.contains(target) || (target?.getRootNode?.() === shadow); }
  function isCandidate(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.closest('#ri-avatar-switcher-root') || el.closest('.ri-avatar-override') || el.closest('.ri-script-portrait')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 15 || rect.height < 15 || rect.width > 150 || rect.height > 150) return false;
    if (!el.closest('#messagesContainer')) return false;
    // A portrait typically has a roughly square shape.
    if (Math.max(rect.width, rect.height) / Math.max(1,Math.min(rect.width,rect.height)) > 2.3) return false;
    return true;
  }
  function getAvatarTarget(el) {
    const area = messageArea();
    if (!area || !(el instanceof Element) || !area.contains(el)) return null;
    let found = el.closest(AVATAR_SELECTOR);
    if (found && isCandidate(found)) return found;
    // Some app renderers put the class on an image's parent.
    const img = el.closest('img');
    if (img && isCandidate(img)) {
      const css = getComputedStyle(img);
      const parentCls = String(img.parentElement?.className || '');
      if (/avatar|portrait|profile|sender|speaker/i.test(parentCls) ||
        Number.parseFloat(css.borderRadius) >= img.getBoundingClientRect().width * .35) return img;
    }
    return null;
  }
  function allTargets() {
    const area = messageArea();
    if (!area || !inChat()) return [];
    const candidates = Array.from(area.querySelectorAll(AVATAR_SELECTOR));
    const result = [];
    for (const el of candidates) {
      if (!isCandidate(el)) continue;
      const inner = Array.from(el.querySelectorAll(AVATAR_SELECTOR)).find(isCandidate);
      if (!inner) result.push(el);
    }
    for (const img of area.querySelectorAll('img')) {
      if (result.some(el => el === img || el.contains(img))) continue;
      const target = getAvatarTarget(img);
      if (target && !result.includes(target)) result.push(target);
    }
    return result;
  }

  function cleanName(candidate) {
    let s = norm(candidate).replace(/\s*[:：]\s*$/, '').replace(/^@/, '')
      .replace(/\s*(?:의\s*)?(?:프로필|인장|아바타)(?:\s*(?:이미지|사진))?$/i, '');
    if (!s || s.length > MAX_NAME || s.split(' ').length > 5) return '';
    if (/[\n\r]/.test(s) || /[.!?。？！]/.test(s) || /^(프로필|복사|편집|저장|삭제|대사|나레이션|새 채팅)$/.test(s)) return '';
    return s;
  }
  function speakerFromAvatar(avatar) {
    const attrs = ['data-speaker','data-character-name','data-name','alt','title','aria-label'];
    for (const el of [avatar, avatar.querySelector('img'), avatar.parentElement]) {
      if (!el) continue;
      for (const attr of attrs) {
        const name = cleanName(el.getAttribute?.(attr));
        if(name && !/^(프로필|캐릭터|이미지|avatar|profile)$/i.test(name)) return name;
      }
    }
    let node = avatar;
    const area = messageArea();
    for(let depth = 0; depth < 6 && node && node !== area; depth++, node=node.parentElement) {
      const possible = Array.from(node.querySelectorAll(NAME_SELECTOR)).slice(0, 15);
      for (const item of possible) {
        // Avoid unrelated nested messages and parent containers.
        if (item.contains(avatar) || item === avatar || item.closest('#ri-avatar-switcher-root')) continue;
        const n = cleanName(item.getAttribute('data-speaker') || item.getAttribute('data-character-name') || item.textContent);
        if(n) return n;
      }
      // Very common: avatar + adjacent small name in header row.
      const children = Array.from(node.children).slice(0, 8);
      for(const child of children) {
        if(child.contains(avatar)) continue;
        if(!/name|sender|speaker|author/i.test(String(child.className || ''))) continue;
        const n = cleanName(child.textContent);
        if(n) return n;
      }
    }
    return '';
  }
  function originalSource(avatar) {
    const img = avatar instanceof HTMLImageElement ? avatar : avatar.querySelector('img');
    if(img) {
      const existing = trackedImages.get(img);
      const src = img.getAttribute('src') || '';
      return existing?.original || (src.startsWith('data:image/') ? '' : src);
    }
    // Some avatars are divs styled with a background image.
    const background = avatar.style.backgroundImage || getComputedStyle(avatar).backgroundImage || '';
    const match = /url\(["']?([^"')]+)["']?\)/.exec(background);
    return match && !match[1].startsWith('data:') ? match[1] : '';
  }
  function workNameFor(avatar, work) {
    const detected = speakerFromAvatar(avatar);
    if (detected && (work?.avatars?.[detected] || sharedAvatars()[detected])) return detected;
    const source = originalSource(avatar);
    const mapped = source ? (work?.sources?.[source] || '') : '';
    return mapped && (work?.avatars?.[mapped] || sharedAvatars()[mapped]) ? mapped : ''; 
  }
  function applyTo(avatar, imageData) {
    const img = avatar instanceof HTMLImageElement ? avatar : null;
    if(img) {
      let t = trackedImages.get(img);
      if(!t) { t={original:img.getAttribute('src') || '', applied:''}; trackedImages.set(img,t); }
      if(img.getAttribute('src') !== imageData) {
        const current = img.getAttribute('src') || '';
        if(current && current !== t.applied && !current.startsWith('data:image/')) t.original = current;
        img.setAttribute('src',imageData);
      }
      t.applied = imageData;
      img.style.objectFit = 'cover';
      return;
    }
    // Overlay instead of altering the site's original DOM image or user messages.
    let overlay = Array.from(avatar.children).find(x => x.classList?.contains('ri-avatar-override'));
    if(!overlay) {
      if (getComputedStyle(avatar).position === 'static') avatar.style.position = 'relative';
      overlay=document.createElement('span');
      overlay.className='ri-avatar-override';
      overlay.setAttribute('aria-hidden','true');
      Object.assign(overlay.style, {
        display:'block', position:'absolute', inset:'0', zIndex:'10',
        borderRadius:'inherit', backgroundSize:'cover', backgroundPosition:'center',
        backgroundRepeat:'no-repeat', pointerEvents:'none', overflow:'hidden'
      });
      avatar.appendChild(overlay);
    }
    const background = `url("${imageData}")`;
    if(overlay.style.backgroundImage !== background) overlay.style.backgroundImage=background;
    trackedAvatars.set(avatar,true);
  }
  function restore(avatar) {
    if(avatar instanceof HTMLImageElement) {
      const old=trackedImages.get(avatar);
      if(old && avatar.getAttribute('src') === old.applied) avatar.setAttribute('src',old.original);
      if(old) { avatar.style.removeProperty('object-fit'); trackedImages.delete(avatar); }
    } else {
      const child=Array.from(avatar.children).find(x=>x.classList?.contains('ri-avatar-override'));
      if(child) child.remove();
    }
  }
  function applyAll() {
    if (!ready || scanning) return;
    scanning=true;
    try {
      const open=inChat();
      // On-page launcher omitted; settings are available via the extension toolbar popup.
      if(!open) { if(panelOpen) closePanel(); return; }
      const work=getWork();
      for (const avatar of allTargets()) {
        const name=workNameFor(avatar,work);
        const replacement=name && (work?.avatars?.[name] || sharedAvatars()[name]);
        if(replacement?.image) applyTo(avatar,replacement.image);
        else restore(avatar);
      }
      if (panelOpen && workLabel && workLabel.dataset.work !== getWorkKey()) renderPanel();
    } finally {scanning=false;}
  }
  function scheduleApply() {
    if (updateScheduled) return;
    updateScheduled=true;
    // Do not perform a full avatar scan in every animation frame while typing.
    avatarTimer = setTimeout(() => {
      avatarTimer = null;
      requestAnimationFrame(() => { updateScheduled=false; applyAll(); });
    }, mobilePerformanceMode ? 420 : 100);
  }
  async function persist() {
    try { await chrome.storage.local.set({[STORE_KEY]:db}); return true; }
    catch(error) { setStatus('저장 실패: 브라우저 저장 용량을 확인해주세요.','bad'); return false; }
  }
  function setStatus(message,kind='ok') {
    if (!statusText) return;
    statusText.textContent=message;
    statusText.dataset.kind=kind;
  }

  function renderPanel() {
    if(!panel) return;
    const work=getWork();
    workLabel.textContent=getWorkName();
    workLabel.dataset.work=getWorkKey();
    const names=Object.keys(work?.avatars || {}).sort((a,b)=>a.localeCompare(b,'ko'));
    entries.replaceChildren();
    if(!names.length) {
      const empty=document.createElement('p'); empty.className='empty';
      empty.textContent='이 방만의 인장이 없습니다. 공용 보관함의 같은 이름 인장이 자동 적용됩니다.';
      entries.appendChild(empty);
    }
    for(const name of names) {
      const item=document.createElement('div');item.className='avatar-entry';
      const thumb=document.createElement('img');thumb.src=work.avatars[name].image;thumb.alt='';
      const label=document.createElement('span');label.className='name';label.textContent=name;
      const edit=document.createElement('button');edit.type='button';edit.className='small';edit.textContent='수정';
      edit.addEventListener('click',()=>{nameInput.value=name;formImage=work.avatars[name].image;updatePreview();setStatus('이미지를 다시 선택하거나 ‘자르기 다시’로 기존 이미지를 조절할 수 있습니다.');});
      const del=document.createElement('button');del.type='button';del.className='small danger';del.textContent='삭제';
      del.addEventListener('click',async()=>{
        delete work.avatars[name];
        for(const [src,n] of Object.entries(work.sources || {})) if(n===name) delete work.sources[src];
        if(await persist()){renderPanel();scheduleApply();setStatus(`${name}: 제작자 인장으로 복구했습니다.`);}
      });
      const share=document.createElement('button');share.type='button';share.className='small';share.textContent='공용 저장';
      share.title='다른 작품의 같은 이름 캐릭터에게도 이 인장 적용';
      share.addEventListener('click',async()=>{
        db.sharedAvatars ||= {};
        if(db.sharedAvatars[name] && !confirm(`${name}의 공용 인장을 덮어쓸까요?`))return;
        db.sharedAvatars[name]={...work.avatars[name],updated:Date.now()};
        if(await persist()){renderPanel();scheduleApply();setStatus(`${name}: 다른 채팅방에서도 자동 사용합니다.`);}
      });
      item.append(thumb,label,edit,share,del);entries.append(item);
    }
    sharedEntries.replaceChildren();
    const globalNames=Object.keys(sharedAvatars()).sort((a,b)=>a.localeCompare(b,'ko'));
    if(!globalNames.length){
      const empty=document.createElement('p');empty.className='empty';
      empty.textContent='공용 인장이 없습니다. 위의 “공용 저장” 또는 새 이미지 등록 시 “다른 방에도 사용”을 선택하세요.';
      sharedEntries.append(empty);
    }
    for(const name of globalNames){
      const item=document.createElement('div');item.className='avatar-entry';
      const thumb=document.createElement('img');thumb.src=sharedAvatars()[name].image;thumb.alt='';
      const label=document.createElement('span');label.className='name';label.textContent=name;
      const use=document.createElement('button');use.type='button';use.className='small';use.textContent='이 방에 저장';
      use.title='공용 이미지로 이 방만의 인장을 새로 만듭니다';
      use.addEventListener('click',async()=>{
        const w=getWork(true);
        w.avatars[name]={...db.sharedAvatars[name],updated:Date.now()};
        if(await persist()){renderPanel();scheduleApply();setStatus(`${name}: 현재 채팅방에도 개별 저장했습니다.`);}
      });
      const del=document.createElement('button');del.type='button';del.className='small danger';del.textContent='공용 삭제';
      del.addEventListener('click',async()=>{
        if(!confirm(`${name}의 공용 인장만 삭제할까요? 다른 방에 개별 저장된 이미지는 유지됩니다.`))return;
        delete db.sharedAvatars[name];
        if(await persist()){renderPanel();scheduleApply();setStatus(`${name}: 공용 보관함에서 삭제했습니다.`);}
      });
      item.append(thumb,label,use,del);sharedEntries.append(item);
    }
  }
  function updatePreview() {
    previewImg.hidden=!formImage;
    previewPlaceholder.hidden=!!formImage;
    if(formImage) previewImg.src=formImage;
    else previewImg.removeAttribute('src');
    updateRecropButton();
  }
  function openPanel() {
    if(!inChat()){window.alert('리핀에서 대화를 먼저 열어주세요.');return;}
    picking=false;panelOpen=true;panel.hidden=false;
    renderPanel();
    setStatus('캐릭터 이름은 대화에 표시된 이름 그대로 입력해주세요.');
  }
  function closePanel() { panelOpen=false;panel.hidden=true; if(cropModal && !cropModal.hidden)closeCropper(true); }
  function startPicking() {
    if(!inChat()){window.alert('리핀에서 대화를 먼저 열어주세요.');return;}
    closePanel();picking=true;
    toast('대화 속 동그란 인장을 클릭하세요. 취소는 ESC');
  }
  function toast(message) {
    let el=shadow.querySelector('.toast');
    if(!el){el=document.createElement('div');el.className='toast';shadow.append(el);}
    el.textContent=message;el.hidden=false;
  }
  function hideToast() { const el=shadow.querySelector('.toast');if(el)el.hidden=true; }
  function onPickClick(event) {
    if(!picking || isManagedUi(event.target)) return;
    const target=getAvatarTarget(event.target);
    if(!target) return;
    event.preventDefault();event.stopImmediatePropagation();
    picking=false;hideToast();
    nameInput.value=speakerFromAvatar(target) || '';
    pickFingerprint=originalSource(target) || null;
    formImage=null;fileInput.value='';updatePreview();
    openPanel();
    setStatus(nameInput.value ? `선택한 인장: ${nameInput.value}. 이미지를 올려주세요.` : '인장을 선택했습니다. 캐릭터 이름을 직접 입력해주세요.');
    nameInput.focus();
  }
  function revokePendingCropUrl() {
    if (pendingCropObjectUrl) {
      try { URL.revokeObjectURL(pendingCropObjectUrl); } catch (_) {}
      pendingCropObjectUrl = null;
    }
  }
  function updateRecropButton() {
    if (recropBtn) recropBtn.hidden = !formImage;
  }
  function clampCropPosition() {
    if (!cropImageNatural) return;
    const stageSize = 240;
    const base = stageSize / Math.min(cropImageNatural.width, cropImageNatural.height);
    const drawnWidth = cropImageNatural.width * base * cropState.scale;
    const drawnHeight = cropImageNatural.height * base * cropState.scale;
    const minX = Math.min(0, stageSize - drawnWidth);
    const minY = Math.min(0, stageSize - drawnHeight);
    cropState.x = Math.max(minX, Math.min(0, cropState.x));
    cropState.y = Math.max(minY, Math.min(0, cropState.y));
  }
  function renderCropPreview() {
    if (!cropImg || !cropImageNatural) return;
    clampCropPosition();
    const stageSize = 240;
    const base = stageSize / Math.min(cropImageNatural.width, cropImageNatural.height);
    const width = cropImageNatural.width * base * cropState.scale;
    const height = cropImageNatural.height * base * cropState.scale;
    cropImg.style.width = `${width}px`;
    cropImg.style.height = `${height}px`;
    cropImg.style.transform = `translate(${cropState.x}px, ${cropState.y}px)`;
    if (cropZoom) cropZoom.value = String(cropState.scale);
    if (cropZoomValue) cropZoomValue.textContent = `${Math.round(cropState.scale * 100)}%`;
  }
  function closeCropper(resetInput = false) {
    if (cropModal) cropModal.hidden = true;
    if (cropStage) cropStage.style.cursor = 'grab';
    cropState.dragging = false;
    cropImageNatural = null;
    revokePendingCropUrl();
    if (resetInput && fileInput) fileInput.value = '';
  }
  function openCropperFromUrl(url) {
    const probe = new Image();
    probe.onload = () => {
      cropImageNatural = { width: probe.naturalWidth, height: probe.naturalHeight };
      const minScale = 1;
      const maxScale = Math.max(4, Math.ceil(Math.max(probe.naturalWidth, probe.naturalHeight) / Math.min(probe.naturalWidth, probe.naturalHeight) * 2));
      cropState.minScale = minScale;
      cropState.maxScale = maxScale;
      cropState.scale = Math.max(1, Math.min(1.35, maxScale));
      const stageSize = 240;
      const base = stageSize / Math.min(probe.naturalWidth, probe.naturalHeight);
      cropState.x = (stageSize - probe.naturalWidth * base * cropState.scale) / 2;
      cropState.y = (stageSize - probe.naturalHeight * base * cropState.scale) / 2;
      cropZoom.min = String(minScale);
      cropZoom.max = String(maxScale);
      cropZoom.step = '0.01';
      cropImg.src = url;
      renderCropPreview();
      cropModal.hidden = false;
    };
    probe.onerror = () => {
      revokePendingCropUrl();
      setStatus('이미지를 여는 중 문제가 발생했습니다. 다른 파일로 다시 시도해주세요.', 'bad');
    };
    probe.src = url;
  }
  async function openCropperFromFile(file) {
    if(!file || !/^image\/(png|jpeg|webp|gif|bmp)$/i.test(file.type)) throw Error('PNG, JPG, WEBP, GIF 또는 BMP 이미지만 사용할 수 있습니다.');
    if(file.size>25*1024*1024) throw Error('25MB 이하의 이미지를 선택해주세요.');
    revokePendingCropUrl();
    pendingCropObjectUrl = URL.createObjectURL(file);
    openCropperFromUrl(pendingCropObjectUrl);
  }
  async function cropCurrentImage() {
    if (!cropImageNatural || !cropImg?.src) throw new Error('자를 이미지를 불러오지 못했습니다.');
    const out = 360;
    const stageSize = 240;
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out, out);
    const source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('이미지를 다시 불러오지 못했습니다.'));
      img.src = cropImg.src;
    });
    const base = stageSize / Math.min(cropImageNatural.width, cropImageNatural.height);
    const scale = base * cropState.scale;
    const drawScale = out / stageSize;
    ctx.drawImage(
      source,
      cropState.x * drawScale,
      cropState.y * drawScale,
      cropImageNatural.width * scale * drawScale,
      cropImageNatural.height * scale * drawScale
    );
    return canvas.toDataURL('image/jpeg', .9);
  }
  async function recropExisting() {
    if (!formImage) {
      setStatus('먼저 이미지를 선택해주세요.', 'bad');
      return;
    }
    revokePendingCropUrl();
    openCropperFromUrl(formImage);
  }
  async function compressFile(file) {
    await openCropperFromFile(file);
    return null;
  }
  async function saveImage() {
    const name=cleanName(nameInput.value);
    if(!name){setStatus('캐릭터 이름을 40자 이내로 입력해주세요.','bad');return;}
    if(!formImage){setStatus('먼저 이미지를 선택해주세요.','bad');return;}
    const work=getWork(true);
    work.avatars[name]={image:formImage,updated:Date.now()};
    if(shareCheckbox?.checked){db.sharedAvatars ||= {};db.sharedAvatars[name]={image:formImage,updated:Date.now()};}
    if(pickFingerprint) work.sources[pickFingerprint]=name;
    if(await persist()) {
      pickFingerprint=null;nameInput.value='';formImage=null;fileInput.value='';shareCheckbox.checked=false;updatePreview();
      renderPanel();scheduleApply();setStatus(`${name} 인장을 저장했습니다.${db.sharedAvatars?.[name]?.image===work.avatars[name].image?' 공용 보관함에도 등록되었습니다.':' 이 방에만 적용됩니다.'}`);
    }
  }
  function mount() {
    if(document.getElementById('ri-avatar-switcher-root')) return;
    root=document.createElement('div');root.id='ri-avatar-switcher-root';
    shadow=root.attachShadow({mode:'open'});
    const style=document.createElement('style');
    style.textContent=`
      :host{font-family:Pretendard,'Noto Sans KR',Arial,sans-serif;color:#252630;}
      *,*::before,*::after{box-sizing:border-box}
      [hidden]{display:none!important}
      button{font:inherit;cursor:pointer}
      .veil{position:fixed;inset:0;z-index:2147483647;background:rgba(14,14,20,.55);display:flex;align-items:center;justify-content:center;padding:16px}
      .panel{width:min(430px,100%);max-height:min(700px,90vh);overflow:auto;border-radius:18px;background:#fbfbfd;box-shadow:0 24px 72px #0004;padding:22px;color:#292a31}
      .panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
      .eyebrow{font-size:10px;letter-spacing:1.1px;color:#777b88;font-weight:800;margin-bottom:5px}
      h2{margin:0;font-size:21px;line-height:1.3} .close{width:30px;height:30px;border-radius:8px;background:#f0f0f3;border:0;font-size:20px;color:#60616b}
      .work{margin:14px 0 16px;padding:11px 13px;border-radius:10px;background:#eff0f5;font-size:12px;line-height:1.5}
      .work strong{display:block;color:#797b87;font-size:10px;margin-bottom:3px}
      h3{font-size:13px;margin:16px 0 10px}
      .entries{max-height:190px;overflow:auto}
      .shared-entries{max-height:180px;overflow:auto}
      .share-check{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;margin:11px 0;color:#45465d}
      .share-check input{width:16px;height:16px;accent-color:#625cf0}
      .avatar-entry{display:flex;align-items:center;gap:8px;background:white;border:1px solid #ededf0;border-radius:10px;padding:8px;margin:6px 0}
      .avatar-entry img{width:35px;height:35px;object-fit:cover;border-radius:50%}
      .avatar-entry .name{font-size:12px;font-weight:700;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .small{padding:6px 9px;background:#eeeef2;border:0;border-radius:7px;font-size:11px;font-weight:700;color:#3f4148}
      .danger{background:#fff0f0;color:#bf4b4b}
      .empty{color:#858592;font-size:12px;line-height:1.6;margin:0;background:white;border:1px dashed #e0e1e8;border-radius:10px;padding:14px}
      label{display:block;margin:11px 0 6px;font-size:12px;font-weight:700}
      input[type=text]{width:100%;background:#fff;border:1px solid #dddfe6;border-radius:9px;padding:10px 12px;color:#292a31;outline:none;font-size:13px}
      input[type=text]:focus{border-color:#716bf0;box-shadow:0 0 0 3px #716bf018}
      .image-line{display:flex;gap:12px;align-items:center}
      .image-preview{width:68px;height:68px;border-radius:11px;overflow:hidden;border:1px solid #e3e4e8;background:#f1f1f5;flex:none;display:flex;align-items:center;justify-content:center}
      .image-preview img{width:100%;height:100%;object-fit:cover}
      .placeholder{font-size:11px;color:#9a9ca8}
      input[type=file]{width:100%;font-size:11px;color:#727584}input[type=file]::file-selector-button{background:white;color:#373947;border:1px solid #dadce4;padding:8px;border-radius:8px;margin-right:8px;cursor:pointer}
      .image-actions{display:flex;flex-direction:column;gap:8px;flex:1}
      .ghost-btn{width:100%;border:1px dashed #d7d9e4;background:#fff;color:#55586a;border-radius:9px;padding:8px 10px;font-size:12px;font-weight:700}
      .ghost-btn:hover{background:#f7f7fb}
      .note{font-size:11px;color:#9496a2;line-height:1.6;margin-top:9px}
      .crop-backdrop{position:fixed;inset:0;background:rgba(15,16,23,.72);display:flex;align-items:center;justify-content:center;padding:18px;z-index:2147483647}
      .crop-card{width:min(380px,100%);background:#fff;border-radius:18px;padding:18px;box-shadow:0 24px 72px #0005}
      .crop-title{font-size:17px;font-weight:800;margin:0 0 6px}.crop-desc{font-size:12px;color:#7a7d89;line-height:1.6;margin:0 0 14px}
      .crop-stage-wrap{display:flex;justify-content:center}.crop-stage{position:relative;width:240px;height:240px;overflow:hidden;border-radius:16px;background:#eef0f6;cursor:grab;user-select:none;touch-action:none;border:1px solid #e2e4ec}
      .crop-stage img{position:absolute;left:0;top:0;max-width:none;will-change:transform;width:auto;height:auto}
      .crop-stage::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at center, transparent 0 35%, rgba(0,0,0,.18) 35.6%, rgba(0,0,0,.18) 100%);mix-blend-mode:multiply;opacity:.35}
      .crop-stage::after{content:'';position:absolute;inset:14px;border:2px solid rgba(255,255,255,.95);border-radius:999px;box-shadow:0 0 0 999px rgba(0,0,0,.18);pointer-events:none}
      .crop-zoom{margin:14px 0 6px}.crop-zoom-head{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;margin-bottom:6px;color:#4d5161}.crop-zoom input{width:100%}
      .controls{display:flex;gap:7px;margin-top:14px}.controls button{flex:1;border:0;border-radius:10px;padding:11px;font-size:12px;font-weight:800}
      .primary{background:#514aeb;color:#fff}.secondary{background:#ececf2;color:#424550}
      .status{min-height:16px;margin-top:12px;font-size:11px;color:#55815b;line-height:1.5}.status[data-kind=bad]{color:#bd4646}
      .toast{position:fixed;z-index:2147483647;bottom:90px;left:50%;transform:translateX(-50%);border-radius:12px;background:#20202a;color:white;padding:12px 18px;box-shadow:0 7px 28px #0005;font-size:13px;max-width:calc(100vw - 25px);text-align:center;pointer-events:none}
      @media(max-width:600px){.panel{padding:17px;max-height:85vh}}
    `;
    shadow.append(style);
    // No floating settings button added to RE:PIN's chat screen.
    panel=document.createElement('div');panel.className='veil';panel.hidden=true;
    panel.innerHTML=`<div class="panel" role="dialog" aria-modal="true" aria-label="리핀 인장 설정">
      <div class="panel-head"><div><div class="eyebrow">RE:PIN CUSTOM</div><h2>캐릭터 인장 설정</h2></div><button class="close" id="ri-close" type="button" title="닫기">×</button></div>
      <div class="work"><strong>현재 작품 / 채팅</strong><span id="ri-work"></span></div>
      <h3>이 방의 인장</h3><div class="entries" id="ri-entries"></div>
      <h3>공용 인장 보관함 · 모든 시리즈</h3><div class="shared-entries" id="ri-shared-entries"></div>
      <div class="note">같은 캐릭터 이름이면 다른 방에서도 공용 인장이 자동 표시됩니다. 각 방에 따로 저장한 이미지는 공용보다 우선합니다.</div>
      <h3>인장 추가 · 수정</h3><label for="ri-name">캐릭터 이름</label><input type="text" id="ri-name" maxlength="40" placeholder="예: 유백, 한서율" autocomplete="off">
      <label for="ri-file">교체할 이미지</label><div class="image-line"><div class="image-preview"><img id="ri-preview" hidden alt="선택한 인장"><span class="placeholder" id="ri-placeholder">미선택</span></div><div class="image-actions"><input type="file" id="ri-file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"><button class="ghost-btn" id="ri-recrop" type="button" hidden>자르기 다시</button></div></div>
      <label class="share-check"><input type="checkbox" id="ri-save-shared"> 이 인장을 다른 방에서도 공용 사용</label>
      <div class="note">이미지를 고른 뒤 직접 확대/이동해서 자를 수 있습니다. 설정한 이미지는 이 브라우저에만 보관됩니다.</div>
      <div class="controls"><button class="secondary" id="ri-pick" type="button">대화에서 인장 클릭</button><button class="primary" id="ri-save" type="button">저장 · 적용</button></div>
      <div id="ri-status" class="status" aria-live="polite"></div>
      <div class="crop-backdrop" id="ri-crop-modal" hidden>
        <div class="crop-card" role="dialog" aria-modal="true" aria-label="인장 자르기">
          <h3 class="crop-title">인장 자르기</h3>
          <p class="crop-desc">이미지를 드래그해서 위치를 맞추고, 확대 슬라이더로 크기를 조절하세요. 대본-개편의 사각 인장 영역을 기준으로 저장됩니다.</p>
          <div class="crop-stage-wrap"><div class="crop-stage" id="ri-crop-stage"><img id="ri-crop-img" alt="자르는 중인 이미지"></div></div>
          <div class="crop-zoom"><div class="crop-zoom-head"><span>확대</span><span id="ri-crop-zoom-value">100%</span></div><input type="range" id="ri-crop-zoom" min="1" max="4" step="0.01" value="1"></div>
          <div class="controls"><button class="secondary" id="ri-crop-cancel" type="button">취소</button><button class="primary" id="ri-crop-confirm" type="button">이대로 사용</button></div>
        </div>
      </div>
    </div>`;
    shadow.append(panel);document.documentElement.append(root);
    workLabel=shadow.querySelector('#ri-work'); entries=shadow.querySelector('#ri-entries');
    nameInput=shadow.querySelector('#ri-name');fileInput=shadow.querySelector('#ri-file');
    shareCheckbox=shadow.querySelector('#ri-save-shared');sharedEntries=shadow.querySelector('#ri-shared-entries');
    previewImg=shadow.querySelector('#ri-preview');previewPlaceholder=shadow.querySelector('#ri-placeholder');
    statusText=shadow.querySelector('#ri-status');
    cropModal=shadow.querySelector('#ri-crop-modal');
    cropStage=shadow.querySelector('#ri-crop-stage');
    cropImg=shadow.querySelector('#ri-crop-img');
    cropZoom=shadow.querySelector('#ri-crop-zoom');
    cropZoomValue=shadow.querySelector('#ri-crop-zoom-value');
    cropConfirmBtn=shadow.querySelector('#ri-crop-confirm');
    cropCancelBtn=shadow.querySelector('#ri-crop-cancel');
    recropBtn=shadow.querySelector('#ri-recrop');
    shadow.querySelector('#ri-close').addEventListener('click',closePanel);
    panel.addEventListener('click',e=>{if(e.target===panel) closePanel();});
    shadow.querySelector('#ri-pick').addEventListener('click',startPicking);
    shadow.querySelector('#ri-save').addEventListener('click',saveImage);
    recropBtn.addEventListener('click', recropExisting);
    fileInput.addEventListener('change',async()=>{
      const file=fileInput.files?.[0];if(!file)return;
      setStatus('이미지를 준비하는 중…');
      try {await compressFile(file); setStatus('자르기 창에서 이미지를 조절한 뒤 저장해주세요.');}
      catch(err){formImage=null;updatePreview();setStatus(err.message,'bad');}
    });
    cropZoom.addEventListener('input', () => {
      cropState.scale = Number.parseFloat(cropZoom.value) || 1;
      renderCropPreview();
    });
    const startDrag = (clientX, clientY) => {
      if (!cropImageNatural) return;
      cropState.dragging = true;
      cropState.dragStartX = clientX;
      cropState.dragStartY = clientY;
      cropState.startX = cropState.x;
      cropState.startY = cropState.y;
      cropStage.style.cursor = 'grabbing';
    };
    const moveDrag = (clientX, clientY) => {
      if (!cropState.dragging) return;
      cropState.x = cropState.startX + (clientX - cropState.dragStartX);
      cropState.y = cropState.startY + (clientY - cropState.dragStartY);
      renderCropPreview();
    };
    const endDrag = () => {
      cropState.dragging = false;
      if (cropStage) cropStage.style.cursor = 'grab';
    };
    cropStage.addEventListener('mousedown', e => { e.preventDefault(); startDrag(e.clientX, e.clientY); });
    window.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup', endDrag);
    cropStage.addEventListener('touchstart', e => { const t = e.touches[0]; if (!t) return; startDrag(t.clientX, t.clientY); }, {passive:true});
    window.addEventListener('touchmove', e => { const t = e.touches[0]; if (!t) return; moveDrag(t.clientX, t.clientY); }, {passive:true});
    window.addEventListener('touchend', endDrag, {passive:true});
    cropCancelBtn.addEventListener('click', () => { closeCropper(true); setStatus('이미지 자르기를 취소했습니다.', 'bad'); });
    cropConfirmBtn.addEventListener('click', async () => {
      try {
        formImage = await cropCurrentImage();
        updatePreview();
        closeCropper(false);
        setStatus('이미지를 잘라 준비했습니다. 저장 · 적용을 눌러주세요.');
      } catch (err) {
        setStatus(err.message || '이미지를 자르는 중 오류가 발생했습니다.', 'bad');
      }
    });
    document.addEventListener('click',onPickClick,true);
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'){
        if(!cropModal.hidden){ closeCropper(true); setStatus('이미지 자르기를 취소했습니다.', 'bad'); }
        else if(picking){picking=false;hideToast();}
        else if(panelOpen) closePanel();
      }
    },true);
  }
  chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if (message?.source!=='repin-avatar-popup') return;
    if (message.command==='OPEN_SETTINGS') openPanel();
    else if(message.command==='PICK_AVATAR') startPicking();
    else if(message.command==='OPEN_SHARED') {openPanel();sharedEntries?.scrollIntoView({block:'center',behavior:'smooth'});}
    else return;
    sendResponse({ok:true});
  });
  async function init() {
    mount();
    try {
      const data=await chrome.storage.local.get(STORE_KEY);
      const stored=data?.[STORE_KEY];
      if(stored && stored.works && typeof stored.works==='object') db=stored;
    } catch(error) {console.warn('[RE:PIN Avatar] 저장된 설정을 읽지 못했습니다.',error);}
    ready=true;
    scheduleApply();
    const observer=new MutationObserver(mutations=>{
      // Ignore composer, keyboard, and unrelated site UI changes.
      // Only the chat overlay, title, and message area can affect portraits.
      const active=chat(), messages=messageArea(), title=document.getElementById('chatTitle');
      const relevant=mutations.some(m=>{
        const target=m.target;
        if(isManagedUi(target) || target.nodeType!==Node.ELEMENT_NODE) return false;
        if(target.closest?.('.ri-script-portrait,.ri-script-my-avatar,.ri-avatar-override'))return false;
        if(target===active || target===title || title?.contains(target)) return true;
        return !!messages && (target===messages || messages.contains(target));
      });
      if(relevant)scheduleApply();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','src','aria-hidden','inert']});
    chrome.storage.onChanged.addListener((changes,area)=>{
      if(area==='local' && changes[STORE_KEY]?.newValue){db=changes[STORE_KEY].newValue; scheduleApply();if(panelOpen)renderPanel();}
    });
    // In-page routing can update without conventional DOM events.
    setInterval(() => {if(inChat() && !document.hidden) scheduleApply();}, 18000);
  }
  init();
})();

(() => {
  'use strict';
  if (window.__repinScriptThemeLoaded) return;
  window.__repinScriptThemeLoaded = true;

  // Theme preference and portrait images are browser-local. Nothing is sent to RE:PIN.
  const THEME_KEY = 'repinScriptTheme_v1';
  const AVATAR_KEY = 'repinAvatarSwitcher_v1';
  const OPTION_ID = 'ri-script-theme-option';
  const PORTRAIT_CLASS = 'ri-script-portrait';
  const CACHE_KEY = 'repinNativePortraitCache_v1';
  const chat = () => document.getElementById('chatOverlay');
  const area = () => document.getElementById('messagesContainer');
  const isChatOpen = () => !!chat() && !chat().hasAttribute('inert') && chat().getAttribute('aria-hidden') !== 'true' && !chat().classList.contains('chat-overlay--parked');
  const safe = value => String(value || '').replace(/\s+/g,' ').trim();
  const workName = () => {
    const v = safe(document.getElementById('chatTitle')?.textContent);
    return v && !['새 채팅', '새로운 채팅', 'New Chat'].includes(v) ? v : '현재 채팅';
  };
  const workKey = () => `${location.origin}::${workName()}`;

  let preferences = {works:{}};
  let avatarData = {works:{}};
  let nativeCache = {works:{}};
  let acquiring = false, cacheWritePending = false;
  const observedNames = new Set();
  const autoAcquiredWorks = new Set();
  let activeKey = '';
  let uiStyle, customCard, inlineButton, inlineLabel, allRoomsButton;
  let pending = false;
  let themeTimer = null;
  let lastScanKey='', lastScanEnabled=null, lastScanArea=null;
  let messagesDirty=true, lastMessageScan=0, lastThemeUICheck=0, lastCapture=0;
  const textNodeFingerprint = new WeakMap();
  const mobileMode = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || matchMedia('(pointer:coarse)').matches;
  let syncThemeSelection = false;
  let observedGrid = null, nativeCard = null;
  const nativeSyncCompleted = new Set();
  let nativeSyncBusy = false;

  // v1.6.2 originally allowed enhancement only for the one work whose title
  // had been selected.  Keep explicit per-work OFF choices, while allowing the
  // same presentation across previously unseen rooms.
  const isEnabled = () => {
    const local = preferences.works?.[workKey()];
    if (local === false) return false;
    if (local === true) return true;
    return preferences.globalEnabled === true;
  };
  const currentPortraits = () => ({
    ...(avatarData.sharedAvatars || {}),
    ...(avatarData.works?.[workKey()]?.avatars || {})
  });
  // The user's avatar is already managed inside RE:PIN, so never use a separate
  // extension-side image slot. Read only the currently selected chat profile.
  const ownProfileName = () => {
    const value = safe(document.querySelector('#chatProfileChipName')?.textContent).normalize('NFC');
    return /^(프로필|Profile|선택|없음|기본)$/i.test(value) ? '' : value;
  };
  const ownDisplayName = () => ownProfileName() || '내 캐릭터';
  const ownPortrait = () => {
    const chip = document.querySelector('#chatProfileChip');
    const imgs = [document.getElementById('chatProfileChipImg'),
      ...(chip?.querySelectorAll('img') || [])];
    for (const img of imgs) {
      if (!img) continue;
      const raw = img.getAttribute('src') || img.currentSrc || '';
      if (!raw || raw === 'null' || raw === 'undefined') continue;
      if (/^(?:data:image\/|blob:|https?:\/\/)/i.test(raw)) return raw;
      if (raw.startsWith('/')) return new URL(raw,location.origin).href;
    }
    if (chip) {
      for (const node of [chip, chip.querySelector('.model-selector-btn-icon')]) {
        if (!node) continue;
        const bg = getComputedStyle(node).backgroundImage;
        const match = /url\(["']?([^"')]+)["']?\)/.exec(bg);
        if (match?.[1]) return match[1];
      }
    }
    return '';
  };
  const getPortrait = name => {
    const normalized = safe(name).normalize('NFC');
    const inWork = currentPortraits();
    if (inWork[normalized]?.image) return inWork[normalized].image;
    // Keep mappings local to a work. Never borrow an image from a different story.
    const sameName = Object.entries(inWork).find(([n]) => safe(n).normalize('NFC') === normalized);
    if (sameName?.[1]?.image) return sameName[1].image;
    return nativeCache.works?.[workKey()]?.[normalized] || '';
  };
  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 20 && rect.height > 14 && getComputedStyle(el).visibility !== 'hidden';
  }

  function createStyles() {
    if (uiStyle?.isConnected) return;
    uiStyle = document.createElement('style');
    uiStyle.id = 'ri-script-theme-style';
    uiStyle.textContent = `
      #${OPTION_ID} {box-sizing:border-box!important;appearance:none!important;min-width:0;min-height:106px;
        text-align:left;display:flex;flex-direction:column;gap:9px;padding:12px 11px!important;
        border:1px solid transparent!important;border-radius:13px!important;
        background:#f0f0f2!important;color:#29292d!important;cursor:pointer!important;font:inherit!important;}
      #${OPTION_ID}:hover{background:#ebebf8!important}
      #${OPTION_ID}.ri-active{background:#e5e6fb!important;border-color:#6c68ec!important;}
      [data-ri-theme-muted="true"]{background:#f0f0f2!important;outline:none!important;box-shadow:none!important;border-color:transparent!important}
      [data-ri-theme-muted="true"] [class*="check"]{background:#d1d2d7!important;color:#888!important}
      [data-ri-theme-grid="on"] > :not(#${OPTION_ID}){background:#f0f0f2!important;border-color:transparent!important;box-shadow:none!important;outline:0!important;}
      [data-ri-theme-grid="on"] > :not(#${OPTION_ID}) [class*="check" i]{background:#d3d4d9!important;color:transparent!important;opacity:.45!important;}
      [data-ri-theme-grid="on"] > :not(#${OPTION_ID}) [aria-checked="true"]{background:#d3d4d9!important;color:transparent!important;opacity:.45!important;}
      #${OPTION_ID} .ri-option-head{display:flex;align-items:center;justify-content:space-between;width:100%;gap:4px}
      #${OPTION_ID} .ri-option-head strong{font-size:12px;font-weight:750}
      #${OPTION_ID} .ri-option-check{flex-shrink:0;width:17px;height:17px;border-radius:50%;background:#d3d4d9;color:#fafafa;
        display:grid;place-items:center;font-size:11px;font-weight:900}
      #${OPTION_ID}.ri-active .ri-option-check{background:#625ff0}
      #${OPTION_ID} .ri-option-preview{font-size:10px;line-height:1.65;color:#757782;display:flex;gap:6px;align-items:center}
      #${OPTION_ID} .ri-option-preview img{width:26px;height:26px;object-fit:cover;border-radius:6px;flex-shrink:0}
      #${OPTION_ID} .ri-option-preview span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #messagesContainer.ri-script-light-surface .${PORTRAIT_CLASS}{
        background:#f2f2f4!important;border-color:#d9dce2!important;color:#606671!important;
      }
      #messagesContainer.ri-script-light-surface .${PORTRAIT_CLASS} .ri-avatar-icon{
        stroke:#717784!important;
      }
      #messagesContainer.ri-script-light-surface .ri-script-my-narration::before{
        background:rgba(115,118,126,.3)!important;
      }
      #messagesContainer .${PORTRAIT_CLASS}{display:inline-flex!important;align-items:center;justify-content:center;
        width:38px!important;height:38px!important;min-width:38px!important;max-width:38px!important;
        margin:2px 8px 2px 0!important;vertical-align:middle!important;border-radius:7px!important;
        overflow:hidden!important;border:1px solid rgba(255,255,255,.26)!important;
        background:#343438!important;color:#b9bac0!important;
        font-family:Arial,sans-serif!important;font-size:11px!important;font-style:normal!important;
        font-weight:650!important;line-height:1!important;box-shadow:0 1px 3px #0002!important;
        flex-shrink:0!important;text-decoration:none!important;white-space:nowrap!important;}
      #messagesContainer .${PORTRAIT_CLASS} img{width:100%!important;height:100%!important;display:block!important;
        object-fit:cover!important;border-radius:7px!important;pointer-events:none!important;}
      #messagesContainer .${PORTRAIT_CLASS} .ri-avatar-icon{width:21px!important;height:21px!important;fill:none!important;
        stroke:#a6a8ad!important;stroke-width:1.6!important;stroke-linecap:round!important;display:block!important;}
      #messagesContainer .${PORTRAIT_CLASS} .ri-initial{font:inherit!important;}
      /* Own narration layout: portrait is inside the same content column as
         other character portraits.  The native quote rule is redrawn BETWEEN
         the portrait and narration text, instead of pushing the portrait out
         of the quote box or outside the message scroll region. */
      #messagesContainer .ri-script-my-narration{
        position:relative!important;
        box-sizing:border-box!important;
        border-left:0!important;
        min-height:50px!important;
        padding:9px 10px 9px 65px!important;
        margin-top:10px!important;
        margin-bottom:12px!important;
      }
      #messagesContainer .ri-script-my-narration::before{
        content:''!important;
        position:absolute!important;
        left:52px!important;
        top:7px!important;
        bottom:7px!important;
        width:2px!important;
        background:rgba(185,186,206,.38)!important;
        border:0!important;
        pointer-events:none!important;
      }
      #messagesContainer .${PORTRAIT_CLASS}.ri-script-my-avatar{
        position:absolute!important;
        left:5px!important;
        top:50%!important;
        transform:translateY(-50%)!important;
        float:none!important;
        display:inline-flex!important;
        width:38px!important;
        height:38px!important;
        min-width:38px!important;
        max-width:38px!important;
        margin:0!important;
        z-index:3!important;
        border-radius:7px!important;
      }
      #ri-script-panel-toggle{width:100%;border:1px solid #d8d9e5;border-radius:9px;padding:9px 11px;
        background:#fff;color:#424553;font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;}
      #ri-script-panel-toggle.ri-active{background:#e8e8ff;border-color:#7772f1;color:#4840ba}
      #ri-script-panel-toggle .ri-theme-sub{display:block;font-size:10px;color:#868892;font-weight:400;margin-top:4px}
      @media(max-width:600px){#messagesContainer .${PORTRAIT_CLASS}{width:32px!important;height:32px!important;min-width:32px!important;max-width:32px!important;margin-right:7px!important}}
    `;
    document.documentElement.appendChild(uiStyle);
  }

  async function setTheme(value) {
    const key = workKey();
    preferences.works ||= {};
    // Explicit false overrides the all-room default; never silently turn the
    // selected room back on when its owner selects another theme.
    preferences.works[key] = !!value;
    try { await chrome.storage.local.set({[THEME_KEY]:preferences}); }
    catch (e) { console.warn('[RE:PIN Script theme] Failed to save theme selection', e); }
    schedule();
  }
  async function setGlobalTheme(value) {
    preferences.globalEnabled = !!value;
    try { await chrome.storage.local.set({[THEME_KEY]:preferences}); }
    catch (e) { console.warn('[RE:PIN Script theme] Failed to save all-room preference',e); }
    schedule();
  }

  function findNativeThemeCard() {
    if (!isChatOpen()) return null;
    const section = document.body; // Settings drawers can be mounted outside #chatOverlay.
    if (!section) return null;
    // The theme chooser is generated by the site's script (not present in its static HTML).
    // Find the visible "대본" tile and the option grid it belongs to.
    const labels = Array.from(section.querySelectorAll('span, strong, b, div, button, label, p'))
      .filter(el => el.id !== OPTION_ID && !el.closest(`#${OPTION_ID}`) &&
        el.childElementCount <= 2 && safe(el.textContent) === '대본' && isElementVisible(el));
    for (const label of labels) {
      let node = label;
      for (let n = 0; node && n < 5; n++, node = node.parentElement) {
        const parent = node.parentElement;
        if (!parent || parent.id === 'chatOverlay') break;
        const r = node.getBoundingClientRect();
        const p = parent.getBoundingClientRect();
        const text = safe(node.textContent);
        const hasPreview = text.length > 2 || node.querySelector('img, svg, p, small');
        const className = String(node.className || '');
        if (r.width < 100 || r.height < 65 || r.width > 420 || r.height > 240) continue;
        const siblings = [...parent.children].filter(s => s !== node && s.id !== OPTION_ID);
        const siblingText = siblings.map(s=>safe(s.textContent).slice(0,100)).join(" ");
        const hasOtherOptions = /대화/.test(siblingText) && /소설|시네마/.test(siblingText);
        const likelyCard = /theme|mode|option|style|card/i.test(className) || node.getAttribute('role') === 'radio' || node.tagName === 'BUTTON';
        // Require sibling cards to avoid capturing an unrelated "대본" label in creator UI.
        if (hasOtherOptions && (likelyCard || hasPreview || (p.width > r.width * 1.3))) {
          return {card:node,grid:parent};
        }
      }
    }
    return null;
  }

  function createThemeCard() {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = OPTION_ID;
    button.setAttribute('aria-label','대본-개편 테마 선택');
    const header = document.createElement('span'); header.className = 'ri-option-head';
    const title = document.createElement('strong'); title.textContent = '대본-개편';
    const check = document.createElement('span');check.className='ri-option-check';check.textContent='✓';
    header.append(title,check);
    const preview = document.createElement('span');preview.className = 'ri-option-preview';
    const portrait = document.createElement('img');portrait.alt='';portrait.style.display='none';
    const previewText = document.createElement('span');previewText.textContent = '유백 | 괜찮아.';
    preview.append(portrait,previewText);
    button.append(header,preview);
    button.addEventListener('click',async e => {
      e.preventDefault();e.stopPropagation();
      await enableEnhancedTheme();
    });
    return button;
  }

  function injectThemeCard() {
    const match = findNativeThemeCard();
    if (!match) return;
    observedGrid = match.grid;
    nativeCard = match.card;
    if (!customCard || !customCard.isConnected || customCard.parentElement !== observedGrid) {
      customCard?.remove();
      customCard = createThemeCard();
      match.grid.appendChild(customCard);
    }
    customCard.classList.toggle('ri-active',isEnabled());
    customCard.setAttribute('aria-pressed',String(isEnabled()));
    if(isEnabled()){
      match.grid.dataset.riThemeGrid='on';
      match.card.dataset.riThemeMuted='true';
    }else{
      delete match.grid.dataset.riThemeGrid;
      delete match.card.dataset.riThemeMuted;
    }
    const first = Object.values(currentPortraits())[0]?.image;
    const portrait = customCard.querySelector('.ri-option-preview img');
    if (portrait) {
      portrait.style.display = first ? 'block' : 'none';
      if (first && portrait.src !== first) portrait.src=first;
    }
  }

  function normalizeNativeScriptSelection(){
    if(!isEnabled() || acquiring || nativeSyncBusy || syncThemeSelection || !isChatOpen())return;
    const found=findNativeThemeCard();
    if(!found || !found.card?.isConnected)return;
    const key=workKey();
    if(nativeSyncCompleted.has(key))return;
    nativeSyncCompleted.add(key);
    // RE:PIN persists its own theme independently. When the extension default
    // is on in a new room, its native base must be Script, never Dialogue.
    nativeSyncBusy=true;
    syncThemeSelection=true;
    try{found.card.click();}
    finally{syncThemeSelection=false;nativeSyncBusy=false;}
  }

  // If RE:PIN still renders native Dialogue avatars while the extended Script
  // preference has loaded, do not add duplicate portraits on top of them.
  function nativeDialogueAvatarsVisible(){
    const root=area();
    if(!root)return false;
    for(const avatar of root.querySelectorAll('[class*="message-avatar" i],[class*="chat-avatar" i],[class*="speaker-avatar" i]')){
      if(avatar.closest(`.${PORTRAIT_CLASS},.ri-script-my-narration`))continue;
      const rect=avatar.getBoundingClientRect();
      if(rect.width>=16 && rect.height>=16 && rect.width<=110 && rect.height<=110)return true;
    }
    return false;
  }

  function hookNativeThemeClick() {
    document.addEventListener('click',e=>{
      if (syncThemeSelection || !isEnabled() || !isChatOpen()) return;
      if (!(e.target instanceof Element)) return;
      if (e.target.closest(`#${OPTION_ID}`) || e.target.closest('#ri-avatar-switcher-root')) return;
      // Never search the whole document for a theme card on ordinary chat clicks.
      if (!customCard?.isConnected || !customCard.parentElement?.contains(e.target)) return;
      const match = findNativeThemeCard();
      if (!match) return;
      const card = [...match.grid.children].find(x => x !== customCard && x.contains(e.target));
      if (card) {void setTheme(false);}
    },true);
  }

  function injectPanelToggle() {
    const root = document.getElementById('ri-avatar-switcher-root');
    const shadow = root?.shadowRoot;
    if (!shadow || !isChatOpen()) return;
    const container = shadow.querySelector('.work');
    if (!container) return;
    if (!shadow.querySelector('#ri-script-toggle-style')) {
      const style = document.createElement('style');
      style.id='ri-script-toggle-style';
      style.textContent=`
        #ri-script-panel-toggle{display:block;width:100%;border:1px solid #d8d9e5;border-radius:9px;
          padding:10px 11px;background:#fff;color:#424553;font-family:inherit;font-size:12px;
          font-weight:800;cursor:pointer;text-align:center;margin:0 0 14px}
        #ri-script-panel-toggle.ri-active{background:#e8e8ff;border-color:#7772f1;color:#4840ba}
        #ri-script-panel-toggle .ri-theme-sub{display:block;font-size:10px;color:#868892;
          font-weight:400;margin-top:4px;line-height:1.5}
      `;
      shadow.appendChild(style);
    }
    if (!inlineButton || !inlineButton.isConnected) {
      inlineButton = document.createElement('button');
      inlineButton.id = 'ri-script-panel-toggle';
      inlineButton.type = 'button';
      inlineLabel = document.createElement('span');
      const sub = document.createElement('span');
      sub.className='ri-theme-sub';
      sub.textContent = '대본 테마 기반 · 등록된 인장과 연동 (대본이 아닐 땐 먼저 대본 선택)';
      inlineButton.append(inlineLabel,sub);
      inlineButton.addEventListener('click',async()=>{
        if(isEnabled()) await setTheme(false);
        else await enableEnhancedTheme();
      });
      container.insertAdjacentElement('afterend',inlineButton);
    }
    inlineButton.classList.toggle('ri-active',isEnabled());
    inlineButton.setAttribute('aria-pressed',String(isEnabled()));
    inlineLabel.textContent = isEnabled() ? '대본-개편  사용 중 · 이 방에서 끄기' : '대본-개편  이 방에서 사용하기';
    if (!allRoomsButton || !allRoomsButton.isConnected) {
      allRoomsButton = document.createElement('button');
      allRoomsButton.type='button';
      allRoomsButton.id='ri-script-all-rooms';
      allRoomsButton.style.cssText='width:100%;border:1px solid #e1e2e8;background:#f9f9fb;color:#565968;border-radius:8px;padding:9px 11px;margin:-7px 0 13px;font:600 11px Pretendard,Arial,sans-serif;cursor:pointer;';
      allRoomsButton.addEventListener('click',()=>void setGlobalTheme(preferences.globalEnabled !== true));
      inlineButton.insertAdjacentElement('afterend',allRoomsButton);
    }
    allRoomsButton.textContent = `새 채팅방에도 자동 적용: ${preferences.globalEnabled ? '켜짐' : '꺼짐'}`;
    allRoomsButton.setAttribute('aria-pressed',String(preferences.globalEnabled === true));
  }

  function sleep(ms) {return new Promise(resolve=>setTimeout(resolve,ms));}
  function findOtherCard(match, label) {
    if (!match?.grid) return null;
    const names = ['대화','대본','소설','시네마','대본-개편'];
    return [...match.grid.children].find(item => {
      if(item.id === OPTION_ID) return false;
      const candidates = item.querySelectorAll('strong, b, span, div');
      const titles = [...candidates].filter(el=> el.childElementCount===0)
        .map(el=>safe(el.textContent)).filter(x => names.includes(x));
      return titles[0] === label;
    }) || null;
  }
  function speakerNamesOnPage() {
    const found = new Set([...Object.keys(currentPortraits()),...observedNames]);
    const a = area();
    if(!a) return found;
    for (const el of a.querySelectorAll(`.${PORTRAIT_CLASS}`)) {
      const name = safe(el.dataset.speaker);
      if(name) found.add(name);
    }
    // Example: '유백 | 대사' in script text.
    const prefix = /(?:^|\n)\s*([가-힣一-龯ぁ-んァ-ン・·]{1,10}(?: [가-힣一-龯ぁ-んァ-ン・·]{1,10}){0,2}|[A-Z][a-zA-Z ]{1,27})\s*[|｜:：]/g;
    for (const node of a.querySelectorAll('p,div,span,strong,b')) {
      if(node.children.length > 5 || node.textContent.length > 1400) continue;
      prefix.lastIndex = 0;
      let m;
      while((m=prefix.exec(node.textContent||''))!==null){
        const n = safe(m[1]);
        if(n && n.length <= 40) found.add(n);
      }
    }
    return found;
  }
  function extractSpeakerNear(image, names) {
    if(!(image instanceof HTMLElement)) return '';
    const attrs = ['data-speaker','data-character-name','data-name','alt','title'];
    for(const node of [image,image.parentElement]){
      if(!node) continue;
      for(const attr of attrs){
        const value = safe(node.getAttribute?.(attr));
        if(value && names.has(value)) return value;
      }
    }
    const nameSelectors = [
      '.message-name','.message-sender','.sender-name','.speaker-name','.character-name',
      '.message-author','[class*="speaker-name" i]','[class*="sender-name" i]',
      '[class*="message-name" i]','[class*="character-name" i]',
      '[class*="author-name" i]','[data-speaker]','[data-character-name]'
    ].join(',');
    let current=image;
    for(let depth=0;current && depth<7;depth++,current=current.parentElement){
      if(current===area()) break;
      if((current.textContent||'').length > 2000) break;
      for(const el of [...current.querySelectorAll(nameSelectors)].slice(0,25)){
        const n=safe(el.getAttribute('data-speaker')||el.getAttribute('data-character-name')||el.textContent);
        if(names.has(n)) return n;
      }
      // Renderers often create <div class="message-avatar"> and a sibling header for the speaker.
      for(const candidate of [...current.querySelectorAll('span,strong,b,div')].slice(0,45)){
        if(candidate.querySelector('img,svg'))continue;
        if(candidate.childElementCount>2)continue;
        const value=safe(candidate.textContent);
        if(names.has(value))return value;
      }
    }
    return '';
  }
  function captureNativePortraits(names = speakerNamesOnPage()) {
    const container=area();
    if(!container || !names.size)return 0;
    let changed=0;
    const saved = nativeCache.works[workKey()] ||= {};
    const nodes = container.querySelectorAll('img,[class*=avatar i],[class*=portrait i]');
    for(const node of nodes) {
      if(!(node instanceof HTMLElement) || node.closest(`.${PORTRAIT_CLASS},.ri-avatar-override`))continue;
      const rect=node.getBoundingClientRect();
      if((rect.width && (rect.width<16 || rect.width>120)) || (rect.height && (rect.height<16 || rect.height>120))) continue;
      const inlineSrc = node instanceof HTMLImageElement ? node.getAttribute('src') : '';
      const imageCss = getComputedStyle(node).backgroundImage || '';
      const cssMatch = /^url\(["']?(.+?)["']?\)$/.exec(imageCss);
      const src = inlineSrc || cssMatch?.[1] || '';
      if(!src || src.startsWith('blob:') || !/^(https?:|data:image\/)/i.test(src))continue;
      const name=extractSpeakerNear(node,names);
      if(!name)continue;
      if(currentPortraits()[name]?.image)continue; // User's selected image always wins.
      if(saved[name]!==src){saved[name]=src;changed++;}
    }
    if(changed) scheduleNativeCacheSave();
    return changed;
  }
  function scheduleNativeCacheSave(){
    if(cacheWritePending)return;
    cacheWritePending=true;
    // Avoid storing duplicates of large data URIs already in avatar settings.
    Promise.resolve().then(async()=>{
      cacheWritePending=false;
      try{await chrome.storage.local.set({[CACHE_KEY]:nativeCache});}
      catch(e){console.warn('[RE:PIN Script] unable to save original portrait cache',e);}
    });
  }
  async function enableEnhancedTheme(){
    if(acquiring)return;
    acquiring=true;
    autoAcquiredWorks.add(workKey());
    syncThemeSelection=true;
    try{
      const match = findNativeThemeCard();
      const dialogue = findOtherCard(match,'대화');
      const script = match?.card;
      const names = speakerNamesOnPage();
      // The native Dialogue theme already has RE:PIN's actual image URLs.
      // Briefly render it to capture avatars before returning to Script layout.
      if(dialogue && script && dialogue!==script){
        dialogue.click();
        for(let i=0;i<12;i++){
          await sleep(90);
          captureNativePortraits(names);
          const found = names.size && names.size === Object.keys(nativeCache.works?.[workKey()] || {}).filter(n=>names.has(n)).length;
          if(found)break;
        }
        // Prefer the live script card if settings have re-rendered.
        const live=findNativeThemeCard()?.card;
        (live || (script.isConnected?script:null))?.click();
      }else if(script){
        script.click();
      }
      await setTheme(true);
    }finally{
      acquiring=false;
      syncThemeSelection=false;
      schedule();
    }
  }

  const messageTokenRx = /^\s*([^\n\r|｜:：]{1,42}?)\s*([|｜:：])/;
  const standaloneRx = /^\s*([^\n\r|｜:：]{1,42}?)\s*([|｜:：])?\s*$/;
  function normalizedName(value) {
    return safe(value).replace(/^@/,'').replace(/[\s|｜:：]+$/,'').normalize('NFC');
  }
  function matchName(text, requireDelimiter = true) {
    const m = requireDelimiter ? String(text).match(messageTokenRx) : String(text).match(standaloneRx);
    if (!m) return null;
    const value = normalizedName(m[1]);
    if (!value || value.length > 40 || /[.!?。？！\n]/.test(value)) return null;
    // Configured names take precedence. Unregistered speakers may use initial-based icons.
    const known = currentPortraits();
    if (Object.hasOwn(known, value)) return value;
    if (!/^[\p{L}\p{N}_ .-]+$/u.test(value) || value.split(' ').length > 3) return null;
    if (!(/^[가-힣一-龯ぁ-んァ-ン・·]{1,10}(?: [가-힣一-龯ぁ-んァ-ン・·]{1,10}){0,2}$/u.test(value) || /^[A-Z][a-zA-Z ]{1,27}$/.test(value))) return null;
    if (['대화','대본','소설','시네마','유저','USER','나레이션','OOC','OC','SYSTEM','System','시스템','설정'].includes(value)) return null;
    return value;
  }

  function createNativeFallbackIcon(){
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns,'svg');
    svg.classList.add('ri-avatar-icon');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('aria-hidden','true');
    const circle=document.createElementNS(ns,'circle');
    circle.setAttribute('cx','12');circle.setAttribute('cy','8');circle.setAttribute('r','3.5');
    const torso=document.createElementNS(ns,'path');
    torso.setAttribute('d','M5.5 20c0-4 2.3-6 6.5-6s6.5 2 6.5 6');
    svg.append(circle,torso);
    return svg;
  }
  function createPortrait(name) {
    const box = document.createElement('span');
    box.className = PORTRAIT_CLASS;
    box.setAttribute('aria-label', `${name} 인장`);
    box.dataset.speaker = name;
    const src = getPortrait(name);
    if (src) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = src;
      box.append(img);
    } else {
      box.append(createNativeFallbackIcon());
    }
    return box;
  }
  function updatePortrait(box, name) {
    const src = getPortrait(name);
    const img = box.querySelector('img');
    if (src) {
      if (img) {if (img.src !== src) img.src=src;}
      else {box.replaceChildren();const node=document.createElement('img');node.src=src;node.alt='';box.append(node);}
    } else if (img) {
      box.replaceChildren(createNativeFallbackIcon());
    }
  }

  function addPortraitBefore(node, name) {
    const parent = node.parentNode;
    if (!parent) return;
    let prev = node.previousSibling;
    // Ignore whitespace separating inline markup from surrounding narration.
    while (prev?.nodeType === Node.TEXT_NODE && !safe(prev.textContent)) prev = prev.previousSibling;
    if (prev?.nodeType === Node.ELEMENT_NODE && prev.classList.contains(PORTRAIT_CLASS)) {
      if (prev.dataset.speaker === name) updatePortrait(prev,name);
      return;
    }
    const portrait = createPortrait(name);
    parent.insertBefore(portrait,node);
  }

  // 리핀 대본 출력은 한 화자 줄도 여러 span/text node로 나뉠 수 있습니다.
  // 한 텍스트 노드에 "유백 | 대사"가 있는 경우와
  // <span>유백</span><span> | 대사</span> 형태를 모두 처리합니다.
  const SPEAKER_LABEL_CLASSES = /(?:speaker|sender|dialogue-name|character-name|novel-speaker|script-name|script-speaker|talker|role-name)/i;
  const LINE_START = /(^|\n)([^\n|｜:：]{1,44}?)\s*([|｜:：])/g;
  function allowedSpeakerName(value) {
    const n = normalizedName(value);
    if (!n || n.length > 40 || /[.!?。？！\n\r]/.test(n)) return '';
    if (['대화','대본','소설','시네마','유저','USER','나레이션','프로필','복사','설정','OOC','OC','SYSTEM','System','시스템'].includes(n)) return '';
    if (Object.hasOwn(currentPortraits(),n)) return n;
    // A former regex rejected Korean display names with spaces, e.g. 쿠제 토오루.
    if (/^[가-힣一-龯ぁ-んァ-ン・·]{1,10}(?: [가-힣一-龯ぁ-んァ-ン・·]{1,10}){0,2}$/u.test(n) && n.length <= 30) return n;
    if (/^[A-Z][a-zA-Z ]{1,27}$/.test(n) && n.split(' ').length <= 3) return n;
    return '';
  }
  function shouldIgnoreNode(node) {
    const parent = node?.parentElement;
    if (!parent || !parent.isConnected) return true;
    if (parent.closest(`.${PORTRAIT_CLASS},.ri-script-my-narration,[contenteditable],script,style,textarea,input,button,a,select`)) return true;
    if (parent.closest('[data-ri-theme-muted]')) return true;
    return false;
  }
  function cleanAnchor(node, name) {
    let anchor = node;
    let parent = node.parentElement;
    // Put the portrait outside the <strong>/<span> so it is not clipped by text styling.
    for (let step=0;step<3 && parent && parent !== area();step++) {
      const tag = parent.tagName;
      if (!['STRONG','B','SPAN','EM','I','SMALL'].includes(tag)) break;
      if (safe(parent.textContent) !== name || parent.querySelector(`.${PORTRAIT_CLASS}`)) break;
      anchor = parent;
      parent = parent.parentElement;
    }
    return anchor;
  }
  function textHasDelimiterAfter(node, name) {
    // Examine the remainder of each nearby inline/paragraph-level container.
    // It may start in a sibling or nested element instead of the same text node.
    for (let el=node.parentElement, level=0; el && el!==area() && level<6; el=el.parentElement,level++) {
      if (el.closest('button,textarea,[contenteditable]')) break;
      if ((el.textContent||'').length > 800) break;
      const content = el.textContent || '';
      const trimmed = content.trimStart();
      // Keep the candidate at the start of a speaker line, not a name mentioned in prose.
      if (!trimmed.startsWith(name)) continue;
      const tail = trimmed.slice(name.length);
      if (/^\s*[|｜:：]/.test(tail)) return true;
      // Some output uses a dedicated speaker-label element and no textual separator.
      const classText = String(el.className || '');
      if (SPEAKER_LABEL_CLASSES.test(classText) && /^\s*(?:\S|$)/.test(tail)) return true;
    }
    return false;
  }
  function processTextNode(node) {
    if (shouldIgnoreNode(node)) return;
    const text=node.textContent || '';
    if (!text.trim() || textNodeFingerprint.get(node) === text) return;
    // Existing unchanged nodes need no repeat parsing after every UI mutation.
    textNodeFingerprint.set(node, text);

    // Complete speaker prefix inside one text node, including multi-line paragraphs.
    LINE_START.lastIndex = 0;
    const matches = [];
    let match;
    while ((match=LINE_START.exec(text)) !== null) {
      const name=allowedSpeakerName(match[2]);
      if (name) {observedNames.add(name);matches.push({start:match.index + match[1].length,name});}
    }
    if (matches.length) {
      // Work from end so splitting one line cannot shift the offsets of earlier lines.
      for(let i=matches.length-1;i>=0;i--) {
        const {start,name}=matches[i];
        const anchor=start===0 ? node : node.splitText(start);
        addPortraitBefore(anchor,name);
      }
      return;
    }

    // Fragmented prefix: <span>한서율</span><span> | 통과다</span>
    // or <strong>한서율</strong> | 통과다.
    const name=allowedSpeakerName(text);
    if (!name || safe(text)!==name) return;
    observedNames.add(name);
    if (textHasDelimiterAfter(node,name) || SPEAKER_LABEL_CLASSES.test(String(node.parentElement?.className || ''))) {
      addPortraitBefore(cleanAnchor(node,name),name);
    }
  }
  // Match a native user message and its quote/narration container, without
  // changing the text, adding a new speaker name, or creating a custom image.
  const OWN_USER_SELECTOR = [
    '.message.user','.message.mine','.message.own','.message--user',
    '.user-message','.message-user','.chat-user-message','.chat-message.user',
    '.message.from-user','[class*="user-message" i]','[class*="message-user" i]',
    '[class*="my-message" i]','[data-role="user"]','[data-sender="user"]',
    '[data-message-role="user"]','[data-is-user="true"]','[data-author="user"]'
  ].join(',');
  const ASSISTANT_SELECTOR = [
    '.message.assistant','.message.ai','.message--assistant','.assistant-message',
    '.ai-message','.message-character','[data-role="assistant"]',
    '[data-sender="assistant"]','[data-message-role="assistant"]',
    '[data-author="assistant"]','[data-role="character"]'
  ].join(',');
  const OWN_QUOTE_SELECTOR = [
    'blockquote', '.script-user-narration','.user-narration',
    '.message-narration','.script-narration',
    '[data-message-type="user-narration"]',
    '[class*="user-narration" i]'
  ].join(',');
  function isAssistantQuote(el) {
    const assistant=el.closest(ASSISTANT_SELECTOR);
    const mine=el.closest(OWN_USER_SELECTOR);
    return !!assistant && (!mine || assistant.contains(mine));
  }
  function narrationTargets() {
    const container=area();
    if (!container) return [];
    const result=new Set();
    // Main path: use the site's own message block. If it contains a quote, attach
    // the portrait directly to that quote, the area highlighted by the user.
    for(const block of container.querySelectorAll(OWN_USER_SELECTOR)){
      if (!safe(block.textContent) || block.closest('#ri-avatar-switcher-root')) continue;
      if (block.parentElement?.closest(OWN_USER_SELECTOR) && block.parentElement!==container) continue;
      const quotes=[...block.querySelectorAll(OWN_QUOTE_SELECTOR)];
      if(quotes.length) {
        for(const quote of quotes) if(!isAssistantQuote(quote) && safe(quote.textContent)) result.add(quote);
      } else if (block.matches(OWN_QUOTE_SELECTOR) || block.getBoundingClientRect().height>0){
        result.add(block);
      }
    }
    // Fallback for script layouts where a bare <blockquote> is rendered without
    // an explicit user role. Only trust this heuristic in a room that the user
    // explicitly enabled: a different story may use quotes for AI narration.
    if (preferences.works?.[workKey()] === true) for(const quote of container.querySelectorAll(OWN_QUOTE_SELECTOR)) {
      if(result.has(quote) || isAssistantQuote(quote)) continue;
      if(quote.closest('.ri-script-portrait') || quote.closest('[contenteditable]'))continue;
      if(!safe(quote.textContent) || quote.querySelector('.ri-script-my-avatar'))continue;
      const text=safe(quote.textContent);
      if(/^[^\n|｜:：]{1,36}\s*[|｜:：]/.test(text))continue;
      const border = getComputedStyle(quote).borderLeftWidth;
      const looksLikeQuote = quote.tagName === 'BLOCKQUOTE' || Number.parseFloat(border)>0;
      if(looksLikeQuote)result.add(quote);
    }
    return [...result].filter(el=>el?.isConnected && el!==container);
  }
  function removeOwnNarrationPortraits() {
    const container=area();
    if(!container)return;
    container.querySelectorAll('.ri-script-my-avatar').forEach(node=>node.remove());
    container.querySelectorAll('.ri-script-my-narration').forEach(node=>{
      node.classList.remove('ri-script-my-narration','ri-script-my-narration-inset','ri-script-my-rule');
    });
    // Clean up any elements created by the previous v1.5 layout.
    container.querySelectorAll('.ri-script-own-portrait,.ri-script-own-name').forEach(node=>node.remove());
    container.querySelectorAll('.ri-script-own-message').forEach(node=>node.classList.remove('ri-script-own-message'));
  }
  function applyOwnNarrationPortraits() {
    const container=area();
    if(!container || !isChatOpen() || !isEnabled()){
      removeOwnNarrationPortraits();
      return;
    }
    // Migrate v1.5's own-message name/avatar layout back to the native quote.
    container.querySelectorAll('.ri-script-own-portrait,.ri-script-own-name').forEach(node=>node.remove());
    container.querySelectorAll('.ri-script-own-message').forEach(node=>node.classList.remove('ri-script-own-message'));
    const desired=new Set(narrationTargets());
    for(const stale of container.querySelectorAll('.ri-script-my-narration')){
      if(!desired.has(stale)){
        stale.querySelector(':scope > .ri-script-my-avatar')?.remove();
        stale.classList.remove('ri-script-my-narration','ri-script-my-narration-inset','ri-script-my-rule');
      }
    }
    const profileSrc=ownPortrait();
    const name=ownDisplayName();
    for(const quote of desired){
      if (quote.matches('[contenteditable]'))continue;
      quote.classList.add('ri-script-my-narration');
      // The avatar always remains within the narration element.  Clean up
      // older layout classes when upgrading without reloading the chat.
      quote.classList.remove('ri-script-my-rule','ri-script-my-narration-inset');
      let portrait=[...quote.children].find(x=>x.classList?.contains('ri-script-my-avatar'));
      if(!portrait){
        portrait=createPortrait(name);
        portrait.classList.add('ri-script-my-avatar');
        quote.insertBefore(portrait,quote.firstChild);
      }
      portrait.setAttribute('aria-label',`${name} 인장`);
      portrait.dataset.speaker=name;
      // Empty/missing native photo -> native-style silhouette (never a letter).
      const img=portrait.querySelector('img');
      if(profileSrc){
        if(img){ if(img.getAttribute('src')!==profileSrc)img.src=profileSrc; }
        else{const image=document.createElement('img');image.src=profileSrc;image.alt='';portrait.replaceChildren(image);}
      }else if(img || !portrait.querySelector('svg')){
        portrait.replaceChildren(createNativeFallbackIcon());
      }
    }
  }

  function applyPortraits() {
    const container=area();
    if (!container || !isChatOpen()) return;
    if (!isEnabled()) {
      container.querySelectorAll(`.${PORTRAIT_CLASS}`).forEach(x=>x.remove());
      return;
    }
    const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT,{
      acceptNode(node) {
        return shouldIgnoreNode(node) || !String(node.textContent||'').trim()
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    // Snapshot before inserting/splitting text nodes to avoid observer recursion.
    const nodes=[];
    for(let n=walker.nextNode();n && nodes.length<2200;n=walker.nextNode()) nodes.push(n);
    for(const node of nodes) if(node.isConnected) processTextNode(node);
    // Newly saved/replaced images should immediately update already placed portraits.
    for(const portrait of container.querySelectorAll(`.${PORTRAIT_CLASS}`)) {
      const name=portrait.dataset.speaker;
      if(name) updatePortrait(portrait,name);
    }
  }

  function syncLightSurface(){
    const container=area();
    if(!container)return;
    let node=container, bright=false;
    for(let i=0;node && i<10;i++,node=node.parentElement){
      const color=getComputedStyle(node).backgroundColor;
      const m=color?.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)/i);
      if(!m || (m[4]!==undefined && Number(m[4])<.2))continue;
      bright = (Number(m[1])*.2126 + Number(m[2])*.7152 + Number(m[3])*.0722) > 178;
      break;
    }
    container.classList.toggle('ri-script-light-surface',bright);
  }

  function run() {
    const now=Date.now(), open=isChatOpen();
    if (!open) {
      if(lastScanArea && lastScanEnabled){
        lastScanArea.querySelectorAll(`.${PORTRAIT_CLASS}`).forEach(x=>x.remove());
        removeOwnNarrationPortraits();
      }
      lastScanArea=null;lastScanEnabled=false;messagesDirty=true;
      return;
    }
    const key=workKey(), container=area(), enabled=isEnabled();
    const roomChanged=activeKey!==key || lastScanArea!==container;
    const themeChanged=lastScanEnabled!==enabled;
    if (roomChanged) {
      activeKey=key;
      nativeSyncCompleted.clear();
      messagesDirty=true;
      lastCapture=0;
      // Do not revisit every previously rendered message on each keystroke.
      container?.querySelectorAll(`.${PORTRAIT_CLASS}`).forEach(x=>x.remove());
    }
    lastScanArea=container;lastScanEnabled=enabled;
    createStyles();
    // The settings theme drawer is uncommon; avoid full-document scanning
    // every time the message input or animation changes.
    if(roomChanged || themeChanged || now-lastThemeUICheck > (mobileMode?3800:1800)) {
      lastThemeUICheck=now;
      injectPanelToggle();
      injectThemeCard();
      normalizeNativeScriptSelection();
    }
    const needsMessages=messagesDirty || roomChanged || themeChanged || now-lastMessageScan>45000;
    if(!needsMessages) return;
    messagesDirty=false;
    lastMessageScan=now;
    syncLightSurface();
    if(now-lastCapture> (mobileMode?18000:9000) || roomChanged){
      lastCapture=now;
      captureNativePortraits();
    }
    if(nativeDialogueAvatarsVisible()){
      container?.querySelectorAll(`.${PORTRAIT_CLASS}`).forEach(x=>x.remove());
      removeOwnNarrationPortraits();
    }else{
      applyPortraits();
      applyOwnNarrationPortraits();
    }
  }
  function schedule() {
    if (pending) return;
    pending = true;
    themeTimer=setTimeout(()=>{
      themeTimer=null;
      requestAnimationFrame(()=>{pending=false;run();});
    },mobileMode?380:90);
  }
  function init() {
    createStyles();
    Promise.all([chrome.storage.local.get(THEME_KEY),chrome.storage.local.get(AVATAR_KEY),chrome.storage.local.get(CACHE_KEY)]).then(([t,a,c])=>{
      if (t?.[THEME_KEY]?.works) preferences=t[THEME_KEY];
      // Existing v1.6.2 users already enabled this theme in at least one room.
      // Interpret that as wanting the same view in new rooms, without changing
      // RE:PIN's native theme setting or erasing the per-room selections.
      if (typeof preferences.globalEnabled !== 'boolean') {
        preferences.globalEnabled = Object.values(preferences.works || {}).some(v=>v===true);
        chrome.storage.local.set({[THEME_KEY]:preferences}).catch(console.warn);
      }
      if (a?.[AVATAR_KEY]?.works) avatarData=a[AVATAR_KEY];
      if (c?.[CACHE_KEY]?.works) nativeCache=c[CACHE_KEY];
      schedule();
    }).catch(console.warn);
    hookNativeThemeClick();
    // Settings panes can be mounted outside #chatOverlay. A direct user click
    // requests one debounced theme/menu check without watching all input edits.
    document.addEventListener('click', () => {
      if (isChatOpen() && !document.hidden) schedule();
    }, true);
    const observer = new MutationObserver(mutations=>{
      const messages=area(), overlay=chat();
      let shouldRun=false;
      for(const m of mutations){
        const node=m.target;
        if(node===uiStyle || node?.nodeType!==Node.ELEMENT_NODE)continue;
        if(node.closest?.(`#${OPTION_ID},#ri-avatar-switcher-root,#ri-tm-bottom-menu`))continue;
        if(node.closest?.(`.${PORTRAIT_CLASS},.ri-avatar-override`))continue;
        if(messages && (node===messages || messages.contains(node))){
          if(m.type==='attributes' && m.attributeName==='style')continue;
          // Ignore extension-owned avatar insertion/removal where possible.
          if(m.type==='childList' && m.addedNodes.length && [...m.addedNodes].every(x=>x.nodeType===Node.ELEMENT_NODE && x.matches?.(`.${PORTRAIT_CLASS},.ri-script-my-avatar`)))continue;
          messagesDirty=true;shouldRun=true;
        }else if(node===overlay || node.id==='chatTitle' || node.closest?.('#chatTitle')){
          shouldRun=true;
        }else if(!node.closest?.('#chatOverlay') && m.type==='childList'){
          // Site settings drawers can render outside the overlay.
          // They are checked by the low-frequency poll, not on each edit.
          continue;
        }
      }
      if(shouldRun)schedule();
    });
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','src','aria-hidden','inert']});
    chrome.storage.onChanged.addListener((changes,where)=>{
      if(where!=='local') return;
      if(changes[THEME_KEY]?.newValue) preferences=changes[THEME_KEY].newValue;
      if(changes[AVATAR_KEY]?.newValue) avatarData=changes[AVATAR_KEY].newValue;
      if(changes[CACHE_KEY]?.newValue) nativeCache=changes[CACHE_KEY].newValue;
      schedule();
    });
    setInterval(() => {if(isChatOpen() && !document.hidden) schedule();}, mobileMode?6000:4000);
    schedule();
  }
  bottomMenuTheme.isEnabled = () => isEnabled();
  bottomMenuTheme.isGlobal = () => preferences.globalEnabled === true;
  bottomMenuTheme.toggle = async () => {
    if (isEnabled()) await setTheme(false);
    else await enableEnhancedTheme();
  };
  bottomMenuTheme.toggleGlobal = async () => {
    await setGlobalTheme(preferences.globalEnabled !== true);
  };
  init();
})();

  // The PC extension opens settings via a browser popup. Tampermonkey users
  // may use the script menu or the same embedded backup controls in settings.
  function installBackupControls() {
    const host=document.getElementById('ri-avatar-switcher-root');
    const shadow=host?.shadowRoot;
    if(!shadow || shadow.querySelector('#ri-tm-backup-section'))return;
    const target=shadow.querySelector('.panel');
    if(!target)return;
    const section=document.createElement('div');
    section.id='ri-tm-backup-section';
    section.style.cssText='border-top:1px solid #e4e5e9;margin-top:14px;padding-top:12px;';
    const heading=document.createElement('div');
    heading.textContent='설정 백업 · 다른 기기로 옮기기';
    heading.style.cssText='font-size:12px;font-weight:750;color:#3f4148;margin-bottom:7px;';
    const row=document.createElement('div');
    row.style.cssText='display:flex;gap:8px;';
    const exportBtn=document.createElement('button');
    exportBtn.type='button';exportBtn.textContent='JSON 백업 다운로드';
    const importBtn=document.createElement('button');
    importBtn.type='button';importBtn.textContent='PC 백업 가져오기';
    for(const btn of [exportBtn,importBtn]){
      btn.style.cssText='flex:1;border:1px solid #dfe0e8;border-radius:8px;padding:10px 8px;background:white;color:#414450;font-size:11px;font-weight:700;cursor:pointer;';
      row.appendChild(btn);
    }
    exportBtn.addEventListener('click',()=>{exportBackup().catch(e=>alert('백업 실패: '+e.message));});
    importBtn.addEventListener('click',importBackupPicker);
    const note=document.createElement('p');
    note.style.cssText='margin:8px 0 0;font-size:10px;color:#858794;line-height:1.6;';
    note.textContent='PC 확장프로그램에서 내려받은 JSON을 그대로 가져옵니다. 백업에는 캐릭터 사진도 포함됩니다.';
    section.append(heading,row,note);
    target.append(section);
  }
  installBackupControls();

  // v1.8.1: compact mobile/desktop menu inside RE:PIN's own chat bottom bar.
  // Keep the original Tampermonkey commands as a fallback, but do not add
  // a floating button that covers the chat or the composer.
  function installChatBottomMenu() {
    const BUTTON_ID = 'ri-tm-bottom-button';
    const MENU_ID = 'ri-tm-bottom-menu';
    const STYLE_ID = 'ri-tm-bottom-style';
    let trigger = null;
    let menu = null;
    let opened = false;
    let syncing = false;
    let previousFocus = null;

    function visibleChat() {
      const chat = document.getElementById('chatOverlay');
      return !!chat && !chat.hasAttribute('inert')
        && chat.getAttribute('aria-hidden') !== 'true'
        && !chat.classList.contains('chat-overlay--parked');
    }

    function injectStyles() {
      if (document.getElementById(STYLE_ID)) return;
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = `
        #${BUTTON_ID} {
          display:inline-flex!important;align-items:center!important;justify-content:center!important;
          gap:5px!important;flex:0 0 auto!important;min-width:54px!important;
          white-space:nowrap!important;line-height:1.2!important;
          border-radius:999px!important;cursor:pointer!important;
          user-select:none!important;-webkit-tap-highlight-color:transparent;
        }
        #${BUTTON_ID} svg {width:15px!important;height:15px!important;flex-shrink:0!important}
        #${BUTTON_ID} [data-ri-label]{font-size:12px!important;font-weight:650!important}
        #${BUTTON_ID}[aria-expanded="true"]{outline:1px solid #8982f9!important;outline-offset:-1px!important}
        #${MENU_ID}{
          position:fixed!important;display:none;z-index:2147483646!important;
          box-sizing:border-box!important;width:min(282px,calc(100vw - 24px))!important;
          max-height:min(365px,65vh)!important;overflow-y:auto!important;
          border:1px solid #dedfe7!important;border-radius:15px!important;
          background:#fcfcfe!important;color:#2c2e39!important;
          box-shadow:0 14px 42px rgba(0,0,0,.25)!important;
          padding:7px!important;font-family:Pretendard,"Noto Sans KR",Arial,sans-serif!important;
          font-size:12px!important;-webkit-overflow-scrolling:touch!important;
        }
        #${MENU_ID}[data-open="true"]{display:block!important}
        #${MENU_ID} .ri-tm-menu-head{
          padding:10px 11px 8px!important;display:flex!important;align-items:center!important;
          justify-content:space-between!important;gap:10px!important;
        }
        #${MENU_ID} .ri-tm-menu-title{font-size:13px!important;font-weight:800!important;color:#30323e!important}
        #${MENU_ID} .ri-tm-menu-sub{font-size:10px!important;color:#858796!important}
        #${MENU_ID} .ri-tm-menu-line{height:1px!important;background:#ececf1!important;margin:5px 3px!important}
        #${MENU_ID} button{
          box-sizing:border-box!important;display:flex!important;align-items:center!important;
          justify-content:space-between!important;gap:8px!important;
          width:100%!important;min-height:39px!important;margin:0!important;
          border:0!important;border-radius:9px!important;background:transparent!important;
          text-align:left!important;color:#373947!important;padding:9px 11px!important;
          font-family:inherit!important;font-size:12px!important;font-weight:650!important;
          cursor:pointer!important;touch-action:manipulation!important;
        }
        #${MENU_ID} button:hover,#${MENU_ID} button:focus-visible{background:#f0f0fa!important;outline:none!important}
        #${MENU_ID} button:disabled{opacity:.55!important;cursor:wait!important}
        #${MENU_ID} button [data-ri-status]{
          font-size:10px!important;font-weight:700!important;color:#777b8c!important;
          white-space:nowrap!important;
        }
        #${MENU_ID} button [data-ri-status="on"]{color:#514ce7!important}
        #${MENU_ID} .ri-tm-footer{font-size:10px!important;color:#9294a0!important;padding:7px 11px 8px!important;line-height:1.5!important}
        @media(max-width:420px){
          #${BUTTON_ID}{min-width:44px!important;padding-left:8px!important;padding-right:8px!important}
          #${MENU_ID}{max-height:min(360px,60vh)!important}
        }
        @media(max-width:355px){
          #${BUTTON_ID}{min-width:32px!important;width:32px!important;padding:6px!important}
          #${BUTTON_ID} [data-ri-label]{display:none!important}
        }
      `;
      document.documentElement.appendChild(s);
    }

    function addOption(label, action, state = '', key = '') {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = key;
      const text = document.createElement('span');
      text.textContent = label;
      button.appendChild(text);
      if (state) {
        const tag = document.createElement('span');
        tag.setAttribute('data-ri-status', state === '켜짐' ? 'on' : 'off');
        tag.textContent = state;
        button.appendChild(tag);
      }
      button.addEventListener('click', async event => {
        event.stopPropagation();
        if (button.disabled) return;
        // Actions that open their own UI should close the menu first.
        closeMenu();
        try {
          await action();
        } catch (err) {
          alert('RE:PIN 메뉴 실행 실패: ' + (err?.message || String(err)));
        }
      });
      menu.appendChild(button);
    }

    function updatePlacement() {
      if (!opened || !menu?.isConnected || !trigger?.isConnected) return;
      const r = trigger.getBoundingClientRect();
      const mw = menu.offsetWidth || 282;
      const mh = menu.offsetHeight || 315;
      const w = document.documentElement.clientWidth;
      const h = window.innerHeight;
      // Always prefer opening above the input row.
      const left = Math.max(12, Math.min(r.left, w - mw - 12));
      const above = r.top - mh - 8;
      const top = above >= 8 ? above : Math.max(8, Math.min(r.bottom + 8, h - mh - 8));
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
    }

    function closeMenu() {
      if (!opened) return;
      opened = false;
      if (menu) {
        menu.dataset.open = 'false';
        menu.setAttribute('aria-hidden','true');
      }
      if (trigger) trigger.setAttribute('aria-expanded','false');
    }

    function buildMenu() {
      menu.replaceChildren();
      const head = document.createElement('div');
      head.className = 'ri-tm-menu-head';
      const title = document.createElement('span');
      title.className = 'ri-tm-menu-title';
      title.textContent = 'RE:PIN 인장';
      const sub = document.createElement('span');
      sub.className = 'ri-tm-menu-sub';
      sub.textContent = '대본-개편';
      head.append(title, sub);
      menu.appendChild(head);
      const hr = () => {
        const line = document.createElement('div');
        line.className = 'ri-tm-menu-line';
        menu.appendChild(line);
      };
      const enabled = !!bottomMenuTheme.isEnabled?.();
      const globalEnabled = !!bottomMenuTheme.isGlobal?.();
      addOption('대본-개편 · 현재 방', () => bottomMenuTheme.toggle?.(),
                enabled ? '켜짐' : '꺼짐', 'theme');
      addOption('새 채팅방 자동 적용', () => bottomMenuTheme.toggleGlobal?.(),
                globalEnabled ? '켜짐' : '꺼짐', 'global');
      hr();
      addOption('인장 설정 · 이미지 자르기', () => sendCommand('OPEN_SETTINGS'), '', 'settings');
      addOption('공용 인장 보관함', () => sendCommand('OPEN_SHARED'), '', 'shared');
      addOption('대화에서 인장 직접 선택', () => sendCommand('PICK_AVATAR'), '', 'pick');
      hr();
      addOption('설정 JSON 백업 다운로드', () => exportBackup(), '', 'backup');
      addOption('PC 백업 JSON 가져오기', () => importBackupPicker(), '', 'import');
      const footer = document.createElement('div');
      footer.className='ri-tm-footer';
      footer.textContent='이미지와 설정은 현재 브라우저에만 저장됩니다.';
      menu.appendChild(footer);
    }

    function openMenu() {
      if (!trigger?.isConnected || !visibleChat()) return;
      if (!menu?.isConnected) makeMenu();
      previousFocus = document.activeElement;
      buildMenu();
      opened = true;
      menu.dataset.open = 'true';
      menu.setAttribute('aria-hidden','false');
      trigger.setAttribute('aria-expanded','true');
      updatePlacement();
    }

    function makeMenu() {
      menu = document.createElement('div');
      menu.id=MENU_ID;
      menu.setAttribute('role','menu');
      menu.setAttribute('aria-label','RE:PIN 인장 설정 메뉴');
      menu.setAttribute('aria-hidden','true');
      menu.dataset.open='false';
      document.documentElement.appendChild(menu);
    }

    function createButton() {
      const btn = document.createElement('button');
      btn.type='button';
      btn.id=BUTTON_ID;
      btn.className='input-option-chip chat-tools-button';
      btn.title='RE:PIN 인장 메뉴';
      btn.setAttribute('aria-label','RE:PIN 인장 메뉴 열기');
      btn.setAttribute('aria-haspopup','menu');
      btn.setAttribute('aria-controls',MENU_ID);
      btn.setAttribute('aria-expanded','false');
      const svgNS='http://www.w3.org/2000/svg';
      const svg=document.createElementNS(svgNS,'svg');
      svg.setAttribute('viewBox','0 0 24 24');
      svg.setAttribute('fill','none');
      svg.setAttribute('stroke','currentColor');
      svg.setAttribute('stroke-width','1.8');
      svg.setAttribute('stroke-linecap','round');
      svg.setAttribute('stroke-linejoin','round');
      const rect=document.createElementNS(svgNS,'rect');
      rect.setAttribute('x','3');rect.setAttribute('y','3');
      rect.setAttribute('width','18');rect.setAttribute('height','18');
      rect.setAttribute('rx','4');
      const path=document.createElementNS(svgNS,'path');
      path.setAttribute('d','m5 17 5-5 3.5 3.5 2.5-2.5 3 4M15.8 8.2h.01');
      svg.append(rect,path);
      const label = document.createElement('span');
      label.dataset.riLabel='';
      label.textContent='인장';
      btn.append(svg,label);
      btn.addEventListener('click', event=>{
        event.preventDefault();
        event.stopPropagation();
        if (opened) closeMenu();
        else openMenu();
      });
      return btn;
    }

    function ensureButton() {
      if (syncing) return;
      syncing=true;
      try {
        const chip = document.querySelector('#chatProfileChip');
        const tools = document.querySelector('#chatToolsBtn');
        const row = tools?.parentElement || chip?.parentElement;
        if (!visibleChat() || !row || !row.closest('#chatOverlay')) {
          closeMenu();
          return;
        }
        if (!document.getElementById(STYLE_ID)) injectStyles();
        if (!menu?.isConnected) makeMenu();
        const current = document.getElementById(BUTTON_ID);
        if (current && current !== trigger) trigger=current;
        if (!trigger || !trigger.isConnected || trigger.parentElement !== row) {
          trigger = current || createButton();
          if (tools && tools.parentElement === row) row.insertBefore(trigger,tools);
          else row.appendChild(trigger);
        }
        if (opened) updatePlacement();
      } finally { syncing=false; }
    }

    // Clicks on other controls, Escape and leaving the chat close this UI.
    document.addEventListener('pointerdown',e=>{
      if(!opened) return;
      if (trigger?.contains(e.target) || menu?.contains(e.target)) return;
      closeMenu();
    },true);
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' && opened) {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        trigger?.focus({preventScroll:true});
      }
    },true);
    window.addEventListener('resize',()=>{if(opened) updatePlacement();});
    window.addEventListener('scroll',()=>{if(opened) updatePlacement();},true);
    // The chat controls may be replaced after SPA navigation.
    let menuCheckPending=false;
    const observer=new MutationObserver(mutations=> {
      if(syncing || menuCheckPending)return;
      const relevant=mutations.some(m=>{
        const node=m.target;
        if(node?.nodeType!==Node.ELEMENT_NODE)return false;
        // Most chat mutations are in #messagesContainer; never react to those.
        if(node.closest?.('#messagesContainer'))return false;
        return node.id==='chatOverlay' || node.closest?.('.input-actions,.input-area,.input-actions-left') ||
          [...m.addedNodes].some(n=>n.nodeType===Node.ELEMENT_NODE && (n.id==='chatToolsBtn' || n.querySelector?.('#chatToolsBtn')));
      });
      if(!relevant)return;
      menuCheckPending=true;
      requestAnimationFrame(()=>{menuCheckPending=false;ensureButton();});
    });
    const obsTarget=document.getElementById('chatOverlay') || document.documentElement;
    observer.observe(obsTarget,{childList:true,subtree:true});
    ensureButton();
    setInterval(()=>{if(!document.hidden)ensureButton();},10000);
  }
  installChatBottomMenu();

})();
