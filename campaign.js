(function () {
  'use strict';

  var api = window.NGCampaign;
  var auth = window.NG_AUTH;
  if (!api) return;
  var selectedCampaignId = api.campaignIdFromLocation();
  var selectedRoom = null;
  var pendingImport = null;
  var archiveMutationPending = false;
  var toastTimer = null;
  var inviteToken = api.inviteTokenFromLocation();
  var versions = api.versions || {};
  var MAX_IMPORT_FILE_BYTES = 256 * 1024;
  var MAX_IMPORT_STATE_BYTES = 224 * 1024;

  function byId(id) { return document.getElementById(id); }
  function safe(value, maximum) { return api.safeText(value, maximum || 160); }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (part) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[part]; }); }
  function campaignOf(payload) { return payload && (payload.campaign || payload.room) || payload || {}; }
  function memberOf(payload) { return payload && (payload.member || payload.currentMember) || null; }
  function setStatus(element, message, kind) { element.textContent = message || ''; element.className = 'form-status' + (kind ? ' ' + kind : ''); }
  function setBusy(form, busy) {
    var roomLocked = form.id === 'create-invite-form' && (roomIsArchived() || archiveMutationPending);
    Array.prototype.forEach.call(form.querySelectorAll('button,input'), function (control) { control.disabled = busy || roomLocked; });
  }
  function showToast(message) { var toast = byId('campaign-toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2600); }
  function friendlyError(error) {
    if (!error) return '暂时无法完成操作。';
    if (error.kind === 'offline') return '当前处于离线状态，请恢复网络后重试。';
    if (error.kind === 'timeout') return '连接超时，请稍后重试。';
    if (error.status === 401 || error.kind === 'unauthenticated') return '请先登录账号。';
    if (error.status === 403 || error.kind === 'forbidden') return '你没有操作这个团房的权限。';
    return error.message || '暂时无法完成操作。';
  }
  function campaignIdFromJoin(payload) {
    var campaign = campaignOf(payload);
    return safe(campaign.id || payload && (payload.campaignId || payload.id), 120);
  }
  function currentRoomVersion() {
    var campaign = campaignOf(selectedRoom);
    var version = Number(selectedRoom && selectedRoom.snapshot && selectedRoom.snapshot.version !== undefined ? selectedRoom.snapshot.version : campaign.version);
    return Number.isSafeInteger(version) && version >= 0 ? version : 0;
  }
  function roomIsArchived() { return campaignOf(selectedRoom).status === 'archived'; }
  function roomIsHost() {
    var campaign = campaignOf(selectedRoom);
    var member = memberOf(selectedRoom) || campaign.member || {};
    return Boolean(member.role === 'host' || selectedRoom && selectedRoom.role === 'host' || campaign.role === 'host');
  }
  function refreshAfterConflict(error, statusElement) {
    if (!error || (error.code !== 'version_conflict' && error.kind !== 'conflict' && error.status !== 409)) return false;
    setStatus(statusElement, '团房刚刚有新变化，已刷新到最新版；请确认后再重试这项操作。', 'error');
    return Promise.all([loadRoom(selectedCampaignId, false), refreshCampaigns()]);
  }
  function setRoomLinkReadOnly(link, href, readOnly) {
    if (readOnly) {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('tabindex', '-1');
      link.title = '团房已归档；恢复后才能继续进入。';
      return;
    }
    link.href = href;
    link.removeAttribute('aria-disabled');
    link.removeAttribute('tabindex');
    link.removeAttribute('title');
  }
  function renderRoomWriteState(isHost) {
    var archived = roomIsArchived();
    var writeLocked = archived || archiveMutationPending;
    var readonlyMessage = '团房已归档并处于只读状态。恢复后才能邀请玩家、导入存档或进入主持台／玩家页；导出仍可使用。';
    byId('room-status').textContent = archived ? '已归档 · 只读' : '同步进行中';
    byId('transfer-copy').textContent = archived ? readonlyMessage : '旧本机战役只会在你选择文件并确认后上传；导入成功前不会删除原文件或本机存档。';

    Array.prototype.forEach.call(byId('create-invite-form').querySelectorAll('button,input'), function (control) { control.disabled = writeLocked; });
    Array.prototype.forEach.call(document.querySelectorAll('#room [data-remove-member], #room [data-revoke-invite], #room [data-rotate-invite]'), function (control) { control.disabled = writeLocked; });
    byId('choose-room-import').disabled = writeLocked;
    byId('room-import-file').disabled = writeLocked;
    byId('confirm-room-import').disabled = writeLocked;

    var campaign = campaignOf(selectedRoom);
    setRoomLinkReadOnly(byId('open-room-console'), 'gm.html?campaign=' + encodeURIComponent(campaign.id), writeLocked);
    setRoomLinkReadOnly(byId('open-room-player'), 'player.html?campaign=' + encodeURIComponent(campaign.id), writeLocked);
    byId('open-room-console').hidden = !isHost;

    var archiveButton = byId('archive-room');
    archiveButton.textContent = archived ? '恢复团房' : '归档团房';
    archiveButton.disabled = archiveMutationPending;
    archiveButton.setAttribute('aria-label', archived ? '恢复团房并重新允许团务操作' : '归档团房并设为只读');
  }
  function inviteTokenFromText(value) {
    var text = safe(value, 1200);
    if (!text) return '';
    try {
      var url = new URL(text, location.href);
      var fromUrl = api.inviteTokenFromLocation(url);
      if (fromUrl) return fromUrl;
    } catch (error) {}
    return text.replace(/^#?(?:join|invite|token)=/, '').split('&')[0].trim();
  }
  function initials(name) { return safe(name, 2).toLocaleUpperCase() || '旅'; }
  function formatDate(value) {
    var date = new Date(value || '');
    return Number.isNaN(date.getTime()) ? '时间待定' : date.toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }
  function scrollForRoute() {
    var route = api.fragmentRoute();
    if (!route) return;
    setTimeout(function () { var element = byId(route); if (element) element.scrollIntoView({ block:'start' }); }, 80);
  }

  function renderAccount(user) {
    var summary = byId('account-summary');
    var loginForm = byId('campaign-login-form');
    var createButton = byId('create-campaign-form').querySelector('[type="submit"]');
    if (user) {
      summary.hidden = false;
      summary.innerHTML = '<strong>' + escapeHtml(user.displayName || user.account || '已登录') + '</strong><span>@' + escapeHtml(user.account || 'account') + ' · 在线团房使用服务端账号会话</span>';
      loginForm.hidden = true;
      createButton.disabled = false;
      byId('campaign-service-state').textContent = '账号与团房服务在线';
      byId('campaign-service-state').className = 'campaign-service-state online';
    } else {
      summary.hidden = true;
      loginForm.hidden = false;
      createButton.disabled = true;
      byId('campaign-service-state').textContent = '可作为访客加入';
      byId('campaign-service-state').className = 'campaign-service-state';
    }
  }

  function renderCampaignList(payload) {
    var campaigns = payload && (payload.campaigns || payload.rooms || payload.items) || [];
    var container = byId('campaign-list');
    if (!campaigns.length) { container.innerHTML = '<p class="campaign-empty">还没有团房。创建《零之圣杯》房间后，版本会固定为 v3.2 / v2.1。</p>'; return; }
    container.innerHTML = campaigns.map(function (campaign) {
      var role = campaign.role || campaign.memberRole || campaign.member && campaign.member.role;
      var status = campaign.status === 'archived' ? '已归档' : '进行中';
      return '<article class="campaign-room-card"><span>' + escapeHtml(role === 'host' ? 'KEEPER · 主持' : 'PLAYER · 玩家') + '</span><h4>' + escapeHtml(campaign.title || '未命名团房') + '</h4><p>《零之圣杯》v' + escapeHtml(campaign.moduleVersion || versions.campaignContentVersion || '3.2') + ' · 规则 ' + escapeHtml(campaign.rulesetVersion || versions.rulesetVersion || '2.1') + '<br>' + escapeHtml(status) + ' · 状态版本 ' + escapeHtml(campaign.version || 0) + '</p><footer><span>' + escapeHtml(campaign.memberCount || 1) + ' 名成员</span><button type="button" data-open-campaign="' + escapeHtml(campaign.id) + '">打开大厅</button></footer></article>';
    }).join('');
    container.querySelectorAll('[data-open-campaign]').forEach(function (button) { button.addEventListener('click', function () { loadRoom(button.getAttribute('data-open-campaign'), true); }); });
  }

  function refreshCampaigns() {
    var user = auth && auth.currentUser && auth.currentUser();
    if (!user) { renderCampaignList({ campaigns:[] }); return Promise.resolve(); }
    byId('refresh-campaigns').disabled = true;
    return api.listCampaigns().then(renderCampaignList).catch(function (error) {
      byId('campaign-list').innerHTML = '<p class="campaign-empty">' + escapeHtml(friendlyError(error)) + '</p>';
    }).finally(function () { byId('refresh-campaigns').disabled = false; });
  }

  function renderMembers(payload, isHost) {
    var campaign = campaignOf(payload);
    var members = payload.members || campaign.members || [];
    var characters = payload.characters || campaign.characters || [];
    byId('member-count').textContent = members.length + ' 人';
    byId('room-members').innerHTML = members.length ? members.map(function (member) {
      var character = characters.find(function (item) { return item.memberId === member.id || item.ownerMemberId === member.id; });
      var roleLabel = member.role === 'host' ? '主持人' : '玩家';
      var characterLabel = character ? (character.name || character.publicName || '角色已提交') : member.role === 'host' ? '管理团房' : '尚未提交角色';
      return '<article class="room-member"><span class="room-member-avatar" aria-hidden="true">' + escapeHtml(initials(member.displayName || member.nickname)) + '</span><div><strong>' + escapeHtml(member.displayName || member.nickname || '未署名成员') + '</strong><span>' + escapeHtml(roleLabel) + ' · ' + escapeHtml(characterLabel) + '</span></div><div class="room-member-actions"><small>' + escapeHtml(member.online ? '在线' : member.lastSeenAt ? formatDate(member.lastSeenAt) : '已加入') + '</small>' + (isHost && member.role === 'player' && member.status !== 'removed' ? '<button type="button" data-remove-member="' + escapeHtml(member.id) + '">移除</button>' : '') + '</div></article>';
    }).join('') : '<p class="campaign-empty">尚无成员。</p>';
    byId('room-members').querySelectorAll('[data-remove-member]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!confirm('将这名玩家移出团房？其团房会话会立即失效，角色与审计历史仍会保留。')) return;
        button.disabled = true;
        api.sendCampaignCommand(selectedCampaignId, 'member.remove', { memberId:button.getAttribute('data-remove-member') }, { baseVersion:currentRoomVersion() }).then(function () {
          showToast('成员已移出团房');
          return loadRoom(selectedCampaignId, false);
        }).catch(function (error) { if (!refreshAfterConflict(error, byId('transfer-status'))) setStatus(byId('transfer-status'), friendlyError(error), 'error'); button.disabled = false; });
      });
    });
  }

  function renderInvites(payload, isHost) {
    var campaign = campaignOf(payload);
    var invites = payload.invites || campaign.invites || [];
    byId('invite-panel').hidden = !isHost;
    if (!isHost) return;
    byId('room-invites').innerHTML = invites.length ? invites.map(function (invite) {
      var active = !invite.revokedAt && (!invite.expiresAt || new Date(invite.expiresAt) > new Date());
      return '<article class="room-invite-row"><div><strong>' + escapeHtml(active ? '有效邀请' : '已失效邀请') + '</strong><span>使用 ' + escapeHtml(invite.useCount || invite.uses || 0) + ' / ' + escapeHtml(invite.maxUses || 8) + ' · 截止 ' + escapeHtml(formatDate(invite.expiresAt)) + '</span></div>' + (active ? '<div class="room-invite-actions"><button type="button" data-rotate-invite="' + escapeHtml(invite.id) + '">轮换</button><button type="button" data-revoke-invite="' + escapeHtml(invite.id) + '">撤销</button></div>' : '') + '</article>';
    }).join('') : '<p class="campaign-empty">尚未生成邀请。</p>';
    byId('room-invites').querySelectorAll('[data-revoke-invite]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!confirm('撤销这条邀请？已加入的成员不会被移除。')) return;
        button.disabled = true;
        api.revokeInvite(selectedCampaignId, button.getAttribute('data-revoke-invite'), { baseVersion:currentRoomVersion() }).then(function () { showToast('邀请已撤销'); return loadRoom(selectedCampaignId, false); }).catch(function (error) { if (!refreshAfterConflict(error, byId('invite-status'))) setStatus(byId('invite-status'), friendlyError(error), 'error'); button.disabled = false; });
      });
    });
    byId('room-invites').querySelectorAll('[data-rotate-invite]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!confirm('轮换这条邀请？旧链接会立即失效，并生成一条新的 7 天／8 次邀请。')) return;
        button.disabled = true;
        api.rotateInvite(selectedCampaignId, button.getAttribute('data-rotate-invite'), { expiresInDays:7, maxUses:8, baseVersion:currentRoomVersion() }).then(function (payload) {
          var token = safe(payload.token || payload.inviteToken || payload.invite && payload.invite.token, 512);
          var joinUrl = safe(payload.joinUrl || payload.invite && payload.invite.joinUrl, 1200) || new URL('campaign.html#join=' + encodeURIComponent(token), location.href).href;
          byId('new-invite').hidden = false;
          byId('new-invite-url').value = joinUrl;
          setStatus(byId('invite-status'), '邀请已轮换；旧链接已经失效，新链接只在本次显示。', 'success');
          return loadRoom(selectedCampaignId, false);
        }).catch(function (error) { if (!refreshAfterConflict(error, byId('invite-status'))) setStatus(byId('invite-status'), friendlyError(error), 'error'); button.disabled = false; });
      });
    });
  }

  function renderRoom(payload) {
    selectedRoom = payload;
    var campaign = campaignOf(payload);
    var member = memberOf(payload) || campaign.member || {};
    var isHost = roomIsHost();
    byId('room').hidden = false;
    byId('room-title').textContent = campaign.title || '团房大厅';
    byId('room-status-dot').style.background = campaign.status === 'archived' ? '#929a9d' : '#72b897';
    byId('room-module-version').textContent = 'v' + (campaign.moduleVersion || versions.campaignContentVersion || '3.2');
    byId('room-rules-version').textContent = campaign.rulesetVersion || versions.rulesetVersion || '2.1';
    byId('room-state-version').textContent = String(campaign.version || payload.snapshot && payload.snapshot.version || 0);
    byId('transfer-panel').hidden = !isHost;
    /* The service exposes an explicit, non-identifying binding flag. Never infer
       guest state from account/user identifiers, which are intentionally absent
       from room projections. */
    var guest = Boolean(member && member.role === 'player' && (member.isGuest === true || member.needsAccountBinding === true));
    byId('guest-panel').hidden = !guest;
    renderMembers(payload, isHost);
    renderInvites(payload, isHost);
    renderRoomWriteState(isHost);
  }

  function loadRoom(id, updateAddress) {
    selectedCampaignId = safe(id, 120);
    if (!selectedCampaignId) return Promise.resolve();
    byId('room').hidden = false;
    byId('room-title').textContent = '正在读取团房…';
    if (updateAddress) {
      var url = new URL(location.href); url.searchParams.set('campaign', selectedCampaignId); history.pushState({}, '', url.pathname + url.search + '#room');
    }
    return api.getCampaign(selectedCampaignId).then(function (payload) { renderRoom(payload); byId('room').scrollIntoView({ block:'start' }); return payload; }).catch(function (error) {
      byId('room').hidden = true; showToast(friendlyError(error));
    });
  }

  byId('join-form').addEventListener('submit', function (event) {
    event.preventDefault(); var form = event.currentTarget;
    var token = form.elements.token.dataset.token || inviteTokenFromText(form.elements.token.value || inviteToken);
    var nickname = safe(form.elements.nickname.value, 60);
    if (!token) { setStatus(byId('join-status'), '邀请链接里没有可用令牌。', 'error'); return; }
    setBusy(form, true); setStatus(byId('join-status'), '正在安全加入团房…');
    api.joinCampaign(token, nickname).then(function (payload) {
      var id = campaignIdFromJoin(payload); if (!id) throw new Error('服务器没有返回团房编号。');
      history.replaceState({}, '', location.pathname + location.search + '#join');
      setStatus(byId('join-status'), '加入成功，正在进入玩家页。', 'success');
      location.href = 'player.html?campaign=' + encodeURIComponent(id);
    }).catch(function (error) { setStatus(byId('join-status'), friendlyError(error), 'error'); setBusy(form, false); });
  });

  byId('campaign-login-form').addEventListener('submit', function (event) {
    event.preventDefault(); var form = event.currentTarget; setBusy(form, true); setStatus(byId('login-status'), '正在登录…');
    auth.login(form.elements.account.value, form.elements.password.value).then(function (user) { form.elements.password.value = ''; renderAccount(user); setStatus(byId('login-status'), '登录成功。', 'success'); return refreshCampaigns(); }).catch(function (error) { setStatus(byId('login-status'), friendlyError(error), 'error'); }).finally(function () { setBusy(form, false); });
  });

  byId('create-campaign-form').addEventListener('submit', function (event) {
    event.preventDefault(); var form = event.currentTarget; setBusy(form, true); setStatus(byId('create-status'), '正在创建并锁定版本快照…');
    api.createCampaign({ title:form.elements.title.value, moduleId:form.elements.moduleId.value }).then(function (payload) {
      var id = campaignIdFromJoin(payload); if (!id) throw new Error('服务器没有返回团房编号。');
      setStatus(byId('create-status'), '团房已创建。', 'success'); showToast('团房已创建并锁定 v3.2 / v2.1');
      return refreshCampaigns().then(function () { return loadRoom(id, true); });
    }).catch(function (error) { setStatus(byId('create-status'), friendlyError(error), 'error'); }).finally(function () { setBusy(form, false); form.querySelector('[type="submit"]').disabled = !(auth && auth.currentUser && auth.currentUser()); });
  });

  byId('create-invite-form').addEventListener('submit', function (event) {
    event.preventDefault(); var form = event.currentTarget;
    if (roomIsArchived()) { setStatus(byId('invite-status'), '团房已归档；请先恢复团房。', 'error'); return; }
    setBusy(form, true); setStatus(byId('invite-status'), '正在生成高熵邀请令牌…');
    api.createInvite(selectedCampaignId, { expiresInDays:form.elements.expiresInDays.value, maxUses:form.elements.maxUses.value, baseVersion:currentRoomVersion() }).then(function (payload) {
      var token = safe(payload.token || payload.inviteToken || payload.invite && payload.invite.token, 512);
      var joinUrl = safe(payload.joinUrl || payload.invite && payload.invite.joinUrl, 1200) || new URL('campaign.html#join=' + encodeURIComponent(token), location.href).href;
      if (!token && !/#(?:join|invite)=/.test(joinUrl)) throw new Error('服务器没有返回邀请令牌。');
      byId('new-invite').hidden = false; byId('new-invite-url').value = joinUrl;
      setStatus(byId('invite-status'), '邀请已生成；令牌只在本次显示。', 'success');
      return loadRoom(selectedCampaignId, false);
    }).catch(function (error) { if (!refreshAfterConflict(error, byId('invite-status'))) setStatus(byId('invite-status'), friendlyError(error), 'error'); }).finally(function () { setBusy(form, false); });
  });
  byId('copy-invite').addEventListener('click', function () { navigator.clipboard.writeText(byId('new-invite-url').value).then(function () { showToast('邀请链接已复制'); }).catch(function () { byId('new-invite-url').select(); document.execCommand('copy'); showToast('邀请链接已复制'); }); });
  byId('refresh-campaigns').addEventListener('click', refreshCampaigns);
  byId('close-room-detail').addEventListener('click', function () { byId('room').hidden = true; document.querySelector('.campaign-room-list').scrollIntoView({ block:'start' }); });
  byId('export-room').addEventListener('click', function () { byId('export-room').disabled = true; api.exportCampaign(selectedCampaignId).then(function (payload) { (window.NG_RESILIENCE || {}).downloadJson('零之圣杯-在线团房-' + new Date().toISOString().slice(0,10) + '.json', payload); showToast('团房备份已导出'); }).catch(function (error) { setStatus(byId('transfer-status'), friendlyError(error), 'error'); }).finally(function () { byId('export-room').disabled = false; }); });
  byId('choose-room-import').addEventListener('click', function () { if (!roomIsArchived()) byId('room-import-file').click(); });
  byId('room-import-file').addEventListener('change', function (event) {
    var file = event.target.files[0]; event.target.value = ''; if (!file) return;
    if (roomIsArchived()) { setStatus(byId('transfer-status'), '团房已归档；请先恢复团房。', 'error'); return; }
    if (file.size > MAX_IMPORT_FILE_BYTES) { setStatus(byId('transfer-status'), 'JSON 过大；导入文件上限为 256 KB。', 'error'); return; }
    var reader = new FileReader(); reader.onload = function () { try {
      var parsed = JSON.parse(reader.result); var exported = parsed.format === 'ng-campaign-export-v1' && parsed.data && typeof parsed.data === 'object';
      var state = exported ? parsed.data.snapshot && parsed.data.snapshot.state : parsed.state || parsed.snapshot && parsed.snapshot.state || parsed;
      if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('invalid');
      var candidate = exported ? parsed : { state:state, characters:parsed.characters || state.roster || [] };
      setStatus(byId('transfer-status'), '正在由服务器校验导入摘要…');
      api.previewCampaignImport(selectedCampaignId, candidate).then(function (payload) {
        var summary = payload.summary || {};
        if (Number(summary.stateBytes || 0) > MAX_IMPORT_STATE_BYTES) throw new Error('存档状态超过服务器 224 KB 上限。');
        pendingImport = candidate;
        byId('import-preview-title').textContent = file.name;
        byId('import-preview-copy').textContent = '服务器预检：状态 ' + Math.ceil(Number(summary.stateBytes || 0) / 1024) + ' KB；角色 ' + Number(summary.characterCount || 0) + ' 名；本机原数据不会被删除。';
        byId('import-preview').hidden = false;
        setStatus(byId('transfer-status'), '服务器预检通过，请核对摘要后确认导入。', 'success');
      }).catch(function (error) { pendingImport = null; byId('import-preview').hidden = true; setStatus(byId('transfer-status'), friendlyError(error), 'error'); });
    } catch (error) { setStatus(byId('transfer-status'), '无法读取这份战役 JSON。', 'error'); } }; reader.readAsText(file);
  });
  byId('cancel-room-import').addEventListener('click', function () { pendingImport = null; byId('import-preview').hidden = true; });
  byId('confirm-room-import').addEventListener('click', function () { if (!pendingImport || roomIsArchived()) { if (roomIsArchived()) setStatus(byId('transfer-status'), '团房已归档；请先恢复团房。', 'error'); return; } var button = byId('confirm-room-import'); button.disabled = true; api.importCampaign(selectedCampaignId, pendingImport, { baseVersion:currentRoomVersion() }).then(function () { pendingImport = null; byId('import-preview').hidden = true; setStatus(byId('transfer-status'), '本机存档已导入在线团房。', 'success'); showToast('在线快照已更新'); return loadRoom(selectedCampaignId, false); }).catch(function (error) { if (!refreshAfterConflict(error, byId('transfer-status'))) setStatus(byId('transfer-status'), friendlyError(error), 'error'); }).finally(function () { button.disabled = roomIsArchived(); }); });
  byId('archive-room').addEventListener('click', function () {
    if (archiveMutationPending) return;
    var restoring = roomIsArchived();
    var question = restoring ? '恢复这个团房？恢复后可继续邀请玩家和修改团务状态。' : '归档这个团房？归档后保留历史，但不能继续修改团务状态。';
    if (!confirm(question)) return;
    archiveMutationPending = true;
    renderRoomWriteState(roomIsHost());
    setStatus(byId('transfer-status'), restoring ? '正在恢复团房…' : '正在归档团房…');
    var request = restoring ? api.restoreCampaign : api.archiveCampaign;
    request(selectedCampaignId, { baseVersion:currentRoomVersion() }).then(function () {
      showToast(restoring ? '团房已恢复' : '团房已归档');
      setStatus(byId('transfer-status'), restoring ? '团房已恢复，可以继续操作。' : '团房已归档，当前为只读状态。', 'success');
      return Promise.all([loadRoom(selectedCampaignId, false), refreshCampaigns()]);
    }).catch(function (error) {
      var refresh = refreshAfterConflict(error, byId('transfer-status'));
      if (refresh) return refresh;
      setStatus(byId('transfer-status'), friendlyError(error), 'error');
    }).finally(function () {
      archiveMutationPending = false;
      renderRoomWriteState(roomIsHost());
    });
  });
  byId('bind-campaign').addEventListener('click', function () { var button = byId('bind-campaign'); button.disabled = true; api.bindCampaign(selectedCampaignId).then(function () { setStatus(byId('bind-status'), '访客身份与角色已绑定到账号。', 'success'); return loadRoom(selectedCampaignId, false); }).catch(function (error) { setStatus(byId('bind-status'), friendlyError(error), 'error'); }).finally(function () { button.disabled = false; }); });

  if (inviteToken) { byId('join-token').value = '邀请令牌已从当前安全链接读取'; byId('join-token').dataset.token = inviteToken; byId('join-token').readOnly = true; }
  if (new URLSearchParams(location.search).get('module')) byId('campaign-module-input').value = safe(new URLSearchParams(location.search).get('module'), 80) || 'null-grail';
  window.addEventListener('popstate', function () { var id = api.campaignIdFromLocation(); if (id) loadRoom(id, false); });
  window.addEventListener('hashchange', scrollForRoute);

  var ready = auth && auth.ready ? auth.ready() : Promise.resolve(null);
  ready.then(function (user) { renderAccount(user); return refreshCampaigns(); }).then(function () { if (selectedCampaignId) return loadRoom(selectedCampaignId, false); }).catch(function (error) { byId('campaign-service-state').textContent = friendlyError(error); byId('campaign-service-state').className = 'campaign-service-state error'; }).finally(scrollForRoute);
}());
