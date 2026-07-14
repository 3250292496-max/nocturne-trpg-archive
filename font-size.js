(function () {
  'use strict';

  var storageKey = 'nocturne-reading-size';
  var root = document.documentElement;
  var current = readPreference();
  var lastScale = 0;
  var resizeFrame = 0;

  function readPreference() {
    try {
      return localStorage.getItem(storageKey) === 'standard' ? 'standard' : 'large';
    } catch (error) {
      return 'large';
    }
  }

  function savePreference(value) {
    try {
      localStorage.setItem(storageKey, value);
    } catch (error) {
      // Private browsing may reject storage; the current page still updates.
    }
  }

  function getViewportWidth() {
    return Math.max(window.innerWidth || 0, root.clientWidth || 0);
  }

  // Large desktop viewports otherwise keep the same 7-13 px interface type used
  // on a laptop. These tiers compensate for that effect without relying on DPR,
  // which would incorrectly enlarge displays already handled by OS scaling.
  function getDisplayScale(width) {
    if (width >= 3600) return 1.28;
    if (width >= 3000) return 1.22;
    if (width >= 2400) return 1.15;
    if (width >= 2000) return 1.08;
    return 1;
  }

  function getEffectiveScale() {
    var displayScale = getDisplayScale(getViewportWidth());
    var preferenceScale = current === 'large' ? 1.15 : 1;
    return {
      display: displayScale,
      effective: Math.round(displayScale * preferenceScale * 1000) / 1000
    };
  }

  function notifyLayout(detail) {
    window.requestAnimationFrame(function () {
      // Reading-size changes also affect maps, canvases and sticky panels whose
      // own code commonly recalculates on resize.
      window.dispatchEvent(new CustomEvent('reading-size-change', { detail: detail }));
      window.dispatchEvent(new Event('resize'));
    });
  }

  function applyScale(shouldNotify) {
    var scale = getEffectiveScale();
    root.dataset.readingSize = current;
    root.dataset.displayScale = String(scale.display);
    root.dataset.readingScale = String(scale.effective);
    root.style.setProperty('--reading-scale', String(scale.effective));

    if (scale.effective === lastScale) return false;
    lastScale = scale.effective;

    if (shouldNotify) {
      notifyLayout({
        preference: current,
        displayScale: scale.display,
        scale: scale.effective
      });
    }
    return true;
  }

  function updateButton(button) {
    var isLarge = current === 'large';
    button.textContent = isLarge ? 'A+' : 'A';
    button.setAttribute('aria-pressed', String(isLarge));
    button.setAttribute(
      'aria-label',
      isLarge ? '当前为大字号，点击切换为标准字号' : '当前为标准字号，点击切换为大字号'
    );
    button.title = isLarge ? '大字号（已自动适配 2K / 4K），点击切换为标准字号' : '标准字号（已自动适配 2K / 4K），点击切换为大字号';
  }

  function findControlMount() {
    var selectors = [
      '.header-tools',
      '.module-header nav',
      '.command-actions',
      '.player-header-tools',
      '.topbar-actions',
      '.desk-actions',
      '.coc-topbar nav',
      '.profile-header nav',
      '.campaign-header-tools',
      '.top-actions'
    ];

    for (var index = 0; index < selectors.length; index += 1) {
      var mount = document.querySelector(selectors[index]);
      if (mount && !mount.closest('[hidden]')) return mount;
    }
    return null;
  }

  function installToggle() {
    if (document.querySelector('.reading-size-toggle')) return;

    var button = document.createElement('button');
    var mount = findControlMount();
    button.className = 'reading-size-toggle ' + (mount ? 'reading-size-toggle--inline' : 'reading-size-toggle--floating');
    button.type = 'button';

    button.addEventListener('click', function () {
      current = current === 'large' ? 'standard' : 'large';
      savePreference(current);
      applyScale(true);
      updateButton(button);
    });

    updateButton(button);
    (mount || document.body).appendChild(button);
    applyScale(false);
  }

  function handleViewportChange(event) {
    // Ignore the synthetic resize dispatched above; genuine viewport changes
    // are coalesced into one recalculation per animation frame.
    if (event && event.isTrusted === false) return;
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(function () {
      applyScale(true);
    });
  }

  root.dataset.readingSize = current;
  root.style.setProperty('--reading-scale', String(getEffectiveScale().effective));
  window.addEventListener('resize', handleViewportChange, { passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installToggle, { once: true });
  } else {
    installToggle();
  }
})();
