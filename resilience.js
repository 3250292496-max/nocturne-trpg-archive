(function (root) {
  'use strict';

  var DEFAULT_TIMEOUT_MS = 10000;
  var alertId = 'ng-persistence-alert';
  var persistenceErrors = Object.create(null);
  var persistenceSequence = 0;

  function requestKind(status) {
    if (status === 401) return 'unauthenticated';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'not_found';
    if (status === 408 || status === 504) return 'timeout';
    if (status === 409) return 'conflict';
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'server';
    return status >= 400 ? 'invalid' : 'ok';
  }

  function makeError(message, details) {
    var error = new Error(message || '暂时无法完成请求。');
    Object.keys(details || {}).forEach(function (key) { error[key] = details[key]; });
    return error;
  }

  function responsePayload(response) {
    return response.text().then(function (raw) {
      if (!raw) return {};
      try { return JSON.parse(raw); }
      catch (error) { return { message: raw.slice(0, 500) }; }
    });
  }

  function request(input, options) {
    var settings = Object.assign({}, options || {});
    var timeoutMs = Number(settings.timeoutMs || DEFAULT_TIMEOUT_MS);
    var retry = settings.retry !== false && String(settings.method || 'GET').toUpperCase() === 'GET';
    delete settings.timeoutMs;
    delete settings.retry;

    function attempt(index) {
      var controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
      var externalSignal = settings.signal || null;
      var forwardAbort = null;
      var timer = controller ? root.setTimeout(function () { controller.abort(); }, timeoutMs) : null;
      var attemptSettings = Object.assign({}, settings);
      if (controller) {
        if (externalSignal && externalSignal.aborted) controller.abort();
        else if (externalSignal && typeof externalSignal.addEventListener === 'function') {
          forwardAbort = function () { controller.abort(); };
          externalSignal.addEventListener('abort', forwardAbort, { once:true });
        }
        attemptSettings.signal = controller.signal;
      }
      return root.fetch(input, attemptSettings).then(function (response) {
        if (timer) root.clearTimeout(timer);
        return responsePayload(response).then(function (payload) {
          if (response.ok) return payload;
          var kind = requestKind(response.status);
          var error = makeError(payload.message || '请求失败。', {
            status: response.status,
            code: payload.code || '',
            kind: kind,
            payload: payload
          });
          if (retry && index === 0 && (kind === 'server' || kind === 'timeout')) return attempt(1);
          throw error;
        });
      }).catch(function (error) {
        if (timer) root.clearTimeout(timer);
        if (error && error.kind) throw error;
        var offline = root.navigator && root.navigator.onLine === false;
        var timedOut = error && error.name === 'AbortError';
        var wrapped = makeError(
          offline ? '当前处于离线状态。' : timedOut ? '请求超时，请重试。' : '网络连接失败，请重试。',
          { kind: offline ? 'offline' : timedOut ? 'timeout' : 'network', cause: error }
        );
        if (retry && index === 0) return attempt(1);
        throw wrapped;
      }).finally(function () {
        if (timer) root.clearTimeout(timer);
        if (forwardAbort && externalSignal && typeof externalSignal.removeEventListener === 'function') {
          externalSignal.removeEventListener('abort', forwardAbort);
        }
      });
    }

    return attempt(0);
  }

  function downloadJson(filename, value) {
    if (!root.document || !root.URL || typeof root.Blob !== 'function') return false;
    var blob = new root.Blob([JSON.stringify(value, null, 2)], { type:'application/json;charset=utf-8' });
    var url = root.URL.createObjectURL(blob);
    var link = root.document.createElement('a');
    link.href = url;
    link.download = filename || 'nocturne-recovery.json';
    link.hidden = true;
    root.document.body.appendChild(link);
    link.click();
    link.remove();
    root.URL.revokeObjectURL(url);
    return true;
  }

  function latestPersistenceError() {
    return Object.keys(persistenceErrors).map(function (scope) {
      return persistenceErrors[scope];
    }).sort(function (left, right) { return right.sequence - left.sequence; })[0] || null;
  }

  function renderPersistenceError() {
    if (!root.document || !root.document.body) return;
    var banner = root.document.getElementById(alertId);
    var current = latestPersistenceError();
    if (!current) {
      if (banner) banner.hidden = true;
      return;
    }
    if (!banner) {
      banner = root.document.createElement('section');
      banner.id = alertId;
      banner.className = 'ng-persistence-alert';
      banner.setAttribute('role', 'alert');
      banner.setAttribute('aria-live', 'assertive');
      var copy = root.document.createElement('p');
      copy.setAttribute('data-ng-persistence-copy', '');
      var actions = root.document.createElement('div');
      var exportButton = root.document.createElement('button');
      exportButton.type = 'button';
      exportButton.textContent = '导出恢复文件';
      exportButton.setAttribute('data-ng-persistence-export', '');
      var closeButton = root.document.createElement('button');
      closeButton.type = 'button';
      closeButton.textContent = '知道了';
      closeButton.addEventListener('click', function () {
        var scope = banner.getAttribute('data-ng-persistence-scope');
        if (scope && persistenceErrors[scope]) persistenceErrors[scope].dismissed = true;
        banner.hidden = true;
      });
      actions.appendChild(exportButton);
      actions.appendChild(closeButton);
      banner.appendChild(copy);
      banner.appendChild(actions);
      root.document.body.appendChild(banner);
    }
    banner.setAttribute('data-ng-persistence-scope', current.scope);
    banner.hidden = current.dismissed === true;
    banner.querySelector('[data-ng-persistence-copy]').textContent = current.message;
    var exportControl = banner.querySelector('[data-ng-persistence-export]');
    exportControl.hidden = !current.recovery;
    exportControl.onclick = current.recovery ? function () {
      downloadJson(current.recovery.filename, current.recovery.value);
    } : null;
  }

  function showPersistenceError(message, recovery, scope) {
    var normalizedScope = String(scope || 'general');
    persistenceErrors[normalizedScope] = {
      scope: normalizedScope,
      message: message,
      recovery: recovery || null,
      dismissed: false,
      sequence: ++persistenceSequence
    };
    renderPersistenceError();
    if (typeof root.CustomEvent === 'function') {
      root.dispatchEvent(new root.CustomEvent('ng:persistence-error', { detail:{ message:message, scope:normalizedScope } }));
    }
  }

  function clearPersistenceError(scope) {
    delete persistenceErrors[String(scope || 'general')];
    renderPersistenceError();
  }

  function storageSet(key, value, options) {
    var settings = options || {};
    try {
      var raw = settings.raw ? String(value) : JSON.stringify(value);
      root.localStorage.setItem(key, raw);
      if (settings.clearAlert !== false) clearPersistenceError(settings.scope || ('local-storage:' + key));
      return true;
    } catch (error) {
      showPersistenceError(
        (settings.label || '当前数据') + '未能保存到此设备。请立即导出恢复文件，避免刷新后丢失。',
        settings.recovery === false ? null : {
          filename: settings.filename || 'nocturne-recovery.json',
          value: value
        },
        settings.scope || ('local-storage:' + key)
      );
      return false;
    }
  }

  function storageGet(key, fallback, options) {
    try {
      var raw = root.localStorage.getItem(key);
      if (raw == null) return fallback;
      return options && options.raw ? raw : JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  root.NG_RESILIENCE = Object.freeze({
    DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
    requestKind: requestKind,
    request: request,
    downloadJson: downloadJson,
    showPersistenceError: showPersistenceError,
    clearPersistenceError: clearPersistenceError,
    hasPersistenceError: function (scope) { return Boolean(persistenceErrors[String(scope || 'general')]); },
    storage: Object.freeze({ get:storageGet, set:storageSet })
  });
})(typeof window !== 'undefined' ? window : globalThis);
