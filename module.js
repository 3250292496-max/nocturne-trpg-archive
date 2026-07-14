(function () {
  'use strict';

  var categoryLabels = {
    module: '模组正文', map: '地图与场景', rules: '规则资料', builder: '自动车卡器',
    handouts: '玩家材料', info: '作品信息', other: '其他附件'
  };
  var categoryOrder = ['module', 'map', 'rules', 'builder', 'handouts', 'info', 'other'];
  var moduleId = new URL(window.location.href).searchParams.get('id') || 'null-grail';
  if (moduleId === 'coc7' || moduleId === 'coc7-7e') {
    window.location.replace('coc7.html?tab=rules');
    return;
  }
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
    var href = resource.url || resource.href || ('/api/modules/' + encodeURIComponent(moduleId) + '/resources/' + encodeURIComponent(resource.id));
    return auth && auth.apiUrl && /^\/api\//.test(href) ? auth.apiUrl(href) : href;
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
    (window.NG_STATIC_MODULES || []).forEach(function (module) {
      if (module && module.id && module.id !== 'coc7' && module.id !== 'coc7-7e') merged[module.id] = module;
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

  function renderMap(resource) {
    var url = resourceUrl(resource);
    if (isImage(resource)) {
      var knownEastlakeMap = /(?:^|\/)eastlake-map\.webp(?:$|[?#])/i.test(url);
      var suppliedWidth = Number(resource.width);
      var suppliedHeight = Number(resource.height);
      var width = Number.isFinite(suppliedWidth) && suppliedWidth > 0 ? Math.min(10000, Math.round(suppliedWidth)) : (knownEastlakeMap ? 1586 : 0);
      var height = Number.isFinite(suppliedHeight) && suppliedHeight > 0 ? Math.min(10000, Math.round(suppliedHeight)) : (knownEastlakeMap ? 992 : 0);
      var dimensions = width && height ? ' width="' + width + '" height="' + height + '"' : '';
      return '<a class="map-card" href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer"><img src="' + escapeHtml(url) + '"' + dimensions + ' alt="' + escapeHtml(resource.title || resource.fileName) + '" loading="lazy" decoding="async"><div><strong>' + escapeHtml(resource.title || resource.fileName) + '</strong><small>打开原图 ↗</small></div></a>';
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
    var summary = module.summary || '浏览模组介绍、地图、规则与配套资源。';
    var visualIdentity = module.visualIdentity && typeof module.visualIdentity === 'object' ? module.visualIdentity : {};
    var cover = visualIdentity.coverImage || module.coverImage || module.cover || '';
    var visual = visualIdentity.bannerImage || module.bannerImage || module.banner || cover || (module.id === 'null-grail' ? 'assets/art/hero-null-grail.webp' : '');
    var shareVisual = visualIdentity.ogImage || module.ogImage || visual || cover;
    var focusData = visualIdentity.focus && typeof visualIdentity.focus === 'object' ? visualIdentity.focus : {};
    var focus = Number.isFinite(Number(focusData.x)) && Number.isFinite(Number(focusData.y))
      ? Math.max(0, Math.min(100, Number(focusData.x))) + '% ' + Math.max(0, Math.min(100, Number(focusData.y))) + '%'
      : visualIdentity.coverFocus || module.coverFocus || module.bannerFocus || '50% 50%';
    var accentValue = String(visualIdentity.themeColor || module.themeColor || module.accent || '');
    var accent = /^#[0-9a-f]{6}$/i.test(accentValue) ? accentValue : '#d1ad6c';
    document.body.style.setProperty('--module-accent', accent);
    byId('module-theme-color').setAttribute('content', accent);
    byId('module-og-title').setAttribute('content', (module.title || '模组档案') + ' · 夜航模组馆');
    byId('module-og-description').setAttribute('content', summary);
    byId('module-og-image-alt').setAttribute('content', (module.title || '模组') + '封面');
    if (visual) {
      var heroImage = byId('module-hero-image');
      heroImage.src = visual;
      heroImage.style.objectPosition = focus;
      var coverWidth = Number(module.coverWidth);
      var coverHeight = Number(module.coverHeight);
      if (Number.isFinite(coverWidth) && coverWidth > 0 && Number.isFinite(coverHeight) && coverHeight > 0) {
        heroImage.width = Math.min(10000, Math.round(coverWidth));
        heroImage.height = Math.min(10000, Math.round(coverHeight));
      } else if (module.id === 'null-grail') {
        heroImage.width = 1915;
        heroImage.height = 821;
      }
      byId('module-hero-visual').hidden = false;
      byId('module-og-image').setAttribute('content', shareVisual);
      byId('module-og-image-width').setAttribute('content', String(Number(visualIdentity.ogWidth || module.ogWidth) || (visualIdentity.ogImage || module.ogImage ? 1200 : heroImage.width || 1915)));
      byId('module-og-image-height').setAttribute('content', String(Number(visualIdentity.ogHeight || module.ogHeight) || (visualIdentity.ogImage || module.ogImage ? 630 : heroImage.height || 821)));
      document.querySelector('.module-hero').classList.add('has-visual');
    }
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
      byId('campaign-action').href = 'campaign.html?module=' + encodeURIComponent(module.id);
      byId('campaign-action').hidden = false;
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

  var modulePath = '/api/modules/' + encodeURIComponent(moduleId);
  var moduleUrl = auth && auth.apiUrl ? auth.apiUrl(modulePath) : modulePath;
  var moduleCredentials = auth && auth.apiCredentials ? auth.apiCredentials(modulePath) : 'same-origin';
  window.NG_RESILIENCE.request(moduleUrl, { credentials: moduleCredentials, cache: 'no-store', timeoutMs:8000 })
    .then(function (payload) { return payload.module || payload; })
    .then(render).catch(function (error) {
      var fallback = staticModules().find(function (module) { return module.id === moduleId; });
      if (fallback) render(fallback);
      else fail(error);
    });
}());
