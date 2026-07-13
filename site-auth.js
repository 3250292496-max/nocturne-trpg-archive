(function () {
  'use strict';

  var state = { user: null, ready: false };
  var listeners = [];
  var readyResolve;
  var readyPromise = new Promise(function (resolve) { readyResolve = resolve; });

  function request(path, options) {
    var settings = Object.assign({
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {}
    }, options || {});
    if (settings.body && typeof settings.body !== 'string') {
      settings.headers = Object.assign({}, settings.headers, { 'Content-Type': 'application/json' });
      settings.body = JSON.stringify(settings.body);
    }
    return window.fetch(path, settings).then(function (response) {
      return response.text().then(function (text) {
        var payload = {};
        if (text) {
          try { payload = JSON.parse(text); }
          catch (error) { payload = { message: '服务器返回了无法识别的内容。' }; }
        }
        if (!response.ok) {
          var requestError = new Error(payload.message || '请求没有成功，请稍后重试。');
          requestError.status = response.status;
          requestError.code = payload.code || 'request_failed';
          requestError.payload = payload;
          throw requestError;
        }
        return payload;
      });
    });
  }

  function emit() {
    listeners.slice().forEach(function (listener) {
      try { listener(state.user); } catch (error) {}
    });
    try {
      window.dispatchEvent(new CustomEvent('ng-auth-change', { detail: { user: state.user } }));
    } catch (error) {}
  }

  function setUser(user) {
    state.user = user || null;
    updateHeader();
    emit();
    return state.user;
  }

  function refresh() {
    return request('/api/auth/me').then(function (payload) {
      return setUser(payload.authenticated ? payload.user : null);
    }).catch(function () {
      return setUser(null);
    });
  }

  function login(account, password) {
    return request('/api/auth/login', {
      method: 'POST',
      body: { account: account, password: password }
    }).then(function (payload) { return setUser(payload.user); });
  }

  function register(account, displayName, password) {
    return request('/api/auth/register', {
      method: 'POST',
      body: { account: account, displayName: displayName, password: password }
    }).then(function (payload) { return setUser(payload.user); });
  }

  function logout() {
    return request('/api/auth/logout', { method: 'POST' }).then(function () {
      setUser(null);
      return true;
    });
  }

  function profile() {
    return request('/api/profile');
  }

  function updateProfile(displayName, bio) {
    return request('/api/profile', {
      method: 'PATCH',
      body: { displayName: displayName, bio: bio }
    }).then(function (payload) {
      setUser(payload.user);
      return payload;
    });
  }

  function applyForAuthor(statement) {
    return request('/api/author/apply', {
      method: 'POST',
      body: { statement: statement }
    }).then(function (payload) {
      setUser(payload.user);
      return payload;
    });
  }

  function listAuthorApplications() {
    return request('/api/author/applications');
  }

  function reviewAuthorApplication(userId, decision) {
    return request('/api/author/applications/' + encodeURIComponent(userId), {
      method: 'PATCH',
      body: { decision: decision }
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return function () {};
    listeners.push(listener);
    return function () {
      var index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    };
  }

  function updateHeader() {
    var accountButton = document.getElementById('account-button');
    var accountLabel = document.getElementById('account-button-label');
    var profileLink = document.getElementById('profile-link');
    var profileName = document.getElementById('profile-name');
    var profileAvatar = document.getElementById('profile-avatar');
    if (state.user) {
      if (accountButton) accountButton.hidden = true;
      if (profileLink) profileLink.hidden = false;
      if (profileName) profileName.textContent = state.user.displayName || state.user.account;
      if (profileAvatar) profileAvatar.textContent = String(state.user.displayName || state.user.account || '航').charAt(0);
    } else {
      if (accountButton) accountButton.hidden = false;
      if (accountLabel) accountLabel.textContent = '登录 / 注册';
      if (profileLink) profileLink.hidden = true;
    }
  }

  function setBusy(form, active) {
    var button = form && form.querySelector('[type="submit"]');
    if (!button) return;
    if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML;
    button.disabled = active;
    button.innerHTML = active ? '正在处理…' : button.dataset.originalText;
  }

  function showError(element, error) {
    if (!element) return;
    element.textContent = error && error.message ? error.message : '操作没有成功，请稍后重试。';
    element.hidden = false;
  }

  function bindDialog() {
    var dialog = document.getElementById('auth-dialog');
    var openButton = document.getElementById('account-button');
    var closeButton = document.getElementById('auth-close');
    var loginForm = document.getElementById('login-form');
    var registerForm = document.getElementById('register-form');
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-auth-tab]'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('[data-auth-panel]'));
    if (!dialog) return;

    function selectTab(name) {
      tabs.forEach(function (tab) {
        var active = tab.getAttribute('data-auth-tab') === name;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      panels.forEach(function (panel) {
        panel.hidden = panel.getAttribute('data-auth-panel') !== name;
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { selectTab(tab.getAttribute('data-auth-tab')); });
    });
    if (openButton) openButton.addEventListener('click', function () {
      selectTab('login');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    });
    if (closeButton) closeButton.addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });

    if (loginForm) loginForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var errorElement = document.getElementById('login-error');
      if (errorElement) errorElement.hidden = true;
      setBusy(loginForm, true);
      login(loginForm.elements.account.value, loginForm.elements.password.value).then(function () {
        loginForm.reset();
        dialog.close();
        window.location.href = 'profile.html';
      }).catch(function (error) {
        showError(errorElement, error);
      }).finally(function () { setBusy(loginForm, false); });
    });

    if (registerForm) registerForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var errorElement = document.getElementById('register-error');
      if (errorElement) errorElement.hidden = true;
      var password = registerForm.elements.password.value;
      var confirmation = registerForm.elements.passwordConfirm.value;
      if (password !== confirmation) {
        showError(errorElement, new Error('两次输入的密码不一致。'));
        return;
      }
      setBusy(registerForm, true);
      register(
        registerForm.elements.account.value,
        registerForm.elements.displayName.value,
        password
      ).then(function () {
        registerForm.reset();
        dialog.close();
        window.location.href = 'profile.html';
      }).catch(function (error) {
        showError(errorElement, error);
      }).finally(function () { setBusy(registerForm, false); });
    });
  }

  function start() {
    bindDialog();
    updateHeader();
    refresh().finally(function () {
      state.ready = true;
      readyResolve(state.user);
    });
  }

  window.NG_AUTH = {
    ready: function () { return readyPromise; },
    currentUser: function () { return state.user; },
    refresh: refresh,
    login: login,
    register: register,
    logout: logout,
    profile: profile,
    updateProfile: updateProfile,
    applyForAuthor: applyForAuthor,
    listAuthorApplications: listAuthorApplications,
    reviewAuthorApplication: reviewAuthorApplication,
    subscribe: subscribe
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}());
