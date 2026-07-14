(function (root) {
  'use strict';

  var siteConfig = root.NG_SITE_CONFIG || {};
  var versions = siteConfig.versions || {};
  var PROTOCOL = versions.campaignProtocol || 'ng-campaign-v1';
  var DEFAULT_MODULE_ID = 'null-grail';
  var MAX_CHAT_LENGTH = 1000;
  var adapters = Object.create(null);

  function noop() {}
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function safeText(value, maximum) { return String(value == null ? '' : value).replace(/\u0000/g, '').trim().slice(0, maximum); }
  /* Do not shorten values that the server must validate. In particular, room
     names and member nicknames should produce a useful validation error rather
     than appear to save after a client-side truncation. */
  function inputText(value) {
    var text = String(value == null ? '' : value).replace(/\u0000/g, '');
    if (typeof text.normalize === 'function') text = text.normalize('NFKC');
    return text.trim();
  }
  function makeId(prefix) {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return prefix + '-' + root.crypto.randomUUID();
    var random = root.crypto && typeof root.crypto.getRandomValues === 'function'
      ? Array.from(root.crypto.getRandomValues(new Uint32Array(3))).map(function (part) { return part.toString(36); }).join('')
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    return prefix + '-' + random;
  }

  function apiUrl(path) {
    if (root.NG_AUTH && typeof root.NG_AUTH.apiUrl === 'function') return root.NG_AUTH.apiUrl(path);
    return path;
  }

  function credentials(path) {
    if (root.NG_AUTH && typeof root.NG_AUTH.apiCredentials === 'function') return root.NG_AUTH.apiCredentials(path);
    return 'include';
  }

  function request(path, options) {
    var settings = Object.assign({
      cache:'no-store',
      credentials:credentials(path),
      headers:{ Accept:'application/json' }
    }, options || {});
    if (settings.body !== undefined && typeof settings.body !== 'string') {
      settings.headers = Object.assign({}, settings.headers, { 'Content-Type':'application/json' });
      settings.body = JSON.stringify(settings.body);
    }
    var resilience = root.NG_RESILIENCE;
    if (resilience && typeof resilience.request === 'function') return resilience.request(apiUrl(path), settings);
    return root.fetch(apiUrl(path), settings).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok || payload.ok === false) {
          var error = new Error(payload.message || '请求没有成功。');
          error.status = response.status;
          error.code = payload.code || 'request_failed';
          throw error;
        }
        return payload;
      });
    });
  }

  function campaignIdFromLocation(locationLike) {
    var current = locationLike || root.location;
    if (!current) return '';
    try {
      var params = new URLSearchParams(current.search || '');
      return safeText(params.get('campaign') || params.get('id'), 120);
    } catch (error) { return ''; }
  }

  function inviteTokenFromLocation(locationLike) {
    var current = locationLike || root.location;
    var hash = current && String(current.hash || '').replace(/^#/, '') || '';
    if (!hash) return '';
    try {
      var params = new URLSearchParams(hash);
      var token = params.get('join') || params.get('invite') || params.get('token') || '';
      if (token) return safeText(token, 512);
      if (!hash.includes('=') && hash !== 'join' && hash !== 'host') return safeText(decodeURIComponent(hash), 512);
    } catch (error) {}
    return '';
  }

  function fragmentRoute(locationLike) {
    var current = locationLike || root.location;
    var hash = current && String(current.hash || '').replace(/^#/, '') || '';
    if (/^host(?:=|&|$)/.test(hash)) return 'host';
    if (/^(?:join|invite)(?:=|&|$)/.test(hash)) return 'join';
    return '';
  }

  function registerAdapter(moduleId, adapter) {
    var id = safeText(moduleId, 80);
    if (!id || !adapter || typeof adapter !== 'object') throw new Error('A module adapter requires an id and implementation.');
    adapters[id] = adapter;
    return adapter;
  }
  function getAdapter(moduleId) { return adapters[safeText(moduleId, 80)] || null; }

  function listCampaigns() { return request('/api/campaigns'); }
  function createCampaign(options) {
    var input = options || {};
    return request('/api/campaigns', {
      method:'POST', retry:false,
      body:{ title:inputText(input.title), moduleId:safeText(input.moduleId, 80) || DEFAULT_MODULE_ID }
    });
  }
  function getCampaign(id, options) {
    var preview = options && options.preview === true;
    return request('/api/campaigns/' + encodeURIComponent(id) + (preview ? '?preview=1' : ''));
  }
  function mutationIdentity(options, prefix) {
    var input = options || {};
    var baseVersion = Number(input.baseVersion !== undefined ? input.baseVersion : input.version);
    return {
      commandId:safeText(input.commandId, 100) || makeId(prefix || 'mutation'),
      baseVersion:Number.isSafeInteger(baseVersion) && baseVersion >= 0 ? baseVersion : 0
    };
  }
  function archiveCampaign(id, options) {
    var identity = mutationIdentity(options, 'archive');
    return request('/api/campaigns/' + encodeURIComponent(id) + '/archive', { method:'POST', retry:false, body:identity });
  }
  function renameCampaign(id, title, options) {
    var identity = mutationIdentity(options, 'campaign-rename');
    return request('/api/campaigns/' + encodeURIComponent(id), {
      method:'PATCH', retry:false,
      body:{ title:inputText(title), commandId:identity.commandId, baseVersion:identity.baseVersion }
    });
  }
  function restoreCampaign(id, options) {
    var identity = mutationIdentity(options, 'campaign-restore');
    return request('/api/campaigns/' + encodeURIComponent(id) + '/restore', { method:'POST', retry:false, body:identity });
  }
  function deleteCampaign(id, title, options) {
    var identity = mutationIdentity(options, 'campaign-delete');
    return request('/api/campaigns/' + encodeURIComponent(id), {
      method:'DELETE', retry:false,
      body:{ confirmationTitle:inputText(title), title:inputText(title), commandId:identity.commandId, baseVersion:identity.baseVersion }
    });
  }
  function createInvite(id, options) {
    var input = options || {};
    var identity = mutationIdentity(input, 'invite');
    return request('/api/campaigns/' + encodeURIComponent(id) + '/invites', {
      method:'POST', retry:false,
      body:{ expiresInDays:Number(input.expiresInDays || 7), maxUses:Number(input.maxUses || 8), commandId:identity.commandId, baseVersion:identity.baseVersion }
    });
  }
  function revokeInvite(id, inviteId, options) {
    var identity = mutationIdentity(options, 'invite-revoke');
    return request('/api/campaigns/' + encodeURIComponent(id) + '/invites/' + encodeURIComponent(inviteId), {
      method:'DELETE', retry:false,
      headers:{ Accept:'application/json', 'X-Command-Id':identity.commandId, 'X-Base-Version':String(identity.baseVersion) }
    });
  }
  function rotateInvite(id, inviteId, options) {
    var input = options || {};
    var identity = mutationIdentity(input, 'invite-rotate');
    return request('/api/campaigns/' + encodeURIComponent(id) + '/invites/' + encodeURIComponent(inviteId) + '/rotate', {
      method:'POST', retry:false,
      body:{ expiresInDays:Number(input.expiresInDays || 7), maxUses:Number(input.maxUses || 8), commandId:identity.commandId, baseVersion:identity.baseVersion }
    });
  }
  function joinCampaign(token, nickname) {
    return request('/api/campaigns/join', {
      method:'POST', retry:false,
      body:{ token:safeText(token, 512), nickname:inputText(nickname) }
    });
  }
  function bindCampaign(id) { return request('/api/campaigns/' + encodeURIComponent(id) + '/bind', { method:'POST', retry:false, body:{} }); }
  function getSnapshot(id, sinceVersion, options) {
    var query = new URLSearchParams();
    if (Number.isFinite(Number(sinceVersion))) query.set('sinceVersion', String(Math.max(0, Number(sinceVersion))));
    if (options && options.preview === true) query.set('preview', '1');
    query = query.toString();
    query = query ? '?' + query : '';
    return request('/api/campaigns/' + encodeURIComponent(id) + '/snapshot' + query);
  }
  function sendCampaignCommand(id, type, payload, options) {
    var identity = mutationIdentity(options, 'command');
    return request('/api/campaigns/' + encodeURIComponent(id) + '/commands', {
      method:'POST', retry:false,
      body:{ protocol:PROTOCOL, type:'command', campaignId:id, commandId:identity.commandId, baseVersion:identity.baseVersion, command:{ type:safeText(type, 80), payload:clone(payload || {}) } }
    });
  }
  function prepareCampaignImport(payload) {
    var source = payload || {};
    if (source.format === 'ng-campaign-export-v1' && source.data && typeof source.data === 'object') {
      return clone(source);
    }
    var importedState = clone(source.state || source);
    if (importedState && importedState.dayId && !importedState.keeper) {
      var adapter = getAdapter(DEFAULT_MODULE_ID);
      importedState = adapter && adapter.stateEnvelope
        ? adapter.stateEnvelope(importedState, { view:'curtain', handout:null, map:{ visible:false, locations:[] }, scene:{ active:false }, combat:{ active:false }, checks:[], current:{ view:'curtain' } })
        : { keeper:importedState, public:{ view:'curtain' } };
    }
    return { state:importedState, characters:Array.isArray(source.characters) ? clone(source.characters) : undefined };
  }
  function importCampaign(id, payload, options) {
    var body = prepareCampaignImport(payload);
    var identity = mutationIdentity(options, 'import');
    body.commandId = identity.commandId;
    body.baseVersion = identity.baseVersion;
    return request('/api/campaigns/' + encodeURIComponent(id) + '/import', { method:'POST', retry:false, body:body });
  }
  function previewCampaignImport(id, payload) {
    var body = prepareCampaignImport(payload);
    body.preview = true;
    return request('/api/campaigns/' + encodeURIComponent(id) + '/import?preview=1', { method:'POST', retry:false, body:body });
  }
  function exportCampaign(id) { return request('/api/campaigns/' + encodeURIComponent(id) + '/export'); }
  function getMessages(id, options) {
    var input = options || {};
    var query = new URLSearchParams();
    if (input.before) query.set('before', input.before);
    query.set('limit', String(Math.max(1, Math.min(100, Number(input.limit || 40)))));
    return request('/api/campaigns/' + encodeURIComponent(id) + '/messages?' + query.toString());
  }
  function EventHub() { this.listeners = Object.create(null); }
  EventHub.prototype.on = function (name, listener) {
    if (typeof listener !== 'function') return noop;
    if (!this.listeners[name]) this.listeners[name] = [];
    this.listeners[name].push(listener);
    var self = this;
    return function () { self.listeners[name] = (self.listeners[name] || []).filter(function (item) { return item !== listener; }); };
  };
  EventHub.prototype.emit = function (name, value) {
    (this.listeners[name] || []).slice().forEach(function (listener) {
      try { listener(value); } catch (error) { root.setTimeout(function () { throw error; }, 0); }
    });
  };

  function LocalTransport(options) {
    var input = options || {};
    this.protocol = input.protocol || 'null-grail-player-v4';
    this.channelName = input.channelName || 'null-grail-player';
    this.channel = null;
    this.hub = new EventHub();
    this.disposed = false;
    this.messageListener = this.handleWindowMessage.bind(this);
    try {
      this.channel = new root.BroadcastChannel(this.channelName);
      this.channel.onmessage = this.handleChannelMessage.bind(this);
    } catch (error) { this.channel = null; }
    root.addEventListener('message', this.messageListener);
    this.hub.emit('status', { state:'local', label:'仅保存在此设备', writable:true });
  }
  LocalTransport.prototype.on = function (name, listener) { return this.hub.on(name, listener); };
  LocalTransport.prototype.handleChannelMessage = function (event) { this.hub.emit('message', event && event.data); };
  LocalTransport.prototype.handleWindowMessage = function (event) {
    if (!event || event.origin !== root.location.origin) return;
    this.hub.emit('message', event.data);
  };
  LocalTransport.prototype.isWritable = function () { return !this.disposed; };
  LocalTransport.prototype.send = function (message) {
    if (this.disposed) return false;
    var payload = Object.assign({}, message || {}, { protocol:(message && message.protocol) || this.protocol });
    if (this.channel) { this.channel.postMessage(payload); return true; }
    if (root.opener && !root.opener.closed) {
      try { root.opener.postMessage(payload, root.location.origin); return true; } catch (error) {}
    }
    return false;
  };
  LocalTransport.prototype.dispose = function () {
    this.disposed = true;
    if (this.channel) this.channel.close();
    root.removeEventListener('message', this.messageListener);
  };

  function websocketUrl(campaignId, preview) {
    var resolved = new URL(apiUrl('/api/campaigns/' + encodeURIComponent(campaignId) + '/socket'), root.location && root.location.href || undefined);
    if (preview === true) resolved.searchParams.set('preview', '1');
    resolved.protocol = resolved.protocol === 'https:' ? 'wss:' : 'ws:';
    return resolved.href;
  }

  function RoomTransport(options) {
    var input = options || {};
    this.campaignId = safeText(input.campaignId, 120);
    this.role = input.role === 'host' ? 'host' : 'player';
    this.preview = input.preview === true;
    this.protocol = PROTOCOL;
    this.version = Math.max(0, Number(input.version || 0));
    this.socket = null;
    this.status = 'idle';
    this.disposed = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.pending = Object.create(null);
    this.queue = Promise.resolve();
    this.hub = new EventHub();
    this.lastSnapshot = null;
    this.connectPromise = null;
  }
  RoomTransport.prototype.on = function (name, listener) { return this.hub.on(name, listener); };
  RoomTransport.prototype.setStatus = function (state, detail) {
    this.status = state;
    var labels = { idle:'尚未连接', syncing:'正在同步', connecting:'正在连接', online:'在线', reconnecting:'正在重连', offline:'已离线', failed:'连接失败', closed:'已关闭' };
    this.hub.emit('status', Object.assign({ state:state, label:labels[state] || state, writable:state === 'online' }, detail || {}));
  };
  RoomTransport.prototype.isWritable = function () { return !this.disposed && this.status === 'online' && this.socket && this.socket.readyState === 1; };
  RoomTransport.prototype.applySnapshot = function (payload) {
    if (!payload || typeof payload !== 'object') return;
    var snapshot = payload.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : payload;
    var version = Number(snapshot.version !== undefined ? snapshot.version : payload.campaign && payload.campaign.version);
    /* A snapshot is authoritative. In particular, after a reconnect it may be
       lower than a locally observed/unacknowledged version. Keeping the larger
       value would make every later command conflict forever. */
    if (Number.isFinite(version)) this.version = Math.max(0, version);
    this.lastSnapshot = clone(snapshot);
    this.hub.emit('snapshot', payload);
    /* A resync snapshot is authoritative at snapshot.version. Events bundled
       for diagnostics/history are already represented by that state and must
       not be replayed into the UI a second time. Live events arrive separately. */
  };
  RoomTransport.prototype.applyEvent = function (envelope) {
    var event = envelope && envelope.event ? envelope.event : envelope;
    if (!event || typeof event !== 'object') return;
    var incomingVersion = Number(envelope && envelope.version);
    if (Number.isFinite(incomingVersion)) {
      if (this.version && incomingVersion > this.version + 1) this.requestResync();
      this.version = Math.max(this.version, incomingVersion);
    }
    this.hub.emit('event', event);
  };
  RoomTransport.prototype.handleEnvelope = function (raw) {
    var message;
    try { message = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (error) { this.hub.emit('error', { kind:'data', message:'团房返回了无法读取的数据。' }); return; }
    if (!message || message.protocol !== this.protocol || (message.campaignId && message.campaignId !== this.campaignId)) return;
    if (message.type === 'error') {
      var failed = message.commandId && this.pending[message.commandId];
      var commandError = new Error(message.message || (message.code === 'rate_limited' ? '操作过于频繁，请稍后重试。' : '团房服务拒绝了这次操作。'));
      commandError.code = message.code || 'server_error';
      commandError.kind = message.code === 'rate_limited' ? 'rate_limited' : message.code === 'version_conflict' ? 'conflict' : 'server';
      if (failed) {
        delete this.pending[message.commandId];
        root.clearTimeout(failed.timer);
        failed.reject(commandError);
      }
      this.hub.emit('error', commandError);
      return;
    }
    if (message.type === 'ack') {
      var pending = this.pending[message.commandId];
      if (!pending) return;
      delete this.pending[message.commandId];
      root.clearTimeout(pending.timer);
      if (Number.isFinite(Number(message.version))) this.version = Math.max(this.version, Number(message.version));
      if (message.ok === false) {
        var error = new Error(message.message || '团房命令未能保存。');
        error.code = message.code || 'command_failed';
        error.kind = error.code === 'version_conflict' ? 'conflict' : 'server';
        pending.reject(error);
      } else pending.resolve(message);
      return;
    }
    if (message.type === 'event') { this.applyEvent(message); return; }
    if (message.type === 'resync') { this.applySnapshot(message); return; }
    if (message.type === 'presence') {
      this.hub.emit('presence', { members:Array.isArray(message.members) ? message.members : [], campaignId:this.campaignId });
    }
  };
  RoomTransport.prototype.openSocket = function () {
    var self = this;
    if (self.disposed) return Promise.reject(new Error('transport_disposed'));
    if (typeof root.WebSocket !== 'function') {
      self.setStatus('failed', { message:'当前浏览器不支持在线团房连接。' });
      return Promise.reject(new Error('websocket_unavailable'));
    }
    self.setStatus(self.reconnectAttempt ? 'reconnecting' : 'connecting');
    return new Promise(function (resolve, reject) {
      var settled = false;
      var socket;
      try { socket = new root.WebSocket(websocketUrl(self.campaignId, self.preview), self.protocol); }
      catch (error) { self.setStatus('failed', { message:error.message }); reject(error); return; }
      self.socket = socket;
      socket.addEventListener('open', function () {
        settled = true;
        self.reconnectAttempt = 0;
        self.setStatus('online');
        try {
          socket.send(JSON.stringify({ protocol:self.protocol, type:'resync', campaignId:self.campaignId, sinceVersion:self.version }));
        } catch (error) {}
        resolve(self);
      }, { once:true });
      socket.addEventListener('message', function (event) { self.handleEnvelope(event.data); });
      socket.addEventListener('error', function () {
        if (!settled) { settled = true; reject(new Error('websocket_connection_failed')); }
      });
      socket.addEventListener('close', function () {
        /* A forced reconnect replaces `self.socket` before the old close event
           arrives. Detached sockets must not reject commands on the new
           connection or schedule a second retry loop. */
        if (self.socket !== socket) return;
        self.rejectPending('连接已中断，未确认的操作没有保存。');
        if (self.disposed) { self.setStatus('closed'); return; }
        self.setStatus('offline', { message:'连接已中断；离线期间不能修改团房状态。' });
        self.scheduleReconnect();
      });
    });
  };
  RoomTransport.prototype.connect = function () {
    var self = this;
    if (self.connectPromise) return self.connectPromise;
    self.setStatus('syncing');
    self.connectPromise = getSnapshot(self.campaignId, self.version, { preview:self.preview }).then(function (payload) {
      self.applySnapshot(payload);
      return self.openSocket();
    }).catch(function (error) {
      self.setStatus('failed', { message:error.message, kind:error.kind || error.code });
      self.hub.emit('error', error);
      throw error;
    }).finally(function () { self.connectPromise = null; });
    return self.connectPromise;
  };
  RoomTransport.prototype.requestResync = function () {
    var self = this;
    if (self.disposed) return Promise.resolve(null);
    return getSnapshot(self.campaignId, self.version, { preview:self.preview }).then(function (payload) { self.applySnapshot(payload); return payload; }).catch(function (error) { self.hub.emit('error', error); return null; });
  };
  RoomTransport.prototype.reconnect = function (options) {
    var self = this;
    var force = Boolean(options && options.force === true);
    if (self.disposed) return Promise.reject(new Error('transport_disposed'));
    if (self.reconnectTimer) {
      root.clearTimeout(self.reconnectTimer);
      self.reconnectTimer = null;
    }
    /* An already healthy socket only needs a fresh authoritative snapshot. This
       avoids creating duplicate WebSockets when a user presses “重新连接”. */
    if (self.isWritable() && !force) return self.requestResync();
    self.reconnectAttempt = 0;
    if (self.socket && self.socket.readyState !== 3) {
      if (self.socket.readyState < 2) {
        try { self.socket.close(1000, 'manual_reconnect'); } catch (error) {}
      }
    }
    self.socket = null;
    return self.connect();
  };
  RoomTransport.prototype.scheduleReconnect = function () {
    var self = this;
    if (self.disposed || self.reconnectTimer) return;
    self.reconnectAttempt += 1;
    var delay = Math.min(30000, 700 * Math.pow(2, Math.min(self.reconnectAttempt, 6))) + Math.floor(Math.random() * 500);
    self.reconnectTimer = root.setTimeout(function () {
      self.reconnectTimer = null;
      self.requestResync().finally(function () { self.openSocket().catch(noop); });
    }, delay);
  };
  RoomTransport.prototype.rejectPending = function (message) {
    var self = this;
    Object.keys(self.pending).forEach(function (id) {
      var pending = self.pending[id];
      root.clearTimeout(pending.timer);
      var error = new Error(message || '操作未确认。');
      error.kind = 'offline';
      pending.reject(error);
      delete self.pending[id];
    });
  };
  RoomTransport.prototype.sendCommand = function (type, payload) {
    var self = this;
    if (!self.isWritable()) {
      var offline = new Error('当前未连接到团房；离线期间不能修改状态。');
      offline.kind = 'offline';
      return Promise.reject(offline);
    }
    var commandId = makeId('command');
    var envelope = {
      protocol:self.protocol,
      type:'command',
      campaignId:self.campaignId,
      commandId:commandId,
      baseVersion:self.version,
      command:{ type:safeText(type, 80), payload:clone(payload || {}) }
    };
    return new Promise(function (resolve, reject) {
      var timer = root.setTimeout(function () {
        if (!self.pending[commandId]) return;
        delete self.pending[commandId];
        var error = new Error('服务器未在时限内确认保存；请等待重新同步。');
        error.kind = 'timeout';
        reject(error);
        self.requestResync();
      }, 10000);
      self.pending[commandId] = { resolve:resolve, reject:reject, timer:timer };
      try { self.socket.send(JSON.stringify(envelope)); }
      catch (error) {
        root.clearTimeout(timer);
        delete self.pending[commandId];
        reject(error);
      }
    });
  };
  RoomTransport.prototype.command = function (type, payload) {
    var self = this;
    var task = self.queue.then(function () { return self.sendCommand(type, payload); });
    self.queue = task.catch(noop);
    return task;
  };
  RoomTransport.prototype.dispose = function () {
    this.disposed = true;
    if (this.reconnectTimer) root.clearTimeout(this.reconnectTimer);
    this.rejectPending('团房连接已关闭。');
    if (this.socket) this.socket.close(1000, 'client_dispose');
    this.setStatus('closed');
  };

  function chatMessage(raw) {
    var value = raw && raw.message && typeof raw.message === 'object' ? raw.message : raw;
    if (!value || typeof value !== 'object') return null;
    var id = safeText(value.id || value.messageId, 160);
    if (!id) return null;
    return {
      id:id,
      content:safeText(value.content || value.text, MAX_CHAT_LENGTH),
      displayName:safeText(value.displayName || value.memberName || value.authorName || value.author && value.author.displayName, 80) || '团房成员',
      memberId:safeText(value.memberId || value.authorId, 120),
      createdAt:safeText(value.createdAt, 50) || new Date().toISOString(),
      deleted:value.deleted === true || Boolean(value.deletedAt),
      deletedAt:safeText(value.deletedAt, 50)
    };
  }

  /* The transport above is module-agnostic. This registered adapter is the
     only place that understands Null Grail's public projection vocabulary. */
  var NullGrailAdapter = registerAdapter(DEFAULT_MODULE_ID, Object.freeze({
    moduleId:DEFAULT_MODULE_ID,
    stateEnvelope:function (keeperState, publicProjection) {
      var projection = publicProjection && typeof publicProjection === 'object' ? clone(publicProjection) : {};
      return { keeper:clone(keeperState || {}), public:projection };
    },
    messagesFromSnapshot:function (payload) {
      var snapshot = payload && payload.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : payload || {};
      var state = snapshot.state && typeof snapshot.state === 'object' ? snapshot.state : snapshot;
      /* Player snapshots already expose the role-filtered public projection at
         the top level. Wrapped public/projection forms are retained only for
         import and local compatibility. */
      var projection = state.projection && typeof state.projection === 'object' ? state.projection : state.public && typeof state.public === 'object' ? state.public : state;
      var output = [];
      var handout = projection.handout || state.currentHandout || state.handout || state.handouts && state.handouts.current || null;
      var map = projection.map || state.map || state.publicMap || null;
      var view = projection.view || state.view || state.current && state.current.view || state.handouts && state.handouts.view || state.playerProjection || (handout ? 'handout' : map && map.visible ? 'map' : 'curtain');
      if (handout) output.push({ type:'show', handout:handout });
      else output.push({ type:'retract', handoutId:null, all:true });
      if (map) output.push({ type:'map-state', map:map, focusLocationId:map.activeLocationId || null, openMap:view === 'map' });
      if (projection.scene) output.push({ type:'scene-state', scene:projection.scene });
      if (projection.combat) output.push({ type:'combat-state', combat:projection.combat });
      if (!handout && view === 'curtain') output.push({ type:'curtain' });
      var checks = state.checks || projection.checks;
      if (checks && checks.latestResult) output.push({ type:'check-result', result:checks.latestResult });
      return output;
    },
    messageFromEvent:function (event, role) {
      var kind = safeText(event && (event.kind || event.type), 80);
      var payload = event && event.payload && typeof event.payload === 'object' ? event.payload : event || {};
      if (kind === 'character.submitted' || kind === 'character.submit') return role === 'host' ? { type:'character-submit', submissionId:payload.submissionId || payload.id, sentAt:payload.sentAt || payload.createdAt, character:payload.character || payload.data } : null;
      if (kind === 'character.reviewed' || kind === 'character.review') return role === 'player' ? { type:'character-ack', submissionId:payload.submissionId, characterId:payload.characterId, accepted:payload.accepted === true || payload.status === 'approved' || payload.status === 'accepted' } : null;
      if (kind === 'check.requested' || kind === 'check.request') return role === 'host' ? { type:'check-request', request:payload.request || payload } : null;
      if (kind === 'check.resolved' || kind === 'check.result') return role === 'player' ? { type:'check-result', result:payload.result || payload } : null;
      if (kind === 'state.replaced' || kind === 'state.patched' || kind === 'state.replace' || kind === 'state.updated') return { type:'snapshot-update', snapshot:payload.snapshot || payload };
      if (kind === 'map.updated' || kind === 'map.update') return { type:'map-state', map:payload.map || payload, focusLocationId:payload.focusLocationId, openMap:payload.openMap === true };
      if (kind === 'handout.updated' || kind === 'handout.update') return payload.retracted ? { type:'retract', handoutId:payload.handoutId } : payload.handout ? { type:'show', handout:payload.handout } : null;
      if (kind === 'scene.updated' || kind === 'scene.update') return { type:'scene-state', scene:payload.scene || payload };
      if (kind === 'combat.updated' || kind === 'combat.update') return { type:'combat-state', combat:payload.combat || payload };
      return null;
    }
  }));

  function mountChat(options) {
    var input = options || {};
    var rootElement = typeof input.element === 'string' ? root.document.querySelector(input.element) : input.element;
    if (!rootElement || !input.campaignId) return null;
    var transport = input.transport;
    var canDelete = input.canDelete === true;
    var messages = [];
    var unread = 0;
    var open = false;
    var loading = false;
    var exhausted = false;
    var nextBefore = '';
    var hasLoadedPage = false;

    rootElement.innerHTML = '<button class="campaign-chat-toggle" data-chat-toggle type="button" aria-expanded="false"><span>团房聊天</span><b hidden>0</b></button>' +
      '<section class="campaign-chat-panel" hidden aria-label="全团文字聊天">' +
        '<header><div><small>ALL MEMBERS</small><strong>团房聊天</strong></div><span data-chat-connection>正在连接</span><button type="button" data-chat-close aria-label="关闭聊天">×</button></header>' +
        '<button class="campaign-chat-earlier" type="button" data-chat-earlier>读取更早消息</button>' +
        '<ol class="campaign-chat-messages" data-chat-list aria-live="polite"></ol>' +
        '<form data-chat-form><label><span class="sr-only">发送到全团频道</span><textarea maxlength="1000" rows="2" placeholder="发消息给全团（最多 1000 字）" required></textarea></label><footer><small data-chat-count>0 / 1000</small><button type="submit">发送</button></footer><p data-chat-error role="alert" hidden></p></form>' +
      '</section>';
    var toggle = rootElement.querySelector('.campaign-chat-toggle');
    var badge = toggle.querySelector('b');
    var panel = rootElement.querySelector('.campaign-chat-panel');
    var list = rootElement.querySelector('[data-chat-list]');
    var form = rootElement.querySelector('[data-chat-form]');
    var textarea = form.querySelector('textarea');
    var submit = form.querySelector('[type="submit"]');
    var count = rootElement.querySelector('[data-chat-count]');
    var errorElement = rootElement.querySelector('[data-chat-error]');
    var connection = rootElement.querySelector('[data-chat-connection]');
    var unreadElement = input.unreadElement && (typeof input.unreadElement === 'string' ? root.document.querySelector(input.unreadElement) : input.unreadElement);

    function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, function (part) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[part]; }); }
    function updateUnread() {
      badge.textContent = String(unread);
      badge.hidden = unread < 1;
      if (unreadElement) { unreadElement.textContent = unread ? String(unread) : ''; unreadElement.hidden = unread < 1; }
    }
    function render() {
      list.innerHTML = messages.length ? messages.map(function (message) {
        var time = new Date(message.createdAt);
        var validTime = Number.isNaN(time.getTime()) ? '' : time.toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' });
        return '<li data-chat-message="' + escapeHtml(message.id) + '"' + (message.deleted ? ' class="deleted"' : '') + '><header><strong>' + escapeHtml(message.displayName) + '</strong><time>' + escapeHtml(validTime) + '</time></header>' +
          '<p>' + (message.deleted ? '此消息已由主持人删除。' : escapeHtml(message.content)) + '</p>' +
          (canDelete && !message.deleted ? '<button type="button" data-chat-delete="' + escapeHtml(message.id) + '">删除</button>' : '') + '</li>';
      }).join('') : '<li class="campaign-chat-empty">还没有消息。可以从一句开场问候开始。</li>';
      rootElement.querySelectorAll('[data-chat-delete]').forEach(function (button) {
        button.addEventListener('click', function () {
          if (!root.confirm('删除这条全团消息？删除记录仍会保留在审计中。')) return;
          button.disabled = true;
          if (!transport || !transport.isWritable()) { showError('当前已离线；重新连接前不能删除消息。'); button.disabled = false; return; }
          transport.command('message.delete', { messageId:button.getAttribute('data-chat-delete') }).then(function () {
            var target = messages.find(function (item) { return item.id === button.getAttribute('data-chat-delete'); });
            if (target) target.deleted = true;
            render();
          }).catch(function (error) { showError(error.message); button.disabled = false; });
        });
      });
    }
    function merge(rawMessages, prepend) {
      var normalized = (Array.isArray(rawMessages) ? rawMessages : []).map(chatMessage).filter(Boolean);
      var combined = prepend ? normalized.concat(messages) : messages.concat(normalized);
      var seen = Object.create(null);
      messages = combined.filter(function (message) { if (seen[message.id]) return false; seen[message.id] = true; return true; }).sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
      render();
    }
    function showError(message) { errorElement.textContent = message || ''; errorElement.hidden = !message; }
    function loadEarlier(initial) {
      if (loading || exhausted) return Promise.resolve();
      loading = true;
      rootElement.querySelector('[data-chat-earlier]').disabled = true;
      var before = hasLoadedPage ? nextBefore : '';
      return getMessages(input.campaignId, { before:before, limit:40 }).then(function (payload) {
        var page = payload.messages || payload.items || [];
        merge(page, true);
        hasLoadedPage = true;
        nextBefore = safeText(payload.nextBefore || payload.cursor, 300);
        exhausted = !nextBefore || page.length < 40;
        rootElement.querySelector('[data-chat-earlier]').textContent = exhausted ? '已经到最早一条' : '读取更早消息';
        if (initial) root.setTimeout(function () { list.scrollTop = list.scrollHeight; }, 0);
      }).catch(function (error) { showError(error.message); }).finally(function () {
        loading = false;
        rootElement.querySelector('[data-chat-earlier]').disabled = exhausted;
      });
    }
    function setOpen(next) {
      open = next;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) { unread = 0; updateUnread(); root.setTimeout(function () { textarea.focus(); list.scrollTop = list.scrollHeight; }, 0); }
    }
    toggle.addEventListener('click', function () { setOpen(!open); });
    rootElement.querySelector('[data-chat-close]').addEventListener('click', function () { setOpen(false); toggle.focus(); });
    rootElement.querySelector('[data-chat-earlier]').addEventListener('click', function () { loadEarlier(false); });
    textarea.addEventListener('input', function () { count.textContent = textarea.value.length + ' / ' + MAX_CHAT_LENGTH; showError(''); });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var content = safeText(textarea.value, MAX_CHAT_LENGTH);
      if (!content) return;
      if (!transport || !transport.isWritable()) { showError('当前已离线；重新连接前不能发送消息。'); return; }
      submit.disabled = true;
      transport.command('player.message', { content:content, message:content }).then(function () {
        textarea.value = ''; count.textContent = '0 / ' + MAX_CHAT_LENGTH; showError('');
        root.setTimeout(function () { list.scrollTop = list.scrollHeight; }, 0);
      }).catch(function (error) { showError(error.message); }).finally(function () { submit.disabled = false; });
    });
    if (transport) {
      transport.on('status', function (status) {
        connection.textContent = status.label;
        submit.disabled = !status.writable;
        textarea.disabled = !status.writable;
      });
      transport.on('event', function (event) {
        var kind = safeText(event && (event.kind || event.type), 80);
        var payload = event && event.payload || event;
        if (kind === 'message.created' || kind === 'player.message' || kind === 'chat.message') {
          var created = chatMessage(payload);
          if (!created) return;
          merge([created], false);
          if (!open || root.document.hidden) { unread += 1; updateUnread(); }
          else root.setTimeout(function () { list.scrollTop = list.scrollHeight; }, 0);
        }
        if (kind === 'message.deleted' || kind === 'chat.deleted') {
          var id = safeText(payload && (payload.id || payload.messageId), 160);
          var target = messages.find(function (item) { return item.id === id; });
          if (target) { target.deleted = true; render(); }
        }
      });
    }
    loadEarlier(true);
    updateUnread();
    return { open:function () { setOpen(true); }, close:function () { setOpen(false); }, refresh:function () { exhausted = false; nextBefore = ''; hasLoadedPage = false; return loadEarlier(true); } };
  }

  root.NGCampaign = Object.freeze({
    protocol:PROTOCOL,
    versions:versions,
    maxChatLength:MAX_CHAT_LENGTH,
    request:request,
    campaignIdFromLocation:campaignIdFromLocation,
    inviteTokenFromLocation:inviteTokenFromLocation,
    fragmentRoute:fragmentRoute,
    registerAdapter:registerAdapter,
    getAdapter:getAdapter,
    NullGrailAdapter:NullGrailAdapter,
    listCampaigns:listCampaigns,
    createCampaign:createCampaign,
    getCampaign:getCampaign,
    archiveCampaign:archiveCampaign,
    renameCampaign:renameCampaign,
    restoreCampaign:restoreCampaign,
    deleteCampaign:deleteCampaign,
    createInvite:createInvite,
    revokeInvite:revokeInvite,
    rotateInvite:rotateInvite,
    joinCampaign:joinCampaign,
    bindCampaign:bindCampaign,
    getSnapshot:getSnapshot,
    sendCampaignCommand:sendCampaignCommand,
    importCampaign:importCampaign,
    previewCampaignImport:previewCampaignImport,
    exportCampaign:exportCampaign,
    getMessages:getMessages,
    LocalTransport:LocalTransport,
    RoomTransport:RoomTransport,
    createLocalTransport:function (options) { return new LocalTransport(options); },
    createRoomTransport:function (options) { return new RoomTransport(options); },
    mountChat:mountChat,
    makeId:makeId,
    safeText:safeText,
    inputText:inputText
  });
})(typeof window !== 'undefined' ? window : globalThis);
