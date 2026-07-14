(function () {
  'use strict';

  var api = window.NGCampaign;
  var auth = window.NG_AUTH;
  if (!api) return;
  var selectedCampaignId = api.campaignIdFromLocation();
  var selectedRoom = null;
  var pendingImport = null;
  var toastTimer = null;
  var inviteToken = api.inviteTokenFromLocation();
  var versions = api.versions || {};
  var MAX_IMPORT_FILE_BYTES = 256 * 1024;
  var MAX_IMPORT_STATE_BYTES = 224 * 1024;
  var roomTransport = null;
  var roomTransportUnsubscribers = [];
  var roomTransportStatus = null;
  var roomPresence = [];
  var newRoomChecklistId = '';
  var inviteCampaignId = '';

  function byId(id) { return document.getElementById(id); }
  function safe(value, maximum) { return api.safeText(value, maximum || 160); }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (part) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[part]; }); }
  function campaignOf(payload) { return payload && (payload.campaign || payload.room) || payload || {}; }
  function memberOf(payload) { return payload && (payload.member || payload.currentMember) || null; }
  function setStatus(element, message, kind) { element.textContent = message || ''; element.className = 'form-status' + (kind ? ' ' + kind : ''); }
  function setBusy(form, busy) { Array.prototype.forEach.call(form.querySelectorAll('button,input'), function (control) { control.disabled = busy; }); }
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
  function refreshAfterConflict(error, statusElement) {
    if (!error || (error.code !== 'version_conflict' && error.kind !== 'conflict' && error.status !== 409)) return false;
    setStatus(statusElement, '团房刚刚有新变化，已刷新到最新版；请确认后再重试这项操作。', 'error');
    loadRoom(selectedCampaignId, false);
    return true;
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
  function roomTitleResult(value) {
    var raw = String(value == null ? '' : value);
    var trimmed = raw.trim();
    if (!trimmed) return { error:'请输入团房名称。' };
    if (raw !== trimmed) return { error:'团房名称开头和结尾不能有空白字符。' };
    var length = Array.from(trimmed).length;
    if (length < 2 || length > 80) return { error:'团房名称必须为 2–80 个字符。' };
    return { value:trimmed };
  }
  function playerNicknameResult(value) {
    var raw = String(value == null ? '' : value);
    var normalized = typeof raw.normalize === 'function' ? raw.normalize('NFKC').trim() : raw.trim();
    if (!normalized) return { error:'请输入团内昵称。' };
    if (normalized.indexOf('\u0000') !== -1) return { error:'团内昵称包含无效字符。' };
    var length = Array.from(normalized).length;
    if (length < 1 || length > 40) return { error:'团内昵称必须为 1–40 个字符。' };
    return { value:normalized };
  }
  function validateNicknameInput(input, statusElement) {
    var result = playerNicknameResult(input.value);
    input.setCustomValidity(result.error || '');
    input.setAttribute('aria-invalid', result.error ? 'true' : 'false');
    if (statusElement) setStatus(statusElement, result.error || '', result.error ? 'error' : '');
    return result;
  }
  function validateRoomTitleInput(input, statusElement) {
    var result = roomTitleResult(input.value);
    input.setCustomValidity(result.error || '');
    input.setAttribute('aria-invalid', result.error ? 'true' : 'false');
    if (statusElement) setStatus(statusElement, result.error || '', result.error ? 'error' : '');
    return result;
  }
  function currentRoomMember(payload) {
    var campaign = campaignOf(payload || selectedRoom);
    return memberOf(payload || selectedRoom) || campaign.member || {};
  }
  function isHostForRoom(payload) {
    var campaign = campaignOf(payload || selectedRoom);
    var member = currentRoomMember(payload || selectedRoom);
    return member.role === 'host' || payload && payload.role === 'host' || campaign.role === 'host';
  }
  function isArchivedRoom(payload) { return campaignOf(payload || selectedRoom).status === 'archived'; }
  function disposeRoomTransport() {
    roomTransportUnsubscribers.splice(0).forEach(function (unsubscribe) { try { unsubscribe(); } catch (error) {} });
    if (roomTransport) { try { roomTransport.dispose(); } catch (error) {} }
    roomTransport = null;
    roomTransportStatus = null;
    roomPresence = [];
  }
  function displayConnectionStatus(status) {
    roomTransportStatus = status || null;
    var element = byId('room-connection-status');
    var dot = byId('room-status-dot');
    var reconnect = byId('room-reconnect');
    if (!element || !dot || !reconnect) return;
    var state = status && status.state || 'idle';
    var label = status && status.label || '尚未连接';
    var detail = status && status.message ? ' · ' + safe(status.message, 120) : '';
    element.textContent = label + detail;
    dot.style.background = state === 'online' ? '#72b897' : state === 'syncing' || state === 'connecting' || state === 'reconnecting' ? '#d4ad6b' : '#c66f72';
    dot.style.boxShadow = state === 'online' ? '0 0 14px rgba(114,184,151,.5)' : state === 'syncing' || state === 'connecting' || state === 'reconnecting' ? '0 0 14px rgba(212,173,107,.45)' : '0 0 14px rgba(198,111,114,.45)';
    reconnect.disabled = state === 'online' || state === 'syncing' || state === 'connecting' || state === 'reconnecting';
    reconnect.textContent = state === 'online' ? '已连接' : state === 'reconnecting' ? '正在重连…' : '手动重连';
  }
  function applyRoomPresence(presence) {
    roomPresence = presence && Array.isArray(presence.members) ? presence.members : [];
    if (!selectedRoom) return;
    var known = Object.create(null);
    roomPresence.forEach(function (member) { if (member && member.id) known[member.id] = member; });
    var campaign = campaignOf(selectedRoom);
    var members = selectedRoom.members || campaign.members || [];
    var merged = members.map(function (member) { return known[member.id] ? Object.assign({}, member, { online:known[member.id].online === true }) : member; });
    selectedRoom = Object.assign({}, selectedRoom, { members:merged });
    renderMembers(selectedRoom, isHostForRoom(selectedRoom));
    updateRoomContext(selectedRoom, isHostForRoom(selectedRoom));
  }
  function beginRoomTransport(payload) {
    var campaign = campaignOf(payload);
    var id = safe(campaign.id, 120);
    if (!id || !api.createRoomTransport) return;
    if (roomTransport && roomTransport.campaignId === id && !roomTransport.disposed) {
      if (roomTransport.status !== 'offline' && roomTransport.status !== 'closed' && roomTransport.status !== 'failed') return;
      if (typeof roomTransport.reconnect === 'function') {
        displayConnectionStatus({ state:'reconnecting', label:'正在重新连接' });
        roomTransport.reconnect().catch(function () { /* The status listener exposes another retry. */ });
        return;
      }
      disposeRoomTransport();
    }
    disposeRoomTransport();
    roomTransport = api.createRoomTransport({ campaignId:id, role:isHostForRoom(payload) ? 'host' : 'player', version:currentRoomVersion() });
    roomTransportUnsubscribers.push(roomTransport.on('status', displayConnectionStatus));
    roomTransportUnsubscribers.push(roomTransport.on('presence', applyRoomPresence));
    roomTransportUnsubscribers.push(roomTransport.on('snapshot', function (snapshot) {
      if (!snapshot || safe(campaignOf(snapshot).id, 120) !== selectedCampaignId) return;
      var titleInput = byId('rename-room-title');
      var editingTitle = document.activeElement === titleInput;
      renderRoom(snapshot, { preserveTitleInput:editingTitle, skipTransport:true });
    }));
    roomTransportUnsubscribers.push(roomTransport.on('event', function (event) {
      var kind = safe(event && (event.kind || event.type), 80);
      if (/^(campaign\.|member\.)/.test(kind)) loadRoom(selectedCampaignId, false);
    }));
    roomTransportUnsubscribers.push(roomTransport.on('error', function (error) { displayConnectionStatus({ state:'failed', label:'连接失败', message:friendlyError(error) }); }));
    displayConnectionStatus({ state:'syncing', label:'正在同步' });
    roomTransport.connect().catch(function () { /* Status listener already renders a recoverable state. */ });
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
    var canManage = isHost && campaign.status !== 'archived';
    byId('member-count').textContent = members.length + ' 人';
    byId('room-members').innerHTML = members.length ? members.map(function (member) {
      var character = characters.find(function (item) { return item.memberId === member.id || item.ownerMemberId === member.id; });
      var roleLabel = member.role === 'host' ? '主持人' : '玩家';
      var characterLabel = character ? (character.name || character.publicName || '角色已提交') : member.role === 'host' ? '管理团房' : '尚未提交角色';
      return '<article class="room-member"><span class="room-member-avatar" aria-hidden="true">' + escapeHtml(initials(member.displayName || member.nickname)) + '</span><div><strong>' + escapeHtml(member.displayName || member.nickname || '未署名成员') + '</strong><span>' + escapeHtml(roleLabel) + ' · ' + escapeHtml(characterLabel) + '</span></div><div class="room-member-actions"><small>' + escapeHtml(member.online ? '在线' : member.lastSeenAt ? formatDate(member.lastSeenAt) : '离线') + '</small>' + (canManage && member.role === 'player' && member.status !== 'removed' ? '<button type="button" data-remove-member="' + escapeHtml(member.id) + '">移除</button>' : '') + '</div></article>';
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
    var editable = campaign.status !== 'archived';
    Array.prototype.forEach.call(byId('create-invite-form').querySelectorAll('button,input'), function (control) { control.disabled = !editable; });
    byId('room-invites').innerHTML = invites.length ? invites.map(function (invite) {
      var active = !invite.revokedAt && (!invite.expiresAt || new Date(invite.expiresAt) > new Date());
      return '<article class="room-invite-row"><div><strong>' + escapeHtml(active ? '有效邀请' : '已失效邀请') + '</strong><span>使用 ' + escapeHtml(invite.useCount || invite.uses || 0) + ' / ' + escapeHtml(invite.maxUses || 8) + ' · 截止 ' + escapeHtml(formatDate(invite.expiresAt)) + '</span></div>' + (active && editable ? '<div class="room-invite-actions"><button type="button" data-rotate-invite="' + escapeHtml(invite.id) + '">轮换</button><button type="button" data-revoke-invite="' + escapeHtml(invite.id) + '">撤销</button></div>' : '') + '</article>';
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
          revealInvite(payload);
          setStatus(byId('invite-status'), '邀请已轮换；旧链接已经失效，新链接只在本次显示。', 'success');
          return loadRoom(selectedCampaignId, false);
        }).catch(function (error) { if (!refreshAfterConflict(error, byId('invite-status'))) setStatus(byId('invite-status'), friendlyError(error), 'error'); button.disabled = false; });
      });
    });
  }

  function onlineMemberCount(payload) {
    var campaign = campaignOf(payload);
    var members = payload.members || campaign.members || [];
    if (!members.length) return '0 / 0';
    if (!roomPresence.length) return '等待连接';
    var onlineById = Object.create(null);
    roomPresence.forEach(function (member) { if (member && member.id) onlineById[member.id] = member.online === true; });
    var online = members.filter(function (member) { return onlineById[member.id] === true; }).length;
    return online + ' / ' + members.length;
  }
  function updateRoomContext(payload, isHost) {
    var campaign = campaignOf(payload);
    var id = safe(campaign.id, 120);
    byId('room-title').textContent = campaign.title || '团房大厅';
    byId('room-status').textContent = campaign.status === 'archived' ? '已归档' : '准备中';
    byId('room-module-version').textContent = 'v' + (campaign.moduleVersion || versions.campaignContentVersion || '3.2');
    byId('room-rules-version').textContent = campaign.rulesetVersion || versions.rulesetVersion || '2.1';
    byId('room-role').textContent = isHost ? '主持人' : '玩家';
    byId('room-online-count').textContent = onlineMemberCount(payload);
    byId('room-state-version').textContent = String(campaign.version || payload.snapshot && payload.snapshot.version || 0);
    byId('open-room-console').hidden = !isHost;
    byId('open-room-console').href = 'gm.html?campaign=' + encodeURIComponent(id);
    var playerUrl = 'player.html?campaign=' + encodeURIComponent(id) + (isHost ? '&preview=1' : '');
    byId('open-room-player').href = playerUrl;
    byId('checklist-open-console').href = 'gm.html?campaign=' + encodeURIComponent(id);
    byId('checklist-open-player').href = playerUrl;
  }
  function updateOpeningChecklist(payload, isHost) {
    var campaign = campaignOf(payload);
    var active = isHost && campaign.status !== 'archived';
    var checklist = byId('opening-checklist');
    checklist.hidden = !active;
    if (!active) return;
    byId('opening-checklist-title').textContent = newRoomChecklistId === campaign.id ? '新团房开团清单' : '开团清单';
    var inviteReady = Boolean(byId('new-invite-url').value);
    byId('checklist-invite').classList.toggle('is-complete', inviteReady);
    byId('checklist-invite-copy').textContent = inviteReady ? '本次生成的邀请已可复制；离开大厅后令牌不会再次显示。' : '生成一条仅本次可见的新邀请链接并复制。';
    var memberText = onlineMemberCount(payload);
    byId('checklist-members-copy').textContent = memberText === '等待连接' ? '正在读取房间服务中的在线成员。' : '当前在线 ' + memberText + ' 名成员。';
  }
  function renderRoom(payload, options) {
    var settings = options || {};
    selectedRoom = payload;
    var campaign = campaignOf(payload);
    var member = currentRoomMember(payload);
    var isHost = isHostForRoom(payload);
    var archived = campaign.status === 'archived';
    byId('room').hidden = false;
    if (inviteCampaignId && inviteCampaignId !== campaign.id) {
      inviteCampaignId = '';
      byId('new-invite').hidden = true;
      byId('new-invite-url').value = '';
    }
    updateRoomContext(payload, isHost);
    if (!roomTransportStatus) displayConnectionStatus({ state:'syncing', label:'正在连接房间服务' });
    byId('room-settings-panel').hidden = !isHost;
    if (isHost) {
      var renameInput = byId('rename-room-title');
      if (!settings.preserveTitleInput) renameInput.value = campaign.title || '';
      renameInput.disabled = archived;
      byId('rename-room-form').querySelector('[type="submit"]').disabled = archived;
    }
    byId('transfer-panel').hidden = !isHost;
    byId('archive-room').hidden = archived;
    byId('archive-room').disabled = archived;
    byId('restore-room').hidden = !archived;
    byId('restore-room').disabled = !archived;
    byId('choose-room-import').disabled = archived;
    byId('confirm-room-import').disabled = archived || !pendingImport;
    byId('permanent-delete-panel').hidden = !(isHost && archived);
    if (!archived) byId('delete-room-confirmation').hidden = true;
    byId('delete-room-title').textContent = campaign.title || '';
    updateOpeningChecklist(payload, isHost);
    /* The service exposes an explicit, non-identifying binding flag. Never infer
       guest state from account/user identifiers, which are intentionally absent
       from room projections. */
    var guest = Boolean(member && member.role === 'player' && (member.isGuest === true || member.needsAccountBinding === true));
    byId('guest-panel').hidden = !guest;
    renderMembers(payload, isHost);
    renderInvites(payload, isHost);
    if (!settings.skipTransport) beginRoomTransport(payload);
  }

  function openRestoreBackupFromRoute() {
    var url = new URL(location.href);
    if (url.searchParams.get('restore') !== '1') return;
    url.searchParams.delete('restore');
    history.replaceState({}, '', url.pathname + url.search + (url.hash || '#room'));
    if (!isHostForRoom(selectedRoom)) { showToast('只有主持人可以在大厅恢复团房备份。'); return; }
    var target = isArchivedRoom(selectedRoom) ? byId('restore-room') : byId('choose-room-import');
    setStatus(byId('transfer-status'), isArchivedRoom(selectedRoom) ? '请先恢复已归档团房，再选择备份并执行服务器预检。' : '已从主持台转到大厅：请选择备份文件，服务器会先预检。', 'success');
    setTimeout(function () { byId('transfer-panel').scrollIntoView({ block:'center' }); target.focus(); }, 80);
  }

  function loadRoom(id, updateAddress) {
    var nextId = safe(id, 120);
    if (roomTransport && roomTransport.campaignId !== nextId) disposeRoomTransport();
    selectedCampaignId = nextId;
    if (!selectedCampaignId) return Promise.resolve();
    byId('room').hidden = false;
    byId('room-title').textContent = '正在读取团房…';
    if (updateAddress) {
      var url = new URL(location.href); url.searchParams.set('campaign', selectedCampaignId); history.pushState({}, '', url.pathname + url.search + '#room');
    }
    return api.getCampaign(selectedCampaignId).then(function (payload) { renderRoom(payload); openRestoreBackupFromRoute(); byId('room').scrollIntoView({ block:'start' }); return payload; }).catch(function (error) {
      byId('room').hidden = true; showToast(friendlyError(error));
    });
  }

  function revealInvite(payload) {
    var token = safe(payload.token || payload.inviteToken || payload.invite && payload.invite.token, 512);
    var joinUrl = safe(payload.joinUrl || payload.invite && payload.invite.joinUrl, 1200) || new URL('campaign.html#join=' + encodeURIComponent(token), location.href).href;
    if (!token && !/#(?:join|invite)=/.test(joinUrl)) throw new Error('服务器没有返回邀请令牌。');
    inviteCampaignId = selectedCampaignId;
    byId('new-invite').hidden = false;
    byId('new-invite-url').value = joinUrl;
    updateOpeningChecklist(selectedRoom || payload, isHostForRoom(selectedRoom || payload));
    return joinUrl;
  }
  function createRoomInvite(options) {
    var input = options || {};
    return api.createInvite(selectedCampaignId, {
      expiresInDays:input.expiresInDays || 7,
      maxUses:input.maxUses || 8,
      baseVersion:currentRoomVersion()
    }).then(function (payload) { revealInvite(payload); return payload; });
  }

  byId('join-form').addEventListener('submit', function (event) {
    event.preventDefault(); var form = event.currentTarget;
    var token = form.elements.token.dataset.token || inviteTokenFromText(form.elements.token.value || inviteToken);
    var nickname = validateNicknameInput(form.elements.nickname, byId('join-status'));
    if (!token) { setStatus(byId('join-status'), '邀请链接里没有可用令牌。', 'error'); return; }
    if (nickname.error) { form.elements.nickname.reportValidity(); return; }
    form.elements.nickname.value = nickname.value;
    setBusy(form, true); setStatus(byId('join-status'), '正在安全加入团房…');
    api.joinCampaign(token, nickname.value).then(function (payload) {
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
    event.preventDefault(); var form = event.currentTarget;
    var title = validateRoomTitleInput(form.elements.title, byId('create-status'));
    if (title.error) { form.elements.title.reportValidity(); return; }
    setBusy(form, true); setStatus(byId('create-status'), '正在创建并锁定版本快照…');
    api.createCampaign({ title:title.value, moduleId:form.elements.moduleId.value }).then(function (payload) {
      var id = campaignIdFromJoin(payload); if (!id) throw new Error('服务器没有返回团房编号。');
      newRoomChecklistId = id;
      setStatus(byId('create-status'), '团房已创建，正在打开开团清单。', 'success'); showToast('团房已创建并锁定 v3.2 / v2.1');
      return refreshCampaigns().then(function () { return loadRoom(id, true); });
    }).catch(function (error) { setStatus(byId('create-status'), friendlyError(error), 'error'); }).finally(function () { setBusy(form, false); form.querySelector('[type="submit"]').disabled = !(auth && auth.currentUser && auth.currentUser()); });
  });

  byId('create-invite-form').addEventListener('submit', function (event) {
    event.preventDefault(); var form = event.currentTarget; setBusy(form, true); setStatus(byId('invite-status'), '正在生成高熵邀请令牌…');
    createRoomInvite({ expiresInDays:form.elements.expiresInDays.value, maxUses:form.elements.maxUses.value }).then(function () {
      setStatus(byId('invite-status'), '邀请已生成；令牌只在本次显示。', 'success');
      return loadRoom(selectedCampaignId, false);
    }).catch(function (error) { if (!refreshAfterConflict(error, byId('invite-status'))) setStatus(byId('invite-status'), friendlyError(error), 'error'); }).finally(function () { setBusy(form, false); });
  });
  function copyInviteUrl() {
    var input = byId('new-invite-url');
    var value = input.value;
    if (!value) return Promise.reject(new Error('请先生成一条邀请链接。'));
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(value).catch(function () { input.select(); document.execCommand('copy'); });
    }
    input.select();
    document.execCommand('copy');
    return Promise.resolve();
  }
  byId('copy-invite').addEventListener('click', function () { copyInviteUrl().then(function () { showToast('邀请链接已复制'); }).catch(function (error) { setStatus(byId('invite-status'), friendlyError(error), 'error'); }); });
  byId('checklist-create-invite').addEventListener('click', function () {
    var button = byId('checklist-create-invite');
    button.disabled = true;
    setStatus(byId('invite-status'), '正在生成并复制邀请链接…');
    var work = byId('new-invite-url').value ? copyInviteUrl() : createRoomInvite({ expiresInDays:7, maxUses:8 }).then(function () { return copyInviteUrl(); });
    work.then(function () {
      showToast('邀请链接已复制');
      setStatus(byId('invite-status'), '邀请已生成并复制；令牌只在本次显示。', 'success');
      updateOpeningChecklist(selectedRoom, isHostForRoom(selectedRoom));
      return loadRoom(selectedCampaignId, false);
    }).catch(function (error) { if (!refreshAfterConflict(error, byId('invite-status'))) setStatus(byId('invite-status'), friendlyError(error), 'error'); }).finally(function () { button.disabled = false; });
  });
  byId('checklist-view-members').addEventListener('click', function () {
    byId('members-panel').scrollIntoView({ block:'center' });
    byId('members-title').focus && byId('members-title').focus();
  });
  byId('rename-room-form').addEventListener('submit', function (event) {
    event.preventDefault();
    if (isArchivedRoom(selectedRoom)) { setStatus(byId('rename-status'), '已归档团房不能改名；请先恢复为准备中。', 'error'); return; }
    var form = event.currentTarget;
    var title = validateRoomTitleInput(form.elements.title, byId('rename-status'));
    if (title.error) { form.elements.title.reportValidity(); return; }
    setBusy(form, true);
    setStatus(byId('rename-status'), '正在保存团房名称…');
    api.renameCampaign(selectedCampaignId, title.value, { baseVersion:currentRoomVersion() }).then(function () {
      showToast('团房名称已更新');
      return Promise.all([loadRoom(selectedCampaignId, false), refreshCampaigns()]);
    }).catch(function (error) { if (!refreshAfterConflict(error, byId('rename-status'))) setStatus(byId('rename-status'), friendlyError(error), 'error'); }).finally(function () { setBusy(form, false); });
  });
  byId('refresh-campaigns').addEventListener('click', refreshCampaigns);
  byId('close-room-detail').addEventListener('click', function () { disposeRoomTransport(); byId('room').hidden = true; document.querySelector('.campaign-room-list').scrollIntoView({ block:'start' }); });
  byId('room-reconnect').addEventListener('click', function () {
    if (!selectedRoom) return;
    if (roomTransport && !roomTransport.disposed && typeof roomTransport.reconnect === 'function') {
      displayConnectionStatus({ state:'reconnecting', label:'正在手动重连' });
      roomTransport.reconnect().catch(function () { /* The transport keeps the retry affordance visible. */ });
      return;
    }
    /* Compatibility fallback for an older transport without reconnect(). */
    disposeRoomTransport();
    displayConnectionStatus({ state:'syncing', label:'正在手动重连' });
    beginRoomTransport(selectedRoom);
  });
  byId('export-room').addEventListener('click', function () { byId('export-room').disabled = true; api.exportCampaign(selectedCampaignId).then(function (payload) { (window.NG_RESILIENCE || {}).downloadJson('零之圣杯-在线团房-' + new Date().toISOString().slice(0,10) + '.json', payload); showToast('团房备份已导出'); }).catch(function (error) { setStatus(byId('transfer-status'), friendlyError(error), 'error'); }).finally(function () { byId('export-room').disabled = false; }); });
  byId('choose-room-import').addEventListener('click', function () { byId('room-import-file').click(); });
  byId('room-import-file').addEventListener('change', function (event) {
    var file = event.target.files[0]; event.target.value = ''; if (!file) return;
    if (isArchivedRoom(selectedRoom)) { setStatus(byId('transfer-status'), '请先恢复已归档团房，再恢复备份。', 'error'); return; }
    if (file.size > MAX_IMPORT_FILE_BYTES) { setStatus(byId('transfer-status'), 'JSON 过大；恢复备份文件上限为 256 KB。', 'error'); return; }
    var reader = new FileReader(); reader.onload = function () { try {
      var parsed = JSON.parse(reader.result); var exported = parsed.format === 'ng-campaign-export-v1' && parsed.data && typeof parsed.data === 'object';
      var state = exported ? parsed.data.snapshot && parsed.data.snapshot.state : parsed.state || parsed.snapshot && parsed.snapshot.state || parsed;
      if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('invalid');
      var candidate = exported ? parsed : { state:state, characters:parsed.characters || state.roster || [] };
      setStatus(byId('transfer-status'), '正在由服务器预检备份摘要…');
      api.previewCampaignImport(selectedCampaignId, candidate).then(function (payload) {
        var summary = payload.summary || {};
        if (Number(summary.stateBytes || 0) > MAX_IMPORT_STATE_BYTES) throw new Error('存档状态超过服务器 224 KB 上限。');
        pendingImport = candidate;
        byId('import-preview-title').textContent = file.name;
        byId('import-preview-copy').textContent = '服务器预检：状态 ' + Math.ceil(Number(summary.stateBytes || 0) / 1024) + ' KB；角色 ' + Number(summary.characterCount || 0) + ' 名；本机原数据不会被删除。';
        byId('import-preview').hidden = false;
        byId('confirm-room-import').disabled = false;
        setStatus(byId('transfer-status'), '服务器预检通过，请核对摘要后确认恢复备份。', 'success');
      }).catch(function (error) { pendingImport = null; byId('import-preview').hidden = true; setStatus(byId('transfer-status'), friendlyError(error), 'error'); });
    } catch (error) { setStatus(byId('transfer-status'), '无法读取这份团房备份 JSON。', 'error'); } }; reader.readAsText(file);
  });
  byId('cancel-room-import').addEventListener('click', function () { pendingImport = null; byId('import-preview').hidden = true; byId('confirm-room-import').disabled = true; });
  byId('confirm-room-import').addEventListener('click', function () { if (!pendingImport || isArchivedRoom(selectedRoom)) return; var button = byId('confirm-room-import'); button.disabled = true; api.importCampaign(selectedCampaignId, pendingImport, { baseVersion:currentRoomVersion() }).then(function () { pendingImport = null; byId('import-preview').hidden = true; setStatus(byId('transfer-status'), '团房备份已恢复到在线团房。', 'success'); showToast('在线快照已更新'); return loadRoom(selectedCampaignId, false); }).catch(function (error) { if (!refreshAfterConflict(error, byId('transfer-status'))) setStatus(byId('transfer-status'), friendlyError(error), 'error'); }).finally(function () { button.disabled = !pendingImport; }); });
  byId('archive-room').addEventListener('click', function () { if (!confirm('归档这个团房？归档后保留历史，但不能继续修改团务状态。')) return; var button = byId('archive-room'); button.disabled = true; api.archiveCampaign(selectedCampaignId, { baseVersion:currentRoomVersion() }).then(function () { showToast('团房已归档；可恢复或永久删除。'); return Promise.all([loadRoom(selectedCampaignId, false), refreshCampaigns()]); }).catch(function (error) { if (!refreshAfterConflict(error, byId('transfer-status'))) setStatus(byId('transfer-status'), friendlyError(error), 'error'); button.disabled = false; }); });
  byId('restore-room').addEventListener('click', function () {
    if (!confirm('将这个已归档团房恢复为准备中？历史会保留，成员可以再次连接。')) return;
    var button = byId('restore-room');
    button.disabled = true;
    api.restoreCampaign(selectedCampaignId, { baseVersion:currentRoomVersion() }).then(function () {
      showToast('团房已恢复为准备中');
      return Promise.all([loadRoom(selectedCampaignId, false), refreshCampaigns()]);
    }).catch(function (error) { if (!refreshAfterConflict(error, byId('transfer-status'))) setStatus(byId('transfer-status'), friendlyError(error), 'error'); }).finally(function () { button.disabled = false; });
  });
  byId('delete-room').addEventListener('click', function () {
    if (!isArchivedRoom(selectedRoom)) return;
    byId('delete-room-confirmation').hidden = false;
    byId('delete-room-title-input').value = '';
    byId('confirm-delete-room').disabled = true;
    setTimeout(function () { byId('delete-room-title-input').focus(); }, 0);
  });
  byId('delete-room-title-input').addEventListener('input', function (event) {
    var expected = campaignOf(selectedRoom).title || '';
    byId('confirm-delete-room').disabled = event.currentTarget.value !== expected;
  });
  byId('cancel-delete-room').addEventListener('click', function () { byId('delete-room-confirmation').hidden = true; byId('delete-room-title-input').value = ''; });
  byId('confirm-delete-room').addEventListener('click', function () {
    var confirmationTitle = byId('delete-room-title-input').value;
    if (confirmationTitle !== (campaignOf(selectedRoom).title || '')) return;
    var button = byId('confirm-delete-room');
    button.disabled = true;
    api.deleteCampaign(selectedCampaignId, confirmationTitle, { baseVersion:currentRoomVersion() }).then(function () {
      disposeRoomTransport();
      pendingImport = null;
      selectedRoom = null;
      selectedCampaignId = '';
      newRoomChecklistId = '';
      byId('room').hidden = true;
      var url = new URL(location.href);
      url.searchParams.delete('campaign');
      url.searchParams.delete('restore');
      history.replaceState({}, '', url.pathname + url.search + '#host');
      showToast('团房已永久删除，成员会话已失效。');
      return refreshCampaigns();
    }).catch(function (error) { if (!refreshAfterConflict(error, byId('transfer-status'))) setStatus(byId('transfer-status'), friendlyError(error), 'error'); button.disabled = false; });
  });
  byId('bind-campaign').addEventListener('click', function () { var button = byId('bind-campaign'); button.disabled = true; api.bindCampaign(selectedCampaignId).then(function () {
    setStatus(byId('bind-status'), '访客身份与角色已绑定到账号。', 'success');
    return roomTransport && roomTransport.campaignId === selectedCampaignId ? roomTransport.reconnect({ force:true }).catch(function () { return null; }) : null;
  }).then(function () { return loadRoom(selectedCampaignId, false); }).catch(function (error) { setStatus(byId('bind-status'), friendlyError(error), 'error'); }).finally(function () { button.disabled = false; }); });

  function bindRoomTitleValidation(input, statusElement) {
    input.addEventListener('input', function () {
      var result = roomTitleResult(input.value);
      input.setCustomValidity(result.error || '');
      input.setAttribute('aria-invalid', result.error ? 'true' : 'false');
      if (result.error) setStatus(statusElement, result.error, 'error');
      else if (statusElement.classList.contains('error')) setStatus(statusElement, '');
    });
  }
  bindRoomTitleValidation(byId('campaign-title-input'), byId('create-status'));
  bindRoomTitleValidation(byId('rename-room-title'), byId('rename-status'));
  byId('join-nickname').addEventListener('input', function (event) {
    var result = playerNicknameResult(event.currentTarget.value);
    event.currentTarget.setCustomValidity(result.error || '');
    event.currentTarget.setAttribute('aria-invalid', result.error ? 'true' : 'false');
    if (result.error) setStatus(byId('join-status'), result.error, 'error');
    else if (byId('join-status').classList.contains('error')) setStatus(byId('join-status'), '');
  });

  if (inviteToken) { byId('join-token').value = '邀请令牌已从当前安全链接读取'; byId('join-token').dataset.token = inviteToken; byId('join-token').readOnly = true; }
  if (new URLSearchParams(location.search).get('module')) byId('campaign-module-input').value = safe(new URLSearchParams(location.search).get('module'), 80) || 'null-grail';
  window.addEventListener('popstate', function () { var id = api.campaignIdFromLocation(); if (id) loadRoom(id, false); else { disposeRoomTransport(); byId('room').hidden = true; } });
  window.addEventListener('hashchange', scrollForRoute);
  window.addEventListener('beforeunload', disposeRoomTransport);

  var ready = auth && auth.ready ? auth.ready() : Promise.resolve(null);
  ready.then(function (user) { renderAccount(user); return refreshCampaigns(); }).then(function () { if (selectedCampaignId) return loadRoom(selectedCampaignId, false); }).catch(function (error) { byId('campaign-service-state').textContent = friendlyError(error); byId('campaign-service-state').className = 'campaign-service-state error'; }).finally(scrollForRoute);
}());
