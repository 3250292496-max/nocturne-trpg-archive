(function () {
  'use strict';

  var storageKey = 'nocturne-reading-size';
  var root = document.documentElement;

  function readPreference() {
    try {
      return localStorage.getItem(storageKey) || 'large';
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

  function applyPreference(value) {
    var normalized = value === 'standard' ? 'standard' : 'large';
    root.dataset.readingSize = normalized;
    return normalized;
  }

  var current = applyPreference(readPreference());

  function installToggle() {
    if (document.querySelector('.reading-size-toggle')) return;

    var button = document.createElement('button');
    button.className = 'reading-size-toggle';
    button.type = 'button';

    function updateButton() {
      var isLarge = current === 'large';
      button.textContent = isLarge ? '字号 · 大' : '字号 · 标准';
      button.setAttribute('aria-pressed', String(isLarge));
      button.setAttribute('aria-label', isLarge ? '当前为大字号，点击切换为标准字号' : '当前为标准字号，点击切换为大字号');
      button.title = isLarge ? '切换为标准字号' : '切换为大字号';
    }

    button.addEventListener('click', function () {
      current = applyPreference(current === 'large' ? 'standard' : 'large');
      savePreference(current);
      updateButton();
    });

    updateButton();
    document.body.appendChild(button);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installToggle, { once: true });
  } else {
    installToggle();
  }
})();
