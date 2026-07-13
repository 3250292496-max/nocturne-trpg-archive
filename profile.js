(function () {
  'use strict';

  var auth = window.NG_AUTH;
  var currentProfile = null;
  var toastTimer = null;

  function byId(id) { return document.getElementById(id); }

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
  }

  function renderIdentity(user) {
    byId('identity-name').textContent = user.displayName || user.account;
    byId('identity-account').textContent = '账号 · ' + user.account;
    byId('identity-avatar').textContent = String(user.displayName || user.account || '航').charAt(0);
    byId('role-badge').textContent = roleLabel(user);
    byId('author-badge').textContent = authorLabel(user.authorStatus);
    byId('locked-badge').hidden = !user.locked;
    byId('joined-date').textContent = formatDate(user.createdAt);
    byId('display-name-input').value = user.displayName || '';
    byId('bio-input').value = user.bio || '';
    byId('bio-count').textContent = String((user.bio || '').length);
  }

  function renderAuthor(user) {
    var verified = byId('author-verified');
    var pending = byId('author-pending');
    var form = byId('author-form');
    byId('author-status-label').textContent = authorLabel(user.authorStatus);
    verified.hidden = user.authorStatus !== 'verified';
    pending.hidden = user.authorStatus !== 'pending';
    form.hidden = user.authorStatus === 'verified' || user.authorStatus === 'pending';
    if (user.authorStatus === 'pending' && user.authorApplication) {
      byId('pending-statement').textContent = user.authorApplication.statement || '';
    }
    if (user.authorStatus === 'rejected') {
      form.querySelector('p').textContent = '上次申请未通过。你可以补充作品信息或更新创作计划后重新提交。';
    }
  }

  function workMarkup(work, index) {
    var value = work.accessKey || '';
    var hint = work.accessKeyConfigured ? '该密钥也用于进入《零之圣杯》守秘人控制台。' : '尚未配置 NG_ACCESS_KEY 或 .keeper-key。';
    return '<article class="work-card">' +
      '<div><p class="profile-eyebrow">WORK · ' + String(index + 1).padStart(2, '0') + '</p>' +
      '<h3>' + escapeHtml(work.title) + ' <small>' + escapeHtml(work.edition || '') + '</small></h3>' +
      '<p>' + escapeHtml(work.relationship || '作者') + '</p></div>' +
      '<div class="work-key"><label for="work-key-' + index + '">作品密钥</label>' +
      '<div class="key-control"><input id="work-key-' + index + '" type="password" readonly value="' + escapeAttribute(value) + '" placeholder="尚未配置">' +
      '<button type="button" data-key-toggle="work-key-' + index + '">显示</button>' +
      '<button type="button" data-key-copy="work-key-' + index + '"' + (value ? '' : ' disabled') + '>复制</button></div>' +
      '<small>' + escapeHtml(hint) + '</small></div></article>';
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }

  function renderWorks(works) {
    var panel = byId('works-panel');
    var list = byId('works-list');
    panel.hidden = !works || works.length === 0;
    list.innerHTML = works && works.length ? works.map(workMarkup).join('') : '';
  }

  function renderProfile(payload) {
    currentProfile = payload;
    byId('profile-loading').hidden = true;
    byId('signed-out-card').hidden = true;
    byId('profile-content').hidden = false;
    byId('logout-button').hidden = false;
    renderIdentity(payload.user);
    renderAuthor(payload.user);
    renderWorks(payload.works || []);
    if (payload.user.role === 'owner') loadApplications();
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
      '<div><h3>' + escapeHtml(user.displayName || user.account) + '</h3>' +
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

    profileForm.addEventListener('submit', function (event) {
      event.preventDefault();
      message(byId('profile-message'), '', false);
      setBusy(profileForm, true);
      auth.updateProfile(profileForm.elements.displayName.value, profileForm.elements.bio.value)
        .then(function (payload) {
          renderProfile(payload);
          message(byId('profile-message'), '个人资料已经保存。', false);
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
