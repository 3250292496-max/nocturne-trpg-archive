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
    script.src = source + '?v=20260714g';
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

  function loadKeeperApplication(access, forceServer) {
    if (appLoaded) return Promise.resolve();
    if (appLoadPromise) return appLoadPromise;

    var mode = forceServer ? 'server' : access.getMode && access.getMode();
    if (mode !== 'server' && mode !== 'static') {
      return Promise.reject(new Error('Keeper access mode is not ready'));
    }

    var campaignId = forceServer && window.NGCampaign && window.NGCampaign.campaignIdFromLocation();
    if (campaignId) {
      appLoadPromise = window.NGCampaign.request('/api/campaigns/' + encodeURIComponent(campaignId) + '/console-data').then(function (payload) {
        window.NG_DATA = payload && payload.data;
        if (!window.NG_DATA) throw new Error('Campaign console data was not loaded');
        return loadScript('gm.js');
      });
    } else if (mode === 'server') {
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
    var campaignId = window.NGCampaign && window.NGCampaign.campaignIdFromLocation();
    var protectedElements = ['.command-bar', '.side-nav', '#workspace', '.tracker-rail', '.mobile-nav'];

    function setConsoleLocked(locked) {
      protectedElements.forEach(function (selector) {
        var element = document.querySelector(selector);
        if (!element) return;
        if (locked) {
          element.setAttribute('inert', '');
          element.setAttribute('aria-hidden', 'true');
        } else {
          element.removeAttribute('inert');
          element.removeAttribute('aria-hidden');
        }
      });
    }

    function setSubmitting(active) {
      submit.disabled = active;
      submit.innerHTML = active ? '正在验证…' : submitMarkup;
    }

    function showGate(showError) {
      setConsoleLocked(true);
      gate.hidden = false;
      gate.classList.remove('dismissed');
      error.hidden = !showError;
      setSubmitting(false);
      if (showError) input.select();
    }

    function revealApplication(forceServer) {
      return loadKeeperApplication(access, forceServer === true).then(function () {
        error.hidden = true;
        setConsoleLocked(false);
        gate.classList.add('dismissed');
        window.setTimeout(function () { gate.hidden = true; }, 260);
      }).catch(function () {
        showGate(true);
        return false;
      });
    }

    function resumeExistingAccess() {
      if (campaignId && window.NGCampaign) {
        input.disabled = true;
        submit.disabled = true;
        submit.textContent = '正在验证团房主持权限…';
        return window.NGCampaign.getCampaign(campaignId).then(function (payload) {
          var campaign = payload.campaign || payload.room || payload;
          var member = payload.member || payload.currentMember || campaign.member || {};
          var role = member.role || payload.role || campaign.role;
          if (role !== 'host') {
            var forbidden = new Error('只有这个团房的主持人可以打开守秘控制台。');
            forbidden.code = 'forbidden';
            throw forbidden;
          }
          return revealApplication(true);
        }).catch(function (requestError) {
          error.textContent = requestError && requestError.message || '无法验证团房主持权限，请返回团房大厅重新登录。';
          error.hidden = false;
          submit.hidden = true;
          input.hidden = true;
          form.querySelector('label').textContent = '在线团房权限验证失败';
          var link = document.createElement('a');
          link.href = 'campaign.html?campaign=' + encodeURIComponent(campaignId) + '#room';
          link.className = 'primary-action';
          link.textContent = '返回团房大厅';
          form.appendChild(link);
          return false;
        });
      }

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

    setConsoleLocked(true);
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
