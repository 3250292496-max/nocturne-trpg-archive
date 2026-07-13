(function () {
  'use strict';

  var data = window.NG_DATA;
  if (!data) return;

  var STORAGE_KEY = 'ng-session:null-grail-v3.2';
  var channel = null;
  var undoStack = [];
  var currentView = 'current';
  var npcFilter = 'all';
  var mapFilter = 'all';
  var selectedLocationId = null;
  var toastTimer = null;
  var lastPlayerPayload = null;
  var playerWindows = [];
  var messageOrigin = window.location.origin === 'null' ? '*' : window.location.origin;

  try {
    channel = new BroadcastChannel('null-grail-player');
    channel.onmessage = function (event) {
      if (!event.data || event.data.type !== 'ready') return;
      sendPlayerMessage(lastPlayerPayload
        ? { type:'show', handout:lastPlayerPayload }
        : { type:'curtain' });
    };
  } catch (error) { channel = null; }

  function freshState() {
    return {
      schemaVersion: 1,
      campaignVersion: '3.2',
      dayId: 'D1',
      loop: 0,
      activeSceneId: null,
      activeNpcs: [],
      trackers: { anomaly: 2, grail: 0, anchor: 0, theory: 0, memory: 0, observation: 0 },
      seals: ['blank', 'blank', 'blank'],
      completedScenes: [],
      sceneClues: {},
      revealedHandouts: [],
      knownTruthSources: {},
      visitedLocations: [],
      npcLocations: {},
      sessionNotes: '',
      clueNotes: '',
      log: []
    };
  }

  function loadState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Object.assign(freshState(), parsed || {}, {
        trackers: Object.assign(freshState().trackers, parsed && parsed.trackers),
        sceneClues: Object.assign({}, parsed && parsed.sceneClues),
        knownTruthSources: Object.assign({}, parsed && parsed.knownTruthSources),
        npcLocations: Object.assign({}, parsed && parsed.npcLocations)
      });
    } catch (error) {
      return freshState();
    }
  }

  var state = loadState();

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
              ? { type:'show', handout:lastPlayerPayload }
              : { type:'curtain' }, messageOrigin);
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
    document.getElementById('seal-list').innerHTML = state.seals.map(function (seal, index) { return '<button class="seal ' + seal + '" type="button" data-seal="' + index + '"><span>◇</span><small>' + labels[seal] + '</small></button>'; }).join('');
    document.getElementById('rail-warning').hidden = state.trackers.anomaly < 6;
    document.querySelectorAll('[data-track]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-track');
        var delta = Number(button.getAttribute('data-delta'));
        var def = definitions.find(function (item) { return item.id === id; });
        commit(def.label + (delta > 0 ? '＋1' : '−1'), function (draft) { draft.trackers[id] = Math.max(0, Math.min(def.max, (draft.trackers[id] || 0) + delta)); });
      });
    });
    document.querySelectorAll('[data-seal]').forEach(function (button) {
      button.addEventListener('click', function () {
        var index = Number(button.getAttribute('data-seal'));
        var order = ['blank','used','anchored','locked'];
        var next = order[(order.indexOf(state.seals[index]) + 1) % order.length];
        commit('第 ' + (index + 1) + ' 枚令印：' + labels[next], function (draft) { draft.seals[index] = next; });
      });
    });
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
    renderLog();
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
    document.getElementById('scene-dialog-content').innerHTML = '<div class="scene-dialog-shell"><button class="dialog-x" type="button" data-close-dialog aria-label="关闭">×</button><div class="scene-dialog-hero"><img src="' + scene.image + '" alt="' + escapeHtml(scene.title) + '场景插画"><div class="scene-hero-copy"><span>' + scene.id + ' · ' + escapeHtml(loc.name) + '</span><h2>' + escapeHtml(scene.title) + '</h2><p>' + escapeHtml(scene.time) + '</p></div></div><div class="scene-dialog-body"><div><section class="dialog-block"><span>PLAYER VISIBLE · 可直接朗读</span><h3>场景表层</h3><p>' + escapeHtml(scene.visible) + '</p></section><section class="dialog-block"><span>CLUE REVEAL · 点击逐条公开</span><h3>可得线索</h3><div class="scene-clues">' + scene.clues.map(function (clue, index) { return '<button class="scene-clue' + (revealed.indexOf(index) !== -1 ? ' revealed' : '') + '" type="button" data-scene-clue="' + index + '">' + escapeHtml(clue) + '</button>'; }).join('') + '</div></section></div><aside><section class="dialog-block"><span>KEEPER ONLY</span><h3>主持目标</h3><p>' + escapeHtml(scene.objective) + '</p></section><section class="dialog-block"><span>FAIL FORWARD</span><h3>默认余波</h3><p class="scene-risk">' + escapeHtml(scene.risk) + '</p></section><section class="dialog-block"><span>CAST</span><h3>在场人物</h3><div class="dialog-cast-buttons">' + npcButtons + '</div></section><section class="dialog-block"><span>PLAYER SAFE</span><h3>关联手卡</h3><div class="dialog-cast-buttons">' + (handoutButtons || '<span>本场无独立手卡</span>') + '</div></section><div class="scene-dialog-actions"><button class="primary-action" type="button" data-start-scene="' + id + '">' + (active ? '场景正在运行' : '开始场景') + '</button><button type="button" data-complete-scene="' + id + '">' + (done ? '已结算 · 保留记录' : '结算场景并更新轨道') + '</button></div></aside></div></div>';
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
    dialog.querySelector('[data-complete-scene]').addEventListener('click', function () {
      if (state.completedScenes.indexOf(id) !== -1) { showToast('该场景已经结算，未重复叠加轨道'); return; }
      completeScene(scene);
      dialog.close();
    });
    if (!dialog.open) dialog.showModal();
  }

  function completeScene(scene) {
    commit('结算场景 ' + scene.id + '：' + scene.title, function (draft) {
      draft.completedScenes.push(scene.id);
      if (draft.visitedLocations.indexOf(scene.location) === -1) draft.visitedLocations.push(scene.location);
      if (draft.activeSceneId === scene.id) draft.activeSceneId = null;
      draft.activeNpcs = [];
      Object.keys(scene.effects || {}).forEach(function (key) {
        var max = ['theory','memory','observation'].indexOf(key) !== -1 ? 3 : 6;
        draft.trackers[key] = Math.max(0, Math.min(max, (draft.trackers[key] || 0) + scene.effects[key]));
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
    commit('向玩家发放 ' + item.id + '：' + item.title, function (draft) { if (draft.revealedHandouts.indexOf(item.id) === -1) draft.revealedHandouts.push(item.id); });
    sendPlayerMessage({ type:'show', handout:lastPlayerPayload });
  }

  function retractHandout(item) {
    if (state.revealedHandouts.indexOf(item.id) === -1) { showToast(item.id + ' 尚未投放'); return; }
    commit('从玩家投屏撤回 ' + item.id + '：' + item.title, function (draft) {
      var at = draft.revealedHandouts.indexOf(item.id);
      if (at !== -1) draft.revealedHandouts.splice(at, 1);
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
    var payload = { exportedAt:new Date().toISOString(), campaign:data.id, state:state };
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
        var imported = payload.state || payload;
        if (!imported || !imported.dayId || !imported.trackers) throw new Error('invalid');
        undoStack.push(clone(state));
        state = Object.assign(freshState(), imported);
        addLog('导入战役备份');
        saveState(); renderAll(); showToast('战役备份已导入');
      } catch (error) { showToast('无法读取这份备份，请确认文件来自本控制台'); }
    };
    reader.readAsText(file);
  }

  function fullReset() {
    commit('执行完整重置，进入第 ' + (state.loop + 2) + ' 轮', function (draft) {
      draft.loop += 1;
      draft.dayId = 'D1';
      draft.activeSceneId = null;
      draft.activeNpcs = [];
      draft.completedScenes = [];
      draft.sceneClues = {};
      draft.visitedLocations = [];
      draft.trackers.anomaly = 2;
      draft.trackers.grail = 0;
      draft.trackers.anchor = Math.min(2, draft.trackers.anchor);
      draft.seals = draft.seals.map(function (seal) { return seal === 'blank' ? 'blank' : 'used'; });
    });
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
    document.getElementById('clue-notes').addEventListener('input', function (event) { state.clueNotes = event.target.value; saveState(); });
    document.getElementById('session-notes').addEventListener('input', function (event) { state.sessionNotes = event.target.value; saveState(); });

    document.getElementById('undo-button').addEventListener('click', function () {
      if (!undoStack.length) { showToast('没有可以撤销的操作'); return; }
      state = undoStack.pop(); addLog('撤销上一步'); saveState(); renderAll(); showToast('已撤销上一步');
    });
    document.getElementById('curtain-button').addEventListener('click', function () {
      lastPlayerPayload = null;
      sendPlayerMessage({ type:'curtain' });
      showToast('玩家投屏已切回帷幕');
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
    document.getElementById('reset-button').addEventListener('click', function () {
      if (!window.confirm('新建空白战役会清除当前自动保存。建议先导出备份。是否继续？')) return;
      undoStack.push(clone(state)); state = freshState(); addLog('新建空白战役'); saveState(); renderAll(); openView('current');
    });
    document.getElementById('clear-log').addEventListener('click', function () { commit('清空场记历史', function (draft) { draft.log = []; }); });
    document.querySelectorAll('[data-loop]').forEach(function (button) { button.addEventListener('click', function () { var delta = Number(button.getAttribute('data-loop')); commit('循环次数' + (delta > 0 ? '＋1' : '−1'), function (draft) { draft.loop = Math.max(0, Math.min(3, draft.loop + delta)); }); }); });

    document.getElementById('tracker-collapse').addEventListener('click', function () {
      var rail = document.querySelector('.tracker-rail'); rail.classList.toggle('collapsed'); this.setAttribute('aria-expanded', String(!rail.classList.contains('collapsed')));
    });
    document.getElementById('reset-guide-button').addEventListener('click', function () { document.getElementById('reset-guide-dialog').showModal(); });
    document.getElementById('confirm-full-reset').addEventListener('click', fullReset);

    document.querySelectorAll('.archive-dialog').forEach(function (dialog) {
      dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') document.getElementById('session-menu').hidden = true;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { event.preventDefault(); document.getElementById('undo-button').click(); }
    });
  }

  if (window.matchMedia('(max-width: 1040px)').matches) document.querySelector('.tracker-rail').classList.add('collapsed');
  bindStaticEvents();
  renderAll();
  openView('current');
}());
