(function () {
  'use strict';

  var modeMeta = document.querySelector('meta[name="ng-deployment-mode"]');
  var originMeta = document.querySelector('meta[name="ng-primary-origin"]');
  var mode = String((modeMeta && modeMeta.content) || 'server').trim().toLowerCase();
  var primaryOrigin = String((originMeta && originMeta.content) || '').trim().replace(/\/+$/, '');
  var capabilityPages = new Set([
    'campaign.html', 'profile.html', 'studio.html', 'run.html',
    'gm.html', 'player.html', 'coc7.html', 'combat.html'
  ]);

  if (mode !== 'readonly' && mode !== 'redirect') {
    window.NG_DEPLOYMENT_MODE = 'server';
    return;
  }

  window.NG_DEPLOYMENT_MODE = mode;
  window.NG_READ_ONLY_MIRROR = mode === 'readonly';

  function leafName(pathname) {
    var clean = String(pathname || '').replace(/\/+$/, '');
    var filename = clean.slice(clean.lastIndexOf('/') + 1) || 'index.html';
    return /\.html$/i.test(filename) ? filename : 'index.html';
  }

  function primaryUrl(source) {
    if (!primaryOrigin) return '';
    try {
      var url = source instanceof URL ? source : new URL(String(source || window.location.href), window.location.href);
      var filename = leafName(url.pathname);
      var target = new URL(filename === 'index.html' ? './' : filename, primaryOrigin + '/');
      target.search = url.search;
      target.hash = url.hash;
      return target.href;
    } catch (error) {
      return primaryOrigin + '/';
    }
  }

  var currentPage = leafName(window.location.pathname);
  if (mode === 'redirect' && primaryOrigin) {
    window.location.replace(primaryUrl(window.location.href));
    return;
  }
  if (mode === 'readonly' && capabilityPages.has(currentPage)) {
    if (primaryOrigin) {
      window.location.replace(primaryUrl(window.location.href));
    } else {
      window.location.replace('index.html?mirror=readonly');
    }
    return;
  }

  function banner() {
    var element = document.createElement('aside');
    element.className = 'ng-mirror-banner';
    element.setAttribute('role', 'status');
    element.innerHTML = '<strong>只读镜像</strong><span>这里用于浏览公开内容，账号与在线开团请使用主站。</span>';
    if (primaryOrigin) {
      var link = document.createElement('a');
      link.href = primaryUrl(window.location.href);
      link.textContent = '前往主站';
      element.appendChild(link);
    }
    document.body.insertBefore(element, document.body.firstChild);
  }

  function routeCapabilityLink(event) {
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link) return;
    var target;
    try { target = new URL(link.href, window.location.href); } catch (error) { return; }
    if (target.origin !== window.location.origin || !capabilityPages.has(leafName(target.pathname))) return;
    event.preventDefault();
    if (primaryOrigin) window.location.assign(primaryUrl(target));
    else window.location.assign('index.html?mirror=readonly');
  }

  if (mode === 'readonly') {
    document.addEventListener('click', routeCapabilityLink, true);
    document.addEventListener('DOMContentLoaded', banner, { once: true });
  }
}());
