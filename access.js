(function () {
  'use strict';

  var ROLE_KEY = 'ng-archive-role:v3.2';
  var LEGACY_ACCESS_KEY = 'ng-archive-access:v3.2';
  var PASSPHRASE_KEY = 'ng-archive-passphrase:v4';
  var VERIFIER_TEXT = 'NOCTURNE_KEEPER_V1';
  var mode = 'unknown';
  var serverAuthorized = false;
  var staticAuthorized = false;
  var manifestPromise = null;
  var derivedKeyPromise = null;
  var derivedForPassphrase = null;

  function normalize(value) {
    return String(value || '').trim().toUpperCase();
  }

  function requireCrypto() {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder || !window.TextDecoder) {
      throw new Error('当前浏览器不支持安全解密，请升级浏览器后重试。');
    }
  }

  function base64ToBytes(value) {
    var normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4) normalized += '=';
    var binary = window.atob(normalized);
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function entryUrl(path) {
    return new URL(path, document.baseURI).href;
  }

  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = window.fetch(entryUrl('secure/manifest.json'), {
        credentials: 'same-origin',
        cache: 'no-store'
      }).then(function (response) {
        if (!response.ok) throw new Error('无法读取加密资料清单（HTTP ' + response.status + '）。');
        return response.json();
      }).then(function (manifest) {
        if (!manifest || !manifest.kdf || !manifest.verifier || !manifest.data || !manifest.resources) {
          throw new Error('加密资料清单格式不完整。');
        }
        return manifest;
      }).catch(function (error) {
        manifestPromise = null;
        throw error;
      });
    }
    return manifestPromise;
  }

  function deriveKey(passphrase, manifest) {
    requireCrypto();
    if (derivedKeyPromise && derivedForPassphrase === passphrase) return derivedKeyPromise;

    var kdf = manifest.kdf;
    var iterations = Number(kdf.iterations);
    if (!iterations || iterations < 1 || !kdf.salt) throw new Error('加密资料的密钥参数无效。');

    derivedForPassphrase = passphrase;
    derivedKeyPromise = window.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    ).then(function (material) {
      return window.crypto.subtle.deriveKey({
        name: 'PBKDF2',
        salt: base64ToBytes(kdf.salt),
        iterations: iterations,
        hash: kdf.hash || 'SHA-256'
      }, material, {
        name: 'AES-GCM',
        length: 256
      }, false, ['decrypt']);
    }).catch(function (error) {
      derivedKeyPromise = null;
      derivedForPassphrase = null;
      throw error;
    });

    return derivedKeyPromise;
  }

  function fetchCiphertext(entry) {
    if (!entry || !entry.path || !entry.iv) return Promise.reject(new Error('加密资料条目不完整。'));
    return window.fetch(entryUrl(entry.path), {
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (response) {
      if (!response.ok) throw new Error('无法读取加密资料（HTTP ' + response.status + '）。');
      return response.arrayBuffer();
    });
  }

  function decryptEntry(entry, passphrase, manifest) {
    return Promise.all([deriveKey(passphrase, manifest), fetchCiphertext(entry)]).then(function (values) {
      return window.crypto.subtle.decrypt({
        name: 'AES-GCM',
        iv: base64ToBytes(entry.iv),
        additionalData: new TextEncoder().encode(entry.aad || ''),
        tagLength: 128
      }, values[0], values[1]);
    });
  }

  function verifyStaticKey(passphrase) {
    staticAuthorized = false;
    return loadManifest().then(function (manifest) {
      return decryptEntry(manifest.verifier, passphrase, manifest);
    }).then(function (plaintext) {
      var valid = new TextDecoder('utf-8').decode(plaintext) === VERIFIER_TEXT;
      if (valid) {
        mode = 'static';
        staticAuthorized = true;
        grantKeeperAccess(passphrase);
      }
      return valid;
    }).catch(function () {
      return false;
    });
  }

  function isStaticResponse(response) {
    return response.status === 404 || response.status === 405 || response.status === 501 || response.status === 503;
  }

  function verifyKey(value) {
    var passphrase = normalize(value);
    if (!passphrase) return Promise.resolve(false);

    if (!window.fetch) return Promise.resolve(false);
    return window.fetch('/api/access', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: passphrase })
    }).then(function (response) {
      if (isStaticResponse(response)) {
        mode = 'static';
        return verifyStaticKey(passphrase);
      }
      mode = 'server';
      if (!response.ok) return false;
      serverAuthorized = true;
      staticAuthorized = false;
      grantKeeperAccess(passphrase);
      return true;
    }).catch(function () {
      mode = 'static';
      return verifyStaticKey(passphrase);
    });
  }

  function getRole() {
    var role = localStorage.getItem(ROLE_KEY);
    return role === 'player' || role === 'keeper' ? role : null;
  }

  function clearPassphrase() {
    sessionStorage.removeItem(PASSPHRASE_KEY);
    localStorage.removeItem(LEGACY_ACCESS_KEY);
    staticAuthorized = false;
    derivedKeyPromise = null;
    derivedForPassphrase = null;
  }

  function setRole(role) {
    if (role !== 'player' && role !== 'keeper') return;
    localStorage.setItem(ROLE_KEY, role);
    if (role === 'player') {
      serverAuthorized = false;
      clearPassphrase();
      if (window.fetch) window.fetch('/api/access', {
        method: 'DELETE',
        credentials: 'same-origin'
      }).catch(function () {});
    }
  }

  function grantKeeperAccess(passphrase) {
    var normalized = normalize(passphrase);
    localStorage.setItem(ROLE_KEY, 'keeper');
    localStorage.removeItem(LEGACY_ACCESS_KEY);
    if (normalized) sessionStorage.setItem(PASSPHRASE_KEY, normalized);
  }

  function hasKeeperAccess() {
    return getRole() === 'keeper' && Boolean(serverAuthorized || staticAuthorized);
  }

  function getMode() {
    return mode;
  }

  function checkServerSession() {
    if (!window.fetch) return Promise.resolve(false);
    return window.fetch('/api/access/status', {
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (response) {
      if (isStaticResponse(response)) {
        mode = 'static';
        serverAuthorized = false;
        return restoreStaticAccess();
      }
      mode = 'server';
      staticAuthorized = false;
      if (!response.ok) {
        serverAuthorized = false;
        return false;
      }
      return response.json().then(function (status) {
        serverAuthorized = Boolean(status && status.authorized);
        if (serverAuthorized) localStorage.setItem(ROLE_KEY, 'keeper');
        return serverAuthorized;
      });
    }).catch(function () {
      mode = 'static';
      serverAuthorized = false;
      return restoreStaticAccess();
    });
  }

  function restoreStaticAccess() {
    var passphrase = sessionStorage.getItem(PASSPHRASE_KEY);
    if (!passphrase) {
      staticAuthorized = false;
      return Promise.resolve(false);
    }
    return verifyStaticKey(passphrase).then(function (valid) {
      if (!valid) clearPassphrase();
      return valid;
    });
  }

  function keeperPassphrase() {
    var passphrase = sessionStorage.getItem(PASSPHRASE_KEY);
    if (!passphrase || !hasKeeperAccess()) throw new Error('守秘人口令已过期，请重新验证。');
    return passphrase;
  }

  function loadKeeperData() {
    var passphrase;
    try {
      passphrase = keeperPassphrase();
    } catch (error) {
      return Promise.reject(error);
    }
    return loadManifest().then(function (manifest) {
      return decryptEntry(manifest.data, passphrase, manifest);
    }).then(function (plaintext) {
      try {
        return JSON.parse(new TextDecoder('utf-8').decode(plaintext));
      } catch (error) {
        throw new Error('守秘人资料解密成功，但 JSON 内容无效。');
      }
    });
  }

  function downloadSecureResource(id) {
    var passphrase;
    try {
      passphrase = keeperPassphrase();
    } catch (error) {
      return Promise.reject(error);
    }

    return loadManifest().then(function (manifest) {
      var entry = manifest.resources[String(id)];
      if (!entry) throw new Error('找不到对应的加密资料。');
      return decryptEntry(entry, passphrase, manifest).then(function (plaintext) {
        var blob = new Blob([plaintext], { type: entry.mime || 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        var anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = entry.filename || String(id);
        anchor.hidden = true;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        return blob;
      });
    });
  }

  function reset() {
    localStorage.removeItem(ROLE_KEY);
    clearPassphrase();
    serverAuthorized = false;
    if (window.fetch) window.fetch('/api/access', {
      method: 'DELETE',
      credentials: 'same-origin'
    }).catch(function () {});
  }

  // Remove the old persistent access flag as soon as the upgraded script loads.
  localStorage.removeItem(LEGACY_ACCESS_KEY);

  window.NG_ACCESS = {
    verifyKey: verifyKey,
    getRole: getRole,
    setRole: setRole,
    hasKeeperAccess: hasKeeperAccess,
    getMode: getMode,
    checkServerSession: checkServerSession,
    loadKeeperData: loadKeeperData,
    downloadSecureResource: downloadSecureResource,
    reset: reset
  };
}());
