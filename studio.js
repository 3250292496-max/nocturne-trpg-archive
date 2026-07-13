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
  var categoryLabels = { module:'模组正文', map:'地图', rules:'规则', builder:'车卡器', handouts:'玩家材料', info:'作品信息', other:'其他' };
  var audienceLabels = { player:'玩家公开', keeper:'守秘人', creator:'创作团队' };

  function byId(id) { return document.getElementById(id); }
  function isStaticMode() { return auth && auth.getMode && auth.getMode() === 'static'; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function staticModules() {
    var merged = {};
    (window.NG_STATIC_MODULES || []).forEach(function (module) { if (module && module.id) merged[module.id] = clone(module); });
    try {
      var local = JSON.parse(window.localStorage.getItem(staticStudioKey) || '[]');
      if (Array.isArray(local)) local.forEach(function (module) { if (module && module.id) merged[module.id] = module; });
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
      if (path === '/api/creator/modules' && method === 'GET') return Promise.resolve({ modules:clone(list), temporary:true });
      if (path === '/api/creator/modules' && method === 'POST') {
        var now = new Date().toISOString();
        var created = Object.assign({
          id:staticModuleId(settings.body && settings.body.title, list), english:'COMMUNITY MODULE', typeLabel:'完整战役模组',
          description:'', players:'', duration:'', era:'', difficulty:'', tags:[], status:'draft', resources:[],
          ownerId:currentUser && currentUser.id, author:{ account:currentUser && currentUser.account, displayName:currentUser && currentUser.displayName },
          createdAt:now, updatedAt:now
        }, settings.body || {});
        list.push(created);
        saveStaticModules(list);
        return Promise.resolve({ module:clone(created), temporary:true });
      }
      if (detail) {
        var id = decodeURIComponent(detail[1]);
        var index = list.findIndex(function (module) { return module.id === id; });
        if (index < 0) throw new Error('没有找到这份浏览器草稿。');
        if (method === 'GET') return Promise.resolve({ module:clone(list[index]), temporary:true });
        if (method === 'PATCH') {
          list[index] = Object.assign({}, list[index], settings.body || {}, { id:list[index].id, updatedAt:new Date().toISOString() });
          saveStaticModules(list);
          return Promise.resolve({ module:clone(list[index]), temporary:true });
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
        return Promise.resolve({ module:clone(list[moduleIndex]), temporary:true });
      }
      throw new Error('这个操作需要网站后端，GitHub Pages 只能保存浏览器草稿。');
    } catch (error) { return Promise.reject(error); }
  }

  function request(path, options) {
    var settings = Object.assign({ credentials:'same-origin', cache:'no-store' }, options || {});
    if (isStaticMode()) return staticRequest(path, settings);
    if (settings.body && !(settings.body instanceof Blob) && typeof settings.body !== 'string') {
      settings.headers = Object.assign({}, settings.headers || {}, { 'Content-Type':'application/json' });
      settings.body = JSON.stringify(settings.body);
    }
    return window.fetch(path, settings).then(function (response) {
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
  function isInformationReady() {
    return Boolean(currentModule.title && currentModule.summary && currentModule.description && currentModule.systemLabel);
  }
  function completion() {
    var checks = [
      Boolean(currentModule.title), Boolean(currentModule.summary), Boolean(currentModule.description), Boolean(currentModule.systemLabel),
      resourcesOf('map').length > 0, resourcesOf('rules').length > 0, resourcesOf('builder').length > 0,
      resourcesOf('module').length > 0 || resourcesOf('handouts').length > 0
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
    var imported = ['map','rules','builder','module'].filter(function (category) { return resourcesOf(category).length; }).length;
    byId('nav-info').textContent = isInformationReady() ? '已就绪' : '待完善';
    byId('nav-imports').textContent = imported + ' / 4';
    byId('nav-resources').textContent = String((currentModule.resources || []).length);
    byId('nav-status').textContent = currentModule.status === 'published' ? '已发布' : '草稿';
    byId('overview-status').textContent = currentModule.status === 'published' ? '已发布' : '草稿';
    var next = [];
    if (!isInformationReady()) next.push('补齐一句话简介、详细介绍和规则系统，让读者能够判断模组是否适合自己。');
    if (!resourcesOf('module').length) next.push('导入模组正文或章节资料，建立作品的核心内容。');
    if (!resourcesOf('map').length) next.push('添加至少一份地图或场景视觉稿。');
    if (!resourcesOf('rules').length) next.push('上传玩家可阅读的规则资料，并确认可见范围。');
    if (!resourcesOf('builder').length) next.push('添加自动车卡器附件，或为后续站内 Builder 准备 JSON Schema。');
    if (!next.length) next.push('资料已经齐备，可以前往“版本与发布”检查玩家公开边界。');
    byId('next-steps-list').innerHTML = next.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('');
  }
  function text(id, value, fallback) { byId(id).textContent = value || fallback || '—'; }

  function fillForm() {
    var form = byId('module-form');
    ['title','english','typeLabel','systemLabel','summary','description','players','duration','era','difficulty'].forEach(function (name) {
      if (form.elements[name]) form.elements[name].value = currentModule[name] || '';
    });
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
      title:formValue('title'), english:formValue('english'), typeLabel:formValue('typeLabel'), systemLabel:formValue('systemLabel'),
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
    request('/api/creator/modules', { method:'POST', body:{ title:form.elements.title.value.trim(), systemLabel:form.elements.systemLabel.value.trim(), summary:form.elements.summary.value.trim() } }).then(function (payload) {
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
    window.fetch('/api/creator/modules/' + encodeURIComponent(currentModule.id) + '/resources?' + query.toString(), {
      method:'POST', credentials:'same-origin', headers:{ 'Content-Type':file.type || 'application/octet-stream' }, body:file
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
        ['title','english','typeLabel','systemLabel','summary','description','players','duration','era','difficulty'].forEach(function (name) {
          if (data[name] !== undefined && form.elements[name]) form.elements[name].value = String(data[name]);
        });
        if (Array.isArray(data.tags)) form.elements.tags.value = data.tags.join(', ');
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

  bindEvents();
  if (!auth) { showGate('账号组件未能加载', '请返回模组馆刷新页面后重试。'); return; }
  auth.ready().then(function (user) {
    currentUser = user;
    byId('static-studio-note').hidden = !isStaticMode();
    if (!user) { showGate('请先登录创作者账号', '登录后才能读取你拥有的模组与创作资料。'); return; }
    byId('studio-avatar').textContent = String(user.displayName || user.account || '航').charAt(0);
    if (user.authorStatus !== 'verified' && user.role !== 'owner') { showGate('需要通过作者认证', '你可以在个人中心提交作品与创作计划；认证通过后即可创建模组。'); return; }
    loadModules();
  });
}());
