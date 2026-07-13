(function () {
  'use strict';

  var data = window.NG_DATA;
  if (!data) return;

  var STORAGE_KEY = 'ng-session:null-grail-v3.2';
  var STATE_SCHEMA_VERSION = 3;
  var RULESET_ID = data.rulesetId || 'null-grail-v3.2-light-d20';
  var playerData = window.NG_PLAYER_DATA || {};
  var MESSAGE_PROTOCOL = playerData.protocol || 'null-grail-player-v3';
  var CHARACTER_PROTOCOL = playerData.characterProtocol || 'null-grail-character-v1';
  var CHARACTER_COLLECTION_PROTOCOL = playerData.characterCollectionProtocol || 'null-grail-character-collection-v1';
  var CHANNEL_NAME = playerData.channelName || 'null-grail-player';
  var approaches = Array.isArray(playerData.approaches) ? playerData.approaches : [];
  var difficulties = Array.isArray(playerData.difficulties) ? playerData.difficulties : [];
  var resultBands = Array.isArray(playerData.resultBands) ? playerData.resultBands : [];
  var channel = null;
  var undoStack = [];
  var currentView = 'current';
  var npcFilter = 'all';
  var mapFilter = 'all';
  var selectedLocationId = null;
  var activeCheckRequestId = null;
  var toastTimer = null;
  var lastPlayerPayload = null;
  var playerWindows = [];
  var messageOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
  var allowedSealStates = ['blank','used','anchored','locked'];

  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = function (event) {
      var message = event.data;
      if (!message || typeof message !== 'object') return;
      if (message.protocol && message.protocol !== MESSAGE_PROTOCOL) return;
      if (message.type === 'ready') {
        sendPlayerMessage(lastPlayerPayload
          ? { type:'show', handout:lastPlayerPayload }
          : { type:'curtain' });
        var readyCharacterId = normalizeId(message.characterId, 'pc', false);
        var latestResult = state && state.checkHistory.find(function (result) {
          return result.targetCharacterId === 'all' || (readyCharacterId && result.targetCharacterId === readyCharacterId);
        });
        if (latestResult) sendPlayerMessage({ type:'check-result', result:latestResult });
        return;
      }
      if (message.type === 'character-submit') receiveCharacterSubmission(message);
      if (message.type === 'check-request') receiveCheckRequest(message.request);
    };
  } catch (error) { channel = null; }

  function freshState() {
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      campaignVersion: '3.2',
      dayId: 'D1',
      loop: 0,
      activeSceneId: null,
      activeNpcs: [],
      trackers: { anomaly: 2, grail: 0, anchor: 0, theory: 0, memory: 0, observation: 0 },
      seals: ['blank', 'blank', 'blank'],
      sealMeta: [{ reflownLoop:-1, note:'' }, { reflownLoop:-1, note:'' }, { reflownLoop:-1, note:'' }],
      reflowsThisSession: 0,
      finaleSeal: 'unavailable',
      completedScenes: [],
      resolvedNodes: [],
      sceneResults: {},
      resetHistory: [],
      anchoredFacts: [],
      sceneClues: {},
      revealedHandouts: [],
      activeHandoutId: null,
      knownTruthSources: {},
      visitedLocations: [],
      npcLocations: {},
      conflictClocks: { goal:0, threat:0, goalLabel:'玩家目标', threatLabel:'敌方／环境威胁' },
      roster: [],
      characterInbox: [],
      checkRequests: [],
      checkHistory: [],
      sessionNotes: '',
      clueNotes: '',
      log: []
    };
  }

  function clampNumber(value, minimum, maximum, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) number = fallback;
    return Math.max(minimum, Math.min(maximum, number));
  }

  function clampInteger(value, minimum, maximum, fallback) {
    return Math.round(clampNumber(value, minimum, maximum, fallback));
  }

  function safeText(value, maximum) {
    var text = typeof value === 'string' ? value : '';
    return text.replace(/\u0000/g, '').trim().slice(0, maximum);
  }

  function createId(prefix) {
    var random = '';
    try {
      var bytes = new Uint32Array(2);
      window.crypto.getRandomValues(bytes);
      random = bytes[0].toString(36) + bytes[1].toString(36);
    } catch (error) {
      random = Math.random().toString(36).slice(2, 14);
    }
    return prefix + '-' + Date.now().toString(36) + '-' + random.slice(0, 16);
  }

  function normalizeId(value, prefix, createWhenMissing) {
    var id = safeText(value, 64);
    if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) return id;
    return createWhenMissing ? createId(prefix) : '';
  }

  function approachDefinition(id) {
    return approaches.find(function (item) { return item.id === id; }) || approaches[0] || { id:'physique', label:'体魄' };
  }

  function bandDefinition(id) {
    return resultBands.find(function (item) { return item.id === id; }) || { id:id, label:id };
  }

  function normalizeCharacter(raw, createWhenMissing) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (raw.character && typeof raw.character === 'object') raw = raw.character;
    if (raw.protocol && raw.protocol !== CHARACTER_PROTOCOL && raw.protocol !== 'null-grail-character-v1') return null;
    if (raw.rulesetId && raw.rulesetId !== RULESET_ID) return null;
    var supplied = raw.approaches && typeof raw.approaches === 'object' ? raw.approaches : {};
    var approachValues = {};
    approaches.forEach(function (definition, index) {
      approachValues[definition.id] = clampInteger(supplied[definition.id], 0, 5, [3,2,2,1,0][index] || 0);
    });
    var specialties = [];
    if (Array.isArray(raw.specialties)) raw.specialties.slice(0, 3).forEach(function (entry) {
      var name = safeText(typeof entry === 'string' ? entry : entry && entry.name, 80);
      if (name && specialties.indexOf(name) === -1) specialties.push(name);
    });
    var trauma = [];
    if (Array.isArray(raw.trauma)) raw.trauma.slice(0, 12).forEach(function (entry) {
      var item = safeText(entry, 160); if (item) trauma.push(item);
    });
    else if (typeof raw.trauma === 'string') raw.trauma.split(/\r?\n/).slice(0, 12).forEach(function (entry) {
      var item = safeText(entry, 160); if (item) trauma.push(item);
    });
    return {
      protocol:CHARACTER_PROTOCOL,
      rulesetId:RULESET_ID,
      id:normalizeId(raw.id, 'pc', createWhenMissing !== false),
      name:safeText(raw.name, 80),
      playerName:safeText(raw.playerName, 80),
      pronouns:safeText(raw.pronouns, 80),
      origin:safeText(raw.origin, 120),
      identity:safeText(raw.identity, 400),
      wish:safeText(raw.wish, 600),
      fearedIdentity:safeText(raw.fearedIdentity, 400),
      anchor:safeText(raw.anchor, 400),
      existenceType:['present','master','servant'].indexOf(raw.existenceType) !== -1 ? raw.existenceType : 'present',
      approaches:approachValues,
      specialties:specialties,
      resolve:clampInteger(raw.resolve, 0, 3, 3),
      stress:clampInteger(raw.stress, 0, 3, 0),
      injury:['none','light','serious','critical'].indexOf(raw.injury) !== -1 ? raw.injury : 'none',
      trauma:trauma,
      coreLoad:clampInteger(raw.coreLoad, 0, 3, 0),
      noblePhantasmReady:raw.noblePhantasmReady !== false,
      notes:safeText(raw.notes, 1600),
      updatedAt:safeText(raw.updatedAt, 40) || new Date().toISOString()
    };
  }

  function normalizeSubmission(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.character || (raw.character.protocol !== CHARACTER_PROTOCOL && raw.character.protocol !== 'null-grail-character-v1') || raw.character.rulesetId !== RULESET_ID) return null;
    var character = normalizeCharacter(raw.character, false);
    var id = normalizeId(raw.id || raw.submissionId, 'submission', false);
    if (!id || !character || !character.id || !character.name) return null;
    return { id:id, receivedAt:safeText(raw.receivedAt || raw.sentAt, 40) || new Date().toISOString(), character:character };
  }

  function normalizeCheckRequest(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (raw.protocol && raw.protocol !== (playerData.checkProtocol || 'null-grail-check-v1')) return null;
    if (raw.rulesetId && raw.rulesetId !== RULESET_ID) return null;
    var id = normalizeId(raw.id, 'request', false);
    var characterId = normalizeId(raw.characterId, 'pc', false);
    var goal = safeText(raw.goal, 500);
    if (!id || !characterId || !goal) return null;
    return {
      id:id,
      characterId:characterId,
      characterName:safeText(raw.characterName, 80) || '未命名角色',
      goal:goal,
      risk:safeText(raw.risk, 500),
      approachId:approachDefinition(safeText(raw.approachId, 24)).id,
      approachValue:clampInteger(raw.approachValue, 0, 5, 0),
      specialty:safeText(raw.specialty, 80),
      specialtyBonus:clampInteger(raw.specialtyBonus, 0, 2, raw.specialty ? 2 : 0),
      mode:['normal','advantage','disadvantage'].indexOf(raw.mode) !== -1 ? raw.mode : 'normal',
      assist:clampInteger(raw.assist, 0, 3, 0),
      modifier:clampInteger(raw.modifier, -20, 20, 0),
      suggestedDc:clampInteger(raw.suggestedDc, 0, 40, 0),
      createdAt:safeText(raw.createdAt, 40) || new Date().toISOString()
    };
  }

  function normalizeCheckResult(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    var id = normalizeId(raw.id, 'result', false);
    var tier = ['exceptional','success','costly','severe'].indexOf(raw.tier) !== -1 ? raw.tier : '';
    var dice = Array.isArray(raw.dice) ? raw.dice.slice(0, 2).map(function (die) { return clampInteger(die, 1, 20, 1); }) : [];
    if (!id || !tier || !dice.length) return null;
    var approach = approachDefinition(safeText(raw.approachId, 24));
    return {
      id:id,
      requestId:normalizeId(raw.requestId, 'request', false),
      targetCharacterId:normalizeId(raw.targetCharacterId, 'pc', false) || 'all',
      characterName:safeText(raw.characterName, 80) || '全体玩家',
      goal:safeText(raw.goal, 500),
      risk:safeText(raw.risk, 500),
      costOwner:safeText(raw.costOwner, 80),
      approachId:approach.id,
      approachLabel:approach.label,
      approachValue:clampInteger(raw.approachValue, 0, 5, 0),
      specialty:safeText(raw.specialty, 80),
      specialtyBonus:clampInteger(raw.specialtyBonus, 0, 2, 0),
      assist:clampInteger(raw.assist, 0, 3, 0),
      modifier:clampInteger(raw.modifier, -20, 20, 0),
      mode:['normal','advantage','disadvantage'].indexOf(raw.mode) !== -1 ? raw.mode : 'normal',
      dice:dice,
      kept:clampInteger(raw.kept, 1, 20, dice[0]),
      dc:clampInteger(raw.dc, 1, 40, 13),
      total:clampInteger(raw.total, -50, 100, 0),
      tier:tier,
      tierLabel:bandDefinition(tier).label,
      publicNote:safeText(raw.publicNote, 800),
      createdAt:safeText(raw.createdAt, 40) || new Date().toISOString()
    };
  }

  function migrateState(raw) {
    var source = raw && typeof raw === 'object' ? clone(raw) : {};
    var base = freshState();
    var migrated = Object.assign(base, source);
    migrated.schemaVersion = STATE_SCHEMA_VERSION;
    migrated.trackers = Object.assign(base.trackers, source.trackers || {});
    migrated.sceneClues = Object.assign({}, source.sceneClues || {});
    migrated.knownTruthSources = Object.assign({}, source.knownTruthSources || {});
    migrated.npcLocations = Object.assign({}, source.npcLocations || {});
    migrated.sceneResults = Object.assign({}, source.sceneResults || {});
    migrated.conflictClocks = Object.assign({}, base.conflictClocks, source.conflictClocks || {});
    migrated.conflictClocks.goal = clampNumber(migrated.conflictClocks.goal, 0, 4, 0);
    migrated.conflictClocks.threat = clampNumber(migrated.conflictClocks.threat, 0, 4, 0);
    migrated.seals = Array.isArray(source.seals) ? source.seals.slice(0, 3) : base.seals.slice();
    while (migrated.seals.length < 3) migrated.seals.push('blank');
    migrated.seals = migrated.seals.map(function (seal) { return allowedSealStates.indexOf(seal) !== -1 ? seal : 'used'; });
    migrated.sealMeta = Array.isArray(source.sealMeta) ? source.sealMeta.slice(0, 3) : [];
    while (migrated.sealMeta.length < 3) migrated.sealMeta.push({ reflownLoop:-1, note:'' });
    migrated.sealMeta = migrated.sealMeta.map(function (item) {
      return { reflownLoop:clampNumber(item && item.reflownLoop, -1, 2, -1), note:String(item && item.note || '').slice(0, 200) };
    });
    ['completedScenes','resolvedNodes','resetHistory','anchoredFacts','revealedHandouts','visitedLocations','roster','characterInbox','checkRequests','checkHistory','log','activeNpcs'].forEach(function (key) {
      if (!Array.isArray(migrated[key])) migrated[key] = [];
    });
    migrated.roster = migrated.roster.map(function (item) { return normalizeCharacter(item, false); }).filter(function (item) { return item && item.id && item.name; }).slice(0, 40);
    migrated.characterInbox = migrated.characterInbox.map(normalizeSubmission).filter(Boolean).slice(0, 40);
    migrated.checkRequests = migrated.checkRequests.map(normalizeCheckRequest).filter(Boolean).slice(0, 60);
    migrated.checkHistory = migrated.checkHistory.map(normalizeCheckResult).filter(Boolean).slice(0, 100);
    migrated.loop = clampNumber(migrated.loop, 0, 2, 0);
    migrated.reflowsThisSession = clampNumber(migrated.reflowsThisSession, 0, 1, 0);
    if (!byId(data.days, migrated.dayId)) migrated.dayId = 'D1';
    if (migrated.activeHandoutId && !byId(data.handouts, migrated.activeHandoutId)) migrated.activeHandoutId = null;
    return migrated;
  }

  function loadState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return migrateState(parsed);
    } catch (error) {
      return freshState();
    }
  }

  var state = loadState();
  var restoredHandout = state.activeHandoutId ? byId(data.handouts, state.activeHandoutId) : null;
  if (restoredHandout) lastPlayerPayload = playerPayload(restoredHandout);

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (char) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char];
    });
  }
  function byId(list, id) { return list.find(function (item) { return item.id === id; }); }
  function currentDay() { return byId(data.days, state.dayId) || data.days[0]; }
  function nowLabel() { return new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }); }

  function playerPayload(item) {
    return {
      id: item.id,
      title: item.title,
      day: item.day,
      image: item.image,
      source: item.source || 'PLAYER SAFE 资料',
      factLabel: item.factLabel || '资料要点',
      body: item.body,
      playerFacts: Array.isArray(item.playerFacts) ? item.playerFacts.slice() : [],
      playerPrompt: item.playerPrompt || ''
    };
  }

  function sendPlayerMessage(message) {
    message = Object.assign({ protocol:MESSAGE_PROTOCOL }, message || {});
    if (channel) channel.postMessage(message);
    playerWindows = playerWindows.filter(function (playerWindow) {
      if (!playerWindow || playerWindow.closed) return false;
      try { playerWindow.postMessage(message, messageOrigin); } catch (error) {}
      return true;
    });
  }

  function openPlayerWindow(url, name) {
    var playerWindow = window.open(url, name);
    if (!playerWindow) {
      showToast('浏览器拦截了玩家窗口，请允许本站打开新窗口');
      return null;
    }
    if (playerWindows.indexOf(playerWindow) === -1) playerWindows.push(playerWindow);
    [250, 700, 1400].forEach(function (delay) {
      window.setTimeout(function () {
        if (!playerWindow.closed) {
          try {
            playerWindow.postMessage(lastPlayerPayload
              ? { protocol:MESSAGE_PROTOCOL, type:'show', handout:lastPlayerPayload }
              : { protocol:MESSAGE_PROTOCOL, type:'curtain' }, messageOrigin);
          } catch (error) {}
        }
      }, delay);
    });
    return playerWindow;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    var saveStatus = document.getElementById('save-status');
    if (saveStatus) {
      saveStatus.textContent = '正在保存…';
      window.setTimeout(function () { saveStatus.textContent = '已自动保存'; }, 260);
    }
  }

  function addLog(label) {
    state.log.unshift({ at: new Date().toISOString(), label: label });
    state.log = state.log.slice(0, 160);
  }

  function commit(label, mutate) {
    undoStack.push(clone(state));
    if (undoStack.length > 40) undoStack.shift();
    mutate(state);
    addLog(label);
    saveState();
    renderAll();
    showToast(label);
  }

  function showToast(message) {
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove('show'); }, 2200);
  }

  function openView(view) {
    currentView = view;
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.classList.toggle('active', panel.getAttribute('data-panel') === view);
    });
    document.querySelectorAll('[data-view]').forEach(function (button) {
      var active = button.getAttribute('data-view') === view;
      button.classList.toggle('active', active);
      if (button.closest('.side-nav')) {
        if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
      }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function dayScenes(day) {
    return day.sceneIds.map(function (id) { return byId(data.scenes, id); }).filter(Boolean);
  }

  function todayNpcIds() {
    var ids = [];
    dayScenes(currentDay()).forEach(function (scene) {
      scene.npcs.forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
    });
    state.activeNpcs.forEach(function (id) { if (ids.indexOf(id) === -1) ids.unshift(id); });
    return ids;
  }

  function renderCurrent() {
    var day = currentDay();
    document.getElementById('top-day').textContent = '第' + ['一','二','三','四','五','六','七'][day.index - 1] + '日';
    document.getElementById('top-title').textContent = day.title;
    document.getElementById('day-image').src = day.image;
    document.getElementById('day-image').alt = day.title + '的场景插画';
    document.getElementById('day-kicker').textContent = 'DAY ' + String(day.index).padStart(2, '0') + ' · ' + day.date;
    document.getElementById('current-heading').textContent = day.title;
    document.getElementById('day-question').textContent = day.question;
    document.getElementById('day-priority').textContent = day.priority;
    document.getElementById('day-windows').innerHTML = day.windows.map(function (item) { return '<span>' + escapeHtml(item) + '</span>'; }).join('');
    document.getElementById('today-goals').innerHTML = day.goals.map(function (goal) { return '<li>' + escapeHtml(goal) + '</li>'; }).join('');

    var scenes = dayScenes(day);
    var completed = scenes.filter(function (scene) { return state.completedScenes.indexOf(scene.id) !== -1; }).length;
    document.getElementById('scene-progress').textContent = completed + ' / ' + scenes.length + ' 已结算';
    document.getElementById('today-scenes').innerHTML = scenes.map(function (scene) {
      var done = state.completedScenes.indexOf(scene.id) !== -1;
      var active = state.activeSceneId === scene.id;
      return '<button class="scene-row' + (done ? ' completed' : '') + '" type="button" data-scene="' + scene.id + '">' +
        '<span class="scene-code">' + scene.id + '</span>' +
        '<span><h3>' + escapeHtml(scene.title) + '</h3><p>' + escapeHtml(scene.visible) + '</p><span class="scene-meta"><i>' + escapeHtml(scene.time) + '</i><i>' + escapeHtml(byId(data.locations, scene.location).name) + '</i></span></span>' +
        '<span class="scene-state">' + (active ? '正在运行' : done ? '已结算 ✓' : '打开 ↗') + '</span>' +
      '</button>';
    }).join('');

    var npcIds = todayNpcIds().slice(0, 7);
    document.getElementById('active-cast').innerHTML = npcIds.map(function (id) {
      var npc = byId(data.npcs, id);
      var servant = npc.crop != null;
      return '<button class="cast-mini" type="button" data-npc="' + id + '"><img class="' + (servant ? 'servant-crop' : '') + '" style="--crop:' + (npc.crop || '50%') + '" src="' + npc.image + '" alt="' + escapeHtml(npc.name) + '肖像"><span>' + escapeHtml(npc.name) + '</span></button>';
    }).join('');

    var pending = day.handouts.map(function (id) { return byId(data.handouts, id); }).filter(Boolean).slice(0, 4);
    document.getElementById('pending-handouts').innerHTML = pending.map(function (item) {
      var sent = state.revealedHandouts.indexOf(item.id) !== -1;
      return '<button class="pending-item" type="button" data-handout="' + item.id + '"><img src="' + item.image + '" alt=""><span><strong>' + item.id + ' · ' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.trigger) + '</small></span><i>' + (sent ? '✓' : '↗') + '</i></button>';
    }).join('');

    document.querySelectorAll('#view-current [data-scene]').forEach(function (button) { button.addEventListener('click', function () { openScene(button.getAttribute('data-scene')); }); });
    document.querySelectorAll('#view-current [data-npc]').forEach(function (button) { button.addEventListener('click', function () { openNpc(button.getAttribute('data-npc')); }); });
    document.querySelectorAll('#view-current [data-handout]').forEach(function (button) { button.addEventListener('click', function () { openHandout(button.getAttribute('data-handout')); }); });
  }

  function renderTimeline() {
    document.getElementById('timeline-list').innerHTML = data.days.map(function (day) {
      var scenes = dayScenes(day);
      var completed = scenes.filter(function (scene) { return state.completedScenes.indexOf(scene.id) !== -1; }).length;
      var current = day.id === state.dayId;
      return '<article class="timeline-day' + (current ? ' current' : '') + '">' +
        '<div class="timeline-day-image"><img src="' + day.image + '" alt=""><span>DAY ' + String(day.index).padStart(2, '0') + '</span></div>' +
        '<div class="timeline-day-copy"><p>' + escapeHtml(day.date) + ' · ' + scenes.length + ' 个节点</p><h2>' + escapeHtml(day.title) + '</h2><blockquote>' + escapeHtml(day.question) + '</blockquote><small>' + escapeHtml(day.priority) + '</small></div>' +
        '<div class="timeline-day-actions"><button type="button" data-select-day="' + day.id + '">' + (current ? '当前主持桌面' : '切换到这一天') + '</button><button type="button" data-day-first="' + day.id + '">打开首个节点</button><span class="timeline-progress">' + completed + ' / ' + scenes.length + ' 已结算</span></div>' +
      '</article>';
    }).join('');
    document.querySelectorAll('[data-select-day]').forEach(function (button) {
      button.addEventListener('click', function () { selectDay(button.getAttribute('data-select-day')); });
    });
    document.querySelectorAll('[data-day-first]').forEach(function (button) {
      button.addEventListener('click', function () { var day = byId(data.days, button.getAttribute('data-day-first')); openScene(day.sceneIds[0]); });
    });
  }

  function selectDay(dayId) {
    if (dayId === state.dayId) { openView('current'); return; }
    var day = byId(data.days, dayId);
    commit('切换到第 ' + day.index + ' 日：' + day.title, function (draft) {
      draft.dayId = dayId;
      draft.activeSceneId = null;
      draft.activeNpcs = [];
      if (day.index > 1 && draft.trackers.grail < day.index - 1) draft.trackers.grail = Math.min(6, day.index - 1);
    });
    openView('current');
  }

  function mapIconSvg(icon) {
    var icons = {
      crossroad: '<path d="M4 12h16M12 4v16M4 12l3-3m-3 3 3 3M12 4l-3 3m3-3 3 3"/>',
      school: '<path d="m4 10 8-5 8 5-8 5-8-5Zm3 3v5h10v-5M9 19h6"/>',
      construction: '<path d="M5 19h14M7 19V9h10v10M9 9V6h6v3M7 13h10"/>',
      church: '<path d="M12 3v5M9.5 5.5h5M7 21V10h10v11M10 21v-5h4v5"/>',
      shrine: '<path d="M4 8h16M6 8l1-4h10l1 4M7 8v12m10-12v12M4 20h16M9 12h6"/>',
      food: '<path d="M5 10h14c0 5-2.5 8-7 8s-7-3-7-8Zm2 9h10M8 6c0-1 1-1.5 1-2.5M12 6c0-1 1-1.5 1-2.5M16 6c0-1 1-1.5 1-2.5"/>',
      repair: '<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5L16 12l-4-4 2.5-2.5Z"/>',
      library: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 9H12v10H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 9H12v10h4.5A3.5 3.5 0 0 1 20 22V5.5Z"/>',
      mansion: '<path d="m4 10 8-6 8 6M6 9v11h12V9M9 20v-6h6v6M9 10h.01M15 10h.01"/>',
      workshop: '<path d="M4 20h16M6 20V9l5 3V9l7 4v7M8 6h3M9.5 4.5v3M14 16h2"/>',
      clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2M8 3h8"/>',
      plaza: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
      factory: '<path d="M4 20V10l5 3v-3l5 3V7h4l2 13H4ZM7 17h2m3 0h2m3 0h2"/>',
      water: '<path d="M3 8c2 0 2 1.5 4 1.5S9 8 11 8s2 1.5 4 1.5S17 8 19 8s2 1.5 2 1.5M3 13c2 0 2 1.5 4 1.5S9 13 11 13s2 1.5 4 1.5S17 13 19 13s2 1.5 2 1.5M5 18h14"/>',
      memorial: '<path d="M8 20h8M9 17h6l-1-11h-4L9 17ZM8 6h8M12 3v3"/>',
      core: '<path d="m12 3 6 9-6 9-6-9 6-9Z"/><circle cx="12" cy="12" r="3"/><path d="M3 12h3m12 0h3"/>'
    };
    return '<svg aria-hidden="true" viewBox="0 0 24 24">' + (icons[icon] || icons.plaza) + '</svg>';
  }

  function riskLabel(level) {
    return level >= 3 ? '高危' : level === 2 ? '警戒' : '常规';
  }

  function renderMap() {
    var todayLocations = dayScenes(currentDay()).map(function (scene) { return scene.location; });
    var hotspots = data.locations.map(function (loc) {
      var isToday = todayLocations.indexOf(loc.id) !== -1;
      var visited = state.visitedLocations.indexOf(loc.id) !== -1;
      var selected = selectedLocationId === loc.id;
      var hidden = (mapFilter === 'today' && !isToday) || (mapFilter === 'danger' && loc.riskLevel < 3);
      var style = 'left:' + loc.x + '%;top:' + loc.y + '%;--pin-x:' + (loc.pinX || 0) + 'px;--pin-y:' + (loc.pinY || 0) + 'px';
      return '<button class="map-hotspot risk-' + loc.riskLevel + (isToday ? ' today' : '') + (visited ? ' visited' : '') + (selected ? ' active' : '') + '" type="button" style="' + style + '" data-location="' + loc.id + '" data-tooltip="' + escapeHtml(loc.name) + '" aria-label="' + escapeHtml(loc.name) + '，' + riskLabel(loc.riskLevel) + '" aria-pressed="' + String(selected) + '"' + (hidden ? ' hidden' : '') + '>' + mapIconSvg(loc.icon) + '<span>' + escapeHtml(loc.shortName || loc.name) + '</span></button>';
    }).join('');
    document.getElementById('map-hotspots').innerHTML = hotspots;
    document.getElementById('location-list').innerHTML = data.locations.map(function (loc) {
      var selected = selectedLocationId === loc.id;
      return '<button class="' + (selected ? 'active' : '') + '" type="button" data-location="' + loc.id + '" aria-pressed="' + String(selected) + '">' + mapIconSvg(loc.icon) + '<span>' + escapeHtml(loc.name) + '</span><small>' + riskLabel(loc.riskLevel) + ' · 第' + loc.unlockDay + '日</small></button>';
    }).join('');
    document.querySelectorAll('#map-hotspots [data-location], #location-list [data-location]').forEach(function (button) {
      button.addEventListener('click', function () { showLocation(button.getAttribute('data-location'), { scroll:true }); });
    });
    if (selectedLocationId && byId(data.locations, selectedLocationId)) showLocation(selectedLocationId, { quiet:true, scroll:false });
  }

  function sceneStatus(scene) {
    var day = byId(data.days, scene.day);
    if (!day) return { label:'阶段未定', className:'future' };
    if (day.index < currentDay().index) return { label:'已过阶段', className:'past' };
    if (day.index === currentDay().index) return { label:'当前日可触发', className:'current' };
    return { label:'第' + day.index + '日开放', className:'future' };
  }

  function showLocation(id, options) {
    options = options || {};
    var loc = byId(data.locations, id);
    if (!loc) return;
    selectedLocationId = id;
    var drawer = document.getElementById('map-drawer');
    var unlocked = currentDay().index >= loc.unlockDay;
    var sceneCards = loc.sceneIds.map(function (sceneId) {
      var scene = byId(data.scenes, sceneId);
      if (!scene) return '';
      var day = byId(data.days, scene.day);
      var status = sceneStatus(scene);
      var revealed = state.sceneClues[scene.id] || [];
      var clues = scene.clues.map(function (clue, index) {
        return '<li class="' + (revealed.indexOf(index) !== -1 ? 'revealed' : '') + '"><i>' + (revealed.indexOf(index) !== -1 ? '✓' : String(index + 1)) + '</i><span>' + escapeHtml(clue) + '</span></li>';
      }).join('');
      var npcButtons = scene.npcs.map(function (npcId) {
        var npc = byId(data.npcs, npcId);
        return npc ? '<button type="button" data-npc="' + npcId + '">' + escapeHtml(npc.name) + '</button>' : '';
      }).join('');
      var handoutButtons = scene.handouts.map(function (handoutId) {
        var item = byId(data.handouts, handoutId);
        return item ? '<button type="button" data-handout="' + handoutId + '">' + handoutId + ' · ' + escapeHtml(item.title) + '</button>' : '';
      }).join('');
      return '<article class="location-scene-card ' + status.className + '"><header><div><span>' + scene.id + '</span><h3>' + escapeHtml(scene.title) + '</h3></div><b>' + status.label + '</b></header>' +
        '<div class="location-scene-trigger"><span>建议触发</span><strong>' + escapeHtml(day ? day.date : scene.day) + ' · ' + escapeHtml(scene.time) + '</strong></div>' +
        '<section class="location-readaloud"><span>开场朗读</span><p>' + escapeHtml(scene.visible) + '</p></section>' +
        '<section><span>守秘人目标</span><p>' + escapeHtml(scene.objective) + '</p></section>' +
        '<section class="location-scene-risk"><span>忽视／失败后的推进</span><p>' + escapeHtml(scene.risk) + '</p></section>' +
        '<section><span>可得线索</span><ul class="location-clues">' + clues + '</ul></section>' +
        '<section><span>在场人物</span><div class="location-link-buttons">' + (npcButtons || '<em>无固定人物</em>') + '</div></section>' +
        '<section><span>关联手卡</span><div class="location-link-buttons">' + (handoutButtons || '<em>无独立手卡</em>') + '</div></section>' +
        '<button class="location-scene-button" type="button" data-scene="' + scene.id + '">打开完整场景并操作线索 <span>↗</span></button></article>';
    }).join('');
    drawer.innerHTML = '<div class="drawer-location-head"><div><p class="drawer-code">' + escapeHtml(loc.group) + ' · ' + riskLabel(loc.riskLevel) + '</p><h2>' + escapeHtml(loc.name) + '</h2></div><div class="drawer-location-icon">' + mapIconSvg(loc.icon) + '</div></div>' +
      '<p class="drawer-location-copy">' + escapeHtml(loc.visible) + '</p>' +
      '<div class="location-stage ' + (unlocked ? 'unlocked' : 'preview') + '"><span>' + (unlocked ? '当前战役已开放' : '阶段预览') + '</span><strong>' + (unlocked ? '可从下方节点直接开始' : '第' + loc.unlockDay + '日开放；守秘人仍可提前备团') + '</strong></div>' +
      '<div class="location-danger risk-' + loc.riskLevel + '"><span>地点风险</span><strong>' + escapeHtml(loc.danger) + '</strong></div>' +
      '<div class="location-scene-list"><div class="location-scene-list-head"><span>关联场景</span><b>' + loc.sceneIds.length + ' 个节点</b></div>' + sceneCards + '</div>';
    drawer.querySelectorAll('[data-scene]').forEach(function (button) { button.addEventListener('click', function () { openScene(button.getAttribute('data-scene')); }); });
    drawer.querySelectorAll('[data-npc]').forEach(function (button) { button.addEventListener('click', function () { openNpc(button.getAttribute('data-npc')); }); });
    drawer.querySelectorAll('[data-handout]').forEach(function (button) { button.addEventListener('click', function () { openHandout(button.getAttribute('data-handout')); }); });
    document.querySelectorAll('#map-hotspots [data-location], #location-list [data-location]').forEach(function (button) {
      var selected = button.getAttribute('data-location') === id;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (!options.quiet) {
      drawer.classList.remove('is-updating');
      void drawer.offsetWidth;
      drawer.classList.add('is-updating');
      window.setTimeout(function () { drawer.classList.remove('is-updating'); }, 420);
    }
    if (options.scroll && window.matchMedia('(max-width: 1040px)').matches) {
      window.requestAnimationFrame(function () { drawer.scrollIntoView({ behavior:'smooth', block:'start' }); });
    }
  }

  function renderNpcs() {
    var query = document.getElementById('npc-search').value.trim().toLowerCase();
    var today = todayNpcIds();
    var filtered = data.npcs.filter(function (npc) {
      var isServant = npc.crop != null;
      if (npcFilter === 'human' && isServant) return false;
      if (npcFilter === 'servant' && !isServant) return false;
      if (npcFilter === 'today' && today.indexOf(npc.id) === -1) return false;
      if (query && (npc.name + npc.role + (state.npcLocations[npc.id] || npc.location)).toLowerCase().indexOf(query) === -1) return false;
      return true;
    });
    document.getElementById('npc-grid').innerHTML = filtered.map(function (npc) {
      var loc = byId(data.locations, state.npcLocations[npc.id] || npc.location);
      var servant = npc.crop != null;
      return '<article class="npc-card" tabindex="0" role="button" data-npc="' + npc.id + '">' +
        '<div class="npc-card-image"><img class="' + (servant ? 'servant-crop' : '') + '" style="--crop:' + (npc.crop || '50%') + '" src="' + npc.image + '" alt="' + escapeHtml(npc.name) + '肖像"><span class="npc-card-code">' + (servant ? 'HEROIC SPIRIT' : 'NPC DOSSIER') + '</span></div>' +
        '<div class="npc-card-body"><h2>' + escapeHtml(npc.name) + '</h2><span>' + escapeHtml(npc.role) + '</span><p>' + escapeHtml(npc.intro) + '</p><div class="npc-card-foot"><span>⌖ ' + escapeHtml(loc ? loc.name : '位置未知') + '</span><span>打开档案 ↗</span></div></div>' +
      '</article>';
    }).join('');
    document.querySelectorAll('#npc-grid [data-npc]').forEach(function (card) {
      card.addEventListener('click', function () { openNpc(card.getAttribute('data-npc')); });
      card.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openNpc(card.getAttribute('data-npc')); } });
    });
  }

  function renderTruths() {
    document.getElementById('truth-grid').innerHTML = data.truths.map(function (truth) {
      var known = state.knownTruthSources[truth.id] || [];
      var revealed = known.length >= 2;
      return '<article class="truth-card' + (revealed ? ' revealed' : '') + '"><header class="truth-card-head"><span class="truth-code">' + truth.id + '</span><h2>' + escapeHtml(truth.title) + '</h2><span class="truth-status">' + known.length + ' / 3 ' + (revealed ? '已确认' : '来源') + '</span></header><div class="truth-sources">' + truth.sources.map(function (source, index) {
        var sourceKnown = known.indexOf(index) !== -1;
        return '<button class="truth-source' + (sourceKnown ? ' known' : '') + '" type="button" data-truth="' + truth.id + '" data-source="' + index + '">' + escapeHtml(source) + '</button>';
      }).join('') + '</div></article>';
    }).join('');
    document.querySelectorAll('[data-truth]').forEach(function (button) {
      button.addEventListener('click', function () {
        var truthId = button.getAttribute('data-truth');
        var sourceIndex = Number(button.getAttribute('data-source'));
        commit((button.classList.contains('known') ? '收回' : '公开') + '线索来源：' + button.textContent.trim(), function (draft) {
          var known = (draft.knownTruthSources[truthId] || []).slice();
          var at = known.indexOf(sourceIndex);
          if (at === -1) known.push(sourceIndex); else known.splice(at, 1);
          draft.knownTruthSources[truthId] = known;
        });
      });
    });
    document.getElementById('clue-notes').value = state.clueNotes;
  }

  function renderHandouts() {
    document.getElementById('handout-grid').innerHTML = data.handouts.map(function (item) {
      var sent = state.revealedHandouts.indexOf(item.id) !== -1;
      var facts = (item.playerFacts || []).slice(0, 2).map(function (fact) { return '<li>' + escapeHtml(fact) + '</li>'; }).join('');
      var remaining = Math.max(0, (item.playerFacts || []).length - 2);
      return '<article class="handout-card' + (sent ? ' sent' : '') + '"><div class="handout-art"><img src="' + item.image + '" alt="' + escapeHtml(item.title) + '视觉手卡"><span class="handout-id">' + item.id + (sent ? ' · 已发放' : '') + '</span></div><div class="handout-body"><span>' + escapeHtml(item.day) + ' · ' + escapeHtml(item.trigger) + '</span><h2>' + escapeHtml(item.title) + '</h2><small class="handout-card-source">' + escapeHtml(item.source || 'PLAYER SAFE 资料') + '</small><p>' + escapeHtml(item.body) + '</p><ul class="handout-fact-preview">' + facts + '</ul>' + (remaining ? '<small class="handout-more">另有 ' + remaining + ' 条资料要点</small>' : '') + '<div class="handout-actions"><button type="button" data-send-handout="' + item.id + '">' + (sent ? '再次投放' : '预览并发放') + '</button><button type="button" data-handout="' + item.id + '" aria-label="打开' + escapeHtml(item.title) + '完整预览">完整预览</button>' + (sent ? '<button class="danger-action" type="button" data-retract-handout="' + item.id + '">撤回投屏</button>' : '') + '</div></div></article>';
    }).join('');
    document.querySelectorAll('#handout-grid [data-handout]').forEach(function (button) { button.addEventListener('click', function () { openHandout(button.getAttribute('data-handout')); }); });
    document.querySelectorAll('#handout-grid [data-send-handout]').forEach(function (button) { button.addEventListener('click', function () { openHandout(button.getAttribute('data-send-handout')); }); });
    document.querySelectorAll('#handout-grid [data-retract-handout]').forEach(function (button) { button.addEventListener('click', function () { var item = byId(data.handouts, button.getAttribute('data-retract-handout')); if (item) retractHandout(item); }); });
  }

  function receiveCharacterSubmission(message) {
    var submission = normalizeSubmission({
      id: message && message.submissionId,
      sentAt: message && message.sentAt,
      character: message && message.character
    });
    if (!submission) return;
    if (state.characterInbox.some(function (item) { return item.id === submission.id; })) return;
    state.characterInbox.unshift(submission);
    state.characterInbox = state.characterInbox.slice(0, 40);
    addLog('收到角色卡：' + submission.character.name);
    saveState();
    renderTabletop();
    showToast('收到 ' + submission.character.name + ' 的角色卡');
  }

  function receiveCheckRequest(rawRequest) {
    var request = normalizeCheckRequest(rawRequest);
    if (!request) return;
    if (state.checkRequests.some(function (item) { return item.id === request.id; })) return;
    state.checkRequests.unshift(request);
    state.checkRequests = state.checkRequests.slice(0, 60);
    addLog('收到判定申请：' + request.characterName + ' — ' + request.goal);
    saveState();
    renderTabletop();
    sendPlayerMessage({ type:'check-ack', requestId:request.id, characterId:request.characterId, status:'received' });
    showToast('收到 ' + request.characterName + ' 的判定申请');
  }

  function upsertCharacter(rawCharacter) {
    var character = normalizeCharacter(rawCharacter, false);
    if (!character || !character.id || !character.name) return null;
    var index = state.roster.findIndex(function (item) { return item.id === character.id; });
    if (index === -1) state.roster.unshift(character); else state.roster[index] = character;
    state.roster = state.roster.slice(0, 40);
    return character;
  }

  function acceptCharacterSubmission(id) {
    var index = state.characterInbox.findIndex(function (item) { return item.id === id; });
    if (index === -1) return;
    var submission = state.characterInbox[index];
    var character = upsertCharacter(submission.character);
    if (!character) { showToast('这份角色卡无法通过协议校验'); return; }
    state.characterInbox.splice(index, 1);
    addLog('接收角色卡：' + character.name);
    saveState();
    renderTabletop();
    sendPlayerMessage({ type:'character-ack', submissionId:submission.id, characterId:character.id, accepted:true });
    showToast(character.name + ' 已加入角色列表');
  }

  function rejectCharacterSubmission(id) {
    var index = state.characterInbox.findIndex(function (item) { return item.id === id; });
    if (index === -1) return;
    var submission = state.characterInbox[index];
    state.characterInbox.splice(index, 1);
    addLog('退回角色卡：' + submission.character.name);
    saveState();
    renderTabletop();
    sendPlayerMessage({ type:'character-ack', submissionId:submission.id, characterId:submission.character.id, accepted:false });
    showToast('已从收件箱移除这份角色卡');
  }

  function downloadJson(payload, filename) {
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportCharacter(character) {
    downloadJson(character, '零之圣杯-角色卡-' + character.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) + '.json');
    showToast('已导出 ' + character.name + ' 的角色卡');
  }

  function exportRoster() {
    if (!state.roster.length) { showToast('角色列表还是空的'); return; }
    downloadJson({
      protocol:CHARACTER_COLLECTION_PROTOCOL,
      rulesetId:RULESET_ID,
      exportedAt:new Date().toISOString(),
      characters:state.roster
    }, '零之圣杯-全队角色-' + new Date().toISOString().slice(0,10) + '.json');
    showToast('全队角色 JSON 已导出');
  }

  function importCharacters(file) {
    if (!file || file.size > 1048576) { showToast('角色文件过大，上限 1 MB'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var payload = JSON.parse(reader.result);
        var list = [];
        if (payload && (payload.protocol === CHARACTER_PROTOCOL || payload.protocol === 'null-grail-character-v1') && payload.rulesetId === RULESET_ID) list = [payload];
        if (payload && (payload.protocol === CHARACTER_COLLECTION_PROTOCOL || payload.protocol === 'null-grail-character-collection-v1') && payload.rulesetId === RULESET_ID && Array.isArray(payload.characters)) list = payload.characters.slice(0, 40);
        if (!list.length) throw new Error('protocol');
        var accepted = 0;
        list.forEach(function (entry) { if (upsertCharacter(entry)) accepted += 1; });
        if (!accepted) throw new Error('characters');
        addLog('导入 ' + accepted + ' 份角色卡');
        saveState();
        renderTabletop();
        showToast('已导入 ' + accepted + ' 份角色卡');
      } catch (error) {
        showToast('无法导入：只接受本网站导出的相同规则版本 JSON');
      }
    };
    reader.readAsText(file);
  }

  function refreshGmSpecialtyOptions(extraSpecialty) {
    var characterSelect = document.getElementById('gm-check-character');
    var specialtySelect = document.getElementById('gm-check-specialty');
    if (!characterSelect || !specialtySelect) return;
    var previous = specialtySelect.value;
    var character = state.roster.find(function (item) { return item.id === characterSelect.value; });
    var specialties = character ? character.specialties.slice() : [];
    var extra = safeText(extraSpecialty, 80);
    if (extra && specialties.indexOf(extra) === -1) specialties.push(extra);
    specialtySelect.innerHTML = '<option value="">不使用专长</option>' + specialties.slice(0, 4).map(function (specialty) {
      return '<option value="' + escapeHtml(specialty) + '">' + escapeHtml(specialty) + ' ＋2</option>';
    }).join('');
    if (specialties.indexOf(previous) !== -1) specialtySelect.value = previous;
  }

  function injuryLabel(injury) {
    return { none:'无伤', light:'轻伤', serious:'重伤', critical:'濒危' }[injury] || '无伤';
  }

  function renderTabletop() {
    var roster = document.getElementById('gm-roster');
    if (!roster) return;
    roster.innerHTML = state.roster.length ? state.roster.map(function (character) {
      var stats = approaches.map(function (definition) { return '<i>' + escapeHtml(definition.label) + ' +' + character.approaches[definition.id] + '</i>'; }).join('');
      var injuryOptions = [['none','无伤'],['light','轻伤'],['serious','重伤'],['critical','濒危']].map(function (item) { return '<option value="' + item[0] + '"' + (character.injury === item[0] ? ' selected' : '') + '>' + item[1] + '</option>'; }).join('');
      var servantResources = character.existenceType === 'servant' ? '<label><span>灵核负荷</span><input type="number" min="0" max="3" value="' + character.coreLoad + '" data-roster-resource="coreLoad"></label><label><span>宝具</span><select data-roster-resource="noblePhantasmReady"><option value="true"' + (character.noblePhantasmReady ? ' selected' : '') + '>可用</option><option value="false"' + (!character.noblePhantasmReady ? ' selected' : '') + '>已用</option></select></label>' : '';
      return '<article class="roster-row" data-roster-id="' + character.id + '"><div class="roster-row-main"><strong>' + escapeHtml(character.name) + '</strong><span>' + escapeHtml(character.playerName || '未填写玩家名') + ' · ' + escapeHtml(character.origin || '来源未填写') + '</span><p>' + escapeHtml(character.identity || character.anchor || '尚未填写一句身份') + '</p><div class="character-statline">' + stats + '</div><div class="roster-resource-editor"><label><span>决意</span><input type="number" min="0" max="3" value="' + character.resolve + '" data-roster-resource="resolve"></label><label><span>压力</span><input type="number" min="0" max="3" value="' + character.stress + '" data-roster-resource="stress"></label><label><span>伤势</span><select data-roster-resource="injury">' + injuryOptions + '</select></label>' + servantResources + '<label class="roster-trauma"><span>创伤（每行一项）</span><textarea rows="2" data-roster-resource="trauma">' + escapeHtml(character.trauma.join('\n')) + '</textarea></label></div></div><div class="row-actions"><button type="button" data-roster-check="' + character.id + '">判定</button><button type="button" data-roster-export="' + character.id + '">导出</button><button class="danger-action" type="button" data-roster-remove="' + character.id + '">移除</button></div></article>';
    }).join('') : '<p class="tabletop-empty">尚无角色。可导入本网站角色 JSON，或让玩家在 PLAYER SAFE 页提交。</p>';

    document.getElementById('character-inbox-count').textContent = state.characterInbox.length + ' 份';
    document.getElementById('gm-character-inbox').innerHTML = state.characterInbox.length ? state.characterInbox.map(function (submission) {
      return '<article class="inbox-row"><div class="inbox-row-main"><strong>' + escapeHtml(submission.character.name) + '</strong><span>' + escapeHtml(submission.character.playerName || '未填写玩家名') + '</span><p>' + escapeHtml(submission.character.identity || '未填写一句身份') + '</p></div><div class="row-actions"><button type="button" data-submission-accept="' + submission.id + '">接收</button><button class="danger-action" type="button" data-submission-reject="' + submission.id + '">移除</button></div></article>';
    }).join('') : '<p class="tabletop-empty">没有待确认的玩家角色卡。</p>';

    document.getElementById('check-request-count').textContent = state.checkRequests.length + ' 条';
    document.getElementById('gm-check-requests').innerHTML = state.checkRequests.length ? state.checkRequests.map(function (request) {
      var approach = approachDefinition(request.approachId);
      return '<article class="inbox-row"><div class="inbox-row-main"><strong>' + escapeHtml(request.characterName) + '</strong><span>' + escapeHtml(approach.label) + (request.specialty ? ' ＋ ' + escapeHtml(request.specialty) : '') + (request.suggestedDc ? ' · 建议 DC ' + request.suggestedDc : '') + '</span><p>' + escapeHtml(request.goal) + '</p></div><div class="row-actions"><button type="button" data-request-load="' + request.id + '">载入</button><button class="danger-action" type="button" data-request-dismiss="' + request.id + '">忽略</button></div></article>';
    }).join('') : '<p class="tabletop-empty">没有等待处理的判定申请。</p>';

    var characterSelect = document.getElementById('gm-check-character');
    var previousCharacter = characterSelect.value;
    characterSelect.innerHTML = '<option value="all">全体玩家／公开判定</option>' + state.roster.map(function (character) {
      return '<option value="' + character.id + '">' + escapeHtml(character.name) + '</option>';
    }).join('');
    if (previousCharacter === 'all' || state.roster.some(function (item) { return item.id === previousCharacter; })) characterSelect.value = previousCharacter;

    var approachSelect = document.getElementById('gm-check-approach');
    if (!approachSelect.options.length) approachSelect.innerHTML = approaches.map(function (definition) {
      return '<option value="' + definition.id + '">' + escapeHtml(definition.label) + '</option>';
    }).join('');
    var dcSelect = document.getElementById('gm-check-dc');
    if (!dcSelect.options.length) dcSelect.innerHTML = difficulties.map(function (definition) {
      return '<option value="' + definition.value + '"' + (definition.value === 13 ? ' selected' : '') + '>' + escapeHtml(definition.label) + '</option>';
    }).join('');
    refreshGmSpecialtyOptions();

    var history = document.getElementById('gm-check-history');
    history.innerHTML = state.checkHistory.length ? state.checkHistory.map(function (result) {
      var modeLabel = result.mode === 'advantage' ? '优势' : result.mode === 'disadvantage' ? '劣势' : '正常';
      var formula = result.dice.join(' / ') + '（' + modeLabel + '取 ' + result.kept + '）＋' + result.approachLabel + ' ' + result.approachValue + (result.specialty ? '＋' + result.specialty + ' ' + result.specialtyBonus : '') + '＋协助 ' + result.assist + '＋修正 ' + result.modifier;
      return '<li class="check-history-item"><div class="result-tier ' + result.tier + '"><strong>' + result.total + '</strong><span>' + escapeHtml(result.tierLabel) + '</span></div><div class="check-history-copy"><strong>' + escapeHtml(result.goal || '未命名判定') + '</strong><span>' + escapeHtml(result.characterName) + ' · DC ' + result.dc + '</span><p>' + escapeHtml(formula) + '</p>' + (result.publicNote ? '<p>公开结果：' + escapeHtml(result.publicNote) + '</p>' : '') + '</div><div class="check-history-meta"><time>' + escapeHtml(new Date(result.createdAt).toLocaleString('zh-CN')) + '</time><div class="row-actions"><button type="button" data-result-resend="' + result.id + '">再次发送</button></div></div></li>';
    }).join('') : '<li class="tabletop-empty">尚无判定历史。</li>';

    document.querySelectorAll('[data-roster-check]').forEach(function (button) { button.addEventListener('click', function () { clearCheckForm(); document.getElementById('gm-check-character').value = button.getAttribute('data-roster-check'); refreshGmSpecialtyOptions(); openView('tabletop'); document.getElementById('gm-check-goal').focus(); }); });
    document.querySelectorAll('[data-roster-id]').forEach(function (card) { card.querySelectorAll('[data-roster-resource]').forEach(function (control) { control.addEventListener('change', function () {
      var character = state.roster.find(function (item) { return item.id === card.getAttribute('data-roster-id'); }); if (!character) return;
      var key = control.getAttribute('data-roster-resource');
      if (key === 'trauma') character.trauma = control.value.split(/\r?\n/).map(function (item) { return safeText(item,160); }).filter(Boolean).slice(0,12);
      else if (key === 'injury') character.injury = ['none','light','serious','critical'].indexOf(control.value) !== -1 ? control.value : 'none';
      else if (key === 'noblePhantasmReady') character.noblePhantasmReady = control.value === 'true';
      else character[key] = clampInteger(control.value,0,3,0);
      character.updatedAt = new Date().toISOString(); addLog('更新角色资源：' + character.name + ' · ' + key); saveState(); renderTabletop();
    }); }); });
    document.querySelectorAll('[data-roster-export]').forEach(function (button) { button.addEventListener('click', function () { var item = state.roster.find(function (character) { return character.id === button.getAttribute('data-roster-export'); }); if (item) exportCharacter(item); }); });
    document.querySelectorAll('[data-roster-remove]').forEach(function (button) { button.addEventListener('click', function () { var id = button.getAttribute('data-roster-remove'); var item = state.roster.find(function (character) { return character.id === id; }); if (!item || !window.confirm('从本次战役移除 ' + item.name + '？玩家本机角色卡不会被删除。')) return; state.roster = state.roster.filter(function (character) { return character.id !== id; }); addLog('移除角色：' + item.name); saveState(); renderTabletop(); }); });
    document.querySelectorAll('[data-submission-accept]').forEach(function (button) { button.addEventListener('click', function () { acceptCharacterSubmission(button.getAttribute('data-submission-accept')); }); });
    document.querySelectorAll('[data-submission-reject]').forEach(function (button) { button.addEventListener('click', function () { rejectCharacterSubmission(button.getAttribute('data-submission-reject')); }); });
    document.querySelectorAll('[data-request-load]').forEach(function (button) { button.addEventListener('click', function () { loadCheckRequest(button.getAttribute('data-request-load')); }); });
    document.querySelectorAll('[data-request-dismiss]').forEach(function (button) { button.addEventListener('click', function () { var id = button.getAttribute('data-request-dismiss'); state.checkRequests = state.checkRequests.filter(function (request) { return request.id !== id; }); if (activeCheckRequestId === id) clearCheckForm(); saveState(); renderTabletop(); showToast('判定申请已移除'); }); });
    document.querySelectorAll('[data-result-resend]').forEach(function (button) { button.addEventListener('click', function () { var result = state.checkHistory.find(function (item) { return item.id === button.getAttribute('data-result-resend'); }); if (result) { sendPlayerMessage({ type:'check-result', result:result }); showToast('判定结果已再次发送'); } }); });
  }

  function clearCheckForm() {
    var form = document.getElementById('gm-check-form');
    if (!form) return;
    form.reset();
    activeCheckRequestId = null;
    document.getElementById('active-request-label').textContent = '新判定';
    document.getElementById('gm-check-preview').innerHTML = '<span>尚未掷骰</span><p>1d20 ＋ 行动方式 ＋ 专长 ＋ 协助 ＋ 修正</p>';
    renderTabletop();
  }

  function loadCheckRequest(id) {
    var request = state.checkRequests.find(function (item) { return item.id === id; });
    if (!request) return;
    activeCheckRequestId = request.id;
    var characterSelect = document.getElementById('gm-check-character');
    characterSelect.value = state.roster.some(function (item) { return item.id === request.characterId; }) ? request.characterId : 'all';
    document.getElementById('gm-check-approach').value = request.approachId;
    refreshGmSpecialtyOptions(request.specialty);
    document.getElementById('gm-check-specialty').value = request.specialty;
    document.getElementById('gm-check-mode').value = request.mode;
    document.getElementById('gm-check-assist').value = request.assist;
    document.getElementById('gm-check-modifier').value = request.modifier;
    if (request.suggestedDc && difficulties.some(function (item) { return item.value === request.suggestedDc; })) document.getElementById('gm-check-dc').value = request.suggestedDc;
    document.getElementById('gm-check-goal').value = request.goal;
    document.getElementById('gm-check-risk').value = request.risk;
    document.getElementById('gm-check-cost-owner').value = '玩家从守秘人公开的代价中选择';
    document.getElementById('active-request-label').textContent = '来自 ' + request.characterName;
    openView('tabletop');
    document.getElementById('gm-check-risk').focus();
  }

  function rollD20() {
    try {
      var value = new Uint32Array(1);
      window.crypto.getRandomValues(value);
      return (value[0] % 20) + 1;
    } catch (error) {
      return Math.floor(Math.random() * 20) + 1;
    }
  }

  function resultTier(total, dc) {
    if (total >= dc + 5) return 'exceptional';
    if (total >= dc) return 'success';
    if (total >= dc - 4) return 'costly';
    return 'severe';
  }

  function defaultResultNote(tier) {
    if (tier === 'exceptional') return '目标达成；可额外选择改善关系、保持隐蔽、清除 1 压力、抢先行动或取得额外线索。';
    if (tier === 'success') return '目标按掷骰前的声明达成。';
    if (tier === 'costly') return '玩家可接受已公开的代价以继续推进，也可拒绝并让局势行动。';
    return '目标未达成并发生严重后果；核心线索保留新的路径、余波或替代来源。';
  }

  function publishCheckResult(event) {
    event.preventDefault();
    var goal = safeText(document.getElementById('gm-check-goal').value, 500);
    var risk = safeText(document.getElementById('gm-check-risk').value, 500);
    if (!goal || !risk) { showToast('掷骰前必须填写目标和失败风险'); return; }
    var request = activeCheckRequestId ? state.checkRequests.find(function (item) { return item.id === activeCheckRequestId; }) : null;
    var selectedId = document.getElementById('gm-check-character').value;
    var character = state.roster.find(function (item) { return item.id === selectedId; });
    var targetCharacterId = request ? request.characterId : (character ? character.id : 'all');
    var characterName = request ? request.characterName : (character ? character.name : '全体玩家');
    var approach = approachDefinition(document.getElementById('gm-check-approach').value);
    var approachValue = character ? character.approaches[approach.id] : (request ? request.approachValue : 0);
    var specialty = safeText(document.getElementById('gm-check-specialty').value, 80);
    var specialtyBonus = specialty ? 2 : 0;
    var assist = clampInteger(document.getElementById('gm-check-assist').value, 0, 3, 0);
    var modifier = clampInteger(document.getElementById('gm-check-modifier').value, -20, 20, 0);
    var dc = clampInteger(document.getElementById('gm-check-dc').value, 1, 40, 13);
    var mode = document.getElementById('gm-check-mode').value;
    var dice = [rollD20()];
    if (mode === 'advantage' || mode === 'disadvantage') dice.push(rollD20());
    var kept = mode === 'advantage' ? Math.max.apply(Math, dice) : mode === 'disadvantage' ? Math.min.apply(Math, dice) : dice[0];
    var total = kept + approachValue + specialtyBonus + assist + modifier;
    var tier = resultTier(total, dc);
    var publicNote = safeText(document.getElementById('gm-check-public-note').value, 800) || defaultResultNote(tier);
    var result = normalizeCheckResult({
      id:createId('result'), requestId:request && request.id, targetCharacterId:targetCharacterId,
      characterName:characterName, goal:goal, risk:risk,
      costOwner:safeText(document.getElementById('gm-check-cost-owner').value, 80),
      approachId:approach.id, approachValue:approachValue, specialty:specialty,
      specialtyBonus:specialtyBonus, assist:assist, modifier:modifier, mode:mode,
      dice:dice, kept:kept, dc:dc, total:total, tier:tier,
      publicNote:publicNote, createdAt:new Date().toISOString()
    });
    if (!result) { showToast('判定数据未通过协议校验'); return; }
    state.checkHistory.unshift(result);
    state.checkHistory = state.checkHistory.slice(0, 100);
    if (request) state.checkRequests = state.checkRequests.filter(function (item) { return item.id !== request.id; });
    activeCheckRequestId = null;
    addLog('发布判定：' + characterName + ' — ' + result.tierLabel + '（' + total + ' / DC ' + dc + '）');
    saveState();
    sendPlayerMessage({ type:'check-result', result:result });
    renderTabletop();
    document.getElementById('gm-check-preview').innerHTML = '<span>' + escapeHtml(result.tierLabel) + ' · <strong>' + total + '</strong> / DC ' + dc + '</span><p>骰点 ' + dice.join(' / ') + '，取 ' + kept + '；' + escapeHtml(approach.label) + ' +' + approachValue + (specialty ? '，' + escapeHtml(specialty) + ' +2' : '') + '，协助 +' + assist + '，额外修正 ' + (modifier >= 0 ? '+' : '') + modifier + '。</p>';
    document.getElementById('active-request-label').textContent = '已发布';
    showToast('判定结果已发送给 ' + characterName);
  }

  function handleSealAction(index) {
    var status = state.seals[index];
    var meta = state.sealMeta[index];
    if (status === 'blank') {
      var action = window.prompt('第 ' + (index + 1) + ' 枚令印为空白。输入 1 普通使用；输入 2 建立双方当下同意的常驻契约。');
      if (action !== '1' && action !== '2') return;
      if (action === '1') {
        var use = window.prompt('记录本次授权／中断／见证的对象与用途（不能强迫爱、原谅、牺牲或服从）：') || '';
        commit('使用第 ' + (index + 1) + ' 枚空白令印', function (draft) { draft.seals[index] = 'used'; draft.sealMeta[index].note = use.slice(0, 200); });
      } else {
        var contract = window.prompt('记录已明确同意的契约双方与解除方式：') || '';
        if (!contract.trim()) { showToast('常驻契约必须记录双方同意与解除方式'); return; }
        commit('第 ' + (index + 1) + ' 枚令印锁定常驻契约', function (draft) { draft.seals[index] = 'locked'; draft.sealMeta[index].note = contract.slice(0, 200); });
      }
      return;
    }
    if (status === 'used') {
      if (state.reflowsThisSession >= 1) { showToast('本场游戏已经回流过 1 枚令印'); return; }
      if (meta.reflownLoop === state.loop) { showToast('这枚令印本循环已经回流过一次'); return; }
      if (!window.confirm('只在已完成可验证修复时回流。确认将这枚已用令印恢复为空白？')) return;
      var repair = window.prompt('记录可验证修复：履行承诺、修正遗漏、归还证据或同等行为。') || '';
      if (!repair.trim()) { showToast('请记录可验证修复后再回流'); return; }
      commit('第 ' + (index + 1) + ' 枚令印因可验证修复回流', function (draft) {
        draft.seals[index] = 'blank';
        draft.sealMeta[index] = { reflownLoop:draft.loop, note:'回流：' + repair.slice(0, 180) };
        draft.reflowsThisSession = 1;
      });
      return;
    }
    if (status === 'locked') {
      if (!window.confirm('任一方可解除契约；解除后令印变为已用，并应共同选择一个可见后果。确认解除？')) return;
      var consequence = window.prompt('记录解除契约的可见后果：') || '';
      commit('解除第 ' + (index + 1) + ' 枚令印维持的常驻契约', function (draft) { draft.seals[index] = 'used'; draft.sealMeta[index].note = '解除：' + consequence.slice(0, 180); });
      return;
    }
    showToast('锚定是完整重置中的暂态；重置完成后该令印变为已用');
  }

  function renderTrackers() {
    var definitions = [
      { id:'anomaly', label:'世界异常', max:6, color:'#cf5d63' },
      { id:'grail', label:'圣杯显现', max:6, color:'#d4ad6b' },
      { id:'anchor', label:'茂的自我锚点', max:6, color:'#78b6b4' },
      { id:'theory', label:'理论碎片', max:3, color:'#859ec4' },
      { id:'memory', label:'记忆碎片', max:3, color:'#c6898c' },
      { id:'observation', label:'观测碎片', max:3, color:'#9aa56d' }
    ];
    document.getElementById('loop-value').textContent = state.loop;
    document.getElementById('tracker-list').innerHTML = definitions.map(function (def) {
      var value = state.trackers[def.id] || 0;
      var dots = Array.from({ length:def.max }, function (_, index) { return '<i class="' + (index < value ? 'filled' : '') + '"></i>'; }).join('');
      return '<div class="tracker-item"><div class="tracker-item-head"><span>' + def.label + '</span><div><button type="button" data-track="' + def.id + '" data-delta="-1" aria-label="减少' + def.label + '">−</button><strong>' + value + '</strong><button type="button" data-track="' + def.id + '" data-delta="1" aria-label="增加' + def.label + '">＋</button></div></div><div class="track-dots" style="--max:' + def.max + ';--track-color:' + def.color + '">' + dots + '</div></div>';
    }).join('');
    var labels = { blank:'空白', used:'已用', anchored:'锚定', locked:'契约锁定' };
    document.getElementById('seal-list').innerHTML = state.seals.map(function (seal, index) {
      var note = state.sealMeta[index] && state.sealMeta[index].note;
      return '<button class="seal ' + seal + '" type="button" data-seal="' + index + '" title="' + escapeHtml(note || labels[seal]) + '"><span>◇</span><small>' + labels[seal] + '</small></button>';
    }).join('');
    document.getElementById('seal-rule-hint').textContent = '本场回流 ' + state.reflowsThisSession + '/1；每枚每循环最多回流一次。锚定仅在完整重置中处理。';
    var seventhNightFailed = ['E25','E26','E27'].some(function (id) { return state.sceneResults[id] && state.sceneResults[id].outcome === 'failure'; });
    document.getElementById('rail-warning').hidden = state.trackers.anomaly < 6 && !seventhNightFailed;
    document.querySelectorAll('[data-track]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-track');
        var delta = Number(button.getAttribute('data-delta'));
        var def = definitions.find(function (item) { return item.id === id; });
        commit(def.label + (delta > 0 ? '＋1' : '−1'), function (draft) { draft.trackers[id] = Math.max(0, Math.min(def.max, (draft.trackers[id] || 0) + delta)); });
      });
    });
    document.querySelectorAll('[data-seal]').forEach(function (button) {
      button.addEventListener('click', function () { handleSealAction(Number(button.getAttribute('data-seal'))); });
    });
    ['goal','threat'].forEach(function (clock) {
      var value = state.conflictClocks[clock] || 0;
      document.getElementById(clock + '-clock-value').textContent = value + ' / 4';
      document.getElementById(clock + '-clock-label').value = state.conflictClocks[clock + 'Label'];
    });
    document.getElementById('clock-resolution-hint').classList.toggle('clock-alert', state.conflictClocks.goal >= 4 || state.conflictClocks.threat >= 4);
    var finaleButton = document.getElementById('finale-seal-button');
    var finaleLabels = { unavailable:'未获得', available:'可用（仅中止崩溃／见证同意）', used:'已用' };
    finaleButton.textContent = '终局临时令印：' + finaleLabels[state.finaleSeal || 'unavailable'];
    finaleButton.disabled = state.finaleSeal === 'used';
  }

  function renderLog() {
    document.getElementById('session-notes').value = state.sessionNotes;
    document.getElementById('history-list').innerHTML = state.log.length ? state.log.map(function (entry) {
      var date = new Date(entry.at);
      return '<li><time>' + date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}) + '</time>' + escapeHtml(entry.label) + '</li>';
    }).join('') : '<li class="history-empty">尚无操作记录。打开一个场景开始本次战役。</li>';
  }

  function renderAll() {
    renderCurrent();
    renderTimeline();
    renderMap();
    renderNpcs();
    renderTruths();
    renderHandouts();
    renderTrackers();
    renderTabletop();
    renderLog();
  }

  function outcomeEffects(scene, outcome) {
    var effects = {};
    if (outcome === 'success') effects = Object.assign({}, scene.effects || {});
    if (outcome === 'costly') {
      effects = Object.assign({}, scene.effects || {});
      effects.anomaly = (effects.anomaly || 0) + 1;
    }
    if (outcome === 'failure') effects = { anomaly:1 };
    return effects;
  }

  function sceneResolutionControls(scene) {
    var labels = [
      ['anomaly','世界异常'], ['grail','圣杯显现'], ['anchor','茂的锚点'],
      ['theory','理论碎片'], ['memory','记忆碎片'], ['observation','观测碎片']
    ];
    return '<section class="dialog-block scene-resolution"><span>OUTCOME · 由主持人选择</span><h3>场景结算</h3>' +
      '<label><span>结果</span><select data-scene-outcome><option value="success">成功／取得主要目标</option><option value="costly">带代价推进</option><option value="failure">失败推进／局势行动</option><option value="custom">自定义结算</option></select></label>' +
      '<div class="scene-effect-grid">' + labels.map(function (item) { return '<label><span>' + item[1] + '</span><input type="number" min="-6" max="6" step="1" value="0" data-scene-effect="' + item[0] + '"></label>'; }).join('') + '</div>' +
      '<label><span>公开代价／余波记录</span><textarea rows="2" maxlength="600" data-scene-result-note placeholder="先公开代价，再决定是否接受；核心线索必须保留替代路径。"></textarea></label>' +
      '<small>轨道不会自动套用固定值；选择结果后仍可逐项调整。</small></section>';
  }

  function fillSceneEffects(dialog, scene, outcome) {
    var effects = outcomeEffects(scene, outcome);
    dialog.querySelectorAll('[data-scene-effect]').forEach(function (input) {
      input.value = outcome === 'custom' ? input.value : String(effects[input.getAttribute('data-scene-effect')] || 0);
    });
  }

  function openScene(id) {
    var scene = byId(data.scenes, id);
    if (!scene) return;
    var dialog = document.getElementById('scene-dialog');
    var loc = byId(data.locations, scene.location);
    var revealed = state.sceneClues[id] || [];
    var done = state.completedScenes.indexOf(id) !== -1;
    var active = state.activeSceneId === id;
    var npcButtons = scene.npcs.map(function (npcId) { var npc = byId(data.npcs, npcId); return '<button type="button" data-npc="' + npcId + '">' + escapeHtml(npc.name) + '</button>'; }).join('');
    var handoutButtons = scene.handouts.map(function (handoutId) { var item = byId(data.handouts, handoutId); return '<button type="button" data-handout="' + handoutId + '">' + handoutId + ' · ' + escapeHtml(item.title) + '</button>'; }).join('');
    document.getElementById('scene-dialog-content').innerHTML = '<div class="scene-dialog-shell"><button class="dialog-x" type="button" data-close-dialog aria-label="关闭">×</button><div class="scene-dialog-hero"><img src="' + scene.image + '" alt="' + escapeHtml(scene.title) + '场景插画"><div class="scene-hero-copy"><span>' + scene.id + ' · ' + escapeHtml(loc.name) + '</span><h2>' + escapeHtml(scene.title) + '</h2><p>' + escapeHtml(scene.time) + '</p></div></div><div class="scene-dialog-body"><div><section class="dialog-block"><span>PLAYER VISIBLE · 可直接朗读</span><h3>场景表层</h3><p>' + escapeHtml(scene.visible) + '</p></section><section class="dialog-block"><span>CLUE REVEAL · 点击逐条公开</span><h3>可得线索</h3><div class="scene-clues">' + scene.clues.map(function (clue, index) { return '<button class="scene-clue' + (revealed.indexOf(index) !== -1 ? ' revealed' : '') + '" type="button" data-scene-clue="' + index + '">' + escapeHtml(clue) + '</button>'; }).join('') + '</div></section></div><aside><section class="dialog-block"><span>KEEPER ONLY</span><h3>主持目标</h3><p>' + escapeHtml(scene.objective) + '</p></section><section class="dialog-block"><span>FAIL FORWARD</span><h3>默认余波</h3><p class="scene-risk">' + escapeHtml(scene.risk) + '</p></section><section class="dialog-block"><span>CAST</span><h3>在场人物</h3><div class="dialog-cast-buttons">' + (npcButtons || '<span>按补救来源选择出场人物</span>') + '</div></section><section class="dialog-block"><span>PLAYER SAFE</span><h3>关联手卡</h3><div class="dialog-cast-buttons">' + (handoutButtons || '<span>本场无独立手卡</span>') + '</div></section>' + (done ? '<section class="dialog-block"><span>RECORDED OUTCOME</span><h3>已结算记录</h3><p>' + escapeHtml(state.sceneResults[id] && state.sceneResults[id].note || '该节点已经结算；轨道不会重复叠加。') + '</p></section>' : sceneResolutionControls(scene)) + '<div class="scene-dialog-actions"><button class="primary-action" type="button" data-start-scene="' + id + '">' + (active ? '场景正在运行' : '开始场景') + '</button><button type="button" data-complete-scene="' + id + '">' + (done ? '已结算 · 保留记录' : '按所选结果结算') + '</button></div></aside></div></div>';
    dialog.querySelector('[data-close-dialog]').addEventListener('click', function () { dialog.close(); });
    dialog.querySelectorAll('[data-npc]').forEach(function (button) { button.addEventListener('click', function () { dialog.close(); openNpc(button.getAttribute('data-npc')); }); });
    dialog.querySelectorAll('[data-handout]').forEach(function (button) { button.addEventListener('click', function () { dialog.close(); openHandout(button.getAttribute('data-handout')); }); });
    dialog.querySelectorAll('[data-scene-clue]').forEach(function (button) {
      button.addEventListener('click', function () {
        var index = Number(button.getAttribute('data-scene-clue'));
        commit((button.classList.contains('revealed') ? '收回' : '公开') + ' ' + scene.id + ' 线索：' + scene.clues[index], function (draft) {
          var list = (draft.sceneClues[id] || []).slice();
          var at = list.indexOf(index);
          if (at === -1) list.push(index); else list.splice(at, 1);
          draft.sceneClues[id] = list;
        });
        dialog.close(); openScene(id);
      });
    });
    dialog.querySelector('[data-start-scene]').addEventListener('click', function () {
      if (state.activeSceneId === id) return;
      commit('开始场景 ' + id + '：' + scene.title, function (draft) { draft.activeSceneId = id; draft.activeNpcs = scene.npcs.slice(); });
      dialog.close(); openScene(id);
    });
    var outcomeSelect = dialog.querySelector('[data-scene-outcome]');
    if (outcomeSelect) {
      fillSceneEffects(dialog, scene, outcomeSelect.value);
      outcomeSelect.addEventListener('change', function () { fillSceneEffects(dialog, scene, outcomeSelect.value); });
    }
    dialog.querySelector('[data-complete-scene]').addEventListener('click', function () {
      if (state.completedScenes.indexOf(id) !== -1) { showToast('该场景已经结算，未重复叠加轨道'); return; }
      var effects = {};
      dialog.querySelectorAll('[data-scene-effect]').forEach(function (input) {
        var value = clampNumber(input.value, -6, 6, 0);
        if (value) effects[input.getAttribute('data-scene-effect')] = value;
      });
      var resultNote = String(dialog.querySelector('[data-scene-result-note]') && dialog.querySelector('[data-scene-result-note]').value || '').trim().slice(0, 600);
      if (outcomeSelect && (outcomeSelect.value === 'costly' || outcomeSelect.value === 'failure') && !resultNote) { showToast('带代价或失败推进必须记录已公开的代价／余波'); return; }
      completeScene(scene, {
        outcome: outcomeSelect ? outcomeSelect.value : 'custom',
        effects: effects,
        note: resultNote
      });
      dialog.close();
    });
    if (!dialog.open) dialog.showModal();
  }

  function completeScene(scene, result) {
    var labels = { success:'成功', costly:'带代价推进', failure:'失败推进', custom:'自定义' };
    result = result || { outcome:'custom', effects:{}, note:'' };
    commit('结算场景 ' + scene.id + '（' + (labels[result.outcome] || '自定义') + '）：' + scene.title, function (draft) {
      draft.completedScenes.push(scene.id);
      if (draft.resolvedNodes.indexOf(scene.id) === -1) draft.resolvedNodes.push(scene.id);
      draft.sceneResults[scene.id] = { outcome:result.outcome, effects:Object.assign({}, result.effects), note:result.note, at:new Date().toISOString(), loop:draft.loop };
      if (draft.visitedLocations.indexOf(scene.location) === -1) draft.visitedLocations.push(scene.location);
      if (draft.activeSceneId === scene.id) draft.activeSceneId = null;
      draft.activeNpcs = [];
      Object.keys(result.effects || {}).forEach(function (key) {
        var max = ['theory','memory','observation'].indexOf(key) !== -1 ? 3 : 6;
        draft.trackers[key] = Math.max(0, Math.min(max, (draft.trackers[key] || 0) + result.effects[key]));
      });
    });
  }

  function openNpc(id) {
    var npc = byId(data.npcs, id);
    if (!npc) return;
    var dialog = document.getElementById('npc-dialog');
    var servant = npc.crop != null;
    var locId = state.npcLocations[npc.id] || npc.location;
    var loc = byId(data.locations, locId);
    var active = state.activeNpcs.indexOf(id) !== -1;
    var fields = [
      ['现在想要', npc.wants], ['真正害怕', npc.fears], ['确实知道', npc.knows], ['不会接受', npc.refuses], ['离场行动', npc.action], ['声线', npc.voice], ['轮回残留', npc.loop], ['当前位置', loc ? loc.name : '未知']
    ];
    document.getElementById('npc-dialog-content').innerHTML = '<div class="npc-dialog-shell"><button class="dialog-x" type="button" data-close-dialog aria-label="关闭">×</button><div class="npc-dialog-hero"><div class="npc-dialog-image"><img class="' + (servant ? 'servant-crop' : '') + '" style="--crop:' + (npc.crop || '50%') + '" src="' + npc.image + '" alt="' + escapeHtml(npc.name) + '肖像"></div><div class="npc-dialog-copy"><span>' + (servant ? 'HEROIC SPIRIT' : 'NPC DOSSIER') + '</span><h2>' + escapeHtml(npc.name) + '</h2><small>' + escapeHtml(npc.role) + '</small><p class="npc-intro">' + escapeHtml(npc.intro) + '</p></div></div><div class="npc-fields">' + fields.map(function (field) { return '<section class="npc-field"><span>' + field[0] + '</span><p>' + escapeHtml(field[1]) + '</p></section>'; }).join('') + '</div><div class="npc-dialog-actions"><button type="button" data-toggle-active="' + id + '">' + (active ? '从当前场景移出' : '加入当前场景') + '</button><button type="button" data-npc-action="' + id + '">执行离场行动</button><button type="button" data-copy-intro="' + id + '">复制玩家可见介绍</button></div></div>';
    dialog.querySelector('[data-close-dialog]').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('[data-toggle-active]').addEventListener('click', function () {
      commit((active ? '移出' : '加入') + '当前场景：' + npc.name, function (draft) {
        var at = draft.activeNpcs.indexOf(id);
        if (at === -1) draft.activeNpcs.push(id); else draft.activeNpcs.splice(at, 1);
      });
      dialog.close(); openNpc(id);
    });
    dialog.querySelector('[data-npc-action]').addEventListener('click', function () {
      commit('执行离场行动：' + npc.name + ' — ' + npc.action, function () {});
      dialog.close();
    });
    dialog.querySelector('[data-copy-intro]').addEventListener('click', function () { copyText(npc.name + '｜' + npc.intro, '已复制 PLAYER SAFE 人物介绍'); });
    if (!dialog.open) dialog.showModal();
  }

  function openHandout(id) {
    var item = byId(data.handouts, id);
    if (!item) return;
    var dialog = document.getElementById('handout-dialog');
    var sent = state.revealedHandouts.indexOf(id) !== -1;
    var facts = (item.playerFacts || []).map(function (fact) { return '<li>' + escapeHtml(fact) + '</li>'; }).join('');
    var relatedScenes = (item.relatedScenes || []).map(function (sceneId) {
      var scene = byId(data.scenes, sceneId);
      return scene ? '<button type="button" data-related-scene="' + sceneId + '"><strong>' + sceneId + '</strong> · ' + escapeHtml(scene.title) + '</button>' : '';
    }).join('');
    document.getElementById('handout-dialog-content').innerHTML = '<div class="handout-dialog-shell"><button class="dialog-x" type="button" data-close-dialog aria-label="关闭">×</button><div class="handout-dialog-art"><img src="' + item.image + '" alt="' + escapeHtml(item.title) + '完整视觉手卡"></div><div class="handout-dialog-copy"><span>PLAYER SAFE · ' + item.id + ' · ' + escapeHtml(item.day) + '</span><h2>' + escapeHtml(item.title) + '</h2><small class="handout-dialog-source">' + escapeHtml(item.source || 'PLAYER SAFE 资料') + '</small><p class="handout-dialog-lead">' + escapeHtml(item.body) + '</p><section class="handout-dialog-facts"><h3>' + escapeHtml(item.factLabel || '资料要点') + '</h3><ul>' + facts + '</ul></section>' + (item.playerPrompt ? '<section class="handout-player-prompt"><span>玩家可见 · 可操作提示</span><p>' + escapeHtml(item.playerPrompt) + '</p></section>' : '') + '<section class="handout-keeper-panel"><div class="handout-trigger"><span>守秘人触发条件</span><strong>' + escapeHtml(item.trigger) + '</strong></div><div class="handout-keeper-note"><span>守秘人提示 · 不随投屏发送</span><p>' + escapeHtml(item.keeperNote || '按当前场景进度发放。') + '</p></div>' + (relatedScenes ? '<div class="handout-related-scenes"><span>关联场景</span><div>' + relatedScenes + '</div></div>' : '') + '</section><div class="handout-dialog-actions"><button type="button" data-broadcast="' + id + '">' + (sent ? '再次发到玩家投屏' : '确认发到玩家投屏') + '</button><button type="button" data-open-player="' + id + '">打开并投送此卡</button><button type="button" data-copy-link="' + id + '">复制投屏地址</button>' + (sent ? '<button class="danger-action" type="button" data-retract="' + id + '">撤回投屏</button>' : '') + '</div></div></div>';
    dialog.querySelector('[data-close-dialog]').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('[data-broadcast]').addEventListener('click', function () { deliverHandout(item); dialog.close(); });
    dialog.querySelector('[data-open-player]').addEventListener('click', function () {
      openPlayerWindow('player.html?mode=single', 'ng-handout-' + id);
      deliverHandout(item);
      dialog.close();
    });
    dialog.querySelector('[data-copy-link]').addEventListener('click', function () {
      copyText(new URL('player.html?mode=projection', window.location.href).href, '已复制安全投屏地址；打开后仍需由控制台投送');
    });
    dialog.querySelectorAll('[data-related-scene]').forEach(function (button) { button.addEventListener('click', function () { dialog.close(); openScene(button.getAttribute('data-related-scene')); }); });
    var retractButton = dialog.querySelector('[data-retract]');
    if (retractButton) retractButton.addEventListener('click', function () { retractHandout(item); dialog.close(); });
    if (!dialog.open) dialog.showModal();
  }

  function deliverHandout(item) {
    lastPlayerPayload = playerPayload(item);
    commit('向玩家发放 ' + item.id + '：' + item.title, function (draft) {
      if (draft.revealedHandouts.indexOf(item.id) === -1) draft.revealedHandouts.push(item.id);
      draft.activeHandoutId = item.id;
    });
    sendPlayerMessage({ type:'show', handout:lastPlayerPayload });
  }

  function retractHandout(item) {
    if (state.revealedHandouts.indexOf(item.id) === -1) { showToast(item.id + ' 尚未投放'); return; }
    commit('从玩家投屏撤回 ' + item.id + '：' + item.title, function (draft) {
      var at = draft.revealedHandouts.indexOf(item.id);
      if (at !== -1) draft.revealedHandouts.splice(at, 1);
      if (draft.activeHandoutId === item.id) draft.activeHandoutId = null;
    });
    if (lastPlayerPayload && lastPlayerPayload.id === item.id) lastPlayerPayload = null;
    sendPlayerMessage({ type:'retract', handoutId:item.id });
  }

  function copyText(text, success) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { showToast(success); });
    } else {
      var area = document.createElement('textarea');
      area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); showToast(success);
    }
  }

  function exportState() {
    var payload = {
      exportedAt:new Date().toISOString(),
      campaign:data.id,
      rulesetId:RULESET_ID,
      rulesetVersion:data.rulesetVersion || '3.2',
      contentVersion:data.contentVersion || data.version,
      schemaVersion:STATE_SCHEMA_VERSION,
      buildId:data.buildId || 'local',
      state:state
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '零之圣杯-守秘人备份-' + new Date().toISOString().slice(0,10) + '.json';
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('战役备份已导出');
  }

  function importState(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var payload = JSON.parse(reader.result);
        if (payload.campaign && payload.campaign !== data.id) throw new Error('campaign');
        if (payload.rulesetId && payload.rulesetId !== RULESET_ID) throw new Error('ruleset');
        if (Number(payload.schemaVersion || payload.state && payload.state.schemaVersion || 1) > STATE_SCHEMA_VERSION) throw new Error('newer-schema');
        var imported = payload.state || payload;
        if (!imported || !imported.dayId || !imported.trackers) throw new Error('invalid');
        undoStack.push(clone(state));
        state = migrateState(imported);
        var migratedFrom = Number(imported.schemaVersion || 1);
        addLog('导入战役备份' + (migratedFrom < STATE_SCHEMA_VERSION ? '并迁移 v' + migratedFrom + ' → v' + STATE_SCHEMA_VERSION : ''));
        var active = state.activeHandoutId ? byId(data.handouts, state.activeHandoutId) : null;
        lastPlayerPayload = active ? playerPayload(active) : null;
        saveState(); renderAll(); showToast(migratedFrom < STATE_SCHEMA_VERSION ? '旧备份已迁移并导入' : '战役备份已导入');
      } catch (error) {
        var message = error && error.message === 'newer-schema' ? '这份备份来自更新版控制台，当前版本无法安全读取' : '无法读取这份备份：战役、规则版本或数据结构不兼容';
        showToast(message);
      }
    };
    reader.readAsText(file);
  }

  function fullReset() {
    var seventhNightFailed = ['E25','E26','E27'].some(function (id) { return state.sceneResults[id] && state.sceneResults[id].outcome === 'failure'; });
    if (state.trackers.anomaly < 6 && !seventhNightFailed) { showToast('尚未满足完整重置触发：异常未达 6，且未记录第七夜失败'); return; }
    if (state.loop >= 2) {
      commit('第三次重置触发：转入终局变体或开放撤离，不再回档', function (draft) { draft.terminalResetTriggered = true; });
      document.getElementById('reset-guide-dialog').close();
      return;
    }
    var facts = document.getElementById('reset-anchor-facts').value.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    var usableBlankCount = state.seals.filter(function (seal) { return seal === 'blank'; }).length;
    if (facts.length > usableBlankCount || facts.length > 3) { showToast('锚定事实超过剩余空白令印数量'); return; }
    var previousAnomaly = state.trackers.anomaly;
    commit('执行完整重置，进入第 ' + (state.loop + 2) + ' 轮', function (draft) {
      var previousCompleted = draft.completedScenes.slice();
      var previousResults = clone(draft.sceneResults);
      draft.loop += 1;
      draft.dayId = 'D1';
      draft.activeSceneId = null;
      draft.activeNpcs = [];
      draft.completedScenes = [];
      draft.sceneResults = {};
      draft.sceneClues = {};
      draft.visitedLocations = [];
      previousCompleted.forEach(function (id) { if (draft.resolvedNodes.indexOf(id) === -1) draft.resolvedNodes.push(id); });
      draft.trackers.anomaly = Math.min(4, Math.max(2 + draft.loop, previousAnomaly - 2));
      draft.trackers.grail = 0;
      var factIndex = 0;
      draft.seals = draft.seals.map(function (seal, index) {
        if (seal === 'locked') { draft.sealMeta[index].note = '完整重置自动解除契约'; return 'used'; }
        if (seal === 'blank' && factIndex < facts.length) { draft.sealMeta[index].note = '锚定：' + facts[factIndex++]; return 'used'; }
        return seal === 'anchored' ? 'used' : seal;
      });
      draft.anchoredFacts = draft.anchoredFacts.concat(facts.map(function (fact) { return { loop:draft.loop, fact:fact }; }));
      draft.resetHistory.push({ at:new Date().toISOString(), loop:draft.loop, previousAnomaly:previousAnomaly, startingAnomaly:draft.trackers.anomaly, anchoredFacts:facts, resolvedNodes:previousCompleted, sceneResults:previousResults });
      draft.reflowsThisSession = 0;
      draft.finaleSeal = 'unavailable';
      draft.conflictClocks = { goal:0, threat:0, goalLabel:'玩家目标', threatLabel:'敌方／环境威胁' };
      draft.roster.forEach(function (character) {
        var injuryAnchored = facts.some(function (fact) { return fact.indexOf(character.name) !== -1 && /(伤势|疤痕)/.test(fact); });
        character.resolve = 3;
        character.stress = 0;
        character.coreLoad = 0;
        character.noblePhantasmReady = true;
        character.injury = injuryAnchored ? 'light' : 'none';
      });
      draft.activeHandoutId = null;
    });
    lastPlayerPayload = null;
    sendPlayerMessage({ type:'curtain' });
    document.getElementById('reset-anchor-facts').value = '';
    document.getElementById('reset-guide-dialog').close();
    openView('current');
  }

  function bindStaticEvents() {
    document.querySelectorAll('[data-view]').forEach(function (button) { button.addEventListener('click', function () { openView(button.getAttribute('data-view')); }); });
    document.querySelectorAll('[data-go]').forEach(function (button) { button.addEventListener('click', function () { openView(button.getAttribute('data-go')); }); });
    document.getElementById('start-first-scene').addEventListener('click', function () { openScene(currentDay().sceneIds[0]); });

    document.querySelectorAll('[data-map-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        mapFilter = button.getAttribute('data-map-filter');
        document.querySelectorAll('[data-map-filter]').forEach(function (item) { item.classList.toggle('active', item === button); });
        renderMap();
      });
    });
    document.querySelectorAll('[data-npc-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        npcFilter = button.getAttribute('data-npc-filter');
        document.querySelectorAll('[data-npc-filter]').forEach(function (item) { item.classList.toggle('active', item === button); });
        renderNpcs();
      });
    });
    document.getElementById('npc-search').addEventListener('input', renderNpcs);
    document.getElementById('open-recovery-scene').addEventListener('click', function () { openScene('E28'); });
    document.getElementById('clue-notes').addEventListener('input', function (event) { state.clueNotes = event.target.value; saveState(); });
    document.getElementById('session-notes').addEventListener('input', function (event) { state.sessionNotes = event.target.value; saveState(); });

    document.getElementById('gm-import-character').addEventListener('click', function () { document.getElementById('gm-character-file').click(); });
    document.getElementById('gm-character-file').addEventListener('change', function (event) {
      if (event.target.files[0]) importCharacters(event.target.files[0]);
      event.target.value = '';
    });
    document.getElementById('gm-export-roster').addEventListener('click', exportRoster);
    document.getElementById('gm-check-character').addEventListener('change', function () { refreshGmSpecialtyOptions(); });
    document.getElementById('gm-check-form').addEventListener('submit', publishCheckResult);
    document.getElementById('gm-clear-check').addEventListener('click', clearCheckForm);

    document.getElementById('undo-button').addEventListener('click', function () {
      if (!undoStack.length) { showToast('没有可以撤销的操作'); return; }
      state = undoStack.pop(); addLog('撤销上一步'); saveState(); renderAll(); showToast('已撤销上一步');
    });
    document.getElementById('curtain-button').addEventListener('click', function () {
      lastPlayerPayload = null;
      commit('玩家投屏切回帷幕', function (draft) { draft.activeHandoutId = null; });
      sendPlayerMessage({ type:'curtain' });
    });
    document.getElementById('player-window-button').addEventListener('click', function () {
      openPlayerWindow('player.html?mode=projection', 'ng-projection');
    });
    document.getElementById('session-menu-button').addEventListener('click', function () {
      var menu = document.getElementById('session-menu'); var opening = menu.hidden; menu.hidden = !opening; this.setAttribute('aria-expanded', String(opening));
    });
    document.getElementById('export-button').addEventListener('click', exportState);
    document.getElementById('import-button').addEventListener('click', function () { document.getElementById('import-file').click(); });
    document.getElementById('import-file').addEventListener('change', function (event) { if (event.target.files[0]) importState(event.target.files[0]); event.target.value = ''; });
    document.getElementById('new-session-button').addEventListener('click', function () {
      commit('开始新的游戏场次', function (draft) { draft.reflowsThisSession = 0; draft.sessionIndex = (draft.sessionIndex || 0) + 1; });
    });
    document.getElementById('reset-button').addEventListener('click', function () {
      if (!window.confirm('新建空白战役会清除当前自动保存。建议先导出备份。是否继续？')) return;
      undoStack.push(clone(state)); state = freshState(); addLog('新建空白战役'); saveState(); renderAll(); openView('current');
    });
    document.getElementById('clear-log').addEventListener('click', function () { commit('清空场记历史', function (draft) { draft.log = []; }); });
    document.querySelectorAll('[data-loop]').forEach(function (button) { button.addEventListener('click', function () { var delta = Number(button.getAttribute('data-loop')); commit('完整重置次数' + (delta > 0 ? '＋1' : '−1'), function (draft) { draft.loop = Math.max(0, Math.min(2, draft.loop + delta)); }); }); });

    document.querySelectorAll('[data-clock]').forEach(function (button) { button.addEventListener('click', function () {
      var clock = button.getAttribute('data-clock'); var delta = Number(button.getAttribute('data-clock-delta'));
      commit((clock === 'goal' ? '目标钟' : '威胁钟') + (delta > 0 ? '＋1' : '−1'), function (draft) { draft.conflictClocks[clock] = clampNumber(draft.conflictClocks[clock] + delta, 0, 4, 0); });
    }); });
    ['goal','threat'].forEach(function (clock) { document.getElementById(clock + '-clock-label').addEventListener('change', function (event) { state.conflictClocks[clock + 'Label'] = safeText(event.target.value, 80) || (clock === 'goal' ? '玩家目标' : '敌方／环境威胁'); saveState(); }); });
    document.getElementById('finale-seal-button').addEventListener('click', function () {
      if (state.finaleSeal === 'unavailable') {
        if (!state.seals.every(function (seal) { return seal === 'used'; })) { showToast('只有三枚令印都已用时才可能获得终局临时令印'); return; }
        if (!window.confirm('确认团队已取得知情同意／决定权证据？临时令印只可中止崩溃或见证同意。')) return;
        commit('获得终局临时令印', function (draft) { draft.finaleSeal = 'available'; });
      } else if (state.finaleSeal === 'available' && window.confirm('确认使用终局临时令印？它只能中止崩溃或见证同意，终局后消失。')) {
        commit('使用终局临时令印', function (draft) { draft.finaleSeal = 'used'; });
      }
    });

    document.getElementById('tracker-collapse').addEventListener('click', function () {
      var rail = document.querySelector('.tracker-rail'); rail.classList.toggle('collapsed'); this.setAttribute('aria-expanded', String(!rail.classList.contains('collapsed')));
    });
    document.getElementById('reset-guide-button').addEventListener('click', function () {
      var resetMessage = state.loop >= 2 ? '已完成两次完整重置；再次触发只能转入终局变体或开放撤离。' : '当前可用空白令印 ' + state.seals.filter(function (seal) { return seal === 'blank'; }).length + ' 枚；契约锁定令印会先变为已用。';
      document.getElementById('reset-eligibility').textContent = resetMessage;
      document.getElementById('confirm-full-reset').textContent = state.loop >= 2 ? '记录第三次触发并转入结局' : '确认开始下一轮';
      document.getElementById('reset-guide-dialog').showModal();
    });
    document.getElementById('confirm-full-reset').addEventListener('click', fullReset);

    document.querySelectorAll('.archive-dialog').forEach(function (dialog) {
      dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') document.getElementById('session-menu').hidden = true;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { event.preventDefault(); document.getElementById('undo-button').click(); }
    });
    window.addEventListener('message', function (event) {
      if (event.origin !== window.location.origin || !event.data) return;
      if (event.data.protocol && event.data.protocol !== MESSAGE_PROTOCOL) return;
      if (event.data.type === 'character-submit') receiveCharacterSubmission(event.data);
      if (event.data.type === 'check-request') receiveCheckRequest(event.data.request);
    });
  }

  if (window.matchMedia('(max-width: 1040px)').matches) document.querySelector('.tracker-rail').classList.add('collapsed');
  bindStaticEvents();
  renderAll();
  openView('current');
}());
