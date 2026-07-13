(function () {
  'use strict';

  var auth = window.NG_AUTH;
  var currentUser = null;
  var currentModule = null;
  var modules = [];
  var resourceFilter = 'all';
  var pendingDeleteId = null;
  var toastTimer = null;
  var staticStudioKey = 'nocturne-studio:modules:v1';
  var rulesets = Array.isArray(window.NG_RULESETS) ? window.NG_RULESETS : [];
  var categoryLabels = { module:'模组正文', map:'地图', rules:'规则', builder:'车卡器', handouts:'玩家材料', info:'作品信息', other:'其他' };
  var audienceLabels = { player:'玩家公开', keeper:'守秘人', creator:'创作团队' };

  function byId(id) { return document.getElementById(id); }
  function isStaticMode() { return auth && auth.getMode && auth.getMode() === 'static'; }
  function apiUrl(path) { return auth && auth.apiUrl ? auth.apiUrl(path) : path; }
  function apiCredentials(path) { return auth && auth.apiCredentials ? auth.apiCredentials(path) : 'same-origin'; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function staticAccessKey() {
    var bytes = new Uint8Array(12);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(bytes, function (value) { return value.toString(16).padStart(2, '0'); })
      .join('').toUpperCase().match(/.{1,4}/g).join('-');
  }

  function staticModules() {
    var merged = {};
    (window.NG_STATIC_MODULES || []).forEach(function (module) {
      if (module && module.id && module.id !== 'coc7' && module.id !== 'coc7-7e') merged[module.id] = clone(module);
    });
    try {
      var local = JSON.parse(window.localStorage.getItem(staticStudioKey) || '[]');
      if (Array.isArray(local)) {
        var cleaned = local.filter(function (module) { return module && module.id !== 'coc7' && module.id !== 'coc7-7e'; });
        if (cleaned.length !== local.length) window.localStorage.setItem(staticStudioKey, JSON.stringify(cleaned));
        cleaned.forEach(function (module) { if (module.id) merged[module.id] = module; });
      }
    } catch (error) {}
    return Object.keys(merged).map(function (id) { return merged[id]; });
  }

  function saveStaticModules(nextModules) {
    try { window.localStorage.setItem(staticStudioKey, JSON.stringify(nextModules)); }
    catch (error) { throw new Error('浏览器草稿空间不足或已被禁用，无法保存这次修改。'); }
  }

  function staticModuleId(title, existing) {
    var base = String(title || 'module').normalize ? String(title || 'module').normalize('NFKD') : String(title || 'module');
    base = base.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'module';
    var id = base;
    var index = 2;
    while (existing.some(function (module) { return module.id === id; })) id = base + '-' + index++;
    return id;
  }

  function staticRequest(path, settings) {
    var method = String(settings.method || 'GET').toUpperCase();
    var list = staticModules();
    var detail = path.match(/^\/api\/creator\/modules\/([^/]+)$/);
    var resource = path.match(/^\/api\/creator\/modules\/([^/]+)\/resources\/([^/]+)$/);
    try {
      if (path === '/api/creator/modules' && method === 'GET') return Promise.resolve({ modules:clone(list), deviceLocal:true, persistent:true });
      if (path === '/api/creator/modules' && method === 'POST') {
        var now = new Date().toISOString();
        var created = Object.assign({
          id:staticModuleId(settings.body && settings.body.title, list), english:'COMMUNITY MODULE', typeLabel:'完整战役模组',
          description:'', players:'', duration:'', era:'', difficulty:'', tags:[], status:'draft', resources:[],
          accessKey:staticAccessKey(), runbook:{ opening:'', scenes:[], npcs:[], clues:[], trackers:[] },
          ownerId:currentUser && currentUser.id,
          author:{ displayName:currentUser && currentUser.displayName || '夜航创作者', name:currentUser && currentUser.displayName || '夜航创作者', avatar:currentUser && currentUser.avatar || '', label:'认证作者' },
          createdAt:now, updatedAt:now
        }, settings.body || {});
        list.push(created);
        saveStaticModules(list);
        return Promise.resolve({ module:clone(created), deviceLocal:true, persistent:true });
      }
      if (detail) {
        var id = decodeURIComponent(detail[1]);
        var index = list.findIndex(function (module) { return module.id === id; });
        if (index < 0) throw new Error('没有找到这份浏览器草稿。');
        if (method === 'GET') return Promise.resolve({ module:clone(list[index]), deviceLocal:true, persistent:true });
        if (method === 'PATCH') {
          list[index] = Object.assign({}, list[index], settings.body || {}, { id:list[index].id, updatedAt:new Date().toISOString() });
          saveStaticModules(list);
          return Promise.resolve({ module:clone(list[index]), deviceLocal:true, persistent:true });
        }
      }
      if (resource && method === 'DELETE') {
        var moduleId = decodeURIComponent(resource[1]);
        var resourceId = decodeURIComponent(resource[2]);
        var moduleIndex = list.findIndex(function (module) { return module.id === moduleId; });
        if (moduleIndex < 0) throw new Error('没有找到这份浏览器草稿。');
        list[moduleIndex].resources = (list[moduleIndex].resources || []).filter(function (item) { return item.id !== resourceId; });
        list[moduleIndex].updatedAt = new Date().toISOString();
        saveStaticModules(list);
        return Promise.resolve({ module:clone(list[moduleIndex]), deviceLocal:true, persistent:true });
      }
      throw new Error('这个操作需要网站后端，GitHub Pages 只能保存浏览器草稿。');
    } catch (error) { return Promise.reject(error); }
  }

  function request(path, options) {
    var settings = Object.assign({ credentials:apiCredentials(path), cache:'no-store' }, options || {});
    if (isStaticMode()) return staticRequest(path, settings);
    if (settings.body && !(settings.body instanceof Blob) && typeof settings.body !== 'string') {
      settings.headers = Object.assign({}, settings.headers || {}, { 'Content-Type':'application/json' });
      settings.body = JSON.stringify(settings.body);
    }
    return window.fetch(apiUrl(path), settings).then(function (response) {
      return response.text().then(function (raw) {
        var payload = {};
        try { payload = raw ? JSON.parse(raw) : {}; } catch (error) {}
        if (!response.ok) {
          var requestError = new Error(payload.message || '操作没有成功，请稍后重试。');
          requestError.status = response.status;
          throw requestError;
        }
        return payload;
      });
    });
  }
  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character];
    });
  }
  function showToast(message) {
    var element = byId('studio-toast');
    window.clearTimeout(toastTimer);
    element.textContent = message;
    element.classList.add('visible');
    toastTimer = window.setTimeout(function () { element.classList.remove('visible'); }, 2600);
  }
  function message(element, value, error) {
    element.textContent = value || '';
    element.classList.toggle('error', Boolean(error));
    element.hidden = !value;
  }
  function setSaveState(state, label) {
    var element = byId('save-state');
    element.classList.remove('saving', 'error');
    if (state) element.classList.add(state);
    element.lastChild.nodeValue = ' ' + label;
  }
  function formatBytes(value) {
    var size = Number(value || 0);
    if (!size) return '外部资料';
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return Math.round(size / 1024) + ' KB';
    return (size / 1024 / 1024).toFixed(1) + ' MB';
  }
  function extension(resource) {
    var match = String(resource.fileName || resource.title || '').match(/\.([^.]+)$/);
    return match ? match[1].slice(0, 5).toUpperCase() : 'FILE';
  }
  function resourcesOf(category) {
    return (currentModule.resources || []).filter(function (resource) { return resource.category === category; });
  }
  function formValue(name) { return byId('module-form').elements[name].value.trim(); }
  function rulesetById(id) {
    return rulesets.find(function (ruleset) { return ruleset.id === id; }) || null;
  }
  function rulesetLabel(id, fallback) {
    var ruleset = rulesetById(id);
    return ruleset ? ruleset.systemLabel : String(fallback || '').trim();
  }
  function populateRulesetSelects() {
    var options = '<option value="">请选择规则系统</option>' + rulesets.map(function (ruleset) {
      return '<option value="' + escapeHtml(ruleset.id) + '">' + escapeHtml(ruleset.title) + '</option>';
    }).join('') + '<option value="custom">其他 / 自定义规则</option>';
    Array.prototype.forEach.call(document.querySelectorAll('select[name="rulesetId"]'), function (select) {
      select.innerHTML = options;
    });
  }
  function isInformationReady() {
    return Boolean(currentModule.title && currentModule.summary && currentModule.description && currentModule.systemLabel);
  }
  function emptyRunbook() {
    return { opening:'', scenes:[], npcs:[], clues:[], trackers:[] };
  }
  function normalizedRunbook(value) {
    var source = value && typeof value === 'object' ? value : {};
    var result = emptyRunbook();
    result.opening = String(source.opening || '');
    ['scenes','npcs','clues','trackers'].forEach(function (kind) {
      result[kind] = Array.isArray(source[kind]) ? source[kind].map(function (item) {
        return item && typeof item === 'object' ? Object.assign({}, item) : {};
      }) : [];
    });
    return result;
  }
  function runbookCount() {
    var runbook = normalizedRunbook(currentModule && currentModule.runbook);
    return ['scenes','npcs','clues','trackers'].reduce(function (total, kind) { return total + runbook[kind].length; }, 0);
  }
  function completion() {
    var checks = [
      Boolean(currentModule.title), Boolean(currentModule.summary), Boolean(currentModule.description), Boolean(currentModule.systemLabel),
      resourcesOf('map').length > 0, resourcesOf('rules').length > 0, resourcesOf('builder').length > 0,
      resourcesOf('module').length > 0 || resourcesOf('handouts').length > 0,
      Boolean(normalizedRunbook(currentModule.runbook).opening || runbookCount())
    ];
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
  }
  function setCheck(id, ready, readyText, emptyText) {
    var element = byId(id);
    element.textContent = ready ? readyText : emptyText;
    element.classList.toggle('ready', ready);
  }

  function renderOverview() {
    var percent = completion();
    text('overview-module-title', currentModule.title, '未命名模组');
    text('overview-english', currentModule.english, 'COMMUNITY MODULE');
    text('overview-summary', currentModule.summary, '尚未填写一句话简介。');
    byId('overview-tags').innerHTML = (currentModule.tags || []).map(function (tag) { return '<span>' + escapeHtml(tag) + '</span>'; }).join('');
    byId('completion-percent').textContent = percent + '%';
    byId('progress-ring').style.setProperty('--progress', percent);
    byId('nav-progress').textContent = percent + '%';
    setCheck('check-information', isInformationReady(), '已就绪', '待完善');
    setCheck('check-map', resourcesOf('map').length, resourcesOf('map').length + ' 份', '未导入');
    setCheck('check-rules', resourcesOf('rules').length, resourcesOf('rules').length + ' 份', '未导入');
    setCheck('check-builder', resourcesOf('builder').length, resourcesOf('builder').length + ' 份', '未导入');
    var configuredRunbook = Boolean(normalizedRunbook(currentModule.runbook).opening || runbookCount());
    setCheck('check-runbook', configuredRunbook, runbookCount() + ' 个条目', '未配置');
    var imported = ['map','rules','builder','module'].filter(function (category) { return resourcesOf(category).length; }).length;
    byId('nav-info').textContent = isInformationReady() ? '已就绪' : '待完善';
    byId('nav-imports').textContent = imported + ' / 4';
    byId('nav-resources').textContent = String((currentModule.resources || []).length);
    byId('nav-runbook').textContent = configuredRunbook ? runbookCount() + ' 个条目' : '未配置';
    byId('nav-status').textContent = currentModule.status === 'published' ? '已发布' : '草稿';
    byId('overview-status').textContent = currentModule.status === 'published' ? '已发布' : '草稿';
    var next = [];
    if (!isInformationReady()) next.push('补齐一句话简介、详细介绍和规则系统，让读者能够判断模组是否适合自己。');
    if (!resourcesOf('module').length) next.push('导入模组正文或章节资料，建立作品的核心内容。');
    if (!resourcesOf('map').length) next.push('添加至少一份地图或场景视觉稿。');
    if (!resourcesOf('rules').length) next.push('上传玩家可阅读的规则资料，并确认可见范围。');
    if (!resourcesOf('builder').length) next.push('添加自动车卡器附件，或为后续站内 Builder 准备 JSON Schema。');
    if (!configuredRunbook) next.push('配置场景、人物、线索或轨道，让这份模组拥有独立的开团控制台。');
    if (!next.length) next.push('资料已经齐备，可以前往“版本与发布”检查玩家公开边界。');
    byId('next-steps-list').innerHTML = next.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('');
  }
  function text(id, value, fallback) { byId(id).textContent = value || fallback || '—'; }

  function fillForm() {
    var form = byId('module-form');
    ['title','english','typeLabel','systemLabel','summary','description','players','duration','era','difficulty'].forEach(function (name) {
      if (form.elements[name]) form.elements[name].value = currentModule[name] || '';
    });
    if (form.elements.rulesetId) {
      var selected = currentModule.rulesetId === 'null-grail-core-d20-v2' ? 'null-grail-core-d20-v2.0' : currentModule.rulesetId || '';
      if (!selected && currentModule.systemLabel) selected = rulesets.some(function (ruleset) { return ruleset.systemLabel === currentModule.systemLabel; })
        ? rulesets.find(function (ruleset) { return ruleset.systemLabel === currentModule.systemLabel; }).id
        : 'custom';
      form.elements.rulesetId.value = selected;
    }
    form.elements.tags.value = (currentModule.tags || []).join(', ');
    updateCounts();
    byId('publish-form').elements.status.value = currentModule.status || 'draft';
  }
  function updateCounts() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-count-for]'), function (counter) {
      var input = byId('module-form').elements[counter.getAttribute('data-count-for')];
      counter.textContent = String(input.value.length);
    });
  }

  function newRunbookId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }
  function runbookRow(kind, item, index) {
    var id = item.id || newRunbookId(kind.slice(0, 2));
    var start = '<article class="runbook-row ' + kind + '" data-runbook-kind="' + kind + '" data-runbook-index="' + index + '" data-runbook-id="' + escapeHtml(id) + '">';
    var remove = '<button class="runbook-remove" type="button" data-runbook-remove aria-label="移除此条">×</button>';
    if (kind === 'scenes') return start +
      '<input data-runbook-field="title" maxlength="120" value="' + escapeHtml(item.title) + '" placeholder="场景标题">' +
      '<input data-runbook-field="goal" maxlength="240" value="' + escapeHtml(item.goal) + '" placeholder="本场景目标 / 推进条件">' + remove +
      '<textarea data-runbook-field="summary" maxlength="2000" rows="3" placeholder="场景内容、进入方式、可能结果……">' + escapeHtml(item.summary) + '</textarea></article>';
    if (kind === 'npcs') return start +
      '<input data-runbook-field="name" maxlength="120" value="' + escapeHtml(item.name) + '" placeholder="人物姓名">' +
      '<input data-runbook-field="role" maxlength="180" value="' + escapeHtml(item.role) + '" placeholder="身份 / 阵营 / 功能">' + remove +
      '<textarea data-runbook-field="note" maxlength="1600" rows="3" placeholder="扮演提示、动机、秘密或数据……">' + escapeHtml(item.note) + '</textarea></article>';
    if (kind === 'clues') return start +
      '<input data-runbook-field="title" maxlength="120" value="' + escapeHtml(item.title) + '" placeholder="线索标题">' + remove +
      '<textarea data-runbook-field="text" maxlength="2400" rows="3" placeholder="仅主持人可见，开团时可一键揭示或复制给玩家。">' + escapeHtml(item.text) + '</textarea></article>';
    return start +
      '<input data-runbook-field="name" maxlength="120" value="' + escapeHtml(item.name) + '" placeholder="轨道名称，例如：仪式进度">' +
      '<input data-runbook-field="maximum" type="number" min="1" max="20" value="' + escapeHtml(item.maximum || 6) + '" aria-label="轨道最大值">' + remove + '</article>';
  }
  function renderRunbookEditor() {
    if (!currentModule || !byId('runbook-form')) return;
    currentModule.runbook = normalizedRunbook(currentModule.runbook);
    byId('runbook-form').elements.opening.value = currentModule.runbook.opening;
    ['scenes','npcs','clues','trackers'].forEach(function (kind) {
      var list = byId('runbook-' + kind);
      var items = currentModule.runbook[kind];
      list.innerHTML = items.length
        ? items.map(function (item, index) { return runbookRow(kind, item, index); }).join('')
        : '<p class="runbook-empty">尚未添加；可从右上角新建。</p>';
    });
    byId('console-preview-link').href = currentModule.id === 'null-grail' ? 'gm.html' : 'run.html?id=' + encodeURIComponent(currentModule.id);
  }
  function collectRunbook() {
    var form = byId('runbook-form');
    var result = emptyRunbook();
    result.opening = form.elements.opening.value.trim();
    ['scenes','npcs','clues','trackers'].forEach(function (kind) {
      result[kind] = Array.prototype.map.call(byId('runbook-' + kind).querySelectorAll('[data-runbook-kind]'), function (row) {
        var item = { id:row.getAttribute('data-runbook-id') || newRunbookId(kind.slice(0, 2)) };
        Array.prototype.forEach.call(row.querySelectorAll('[data-runbook-field]'), function (field) {
          var name = field.getAttribute('data-runbook-field');
          item[name] = name === 'maximum' ? Math.max(1, Math.min(20, Number(field.value) || 1)) : field.value.trim();
        });
        return item;
      }).filter(function (item) { return kind === 'scenes' || kind === 'clues' ? item.title : item.name; });
    });
    return result;
  }
  function addRunbookItem(kind) {
    currentModule.runbook = collectRunbook();
    var templates = {
      scenes:{ id:newRunbookId('sc'), title:'', summary:'', goal:'' },
      npcs:{ id:newRunbookId('np'), name:'', role:'', note:'' },
      clues:{ id:newRunbookId('cl'), title:'', text:'' },
      trackers:{ id:newRunbookId('tr'), name:'', maximum:6 }
    };
    if (!templates[kind]) return;
    currentModule.runbook[kind].push(templates[kind]);
    renderRunbookEditor();
    var rows = byId('runbook-' + kind).querySelectorAll('[data-runbook-kind]');
    var last = rows[rows.length - 1];
    if (last) last.querySelector('input,textarea').focus();
  }
  function saveRunbook(event) {
    event.preventDefault();
    var button = event.currentTarget.querySelector('[type="submit"]');
    var runbook = collectRunbook();
    button.disabled = true;
    setSaveState('saving', '正在保存开团控制台…');
    message(byId('runbook-message'), '', false);
    request('/api/creator/modules/' + encodeURIComponent(currentModule.id), { method:'PATCH', body:{ runbook:runbook } }).then(function (payload) {
      currentModule = payload.module || payload;
      renderModule();
      setSaveState('', '所有更改已保存');
      message(byId('runbook-message'), '开团控制台已保存；本作品密钥现在可打开对应主持界面。', false);
    }).catch(function (error) {
      setSaveState('error', '开团控制台保存失败');
      message(byId('runbook-message'), error.message, true);
    }).finally(function () { button.disabled = false; });
  }

  function resourceMarkup(resource) {
    return '<article class="studio-resource-row" data-resource-id="' + escapeHtml(resource.id) + '" data-audience="' + escapeHtml(resource.audience || 'creator') + '">' +
      '<span class="resource-kind">' + escapeHtml(extension(resource)) + '</span>' +
      '<div><strong>' + escapeHtml(resource.title || resource.fileName || '未命名资源') + '</strong><small>' + escapeHtml(categoryLabels[resource.category] || '其他') + ' · ' + escapeHtml(formatBytes(resource.size)) + ' · ' + escapeHtml(resource.fileName || '') + '</small></div>' +
      '<span class="audience-badge ' + escapeHtml(resource.audience || 'creator') + '">' + escapeHtml(audienceLabels[resource.audience] || '创作团队') + '</span>' +
      '<button class="resource-delete" type="button" aria-label="移除 ' + escapeHtml(resource.title || resource.fileName) + '" data-delete-resource="' + escapeHtml(resource.id) + '">×</button></article>';
  }
  function renderResources() {
    var all = currentModule.resources || [];
    var filtered = resourceFilter === 'all' ? all : all.filter(function (resource) { return resource.audience === resourceFilter; });
    byId('studio-resource-list').innerHTML = filtered.map(resourceMarkup).join('');
    byId('studio-resource-list').hidden = filtered.length === 0;
    byId('studio-resource-empty').hidden = filtered.length !== 0;
  }
  function renderPublishChecks() {
    var checks = [
      { ready:Boolean(currentModule.title && currentModule.summary), title:'公共标题与简介', copy:'模组馆能够说明这是一段怎样的故事' },
      { ready:Boolean(currentModule.description), title:'详细介绍', copy:'独立模组页有足够的无剧透说明' },
      { ready:resourcesOf('module').length > 0, title:'模组正文', copy:'已经归档至少一份正文或章节资料' },
      { ready:resourcesOf('rules').length > 0, title:'规则资料', copy:'玩家或主持人能够取得所需规则' },
      { ready:(currentModule.resources || []).some(function (item) { return item.audience === 'player'; }), title:'玩家公开资料', copy:'至少一份资源可在模组详情页访问' }
    ];
    byId('publish-checks').innerHTML = checks.map(function (check) {
      return '<div class="publish-check-row' + (check.ready ? ' ready' : '') + '"><span>' + (check.ready ? '✓' : '·') + '</span><div><strong>' + escapeHtml(check.title) + '</strong><small>' + escapeHtml(check.copy) + '</small></div><b>' + (check.ready ? '已就绪' : '待完善') + '</b></div>';
    }).join('');
  }

  function renderModule() {
    document.title = (currentModule.title || '创作者工作台') + ' · 创作者工作台';
    text('breadcrumb-title', currentModule.title, '未命名模组');
    byId('preview-link').href = 'module.html?id=' + encodeURIComponent(currentModule.id);
    byId('preview-link').hidden = currentModule.status !== 'published';
    fillForm();
    renderRunbookEditor();
    renderOverview();
    renderResources();
    renderPublishChecks();
  }

  function renderModuleSwitcher() {
    byId('module-switch').innerHTML = modules.map(function (module) {
      return '<option value="' + escapeHtml(module.id) + '"' + (currentModule && currentModule.id === module.id ? ' selected' : '') + '>' + escapeHtml(module.title || '未命名模组') + (module.status === 'draft' ? ' · 草稿' : '') + '</option>';
    }).join('');
  }

  function showGate(titleValue, copy) {
    byId('studio-loading').hidden = true;
    byId('studio-shell').hidden = true;
    byId('create-module').hidden = true;
    byId('studio-gate').hidden = false;
    text('gate-title', titleValue);
    text('gate-copy', copy);
  }

  function loadModules() {
    return request('/api/creator/modules').then(function (payload) {
      modules = payload.modules || [];
      var params = new URL(window.location.href).searchParams;
      if (params.get('new') === '1') {
        byId('studio-loading').hidden = true;
        byId('create-module').hidden = false;
        return;
      }
      var id = params.get('id') || (modules[0] && modules[0].id);
      if (!id) {
        byId('studio-loading').hidden = true;
        byId('create-module').hidden = false;
        return;
      }
      return request('/api/creator/modules/' + encodeURIComponent(id)).then(function (modulePayload) {
        currentModule = modulePayload.module || modulePayload;
        if (!modules.some(function (item) { return item.id === currentModule.id; })) modules.unshift(currentModule);
        renderModuleSwitcher();
        renderModule();
        byId('studio-loading').hidden = true;
        byId('studio-shell').hidden = false;
      });
    }).catch(function (error) { showGate('无法打开创作者工作台', error.message); });
  }

  function switchSection(name) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-section]'), function (button) { button.classList.toggle('active', button.getAttribute('data-section') === name); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-section-panel]'), function (panel) { panel.classList.toggle('active', panel.getAttribute('data-section-panel') === name); });
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  function saveMetadata(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector('[type="submit"]');
    var payload = {
      title:formValue('title'), english:formValue('english'), typeLabel:formValue('typeLabel'),
      rulesetId:formValue('rulesetId'), systemLabel:rulesetLabel(formValue('rulesetId'), formValue('systemLabel')),
      summary:formValue('summary'), description:formValue('description'), players:formValue('players'), duration:formValue('duration'),
      era:formValue('era'), difficulty:formValue('difficulty'),
      tags:formValue('tags').split(/[,，]/).map(function (tag) { return tag.trim(); }).filter(Boolean).slice(0, 12)
    };
    button.disabled = true;
    setSaveState('saving', '正在保存…');
    message(byId('module-form-message'), '', false);
    request('/api/creator/modules/' + encodeURIComponent(currentModule.id), { method:'PATCH', body:payload }).then(function (response) {
      currentModule = response.module || response;
      renderModule();
      renderModuleSwitcher();
      setSaveState('', '所有更改已保存');
      message(byId('module-form-message'), '基本信息已经保存。', false);
    }).catch(function (error) {
      setSaveState('error', '保存失败');
      message(byId('module-form-message'), error.message, true);
    }).finally(function () { button.disabled = false; });
  }

  function createModule(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector('[type="submit"]');
    button.disabled = true;
    message(byId('create-message'), '', false);
    var selectedRuleset = form.elements.rulesetId.value.trim();
    request('/api/creator/modules', { method:'POST', body:{
      title:form.elements.title.value.trim(), rulesetId:selectedRuleset,
      systemLabel:rulesetLabel(selectedRuleset, form.elements.systemLabel.value), summary:form.elements.summary.value.trim()
    } }).then(function (payload) {
      var module = payload.module || payload;
      window.location.replace('studio.html?id=' + encodeURIComponent(module.id));
    }).catch(function (error) {
      message(byId('create-message'), error.message, true);
      button.disabled = false;
    });
  }

  function uploadResource(form) {
    var card = form.closest('[data-import-category]');
    var category = card.getAttribute('data-import-category');
    var file = form.elements.file.files[0];
    var state = form.querySelector('.upload-state');
    var button = form.querySelector('[type="submit"]');
    if (!file) return;
    if (isStaticMode()) {
      state.classList.add('error');
      state.textContent = 'GitHub Pages 无法把附件发布给其他访客；请通过仓库或后端同步此文件。';
      setSaveState('error', '附件尚未发布');
      return;
    }
    var query = new URLSearchParams({ category:category, audience:form.elements.audience.value, title:file.name, filename:file.name });
    button.disabled = true;
    state.classList.remove('error');
    state.textContent = '正在上传 ' + file.name + '…';
    setSaveState('saving', '正在归档资源…');
    var uploadPath = '/api/creator/modules/' + encodeURIComponent(currentModule.id) + '/resources?' + query.toString();
    window.fetch(apiUrl(uploadPath), {
      method:'POST', credentials:apiCredentials(uploadPath), headers:{ 'Content-Type':file.type || 'application/octet-stream' }, body:file
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok) throw new Error(payload.message || '文件上传失败。');
        return payload;
      });
    }).then(function (payload) {
      currentModule = payload.module || currentModule;
      state.textContent = '已归档：' + file.name;
      form.reset();
      renderModule();
      setSaveState('', '所有更改已保存');
      showToast('资源已加入《' + currentModule.title + '》');
    }).catch(function (error) {
      state.classList.add('error');
      state.textContent = error.message;
      setSaveState('error', '资源导入失败');
    }).finally(function () { button.disabled = false; });
  }

  function importInfo(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (data.module && typeof data.module === 'object') data = data.module;
        var form = byId('module-form');
        ['title','english','typeLabel','rulesetId','systemLabel','summary','description','players','duration','era','difficulty'].forEach(function (name) {
          if (data[name] !== undefined && form.elements[name]) form.elements[name].value = String(data[name]);
        });
        if (Array.isArray(data.tags)) form.elements.tags.value = data.tags.join(', ');
        if (data.runbook && typeof data.runbook === 'object') {
          currentModule.runbook = normalizedRunbook(data.runbook);
          renderRunbookEditor();
        }
        updateCounts();
        switchSection('information');
        showToast('信息已填入表单，请检查后保存');
      } catch (error) { showToast('无法读取 JSON：请检查文件结构'); }
    };
    reader.readAsText(file, 'utf-8');
  }

  function savePublish(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector('[type="submit"]');
    button.disabled = true;
    setSaveState('saving', '正在保存发布设置…');
    request('/api/creator/modules/' + encodeURIComponent(currentModule.id), { method:'PATCH', body:{ status:form.elements.status.value } }).then(function (payload) {
      currentModule = payload.module || payload;
      renderModule();
      setSaveState('', '所有更改已保存');
      message(byId('publish-message'), isStaticMode()
        ? (currentModule.status === 'published' ? '已在当前浏览器的模组馆预览中公开；其他访客不会看到这份草稿。' : '这份浏览器草稿已设为不公开。')
        : (currentModule.status === 'published' ? '模组已经发布到公共模组馆。' : '模组已转为草稿。'), false);
    }).catch(function (error) {
      setSaveState('error', '发布设置保存失败');
      message(byId('publish-message'), error.message, true);
    }).finally(function () { button.disabled = false; });
  }

  function requestDelete(resourceId) {
    var resource = (currentModule.resources || []).find(function (item) { return item.id === resourceId; });
    if (!resource) return;
    pendingDeleteId = resourceId;
    byId('delete-copy').textContent = '“' + (resource.title || resource.fileName) + '”会从作品资料库中永久移除。';
    byId('delete-dialog').showModal();
  }
  function confirmDelete(event) {
    event.preventDefault();
    if (!pendingDeleteId) return;
    var id = pendingDeleteId;
    pendingDeleteId = null;
    byId('delete-dialog').close();
    request('/api/creator/modules/' + encodeURIComponent(currentModule.id) + '/resources/' + encodeURIComponent(id), { method:'DELETE' }).then(function (payload) {
      currentModule = payload.module || currentModule;
      renderModule();
      showToast('资源已经移除');
    }).catch(function (error) { showToast(error.message); });
  }

  function bindEvents() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-section]'), function (button) { button.addEventListener('click', function () { switchSection(button.getAttribute('data-section')); }); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-go-section]'), function (button) { button.addEventListener('click', function () { switchSection(button.getAttribute('data-go-section')); }); });
    byId('create-form').addEventListener('submit', createModule);
    byId('module-form').addEventListener('submit', saveMetadata);
    byId('module-form').addEventListener('input', updateCounts);
    Array.prototype.forEach.call(document.querySelectorAll('select[name="rulesetId"]'), function (select) {
      select.addEventListener('change', function () {
        var form = select.form;
        var ruleset = rulesetById(select.value);
        if (ruleset && form && form.elements.systemLabel) form.elements.systemLabel.value = ruleset.systemLabel;
      });
    });
    byId('runbook-form').addEventListener('submit', saveRunbook);
    Array.prototype.forEach.call(document.querySelectorAll('[data-runbook-add]'), function (button) {
      button.addEventListener('click', function () { addRunbookItem(button.getAttribute('data-runbook-add')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.runbook-list'), function (list) {
      list.addEventListener('click', function (event) {
        var button = event.target.closest('[data-runbook-remove]');
        if (!button) return;
        var row = button.closest('[data-runbook-kind]');
        if (row) row.remove();
      });
    });
    byId('publish-form').addEventListener('submit', savePublish);
    byId('module-switch').addEventListener('change', function () { window.location.href = 'studio.html?id=' + encodeURIComponent(this.value); });
    byId('info-json-input').addEventListener('change', function () { if (this.files[0]) importInfo(this.files[0]); this.value = ''; });
    Array.prototype.forEach.call(document.querySelectorAll('.upload-form'), function (form) {
      form.addEventListener('submit', function (event) { event.preventDefault(); uploadResource(form); });
      form.elements.file.addEventListener('change', function () { var label = form.querySelector('label span'); if (this.files[0]) label.textContent = this.files[0].name; });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-resource-filter]'), function (button) {
      button.addEventListener('click', function () {
        resourceFilter = button.getAttribute('data-resource-filter');
        Array.prototype.forEach.call(document.querySelectorAll('[data-resource-filter]'), function (item) { item.classList.toggle('active', item === button); });
        renderResources();
      });
    });
    byId('studio-resource-list').addEventListener('click', function (event) { var button = event.target.closest('[data-delete-resource]'); if (button) requestDelete(button.getAttribute('data-delete-resource')); });
    byId('confirm-delete').addEventListener('click', confirmDelete);
  }

  populateRulesetSelects();
  bindEvents();
  if (!auth) { showGate('账号组件未能加载', '请返回模组馆刷新页面后重试。'); return; }
  auth.ready().then(function (user) {
    currentUser = user;
    byId('static-studio-note').hidden = !isStaticMode();
    if (!user) { showGate('请先登录创作者账号', '登录后才能读取你拥有的模组与创作资料。'); return; }
    if (auth.renderAvatar) auth.renderAvatar(byId('studio-avatar'), user, { label: '进入{name}的个人中心' });
    else byId('studio-avatar').textContent = Array.from(user.displayName || '夜航用户')[0] || '航';
    if (user.authorStatus !== 'verified' && user.role !== 'owner') { showGate('需要通过作者认证', '你可以在个人中心提交作品与创作计划；认证通过后即可创建模组。'); return; }
    loadModules();
  });
}());
