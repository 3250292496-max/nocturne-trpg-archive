(function () {
  'use strict';

  var STATIC_USERS_KEY = 'nocturne-auth:users:v2';
  var STATIC_SESSION_KEY = 'nocturne-auth:session:v2';
  var STATIC_OWNER_PROFILE_KEY = 'nocturne-auth:owner-profile:v2';
  var LEGACY_STATIC_USERS_KEY = 'nocturne-auth:users:v1';
  var LEGACY_STATIC_SESSION_KEY = 'nocturne-auth:session:v1';
  var LEGACY_STATIC_OWNER_PROFILE_KEY = 'nocturne-auth:owner-profile:v1';
  var MAX_AVATAR_DATA_LENGTH = 180 * 1024;
  var OWNER_ID = 'site-owner-3250292496';
  var OWNER_ACCOUNT = '3250292496';
  var OWNER_CREDENTIAL = {
    iterations: 310000,
    salt: '5Y0Fou3lK66puFVPxOmQ5w',
    digest: 'cCxF0flDVFKflB-bYU4DrOqQaYBhn0vFWiV-__CF5b8'
  };

  var state = {
    user: null,
    ready: false,
    storageAvailable: true,
    mode: /\.github\.io$/i.test(window.location.hostname) || window.location.protocol === 'file:' ? 'static' : 'server'
  };
  var listeners = [];
  var readyResolve;
  var readyPromise = new Promise(function (resolve) { readyResolve = resolve; });

  function authError(message, status, code) {
    var error = new Error(message);
    error.status = status || 400;
    error.code = code || 'request_failed';
    return error;
  }

  function accountKey(value) {
    var text = String(value || '');
    if (text.normalize) text = text.normalize('NFKC');
    return text.trim().toLowerCase();
  }

  function cleanText(value, maximum) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maximum);
  }

  function displayNameOf(user) {
    return cleanText(user && user.displayName, 40) || '夜航用户';
  }

  function firstCharacter(value) {
    return Array.from(String(value || '航'))[0] || '航';
  }

  function avatarDataUrl(value) {
    var text = String(value || '').trim();
    if (!text) return '';
    if (text.length > MAX_AVATAR_DATA_LENGTH) return null;
    return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(text) ? text : null;
  }

  function normalizedCredential(value) {
    if (!value || typeof value !== 'object') return null;
    var iterations = Number(value.iterations);
    var salt = String(value.salt || '');
    var digest = String(value.digest || '');
    if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return null;
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(salt) || !/^[A-Za-z0-9_-]{32,128}$/.test(digest)) return null;
    return { iterations: iterations, salt: salt, digest: digest };
  }

  function renderAvatar(element, user, options) {
    if (!element) return;
    var settings = options || {};
    var name = displayNameOf(user);
    var avatar = avatarDataUrl(user && user.avatar);
    element.replaceChildren();
    element.classList.toggle('has-image', Boolean(avatar));
    if (settings.label) element.setAttribute('aria-label', settings.label.replace('{name}', name));
    if (avatar) {
      var image = document.createElement('img');
      image.src = avatar;
      image.alt = settings.imageAlt || '';
      image.decoding = 'async';
      element.appendChild(image);
      return;
    }
    element.textContent = firstCharacter(name);
  }

  function bytesToBase64Url(bytes) {
    var binary = '';
    for (var index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function randomSalt() {
    if (!window.crypto || !window.crypto.getRandomValues) throw authError('当前浏览器不支持本机账号加密。', 501, 'crypto_unavailable');
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  }

  function base64UrlToBytes(value) {
    var normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4) normalized += '=';
    var binary = window.atob(normalized);
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function passwordDigest(password, credential) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
      return Promise.reject(authError('当前浏览器不支持本机账号加密。', 501, 'crypto_unavailable'));
    }
    return window.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(String(password || '')),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    ).then(function (material) {
      return window.crypto.subtle.deriveBits({
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: base64UrlToBytes(credential.salt),
        iterations: credential.iterations
      }, material, 256);
    }).then(function (bits) {
      return bytesToBase64Url(new Uint8Array(bits));
    });
  }

  function storageRead(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      state.storageAvailable = false;
      return fallback;
    }
  }

  function storageWrite(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      state.storageAvailable = true;
    } catch (error) {
      state.storageAvailable = false;
      throw authError('浏览器无法长期保存账号资料。请允许站点存储或清理浏览器空间后重试。', 503, 'storage_unavailable');
    }
  }

  function migrateStaticStorage() {
    if (state.mode !== 'static') return;
    var pairs = [
      [STATIC_USERS_KEY, LEGACY_STATIC_USERS_KEY],
      [STATIC_SESSION_KEY, LEGACY_STATIC_SESSION_KEY],
      [STATIC_OWNER_PROFILE_KEY, LEGACY_STATIC_OWNER_PROFILE_KEY]
    ];
    try {
      pairs.forEach(function (pair) {
        var destination = pair[0];
        var legacy = pair[1];
        var current = window.localStorage.getItem(destination);
        if (current === null) {
          var legacyValue = window.localStorage.getItem(legacy);
          if (legacyValue === null) legacyValue = window.sessionStorage.getItem(legacy);
          if (legacyValue !== null) window.localStorage.setItem(destination, legacyValue);
        }
        if (window.localStorage.getItem(destination) !== null) {
          window.localStorage.removeItem(legacy);
          window.sessionStorage.removeItem(legacy);
        }
      });
      state.storageAvailable = true;
    } catch (error) {
      state.storageAvailable = false;
    }
  }

  function normalizedTimestamp(value, fallback) {
    var timestamp = cleanText(value, 40);
    return timestamp && !Number.isNaN(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : fallback;
  }

  function normalizeStoredUser(source) {
    if (!source || typeof source !== 'object') return null;
    var account = String(source.account || '');
    if (account.normalize) account = account.normalize('NFKC');
    account = account.trim();
    var id = cleanText(source.id, 100);
    var credential = normalizedCredential(source.credential);
    if (!/^[A-Za-z0-9_.-]{4,32}$/.test(account) || accountKey(account) === OWNER_ACCOUNT) return null;
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(id) || !credential) return null;
    var createdAt = normalizedTimestamp(source.createdAt, new Date().toISOString());
    var avatar = avatarDataUrl(source.avatar);
    return {
      id: id,
      account: account,
      accountKey: accountKey(account),
      displayName: cleanText(source.displayName, 40) || '夜航用户',
      bio: cleanText(source.bio, 500),
      avatar: avatar || '',
      role: 'member',
      authorStatus: 'none',
      authorApplication: null,
      locked: false,
      createdAt: createdAt,
      updatedAt: normalizedTimestamp(source.updatedAt, createdAt),
      credential: credential
    };
  }

  function staticUsers() {
    var stored = storageRead(STATIC_USERS_KEY, []);
    if (!Array.isArray(stored)) return [];
    var ids = {};
    var accounts = {};
    return stored.map(normalizeStoredUser).filter(function (user) {
      if (!user || ids[user.id] || accounts[user.accountKey]) return false;
      ids[user.id] = true;
      accounts[user.accountKey] = true;
      return true;
    });
  }

  function saveStaticUsers(users) {
    storageWrite(STATIC_USERS_KEY, users);
  }

  function ownerUser() {
    var override = storageRead(STATIC_OWNER_PROFILE_KEY, {});
    var avatar = avatarDataUrl(override.avatar);
    return {
      id: OWNER_ID,
      account: OWNER_ACCOUNT,
      accountKey: OWNER_ACCOUNT,
      displayName: cleanText(override.displayName, 40) || '夜航模组馆馆主',
      bio: cleanText(override.bio, 500) || '愿这座档案馆既方便自己的创作，也让每一位跑团同好都能更轻松地找到、阅读并使用好故事。',
      avatar: avatar || '',
      role: 'owner',
      authorStatus: 'verified',
      authorApplication: null,
      locked: true,
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: override.updatedAt || '2026-07-13T00:00:00.000Z'
    };
  }

  function publicStaticUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      account: user.account,
      displayName: displayNameOf(user),
      bio: user.bio || '',
      avatar: avatarDataUrl(user.avatar) || '',
      role: user.role || 'member',
      authorStatus: user.authorStatus || 'none',
      authorApplication: user.authorApplication || null,
      locked: Boolean(user.locked),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  function staticUserById(id) {
    if (id === OWNER_ID) return ownerUser();
    return staticUsers().find(function (user) { return user && user.id === id; }) || null;
  }

  function staticUserByAccount(account) {
    var key = accountKey(account);
    if (key === OWNER_ACCOUNT) return ownerUser();
    return staticUsers().find(function (user) { return user && user.accountKey === key; }) || null;
  }

  function staticSessionUser() {
    try {
      return staticUserById(window.localStorage.getItem(STATIC_SESSION_KEY));
    } catch (error) {
      state.storageAvailable = false;
      return null;
    }
  }

  function setStaticSession(user) {
    try {
      if (user) window.localStorage.setItem(STATIC_SESSION_KEY, user.id);
      else window.localStorage.removeItem(STATIC_SESSION_KEY);
      state.storageAvailable = true;
    } catch (error) {
      state.storageAvailable = false;
      throw authError('浏览器无法长期保存登录状态。请允许站点存储后重试。', 503, 'storage_unavailable');
    }
  }

  function saveStaticUser(user) {
    if (user.id === OWNER_ID) {
      storageWrite(STATIC_OWNER_PROFILE_KEY, {
        displayName: user.displayName,
        bio: user.bio || '',
        avatar: avatarDataUrl(user.avatar) || '',
        updatedAt: user.updatedAt
      });
      return ownerUser();
    }
    var users = staticUsers();
    var index = users.findIndex(function (candidate) { return candidate && candidate.id === user.id; });
    if (index < 0) throw authError('本机账号已经失效，请重新注册。', 401, 'authentication_required');
    users[index] = user;
    saveStaticUsers(users);
    return user;
  }

  function staticProfilePayload(user) {
    var works = [];
    if (user && user.id === OWNER_ID) {
      works.push({
        id: 'null-grail',
        title: '《零之圣杯》',
        edition: 'v3.2',
        relationship: '网站作者 / 作品所有者',
        status: 'published',
        updatedAt: '2026-07-13T00:00:00.000Z',
        accessKey: null,
        accessKeyConfigured: false,
        secretUnavailableOnStatic: true
      });
    }
    try {
      var localModules = JSON.parse(window.localStorage.getItem('nocturne-studio:modules:v1') || '[]');
      if (Array.isArray(localModules)) localModules.forEach(function (module) {
        if (!module || !module.id || module.id === 'null-grail' || module.ownerId !== user.id) return;
        works.push({
          id: module.id,
          title: module.title || '未命名模组',
          edition: module.edition || '',
          relationship: '作品所有者 · 本机草稿',
          status: module.status === 'published' ? 'published' : 'draft',
          updatedAt: module.updatedAt || module.createdAt || new Date().toISOString(),
          accessKey: module.accessKey || null,
          accessKeyConfigured: Boolean(module.accessKey)
        });
      });
    } catch (error) {}
    return { ok: true, user: publicStaticUser(user), works: works, persistent: true, deviceLocal: true };
  }

  function requireStaticUser() {
    var user = staticSessionUser();
    if (!user) throw authError('请先登录账号。', 401, 'authentication_required');
    return user;
  }

  function staticRefresh() {
    return Promise.resolve(setUser(publicStaticUser(staticSessionUser())));
  }

  function staticLogin(account, password) {
    var user = staticUserByAccount(account);
    var credential = user && user.id === OWNER_ID ? OWNER_CREDENTIAL : user && user.credential;
    if (!user || !credential) return Promise.reject(authError('账号或密码不正确。', 401, 'invalid_credentials'));
    return passwordDigest(password, credential).then(function (digest) {
      if (digest !== credential.digest) throw authError('账号或密码不正确。', 401, 'invalid_credentials');
      setStaticSession(user);
      return setUser(publicStaticUser(user));
    });
  }

  function staticRegister(account, displayName, password) {
    var normalizedAccount = String(account || '');
    if (normalizedAccount.normalize) normalizedAccount = normalizedAccount.normalize('NFKC');
    normalizedAccount = normalizedAccount.trim();
    var name = cleanText(displayName, 40);
    var secret = String(password || '');
    if (!/^[A-Za-z0-9_.-]{4,32}$/.test(normalizedAccount)) {
      return Promise.reject(authError('账号需为 4–32 位英文字母、数字、点、短横线或下划线。', 400, 'invalid_registration'));
    }
    if (!name) return Promise.reject(authError('请填写显示名称。', 400, 'invalid_registration'));
    if (secret.length < 8 || secret.length > 128) {
      return Promise.reject(authError('密码长度需为 8–128 位。', 400, 'invalid_registration'));
    }
    if (staticUserByAccount(normalizedAccount)) {
      return Promise.reject(authError('这个账号已经存在。', 409, 'account_exists'));
    }

    var credential = { iterations: 310000, salt: randomSalt(), digest: '' };
    return passwordDigest(secret, credential).then(function (digest) {
      credential.digest = digest;
      var createdAt = new Date().toISOString();
      var user = {
        id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : 'session-' + Date.now() + '-' + Math.random().toString(16).slice(2),
        account: normalizedAccount,
        accountKey: accountKey(normalizedAccount),
        displayName: name,
        bio: '',
        avatar: '',
        role: 'member',
        authorStatus: 'none',
        authorApplication: null,
        locked: false,
        createdAt: createdAt,
        updatedAt: createdAt,
        credential: credential
      };
      var users = staticUsers();
      users.push(user);
      saveStaticUsers(users);
      setStaticSession(user);
      return setUser(publicStaticUser(user));
    });
  }

  function staticLogout() {
    setStaticSession(null);
    setUser(null);
    return Promise.resolve(true);
  }

  function staticProfile() {
    try { return Promise.resolve(staticProfilePayload(requireStaticUser())); }
    catch (error) { return Promise.reject(error); }
  }

  function staticUpdateProfile(displayName, bio, avatar) {
    try {
      var user = requireStaticUser();
      var name = cleanText(displayName, 40);
      if (!name) throw authError('显示名称不能为空。', 400, 'invalid_profile');
      var normalizedAvatar = avatarDataUrl(avatar);
      if (normalizedAvatar === null) throw authError('头像格式无效或压缩后仍然过大。', 400, 'invalid_avatar');
      user.displayName = name;
      user.bio = cleanText(bio, 500);
      user.avatar = normalizedAvatar;
      user.updatedAt = new Date().toISOString();
      user = saveStaticUser(user);
      setUser(publicStaticUser(user));
      return Promise.resolve(staticProfilePayload(user));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function backendRequired() {
    return Promise.reject(authError('GitHub Pages 本机账号不能提交或审核作者认证；此功能需要网站后端。', 501, 'backend_required'));
  }

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
      var contentType = String(response.headers.get('Content-Type') || '').toLowerCase();
      return response.text().then(function (text) {
        var payload = {};
        if (text && contentType.indexOf('application/json') >= 0) {
          try { payload = JSON.parse(text); }
          catch (error) { throw authError('账号服务返回了损坏的数据。', response.status, 'invalid_json'); }
        } else if (text && contentType.indexOf('application/json') < 0) {
          var nonJson = authError('当前地址没有运行账号服务。', response.status, 'non_json_response');
          nonJson.contentType = contentType;
          throw nonJson;
        }
        if (!response.ok) {
          var requestError = authError(payload.message || '请求没有成功，请稍后重试。', response.status, payload.code || 'request_failed');
          requestError.payload = payload;
          throw requestError;
        }
        return payload;
      });
    });
  }

  function canUseStaticFallback(error) {
    return error && error.code === 'non_json_response' && (error.status === 404 || error.status === 405 || error.status === 501);
  }

  function activateStaticMode() {
    state.mode = 'static';
    updateHeader();
  }

  function emit() {
    listeners.slice().forEach(function (listener) {
      try { listener(state.user); } catch (error) {}
    });
    try {
      window.dispatchEvent(new CustomEvent('ng-auth-change', { detail: { user: state.user, mode: state.mode } }));
    } catch (error) {}
  }

  function setUser(user) {
    state.user = user || null;
    updateHeader();
    emit();
    return state.user;
  }

  function refresh() {
    if (state.mode === 'static') return staticRefresh();
    return request('/api/auth/me').then(function (payload) {
      return setUser(payload.authenticated ? payload.user : null);
    }).catch(function (error) {
      if (canUseStaticFallback(error)) {
        activateStaticMode();
        return staticRefresh();
      }
      return setUser(null);
    });
  }

  function login(account, password) {
    if (state.mode === 'static') return staticLogin(account, password);
    return request('/api/auth/login', {
      method: 'POST',
      body: { account: account, password: password }
    }).then(function (payload) { return setUser(payload.user); });
  }

  function register(account, displayName, password) {
    if (state.mode === 'static') return staticRegister(account, displayName, password);
    return request('/api/auth/register', {
      method: 'POST',
      body: { account: account, displayName: displayName, password: password }
    }).then(function (payload) { return setUser(payload.user); });
  }

  function logout() {
    if (state.mode === 'static') return staticLogout();
    return request('/api/auth/logout', { method: 'POST' }).then(function () {
      setUser(null);
      return true;
    });
  }

  function profile() {
    if (state.mode === 'static') return staticProfile();
    return request('/api/profile');
  }

  function updateProfile(displayName, bio, avatar) {
    if (state.mode === 'static') return staticUpdateProfile(displayName, bio, avatar);
    return request('/api/profile', {
      method: 'PATCH',
      body: { displayName: displayName, bio: bio, avatar: avatar || '' }
    }).then(function (payload) {
      setUser(payload.user);
      return payload;
    });
  }

  function applyForAuthor(statement) {
    if (state.mode === 'static') return backendRequired();
    return request('/api/author/apply', {
      method: 'POST',
      body: { statement: statement }
    }).then(function (payload) {
      setUser(payload.user);
      return payload;
    });
  }

  function listAuthorApplications() {
    if (state.mode === 'static') return Promise.resolve({ ok: true, applications: [], persistent: true, deviceLocal: true });
    return request('/api/author/applications');
  }

  function reviewAuthorApplication(userId, decision) {
    if (state.mode === 'static') return backendRequired();
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
    var footnote = document.getElementById('auth-footnote');
    if (state.user) {
      var displayName = displayNameOf(state.user);
      if (accountButton) accountButton.hidden = true;
      if (profileLink) profileLink.hidden = false;
      if (profileName) profileName.textContent = displayName;
      if (profileLink) profileLink.setAttribute('aria-label', '进入' + displayName + '的个人中心');
      renderAvatar(profileAvatar, state.user);
    } else {
      if (accountButton) accountButton.hidden = false;
      if (accountLabel) accountLabel.textContent = '登录 / 注册';
      if (profileLink) profileLink.hidden = true;
    }
    if (footnote && state.mode === 'static') {
      footnote.textContent = '本机账号会长期保存在当前浏览器中，密码只保存不可逆校验值；清除网站数据或更换浏览器、设备后不会同步。此登录不会替代《零之圣杯》的独立作品密钥。';
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
    migrateStaticStorage();
    bindDialog();
    updateHeader();
    if (state.mode === 'static') {
      window.addEventListener('storage', function (event) {
        if ([STATIC_USERS_KEY, STATIC_SESSION_KEY, STATIC_OWNER_PROFILE_KEY].indexOf(event.key) >= 0) refresh();
      });
    }
    refresh().finally(function () {
      state.ready = true;
      readyResolve(state.user);
    });
  }

  window.NG_AUTH = {
    ready: function () { return readyPromise; },
    currentUser: function () { return state.user; },
    displayName: displayNameOf,
    renderAvatar: renderAvatar,
    getMode: function () { return state.mode; },
    capabilities: function () {
      return state.mode === 'static'
        ? { persistent: state.storageAvailable, deviceLocal: true, authorReview: false, workKeys: false, creatorWrites: false }
        : { persistent: true, authorReview: true, workKeys: true, creatorWrites: true };
    },
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
