(function () {
  'use strict';

  var params = new URL(window.location.href).searchParams;
  var moduleId = String(params.get('id') || '').trim().toLowerCase();
  if (!moduleId) {
    window.location.replace('index.html#console');
    return;
  }
  if (moduleId === 'coc7' || moduleId === 'coc7-7e') {
    window.location.replace('coc7.html?tab=rules');
    return;
  }
  var localModuleKey = 'nocturne-studio:modules:v1';
  var sessionPrefix = 'nocturne-run:';
  var currentModule = null;
  var availableModules = [];
  var sessionState = null;
  var staticMode = false;
  var toastTimer = null;
  var notesTimer = null;
  var auth = window.NG_AUTH;

  function byId(id) { return document.getElementById(id); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character];
    });
  }
  function safeHref(value) {
    var text = String(value || '').trim();
    if (!text) return '#';
    if (auth && auth.apiUrl && /^\/api\//.test(text)) text = auth.apiUrl(text);
    try {
      var parsed = new URL(text, window.location.href);
      if (!/^https?:$/.test(parsed.protocol) && parsed.origin !== window.location.origin) return '#';
      return parsed.href;
    } catch (error) { return '#'; }
  }
  function normalizeRunbook(value) {
    var source = value && typeof value === 'object' ? value : {};
    return {
      opening:String(source.opening || ''),
      scenes:Array.isArray(source.scenes) ? source.scenes : [],
      npcs:Array.isArray(source.npcs) ? source.npcs : [],
      clues:Array.isArray(source.clues) ? source.clues : [],
      trackers:Array.isArray(source.trackers) ? source.trackers : []
    };
  }
  function api(path, options) {
    var target = auth && auth.apiUrl ? auth.apiUrl(path) : path;
    var credentials = auth && auth.apiCredentials ? auth.apiCredentials(path) : 'same-origin';
    var settings = Object.assign({ credentials:credentials, cache:'no-store' }, options || {});
    if (settings.body && typeof settings.body !== 'string') {
      settings.headers = Object.assign({}, settings.headers || {}, { 'Content-Type':'application/json' });
      settings.body = JSON.stringify(settings.body);
    }
    if (window.NG_RESILIENCE && window.NG_RESILIENCE.request) {
      settings.retry = String(settings.method || 'GET').toUpperCase() === 'GET';
      return window.NG_RESILIENCE.request(target, settings);
    }
    return window.fetch(target, settings).then(function (response) {
      return response.text().then(function (raw) {
        var payload = {};
        try { payload = raw ? JSON.parse(raw) : {}; }
        catch (error) { throw new Error('网站后端没有返回可读取的数据。'); }
        if (!response.ok) {
          var requestError = new Error(payload.message || (response.status === 401 ? '开团密钥不正确。' : '暂时无法完成这个操作。'));
          requestError.status = response.status;
          requestError.code = payload.code || '';
          throw requestError;
        }
        return payload;
      });
    });
  }
  function staticModules() {
    var merged = {};
    (window.NG_STATIC_MODULES || []).forEach(function (module) {
      if (module && module.id && module.id !== 'coc7' && module.id !== 'coc7-7e') merged[module.id] = clone(module);
    });
    try {
      var local = JSON.parse(window.localStorage.getItem(localModuleKey) || '[]');
      if (Array.isArray(local)) {
        var cleaned = local.filter(function (module) { return module && module.id !== 'coc7' && module.id !== 'coc7-7e'; });
        if (cleaned.length !== local.length) window.localStorage.setItem(localModuleKey, JSON.stringify(cleaned));
        cleaned.forEach(function (module) { if (module.id) merged[module.id] = module; });
      }
    } catch (error) {}
    return Object.keys(merged).map(function (id) { return merged[id]; });
  }
  function showToast(value) {
    var toast = byId('run-toast');
    window.clearTimeout(toastTimer);
    toast.textContent = value;
    toast.classList.add('visible');
    toastTimer = window.setTimeout(function () { toast.classList.remove('visible'); }, 2500);
  }
  function gateMessage(value, isError) {
    var element = byId('gate-message');
    element.textContent = value || '';
    element.classList.toggle('error', Boolean(isError));
    element.hidden = !value;
  }
  function showGate(module, copy) {
    byId('run-loading').hidden = true;
    byId('run-shell').hidden = true;
    byId('run-gate').hidden = false;
    byId('gate-title').textContent = module && module.title ? '进入《' + module.title + '》' : '打开模组开团台';
    byId('gate-copy').textContent = copy || '请输入这份模组自己的开团密钥。密钥由作者在个人中心查看并交给本团主持人。';
    byId('gate-module-link').href = module && module.id ? 'module.html?id=' + encodeURIComponent(module.id) : 'index.html#modules';
    window.setTimeout(function () { byId('access-key').focus(); }, 0);
  }
  function fatal(value) {
    showGate(currentModule, value);
    byId('access-form').hidden = true;
  }
  function stateKey() { return sessionPrefix + currentModule.id + ':v1'; }
  function newState() {
    return { round:1, notes:'', scenes:{}, cast:{}, clues:{}, trackers:{}, log:[] };
  }
  function loadState() {
    var result = newState();
    try {
      var stored = JSON.parse(window.localStorage.getItem(stateKey()) || '{}');
      if (stored && typeof stored === 'object') result = Object.assign(result, stored);
    } catch (error) {}
    ['scenes','cast','clues','trackers'].forEach(function (name) {
      if (!result[name] || typeof result[name] !== 'object' || Array.isArray(result[name])) result[name] = {};
    });
    if (!Array.isArray(result.log)) result.log = [];
    result.round = Math.max(1, Number(result.round) || 1);
    result.notes = String(result.notes || '');
    return result;
  }
  function saveState() {
    var key = stateKey();
    var saved = window.NG_RESILIENCE && window.NG_RESILIENCE.storage
      ? window.NG_RESILIENCE.storage.set(key, sessionState, {
        scope:'local-run:' + currentModule.id,
        label:'本机开团记录',
        filename:(currentModule.id || 'module') + '-开团恢复-' + new Date().toISOString().slice(0,10) + '.json'
      })
      : (function () { try { window.localStorage.setItem(key, JSON.stringify(sessionState)); return true; } catch (error) { return false; } }());
    if (!saved) showToast('浏览器存储空间不足，本次更改未保存；请立即导出恢复文件。');
    return saved;
  }
  function itemId(item, index, prefix) { return String(item && item.id || prefix + '-' + index); }
  function logAction(label, detail) {
    sessionState.log.unshift({ at:new Date().toISOString(), label:String(label || ''), detail:String(detail || '') });
    sessionState.log = sessionState.log.slice(0, 30);
    saveState();
    renderLog();
  }
  function timeLabel(value) {
    try { return new Date(value).toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }); }
    catch (error) { return ''; }
  }
  function renderLog() {
    var list = byId('session-log');
    list.innerHTML = sessionState.log.length ? sessionState.log.slice(0, 12).map(function (entry) {
      return '<li><span>' + escapeHtml(timeLabel(entry.at) + ' · ' + entry.label) + '</span><strong>' + escapeHtml(entry.detail) + '</strong></li>';
    }).join('') : '<li><span>尚无操作记录</span><strong>—</strong></li>';
  }
  function renderTrackers() {
    var trackers = currentModule.runbook.trackers;
    var list = byId('tracker-list');
    if (!trackers.length) {
      list.innerHTML = '<p class="empty-state">作者尚未配置战役轨道。</p>';
      return;
    }
    list.innerHTML = trackers.map(function (tracker, index) {
      var id = itemId(tracker, index, 'tracker');
      var maximum = Math.max(1, Math.min(20, Number(tracker.maximum) || 6));
      var value = Math.max(0, Math.min(maximum, Number(sessionState.trackers[id]) || 0));
      var bars = '';
      for (var step = 1; step <= maximum; step += 1) bars += '<i class="' + (step <= value ? 'on' : '') + '"></i>';
      return '<div class="tracker-row" data-tracker-id="' + escapeHtml(id) + '" data-tracker-max="' + maximum + '"><div><strong>' + escapeHtml(tracker.name || '未命名轨道') + '</strong><div class="tracker-bar">' + bars + '</div></div><div class="tracker-control"><button type="button" data-tracker-delta="-1" aria-label="减少">−</button><b>' + value + '/' + maximum + '</b><button type="button" data-tracker-delta="1" aria-label="增加">＋</button></div></div>';
    }).join('');
  }
  function renderScenes() {
    var scenes = currentModule.runbook.scenes;
    byId('scene-count').textContent = String(scenes.length);
    byId('scene-list').innerHTML = scenes.length ? scenes.map(function (scene, index) {
      var id = itemId(scene, index, 'scene');
      var status = Math.max(0, Math.min(2, Number(sessionState.scenes[id]) || 0));
      var labels = ['未开始','进行中','已完成'];
      var classes = ['','running','done'];
      return '<article class="flow-card"><header><span class="card-index">' + String(index + 1).padStart(2, '0') + '</span><div><h2>' + escapeHtml(scene.title || '未命名场景') + '</h2><p class="subline">' + escapeHtml(scene.goal || '未填写推进目标') + '</p></div><button class="state-button ' + classes[status] + '" type="button" data-scene-id="' + escapeHtml(id) + '">' + labels[status] + '</button></header><p class="body-copy">' + escapeHtml(scene.summary || '作者尚未填写场景内容。') + '</p></article>';
    }).join('') : '<p class="empty-state">作者尚未配置场景节点。可在创作者面板中添加。</p>';
  }
  function renderCast() {
    var cast = currentModule.runbook.npcs;
    byId('cast-count').textContent = String(cast.length);
    byId('cast-list').innerHTML = cast.length ? cast.map(function (person, index) {
      var id = itemId(person, index, 'npc');
      var present = Boolean(sessionState.cast[id]);
      return '<article class="flow-card"><header><div><p class="role">' + escapeHtml(person.role || '身份未注明') + '</p><h2>' + escapeHtml(person.name || '未命名人物') + '</h2></div><button class="presence-button ' + (present ? 'on' : '') + '" type="button" data-cast-id="' + escapeHtml(id) + '">' + (present ? '本场在场' : '暂未在场') + '</button></header><p class="body-copy">' + escapeHtml(person.note || '作者尚未填写人物提示。') + '</p></article>';
    }).join('') : '<p class="empty-state">作者尚未配置人物与 NPC。</p>';
  }
  function renderClues() {
    var clues = currentModule.runbook.clues;
    byId('clue-count').textContent = String(clues.length);
    byId('clue-list').innerHTML = clues.length ? clues.map(function (clue, index) {
      var id = itemId(clue, index, 'clue');
      var revealed = Boolean(sessionState.clues[id]);
      return '<article class="flow-card clue-card ' + (revealed ? '' : 'locked') + '"><header><div><p class="role">CLUE ' + String(index + 1).padStart(2, '0') + '</p><h2>' + escapeHtml(clue.title || '未命名线索') + '</h2></div><div class="clue-actions"><button class="reveal-button ' + (revealed ? 'on' : '') + '" type="button" data-clue-id="' + escapeHtml(id) + '">' + (revealed ? '已揭示' : '揭示线索') + '</button>' + (revealed ? '<button class="copy-button" type="button" data-copy-clue="' + escapeHtml(id) + '">复制</button>' : '') + '</div></header><p class="body-copy">' + (revealed ? escapeHtml(clue.text || '这条线索没有正文。') : '内容已折叠，仅主持人操作后显示。') + '</p></article>';
    }).join('') : '<p class="empty-state">作者尚未配置线索。</p>';
  }
  function resourceType(resource) {
    var match = String(resource.fileName || resource.title || '').match(/\.([^.]+)$/);
    return match ? match[1].slice(0, 5).toUpperCase() : 'FILE';
  }
  function renderResources() {
    var resources = Array.isArray(currentModule.resources) ? currentModule.resources : [];
    byId('resource-count').textContent = String(resources.length);
    byId('resource-list').innerHTML = resources.length ? resources.map(function (resource) {
      var audience = resource.audience === 'keeper' ? '主持人资料' : '玩家公开资料';
      return '<article class="resource-row"><span class="resource-icon">' + escapeHtml(resourceType(resource)) + '</span><div><strong>' + escapeHtml(resource.title || resource.fileName || '未命名资料') + '</strong><small>' + escapeHtml(audience + (resource.fileName ? ' · ' + resource.fileName : '')) + '</small></div><a href="' + escapeHtml(safeHref(resource.href || resource.webHref)) + '" target="_blank" rel="noreferrer">打开资料 ↗</a></article>';
    }).join('') : '<p class="empty-state">这份模组暂时没有可供主持人读取的资料。</p>';
  }
  function renderHeader() {
    document.title = currentModule.title + ' · 开团控制台';
    ['top-title','module-title','sidebar-module'].forEach(function (id) { byId(id).textContent = currentModule.title || '未命名模组'; });
    byId('top-system').textContent = currentModule.systemLabel || (currentModule.systems || []).join(' / ') || 'TABLETOP MODULE';
    byId('module-summary').textContent = currentModule.summary || '这份模组尚未填写一句话简介。';
    var author = currentModule.author || {};
    byId('module-author').textContent = author.displayName || author.name || '未知作者';
    var avatar = byId('author-avatar');
    var avatarSource = String(author.avatar || '');
    if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(avatarSource)) avatar.innerHTML = '<img src="' + escapeHtml(avatarSource) + '" alt="">';
    else avatar.textContent = Array.from(author.displayName || author.name || '作')[0] || '作';
    byId('module-detail-link').href = 'module.html?id=' + encodeURIComponent(currentModule.id);
    var opening = byId('run-opening');
    opening.textContent = currentModule.runbook.opening || '作者尚未填写主持总览。你仍可使用本地团务记录、骰子和已配置的其他内容。';
    opening.classList.toggle('empty', !currentModule.runbook.opening);
  }
  function renderSwitcher() {
    var list = availableModules.slice();
    if (currentModule && !list.some(function (module) { return module.id === currentModule.id; })) list.unshift(currentModule);
    byId('module-switch').innerHTML = list.map(function (module) {
      return '<option value="' + escapeHtml(module.id) + '"' + (module.id === currentModule.id ? ' selected' : '') + '>' + escapeHtml(module.title || module.id) + (module.id === 'null-grail' ? ' · 专属台' : '') + '</option>';
    }).join('');
  }
  function renderAll() {
    renderHeader();
    renderSwitcher();
    byId('session-notes').value = sessionState.notes;
    byId('round-value').textContent = String(sessionState.round);
    renderTrackers();
    renderScenes();
    renderCast();
    renderClues();
    renderResources();
    renderLog();
  }
  function openConsole(module) {
    currentModule = Object.assign({}, module);
    currentModule.resources = (Array.isArray(module.resources) ? module.resources : []).filter(function (resource) { return resource.audience !== 'creator'; });
    currentModule.runbook = normalizeRunbook(currentModule.runbook);
    sessionState = loadState();
    renderAll();
    byId('run-loading').hidden = true;
    byId('run-gate').hidden = true;
    byId('run-shell').hidden = false;
  }
  function loadServerConsole() {
    return api('/api/modules/' + encodeURIComponent(moduleId) + '/console').then(function (payload) {
      openConsole(payload.module || payload);
    });
  }
  function bootStatic() {
    staticMode = true;
    availableModules = staticModules();
    if (!moduleId) {
      window.location.replace('index.html#console');
      return;
    }
    if (moduleId === 'coc7' || moduleId === 'coc7-7e') { window.location.replace('coc7.html?tab=rules'); return; }
    if (moduleId === 'null-grail') { window.location.replace('gm.html'); return; }
    currentModule = availableModules.find(function (module) { return module.id === moduleId; }) || null;
    if (!currentModule) return fatal('找不到这份浏览器本地模组；它可能只保存在作者的另一台设备上。');
    showGate(currentModule, '静态站点上的创作草稿保存在本设备。请输入作者为这份作品生成的独立密钥。');
  }
  function bootServer(payload) {
    availableModules = payload.modules || [];
    if (!moduleId) {
      window.location.replace('index.html#console');
      return;
    }
    if (moduleId === 'coc7' || moduleId === 'coc7-7e') { window.location.replace('coc7.html?tab=rules'); return; }
    if (moduleId === 'null-grail') { window.location.replace('gm.html'); return; }
    currentModule = availableModules.find(function (module) { return module.id === moduleId; }) || { id:moduleId, title:'这份模组' };
    api('/api/modules/' + encodeURIComponent(moduleId) + '/access').then(function (status) {
      if (status.authorized) return loadServerConsole();
      showGate(currentModule);
    }).catch(function (error) {
      if (error.status === 404) fatal('找不到这份模组；它可能尚未发布、已经下架，或链接输入有误。');
      else showGate(currentModule);
    });
  }
  function boot() {
    api('/api/modules').then(bootServer).catch(bootStatic);
  }

  byId('access-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var button = event.currentTarget.querySelector('button');
    var key = event.currentTarget.elements.key.value.trim();
    button.disabled = true;
    gateMessage('正在验证这份作品的开团密钥……', false);
    if (staticMode) {
      window.setTimeout(function () {
        var expected = String(currentModule.accessKey || '').trim().toUpperCase();
        if (expected && key.toUpperCase() === expected) {
          gateMessage('', false);
          openConsole(currentModule);
        } else gateMessage('密钥不正确；请向这份模组的作者确认，其他作品的密钥不能通用。', true);
        button.disabled = false;
      }, 180);
      return;
    }
    api('/api/modules/' + encodeURIComponent(moduleId) + '/access', { method:'POST', body:{ key:key } }).then(function () {
      gateMessage('', false);
      return loadServerConsole();
    }).catch(function (error) {
      gateMessage(error.status === 401 ? '密钥不正确；请确认你使用的是这份模组自己的密钥。' : error.message, true);
    }).finally(function () { button.disabled = false; });
  });
  byId('module-switch').addEventListener('change', function () {
    if (this.value === 'null-grail') window.location.href = 'gm.html';
    else window.location.href = 'run.html?id=' + encodeURIComponent(this.value);
  });
  byId('lock-console').addEventListener('click', function () {
    if (staticMode) { showGate(currentModule); return; }
    api('/api/modules/' + encodeURIComponent(moduleId) + '/access', { method:'DELETE' }).finally(function () { window.location.reload(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-run-tab]'), function (button) {
    button.addEventListener('click', function () {
      var name = button.getAttribute('data-run-tab');
      Array.prototype.forEach.call(document.querySelectorAll('[data-run-tab]'), function (item) { item.classList.toggle('active', item === button); });
      Array.prototype.forEach.call(document.querySelectorAll('[data-run-panel]'), function (panel) { panel.classList.toggle('active', panel.getAttribute('data-run-panel') === name); });
      window.scrollTo({ top:0, behavior:'smooth' });
    });
  });
  byId('tracker-list').addEventListener('click', function (event) {
    var button = event.target.closest('[data-tracker-delta]');
    if (!button) return;
    var row = button.closest('[data-tracker-id]');
    var id = row.getAttribute('data-tracker-id');
    var maximum = Number(row.getAttribute('data-tracker-max')) || 1;
    var next = Math.max(0, Math.min(maximum, (Number(sessionState.trackers[id]) || 0) + Number(button.getAttribute('data-tracker-delta'))));
    sessionState.trackers[id] = next;
    saveState();
    renderTrackers();
  });
  byId('scene-list').addEventListener('click', function (event) {
    var button = event.target.closest('[data-scene-id]');
    if (!button) return;
    var id = button.getAttribute('data-scene-id');
    sessionState.scenes[id] = ((Number(sessionState.scenes[id]) || 0) + 1) % 3;
    saveState();
    renderScenes();
  });
  byId('cast-list').addEventListener('click', function (event) {
    var button = event.target.closest('[data-cast-id]');
    if (!button) return;
    var id = button.getAttribute('data-cast-id');
    sessionState.cast[id] = !sessionState.cast[id];
    saveState();
    renderCast();
  });
  byId('clue-list').addEventListener('click', function (event) {
    var reveal = event.target.closest('[data-clue-id]');
    if (reveal) {
      var revealId = reveal.getAttribute('data-clue-id');
      sessionState.clues[revealId] = !sessionState.clues[revealId];
      saveState();
      renderClues();
      return;
    }
    var copy = event.target.closest('[data-copy-clue]');
    if (!copy) return;
    var id = copy.getAttribute('data-copy-clue');
    var clue = currentModule.runbook.clues.find(function (item, index) { return itemId(item, index, 'clue') === id; });
    if (!clue) return;
    var copyText = (clue.title ? clue.title + '\n' : '') + String(clue.text || '');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(copyText).then(function () { showToast('线索文字已复制。'); });
    else showToast('当前浏览器不允许自动复制，请手动选择线索文字。');
  });
  byId('session-notes').addEventListener('input', function () {
    sessionState.notes = this.value;
    byId('notes-state').textContent = '保存中…';
    window.clearTimeout(notesTimer);
    notesTimer = window.setTimeout(function () { saveState(); byId('notes-state').textContent = '已保存'; }, 240);
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-round]'), function (button) {
    button.addEventListener('click', function () {
      sessionState.round = Math.max(1, sessionState.round + Number(button.getAttribute('data-round')));
      saveState();
      byId('round-value').textContent = String(sessionState.round);
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-die]'), function (button) {
    button.addEventListener('click', function () {
      var sides = Number(button.getAttribute('data-die')) || 20;
      var result = Math.floor(Math.random() * sides) + 1;
      logAction('掷 d' + sides, String(result));
      showToast('d' + sides + ' → ' + result);
    });
  });
  byId('export-session').addEventListener('click', function () {
    var payload = { module:{ id:currentModule.id, title:currentModule.title }, exportedAt:new Date().toISOString(), session:sessionState };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json;charset=utf-8' });
    var href = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = href;
    link.download = currentModule.id + '-session-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
    showToast('本次团务记录已导出。');
  });
  byId('reset-session').addEventListener('click', function () {
    if (!window.confirm('只清空当前浏览器中《' + currentModule.title + '》的团务进度；作者原稿不会改变。继续吗？')) return;
    sessionState = newState();
    saveState();
    renderAll();
    showToast('本地团务进度已清空。');
  });

  boot();
}());
