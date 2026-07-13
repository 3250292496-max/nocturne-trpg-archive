(function () {
  'use strict';

  var categoryLabels = {
    module: '模组正文', map: '地图与场景', rules: '规则资料', builder: '自动车卡器',
    handouts: '玩家材料', info: '作品信息', other: '其他附件'
  };
  var categoryOrder = ['module', 'map', 'rules', 'builder', 'handouts', 'info', 'other'];
  var moduleId = new URL(window.location.href).searchParams.get('id') || 'null-grail';
  var auth = window.NG_AUTH;
  var loadedModule = null;
  var staticStudioKey = 'nocturne-studio:modules:v1';

  function byId(id) { return document.getElementById(id); }
  function text(id, value, fallback) { byId(id).textContent = value || fallback || '—'; }
  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }
  function resourceUrl(resource) {
    return resource.url || resource.href || ('/api/modules/' + encodeURIComponent(moduleId) + '/resources/' + encodeURIComponent(resource.id));
  }
  function formatBytes(value) {
    var size = Number(value || 0);
    if (!size) return '外部资料';
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return Math.round(size / 1024) + ' KB';
    return (size / 1024 / 1024).toFixed(1) + ' MB';
  }
  function extension(resource) {
    var name = resource.fileName || resource.title || '';
    var match = name.match(/\.([^.]+)$/);
    return match ? match[1].slice(0, 5).toUpperCase() : 'FILE';
  }
  function isImage(resource) { return /^image\/(png|jpeg|webp)$/i.test(resource.mime || ''); }
  function normalizeResource(resource) {
    return Object.assign({ category: 'other', audience: 'player' }, resource || {});
  }

  function staticModules() {
    var merged = {};
    (window.NG_STATIC_MODULES || []).forEach(function (module) { merged[module.id] = module; });
    try {
      var local = JSON.parse(window.localStorage.getItem(staticStudioKey) || '[]');
      if (Array.isArray(local)) local.forEach(function (module) { if (module && module.id) merged[module.id] = module; });
    } catch (error) {}
    return Object.keys(merged).map(function (id) { return merged[id]; });
  }

  function renderMap(resource) {
    var url = resourceUrl(resource);
    if (isImage(resource)) {
      return '<a class="map-card" href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer"><img src="' + escapeHtml(url) + '" alt="' + escapeHtml(resource.title || resource.fileName) + '"><div><strong>' + escapeHtml(resource.title || resource.fileName) + '</strong><small>打开原图 ↗</small></div></a>';
    }
    return '<a class="map-card map-file" href="' + escapeHtml(url) + '"><span class="resource-format">' + escapeHtml(extension(resource)) + '</span><strong>' + escapeHtml(resource.title || resource.fileName) + '</strong><small>下载地图资料 ↓</small></a>';
  }

  function renderResource(resource) {
    var title = resource.title || resource.fileName || '未命名资料';
    return '<a class="resource-card" href="' + escapeHtml(resourceUrl(resource)) + '">' +
      '<span class="resource-format">' + escapeHtml(extension(resource)) + '</span>' +
      '<span><strong>' + escapeHtml(title) + '</strong><small>' + escapeHtml(formatBytes(resource.size)) + ' · ' + escapeHtml(categoryLabels[resource.category] || '其他附件') + '</small></span>' +
      '<span aria-hidden="true">↓</span></a>';
  }

  function renderResources(resources) {
    var visible = resources.map(normalizeResource).filter(function (resource) { return resource.audience === 'player'; });
    var groups = {};
    visible.forEach(function (resource) {
      if (!groups[resource.category]) groups[resource.category] = [];
      groups[resource.category].push(resource);
    });
    byId('resource-sections').innerHTML = categoryOrder.filter(function (category) { return groups[category] && groups[category].length; }).map(function (category) {
      return '<section class="resource-group"><h3>' + escapeHtml((categoryLabels[category] || category).toUpperCase()) + ' · ' + groups[category].length + '</h3><div class="resource-grid">' + groups[category].map(renderResource).join('') + '</div></section>';
    }).join('');
    byId('resource-empty').hidden = visible.length !== 0;
    byId('resource-sections').hidden = visible.length === 0;

    var maps = groups.map || [];
    byId('maps').hidden = maps.length === 0;
    byId('maps-count').textContent = maps.length + ' 份地图资料';
    byId('map-gallery').innerHTML = maps.map(renderMap).join('');

    byId('resource-index').innerHTML = '<div class="module-index-list">' + categoryOrder.map(function (category) {
      return '<div class="module-index-row"><span>' + escapeHtml(categoryLabels[category]) + '</span><strong>' + ((groups[category] || []).length) + '</strong></div>';
    }).join('') + '</div>';
  }

  function canEdit(module, user) {
    return Boolean(user && (user.id === module.ownerId || user.role === 'owner'));
  }

  function updateOwnerUi(user) {
    if (!loadedModule || !canEdit(loadedModule, user)) return;
    var url = 'studio.html?id=' + encodeURIComponent(loadedModule.id);
    byId('workspace-action').href = url;
    byId('workspace-action').hidden = false;
    byId('creator-nav').href = url;
    byId('creator-nav').hidden = false;
  }

  function render(module) {
    loadedModule = module;
    document.title = (module.title || '模组档案') + ' · 夜航模组馆';
    text('module-number', 'ARCHIVE · ' + String(module.number || module.id || '').toUpperCase());
    text('module-type', module.typeLabel, '完整战役模组');
    text('module-status', module.status === 'draft' ? '草稿' : '已发布');
    text('module-english', module.english, 'COMMUNITY MODULE');
    text('module-title', module.title, '未命名模组');
    text('module-summary', module.summary, '创作者还没有填写一句话简介。');
    var authorName = module.author && (module.author.displayName || module.author.name) || module.authorName || '夜航创作者';
    text('module-author', authorName);
    if (auth && auth.renderAvatar) auth.renderAvatar(byId('author-avatar'), { displayName: authorName, avatar: module.author && module.author.avatar || '' });
    else text('author-avatar', Array.from(authorName)[0] || '航');
    text('module-system', module.systemLabel);
    text('module-players', module.players);
    text('module-duration', module.duration);
    text('module-era', module.era);
    text('module-difficulty', module.difficulty);
    byId('module-description').textContent = module.description || '创作者还没有补充详细介绍。';
    byId('module-tags').innerHTML = (module.tags || []).map(function (tag) { return '<span>' + escapeHtml(tag) + '</span>'; }).join('');
    renderResources(module.resources || []);
    if (module.id === 'null-grail') {
      byId('keeper-action').hidden = false;
      byId('player-action').hidden = false;
    } else {
      byId('keeper-action').href = 'run.html?id=' + encodeURIComponent(module.id);
      byId('keeper-action').querySelector('span').textContent = '打开本模组开团控制台';
      byId('keeper-action').querySelector('small').textContent = '场景、人物、线索、轨道与团务记录 →';
      byId('keeper-action').hidden = false;
    }
    byId('module-loading').hidden = true;
    byId('module-content').hidden = false;
    if (auth) auth.ready().then(updateOwnerUi);
  }

  function fail(error) {
    byId('module-loading').hidden = true;
    byId('module-error').hidden = false;
    byId('module-error-message').textContent = error && error.message ? error.message : '模组可能尚未公开，或链接已经失效。';
  }

  window.fetch('/api/modules/' + encodeURIComponent(moduleId), { credentials: 'same-origin', cache: 'no-store' })
    .then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok) throw new Error(payload.message || '无法读取这份模组档案。');
        return payload.module || payload;
      });
    }).then(render).catch(function (error) {
      var fallback = staticModules().find(function (module) { return module.id === moduleId; });
      if (fallback) render(fallback);
      else fail(error);
    });
}());
