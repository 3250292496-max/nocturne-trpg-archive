(function () {
  'use strict';

  var auth = window.NG_AUTH;
  var currentProfile = null;
  var toastTimer = null;
  var pendingAvatar = '';
  var avatarProcessing = false;
  var MAX_AVATAR_FILE_BYTES = 5 * 1024 * 1024;
  var MAX_AVATAR_DATA_LENGTH = 180 * 1024;
  var AVATAR_SIZE = 256;

  function byId(id) { return document.getElementById(id); }
  function isStaticMode() { return auth && auth.getMode && auth.getMode() === 'static'; }

  function displayName(user) {
    return auth && auth.displayName ? auth.displayName(user) : String(user && user.displayName || '夜航用户');
  }

  function renderAvatar(element, user, label) {
    if (!element) return;
    if (auth && auth.renderAvatar) {
      auth.renderAvatar(element, user, { label: label || '{name}的头像' });
      return;
    }
    element.textContent = Array.from(displayName(user))[0] || '航';
  }

  function avatarPreviewUser() {
    return {
      displayName: byId('display-name-input').value.trim() || (currentProfile && displayName(currentProfile.user)) || '夜航用户',
      avatar: pendingAvatar
    };
  }

  function updateAvatarPreview() {
    var user = avatarPreviewUser();
    renderAvatar(byId('avatar-preview'), user, '{name}的头像预览');
    byId('avatar-remove').disabled = !pendingAvatar;
  }

  function loadAvatarImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('无法读取这张图片，请换一张 JPG、PNG 或 WebP。'));
      };
      image.src = url;
    });
  }

  function prepareAvatar(file) {
    if (!file || ['image/jpeg', 'image/png', 'image/webp'].indexOf(file.type) < 0) {
      return Promise.reject(new Error('头像只支持 JPG、PNG 或 WebP 图片。'));
    }
    if (file.size > MAX_AVATAR_FILE_BYTES) {
      return Promise.reject(new Error('头像原图不能超过 5 MB。'));
    }
    return loadAvatarImage(file).then(function (image) {
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('这张图片没有可用尺寸。');
      var canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      var context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器无法处理头像图片。');
      context.fillStyle = '#15202b';
      context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
      var crop = Math.min(image.naturalWidth, image.naturalHeight);
      var sourceX = Math.max(0, (image.naturalWidth - crop) / 2);
      var sourceY = Math.max(0, (image.naturalHeight - crop) / 2);
      context.drawImage(image, sourceX, sourceY, crop, crop, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      var data = canvas.toDataURL('image/webp', .82);
      if (data.indexOf('data:image/webp;base64,') !== 0 || data.length > MAX_AVATAR_DATA_LENGTH) {
        data = canvas.toDataURL('image/jpeg', .76);
      }
      if (data.length > MAX_AVATAR_DATA_LENGTH) data = canvas.toDataURL('image/jpeg', .58);
      if (data.length > MAX_AVATAR_DATA_LENGTH) throw new Error('头像压缩后仍然过大，请选择更简单的图片。');
      return data;
    });
  }

  function setBusy(form, active) {
    var button = form && form.querySelector('[type="submit"]');
    if (!button) return;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.disabled = active;
    button.textContent = active ? '正在处理…' : button.dataset.originalText;
  }

  function message(element, text, error) {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle('error', Boolean(error));
    element.hidden = !text;
  }

  function toast(text) {
    var element = byId('profile-toast');
    if (!element) return;
    window.clearTimeout(toastTimer);
    element.textContent = text;
    element.classList.add('visible');
    toastTimer = window.setTimeout(function () { element.classList.remove('visible'); }, 2600);
  }

  function formatDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function roleLabel(user) {
    if (user.role === 'owner') return '网站站长';
    if (user.role === 'author') return '认证作者';
    return '普通成员';
  }

  function authorLabel(status) {
    if (status === 'verified') return '已认证作者';
    if (status === 'pending') return '作者认证审核中';
    if (status === 'rejected') return '认证未通过';
    return '尚未认证作者';
  }

  function showSignedOut() {
    byId('profile-loading').hidden = true;
    byId('profile-content').hidden = true;
    byId('signed-out-card').hidden = false;
    byId('logout-button').hidden = true;
    if (isStaticMode()) {
      byId('profile-storage-note').textContent = '当前为 GitHub Pages 本机账号：账号资料和登录状态会长期保存在这个浏览器中。清除网站数据或更换浏览器、设备后不会同步。';
    }
  }

  function renderIdentity(user) {
    var name = displayName(user);
    byId('identity-name').textContent = name;
    byId('identity-account').textContent = '账号 · ' + user.account;
    renderAvatar(byId('identity-avatar'), user, '{name}的头像');
    byId('role-badge').textContent = roleLabel(user);
    byId('author-badge').textContent = authorLabel(user.authorStatus);
    byId('locked-badge').hidden = !user.locked;
    byId('joined-date').textContent = formatDate(user.createdAt);
    byId('display-name-input').value = name;
    byId('bio-input').value = user.bio || '';
    byId('bio-count').textContent = String((user.bio || '').length);
    pendingAvatar = user.avatar || '';
    updateAvatarPreview();
  }

  function renderAuthor(user) {
    var verified = byId('author-verified');
    var pending = byId('author-pending');
    var form = byId('author-form');
    byId('author-status-label').textContent = authorLabel(user.authorStatus);
    verified.hidden = user.authorStatus !== 'verified';
    pending.hidden = user.authorStatus !== 'pending';
    form.hidden = user.authorStatus === 'verified' || user.authorStatus === 'pending';
    if (isStaticMode() && user.authorStatus !== 'verified') {
      form.hidden = false;
      form.querySelector('p').textContent = 'GitHub Pages 本机账号不能真正提交作者认证；作者审核需要网站后端。';
      form.querySelector('textarea').disabled = true;
      form.querySelector('[type="submit"]').disabled = true;
    }
    if (user.authorStatus === 'pending' && user.authorApplication) {
      byId('pending-statement').textContent = user.authorApplication.statement || '';
    }
    if (user.authorStatus === 'rejected') {
      form.querySelector('p').textContent = '上次申请未通过。你可以补充作品信息或更新创作计划后重新提交。';
    }
  }

  function workMarkup(work, index) {
    var staticMode = isStaticMode();
    var value = staticMode ? '' : work.accessKey || '';
    var hint = work.accessKeyConfigured ? '该密钥也用于进入《零之圣杯》守秘人控制台。' : '尚未配置 NG_ACCESS_KEY 或 .keeper-key。';
    var showKey = !staticMode && work.id === 'null-grail' && (work.accessKeyConfigured || value);
    return '<article class="work-card">' +
      '<div><p class="profile-eyebrow">WORK · ' + String(index + 1).padStart(2, '0') + '</p>' +
      '<h3>' + escapeHtml(work.title) + ' <small>' + escapeHtml(work.edition || '') + '</small></h3>' +
      '<p>' + escapeHtml(work.relationship || '作品所有者') + ' · ' + escapeHtml(work.status === 'published' ? '已发布' : '草稿') + '</p>' +
      '<div class="work-actions"><a href="module.html?id=' + encodeURIComponent(work.id) + '">查看模组</a><a class="manage" href="studio.html?id=' + encodeURIComponent(work.id) + '">进入创作者工作台 →</a></div></div>' +
      (showKey ? '<div class="work-key"><label for="work-key-' + index + '">作品密钥</label>' +
      '<div class="key-control"><input id="work-key-' + index + '" type="password" readonly value="' + escapeAttribute(value) + '" placeholder="尚未配置">' +
      '<button type="button" data-key-toggle="work-key-' + index + '">显示</button>' +
      '<button type="button" data-key-copy="work-key-' + index + '"' + (value ? '' : ' disabled') + '>复制</button></div>' +
      '<small>' + escapeHtml(hint) + '</small></div>' : staticMode && work.secretUnavailableOnStatic
        ? '<div class="work-key static-key-note"><label>作品密钥</label><small>公开版不保存作品密钥；创作者工作台的在线展示数据仅保存在当前浏览器。守秘人控制台仍需独立作品密钥。</small></div>'
        : '') + '</article>';
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }

  function renderWorks(works, user) {
    var panel = byId('works-panel');
    var list = byId('works-list');
    var canCreate = user && (user.authorStatus === 'verified' || user.role === 'owner');
    panel.hidden = !canCreate && (!works || works.length === 0);
    byId('new-work-link').hidden = !canCreate;
    list.innerHTML = works && works.length ? works.map(workMarkup).join('') : '<div class="works-empty"><span>◇</span><div><strong>还没有创建模组</strong><p>建立第一份作品档案后，就能导入信息、地图、规则与自动车卡器。</p></div><a href="studio.html?new=1">创建第一份模组 →</a></div>';
  }

  function renderProfile(payload) {
    currentProfile = payload;
    byId('profile-loading').hidden = true;
    byId('signed-out-card').hidden = true;
    byId('profile-content').hidden = false;
    byId('logout-button').hidden = false;
    byId('static-session-note').hidden = !isStaticMode();
    renderIdentity(payload.user);
    renderAuthor(payload.user);
    renderWorks(payload.works || [], payload.user);
    if (payload.user.role === 'owner' && !isStaticMode()) loadApplications();
    else byId('applications-panel').hidden = true;
  }

  function loadProfile() {
    return auth.profile().then(renderProfile).catch(function (error) {
      if (error.status === 401) showSignedOut();
      else {
        showSignedOut();
        message(byId('profile-login-error'), error.message, true);
      }
    });
  }

  function applicationMarkup(user) {
    var application = user.authorApplication || {};
    var pending = user.authorStatus === 'pending';
    return '<article class="application-card" data-application="' + escapeAttribute(user.id) + '">' +
      '<div><h3>' + escapeHtml(displayName(user)) + '</h3>' +
      '<small>账号 ' + escapeHtml(user.account) + ' · ' + escapeHtml(formatDate(application.submittedAt)) + ' · ' + escapeHtml(authorLabel(user.authorStatus)) + '</small>' +
      '<p>' + escapeHtml(application.statement || '') + '</p></div>' +
      (pending ? '<div class="review-actions"><button class="approve" type="button" data-review="verified">通过</button><button class="reject" type="button" data-review="rejected">拒绝</button></div>' : '') +
      '</article>';
  }

  function loadApplications() {
    var panel = byId('applications-panel');
    panel.hidden = false;
    auth.listAuthorApplications().then(function (payload) {
      var applications = payload.applications || [];
      byId('applications-count').textContent = applications.length + ' 份申请';
      byId('applications-list').innerHTML = applications.length
        ? applications.map(applicationMarkup).join('')
        : '<p class="empty-applications">目前还没有作者认证申请。</p>';
    }).catch(function (error) {
      byId('applications-list').innerHTML = '<p class="empty-applications">' + escapeHtml(error.message) + '</p>';
    });
  }

  function bindEvents() {
    var loginForm = byId('profile-login-form');
    var profileForm = byId('profile-form');
    var authorForm = byId('author-form');
    var bioInput = byId('bio-input');
    var displayNameInput = byId('display-name-input');
    var avatarInput = byId('avatar-input');
    var avatarMessage = byId('avatar-message');

    loginForm.addEventListener('submit', function (event) {
      event.preventDefault();
      message(byId('profile-login-error'), '', false);
      setBusy(loginForm, true);
      auth.login(loginForm.elements.account.value, loginForm.elements.password.value)
        .then(function () { loginForm.reset(); return loadProfile(); })
        .catch(function (error) { message(byId('profile-login-error'), error.message, true); })
        .finally(function () { setBusy(loginForm, false); });
    });

    byId('logout-button').addEventListener('click', function () {
      auth.logout().then(function () {
        currentProfile = null;
        showSignedOut();
        toast('已经安全退出账号。');
      }).catch(function (error) { toast(error.message); });
    });

    bioInput.addEventListener('input', function () {
      byId('bio-count').textContent = String(bioInput.value.length);
    });

    displayNameInput.addEventListener('input', function () {
      if (!pendingAvatar) updateAvatarPreview();
    });

    avatarInput.addEventListener('change', function () {
      var file = avatarInput.files && avatarInput.files[0];
      if (!file) return;
      var saveButton = profileForm.querySelector('[type="submit"]');
      avatarProcessing = true;
      saveButton.disabled = true;
      message(avatarMessage, '正在裁剪和压缩头像…', false);
      prepareAvatar(file).then(function (avatar) {
        pendingAvatar = avatar;
        updateAvatarPreview();
        message(avatarMessage, '头像已准备好，点击下方按钮保存。', false);
      }).catch(function (error) {
        message(avatarMessage, error.message, true);
      }).finally(function () {
        avatarProcessing = false;
        saveButton.disabled = false;
        avatarInput.value = '';
      });
    });

    byId('avatar-remove').addEventListener('click', function () {
      pendingAvatar = '';
      updateAvatarPreview();
      message(avatarMessage, '头像已移除，点击下方按钮保存。', false);
    });

    profileForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (avatarProcessing) {
        message(byId('profile-message'), '头像仍在处理中，请稍候。', true);
        return;
      }
      message(byId('profile-message'), '', false);
      setBusy(profileForm, true);
      auth.updateProfile(profileForm.elements.displayName.value, profileForm.elements.bio.value, pendingAvatar)
        .then(function (payload) {
          renderProfile(payload);
          message(avatarMessage, '', false);
          message(byId('profile-message'), '昵称、头像和个人资料已经保存。', false);
        }).catch(function (error) {
          message(byId('profile-message'), error.message, true);
        }).finally(function () { setBusy(profileForm, false); });
    });

    authorForm.addEventListener('submit', function (event) {
      event.preventDefault();
      message(byId('author-message'), '', false);
      setBusy(authorForm, true);
      auth.applyForAuthor(authorForm.elements.statement.value)
        .then(function (payload) {
          authorForm.reset();
          renderProfile(payload);
          toast('作者认证申请已提交。');
        }).catch(function (error) {
          message(byId('author-message'), error.message, true);
        }).finally(function () { setBusy(authorForm, false); });
    });

    byId('works-list').addEventListener('click', function (event) {
      var toggle = event.target.closest('[data-key-toggle]');
      var copy = event.target.closest('[data-key-copy]');
      if (toggle) {
        var target = byId(toggle.getAttribute('data-key-toggle'));
        var showing = target.type === 'text';
        target.type = showing ? 'password' : 'text';
        toggle.textContent = showing ? '显示' : '隐藏';
      }
      if (copy) {
        var input = byId(copy.getAttribute('data-key-copy'));
        if (!input || !input.value) return;
        navigator.clipboard.writeText(input.value).then(function () { toast('作品密钥已复制。'); })
          .catch(function () { input.type = 'text'; input.select(); toast('请按 Ctrl+C 复制作品密钥。'); });
      }
    });

    byId('applications-list').addEventListener('click', function (event) {
      var button = event.target.closest('[data-review]');
      if (!button) return;
      var card = button.closest('[data-application]');
      var decision = button.getAttribute('data-review');
      Array.prototype.forEach.call(card.querySelectorAll('button'), function (item) { item.disabled = true; });
      auth.reviewAuthorApplication(card.getAttribute('data-application'), decision)
        .then(function () {
          toast(decision === 'verified' ? '作者认证已通过。' : '申请已标记为未通过。');
          loadApplications();
        }).catch(function (error) {
          toast(error.message);
          Array.prototype.forEach.call(card.querySelectorAll('button'), function (item) { item.disabled = false; });
        });
    });
  }

  if (!auth) {
    byId('profile-loading').innerHTML = '<p>账号组件未能加载，请返回首页重试。</p>';
    return;
  }

  bindEvents();
  auth.ready().then(function (user) {
    if (!user) showSignedOut();
    else loadProfile();
  });
}());
