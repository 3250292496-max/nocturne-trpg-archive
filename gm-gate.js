(function () {
  'use strict';

  var appLoadPromise = null;
  var appLoaded = false;

  function loadScript(source) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-keeper-source="' + source + '"]');
      if (existing) {
        if (existing.getAttribute('data-loaded') === 'true') resolve();
        else {
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', reject, { once: true });
        }
        return;
      }

      var script = document.createElement('script');
    script.src = source + '?v=20260713u';
      script.async = false;
      script.setAttribute('data-keeper-source', source);
      script.addEventListener('load', function () {
        script.setAttribute('data-loaded', 'true');
        resolve();
      }, { once: true });
      script.addEventListener('error', function () {
        script.remove();
        reject(new Error('Unable to load ' + source));
      }, { once: true });
      document.body.appendChild(script);
    });
  }

  function loadKeeperApplication(access) {
    if (appLoaded) return Promise.resolve();
    if (appLoadPromise) return appLoadPromise;

    var mode = access.getMode && access.getMode();
    if (mode !== 'server' && mode !== 'static') {
      return Promise.reject(new Error('Keeper access mode is not ready'));
    }

    if (mode === 'server') {
      appLoadPromise = loadScript('gm-data.js').then(function () {
        if (!window.NG_DATA) throw new Error('Keeper data was not loaded');
        return loadScript('gm.js');
      });
    } else {
      appLoadPromise = access.loadKeeperData().then(function (data) {
        if (data) window.NG_DATA = data;
        if (!window.NG_DATA) throw new Error('Keeper data could not be decrypted');
        return loadScript('gm.js');
      });
    }

    appLoadPromise = appLoadPromise.then(function () {
      appLoaded = true;
    }).catch(function (error) {
      appLoadPromise = null;
      throw error;
    });
    return appLoadPromise;
  }

  function bindGate() {
    var access = window.NG_ACCESS;
    var gate = document.getElementById('keeper-gate');
    var form = document.getElementById('keeper-key-form');
    var input = document.getElementById('keeper-key-input');
    var error = document.getElementById('keeper-key-error');
    if (!access || !gate || !form) return;

    var submit = form.querySelector('[type="submit"]');
    var submitMarkup = submit.innerHTML;

    function setSubmitting(active) {
      submit.disabled = active;
      submit.innerHTML = active ? '正在验证…' : submitMarkup;
    }

    function showGate(showError) {
      gate.hidden = false;
      gate.classList.remove('dismissed');
      error.hidden = !showError;
      setSubmitting(false);
      if (showError) input.select();
    }

    function revealApplication() {
      return loadKeeperApplication(access).then(function () {
        error.hidden = true;
        gate.classList.add('dismissed');
        window.setTimeout(function () { gate.hidden = true; }, 260);
      }).catch(function () {
        showGate(true);
        return false;
      });
    }

    function resumeExistingAccess() {
      var mode = access.getMode && access.getMode();
      if (mode === 'server') {
        return access.checkServerSession().then(function (authorized) {
          if (authorized) return revealApplication();
          showGate(false);
          return false;
        }).catch(function () {
          showGate(false);
          return false;
        });
      }

      if (mode === 'static') {
        if (!access.hasKeeperAccess()) {
          showGate(false);
          return Promise.resolve(false);
        }
        return revealApplication();
      }

      if (!access.checkServerSession) {
        showGate(false);
        return Promise.resolve(false);
      }

      return access.checkServerSession().then(function (authorized) {
        if (access.getMode() === 'server' && authorized) return revealApplication();
        if (access.getMode() === 'static' && access.hasKeeperAccess()) return revealApplication();
        showGate(false);
        return false;
      }).catch(function () {
        showGate(false);
        return false;
      });
    }

    gate.hidden = false;
    resumeExistingAccess();

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      error.hidden = true;
      setSubmitting(true);

      access.verifyKey(input.value).then(function (valid) {
        if (!valid) {
          showGate(true);
          return false;
        }
        return revealApplication();
      }).catch(function () {
        showGate(true);
      });
    });

    window.addEventListener('storage', function (event) {
      if (event.key === 'ng-archive-role:v3.2' && event.newValue === 'player') {
        window.setTimeout(function () { window.location.reload(); }, 180);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindGate);
  else bindGate();
}());
