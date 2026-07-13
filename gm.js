(function () {
  'use strict';

  var data = window.NG_DATA;
  if (!data) return;

  var STORAGE_KEY = 'ng-session:null-grail-v3.2';
  var STATE_SCHEMA_VERSION = 8;
  var playerData = window.NG_PLAYER_DATA || {};
  var RULESET_ID = playerData.rulesetId || data.rulesetId || 'null-grail-core-d20-v2.0';
  var coc7 = window.COC7_CORE || null;
  var coc7Xlsx = window.COC7_XLSX || null;
  var MESSAGE_PROTOCOL = playerData.protocol || 'null-grail-player-v3';
  var CHARACTER_PROTOCOL = playerData.characterProtocol || 'null-grail-character-v1';
  var CHARACTER_COLLECTION_PROTOCOL = playerData.characterCollectionProtocol || 'null-grail-character-collection-v1';
  var CHANNEL_NAME = playerData.channelName || 'null-grail-player';
  var attributes = Array.isArray(playerData.attributes) ? playerData.attributes : [];
  var skills = Array.isArray(playerData.skills) ? playerData.skills : [];
  var difficulties = Array.isArray(playerData.difficulties) ? playerData.difficulties : [];
  var resultBands = Array.isArray(playerData.resultBands) ? playerData.resultBands : [];
  var LEGACY_RULESET_IDS = ['null-grail-core-d20-v2','null-grail-v3.2-light-d20'];
  var LEGACY_CHARACTER_PROTOCOLS = ['null-grail-character-v1','null-grail-character-v2'];
  var LEGACY_COLLECTION_PROTOCOLS = ['null-grail-character-collection-v1','null-grail-character-collection-v2'];
  var LEGACY_CHECK_PROTOCOLS = ['null-grail-check-v1'];
  var channel = null;
  var undoStack = [];
  var requestedView = new URLSearchParams(window.location.search).get('view');
  var currentView = ['current','timeline','map','npcs','truths','handouts','tabletop','combat','log'].indexOf(requestedView) !== -1 ? requestedView : 'current';
  var npcFilter = 'all';
  var mapFilter = 'all';
  var selectedLocationId = null;
  var activeCheckRequestId = null;
  var toastTimer = null;
  var lastPlayerPayload = null;
  var playerWindows = [];
  var messageOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
  var allowedSealStates = ['blank','used','anchored','locked'];
  var AUDIT_ALLIANCE_STATES = [
    { id:'unspoken', label:'未谈' },
    { id:'conditional', label:'有条件' },
    { id:'confirmed', label:'确认' },
    { id:'withdrawn', label:'撤回' }
  ];
  var AUDIT_FRAGMENT_WILLINGNESS = [
    { id:'unasked', label:'未询问' },
    { id:'refused', label:'拒绝' },
    { id:'hesitant', label:'犹豫' },
    { id:'conditional', label:'有条件' },
    { id:'willing', label:'愿意交付' },
    { id:'delivered', label:'已交付' }
  ];
  var AUDIT_CONSENT_STATES = [
    { id:'unasked', label:'未询问' },
    { id:'conditional', label:'犹豫／有条件' },
    { id:'consented', label:'明确同意' },
    { id:'refused', label:'明确拒绝' },
    { id:'withdrawn', label:'已撤回' }
  ];

  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = function (event) {
      var message = event.data;
      if (!message || typeof message !== 'object') return;
      if (message.protocol !== MESSAGE_PROTOCOL) return;
      if (message.type === 'ready') {
        sendPlayerMessage(lastPlayerPayload
          ? { type:'show', handout:lastPlayerPayload }
          : { type:'curtain' });
        sendPlayerMapState({ openMap:state.playerProjection === 'map' });
        var readyCharacterId = normalizeId(message.characterId, 'pc', false);
        var latestResult = state && state.checkHistory.find(function (result) {
          return result.targetCharacterId === 'all' || (readyCharacterId && result.targetCharacterId === readyCharacterId);
        });
        if (latestResult) sendPlayerMessage({ type:'check-result', result:latestResult });
        return;
      }
      if (message.type === 'character-submit') receiveCharacterSubmission(message);
      if (message.type === 'check-request') receiveCheckRequest(message.request);
    };
  } catch (error) { channel = null; }

  function freshSessionAudit() {
    return {
      factionClocks: [
        { id:'faction-1', name:'川风家', value:0 },
        { id:'faction-2', name:'大目／龙之助', value:0 },
        { id:'faction-3', name:'久保观测计划', value:0 },
        { id:'faction-4', name:'城市恐慌', value:0 }
      ],
      alliancePromises: ['莱茵', '阿罗德', '久保', '茂'].map(function (target, index) {
        return { id:'alliance-' + (index + 1), target:target, promise:'', status:'unspoken' };
      }),
      fragments: [
        { id:'theory', label:'理论碎片', holder:'', leaning:'', willingness:'unasked' },
        { id:'memory', label:'记忆碎片', holder:'', leaning:'', willingness:'unasked' },
        { id:'observation', label:'观测碎片', holder:'', leaning:'', willingness:'unasked' }
      ],
      finaleConsent: {
        tano:{ status:'unasked', quote:'' },
        shigeru:{ status:'unasked', quote:'' }
      },
      deliveryFollowUps: []
    };
  }

  function freshState() {
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      campaignVersion: '3.2',
      dayId: 'D1',
      loop: 0,
      activeSceneId: null,
      activeNpcs: [],
      trackers: { anomaly: 2, grail: 0, anchor: 0, theory: 0, memory: 0, observation: 0 },
      seals: ['blank', 'blank', 'blank'],
      sealMeta: [{ reflownLoop:-1, note:'' }, { reflownLoop:-1, note:'' }, { reflownLoop:-1, note:'' }],
      reflowsThisSession: 0,
      finaleSeal: 'unavailable',
      completedScenes: [],
      resolvedNodes: [],
      sceneResults: {},
      resetHistory: [],
      anchoredFacts: [],
      sceneClues: {},
      sceneClockProgress: {},
      sceneSideObjectives: {},
      sceneAssignments: {},
      revealedHandouts: [],
      activeHandoutId: null,
      playerProjection: 'curtain',
      publicMap: { visible:false, activeLocationId:null, locationIds:[], sceneIds:[], updatedAt:'' },
      knownTruthSources: {},
      visitedLocations: [],
      npcLocations: {},
      conflictClocks: { goal:0, threat:0, goalLabel:'玩家目标', threatLabel:'敌方／环境威胁' },
      sessionAudit: freshSessionAudit(),
      roster: [],
      combatScenes: [],
      activeCombatId: null,
      characterInbox: [],
      checkRequests: [],
      checkHistory: [],
      sessionNotes: '',
      clueNotes: '',
      log: []
    };
  }

  function clampNumber(value, minimum, maximum, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) number = fallback;
    return Math.max(minimum, Math.min(maximum, number));
  }

  function clampInteger(value, minimum, maximum, fallback) {
    return Math.round(clampNumber(value, minimum, maximum, fallback));
  }

  function safeText(value, maximum) {
    var text = typeof value === 'string' ? value : '';
    return text.replace(/\u0000/g, '').trim().slice(0, maximum);
  }

  function auditStatus(value, definitions, fallback) {
    return definitions.some(function (item) { return item.id === value; }) ? value : fallback;
  }

  function normalizeSessionAudit(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    var base = freshSessionAudit();
    var factionSource = Array.isArray(source.factionClocks) ? source.factionClocks : [];
    var allianceSource = Array.isArray(source.alliancePromises) ? source.alliancePromises : [];
    var fragmentSource = Array.isArray(source.fragments) ? source.fragments : [];
    var consentSource = source.finaleConsent && typeof source.finaleConsent === 'object' ? source.finaleConsent : {};

    var factions = base.factionClocks.map(function (fallback, index) {
      var item = factionSource[index] && typeof factionSource[index] === 'object' ? factionSource[index] : {};
      return {
        id:fallback.id,
        name:safeText(item.name, 80) || fallback.name,
        value:clampInteger(item.value, 0, 4, 0)
      };
    });
    var alliances = base.alliancePromises.map(function (fallback, index) {
      var item = allianceSource[index] && typeof allianceSource[index] === 'object' ? allianceSource[index] : {};
      return {
        id:fallback.id,
        target:safeText(item.target, 120),
        promise:safeText(item.promise, 500),
        status:auditStatus(item.status, AUDIT_ALLIANCE_STATES, 'unspoken')
      };
    });
    var fragments = base.fragments.map(function (fallback, index) {
      var item = fragmentSource.find(function (candidate) { return candidate && candidate.id === fallback.id; }) || fragmentSource[index] || {};
      return {
        id:fallback.id,
        label:fallback.label,
        holder:safeText(item.holder, 120),
        leaning:safeText(item.leaning, 300),
        willingness:auditStatus(item.willingness, AUDIT_FRAGMENT_WILLINGNESS, 'unasked')
      };
    });
    function normalizeConsent(person) {
      var item = consentSource[person] && typeof consentSource[person] === 'object' ? consentSource[person] : {};
      return {
        status:auditStatus(item.status, AUDIT_CONSENT_STATES, 'unasked'),
        quote:safeText(item.quote, 1000)
      };
    }
    var deliveries = (Array.isArray(source.deliveryFollowUps) ? source.deliveryFollowUps : []).map(function (item) {
      if (!item || typeof item !== 'object') return null;
      var handout = safeText(item.handout, 120);
      var target = safeText(item.target, 120);
      if (!handout || !target) return null;
      return {
        id:normalizeId(item.id, 'delivery', true),
        handout:handout,
        deliveredAt:safeText(item.deliveredAt, 40),
        target:target,
        misread:safeText(item.misread, 600),
        followUp:safeText(item.followUp, 600)
      };
    }).filter(Boolean).slice(0, 120);

    return {
      factionClocks:factions,
      alliancePromises:alliances,
      fragments:fragments,
      finaleConsent:{ tano:normalizeConsent('tano'), shigeru:normalizeConsent('shigeru') },
      deliveryFollowUps:deliveries
    };
  }

  function normalizeSceneRunbookState(rawClocks, rawObjectives, rawAssignments) {
    var clocks = {};
    var objectives = {};
    var assignments = {};
    var clockSource = rawClocks && typeof rawClocks === 'object' ? rawClocks : {};
    var objectiveSource = rawObjectives && typeof rawObjectives === 'object' ? rawObjectives : {};
    var assignmentSource = rawAssignments && typeof rawAssignments === 'object' ? rawAssignments : {};
    data.scenes.forEach(function (scene) {
      var sceneClocks = Array.isArray(scene.clocks) ? scene.clocks : [];
      if (sceneClocks.length) {
        var supplied = clockSource[scene.id] && typeof clockSource[scene.id] === 'object' ? clockSource[scene.id] : {};
        clocks[scene.id] = {};
        sceneClocks.forEach(function (clock) { clocks[scene.id][clock.id] = clampInteger(supplied[clock.id], 0, Number(clock.max) || 4, 0); });
      }
      var validObjectives = (Array.isArray(scene.sideObjectives) ? scene.sideObjectives : []).map(function (item) { return item.id; });
      if (validObjectives.length) objectives[scene.id] = (Array.isArray(objectiveSource[scene.id]) ? objectiveSource[scene.id] : []).filter(function (id, index, list) { return validObjectives.indexOf(id) !== -1 && list.indexOf(id) === index; });
      var assignmentCount = Array.isArray(scene.allyAssignments) ? scene.allyAssignments.length : 0;
      if (assignmentCount) assignments[scene.id] = (Array.isArray(assignmentSource[scene.id]) ? assignmentSource[scene.id] : []).map(Number).filter(function (index, at, list) { return Number.isInteger(index) && index >= 0 && index < assignmentCount && list.indexOf(index) === at; });
    });
    return { clocks:clocks, objectives:objectives, assignments:assignments };
  }

  function createId(prefix) {
    var random = '';
    try {
      var bytes = new Uint32Array(2);
      window.crypto.getRandomValues(bytes);
      random = bytes[0].toString(36) + bytes[1].toString(36);
    } catch (error) {
      random = Math.random().toString(36).slice(2, 14);
    }
    return prefix + '-' + Date.now().toString(36) + '-' + random.slice(0, 16);
  }

  function normalizeId(value, prefix, createWhenMissing) {
    var id = safeText(value, 64);
    if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) return id;
    return createWhenMissing ? createId(prefix) : '';
  }

  function firstDefined() {
    for (var index = 0; index < arguments.length; index += 1) {
      if (arguments[index] !== undefined && arguments[index] !== null) return arguments[index];
    }
    return undefined;
  }

  function compatibleRulesetId(id) {
    return !id || id === RULESET_ID || LEGACY_RULESET_IDS.indexOf(id) !== -1;
  }

  function compatibleCharacterProtocol(protocol) {
    return !protocol || protocol === CHARACTER_PROTOCOL || LEGACY_CHARACTER_PROTOCOLS.indexOf(protocol) !== -1;
  }

  function compatibleCollectionProtocol(protocol) {
    return protocol === CHARACTER_COLLECTION_PROTOCOL || LEGACY_COLLECTION_PROTOCOLS.indexOf(protocol) !== -1;
  }

  function compatibleCheckProtocol(protocol) {
    return !protocol || protocol === (playerData.checkProtocol || 'null-grail-check-v2') || LEGACY_CHECK_PROTOCOLS.indexOf(protocol) !== -1;
  }

  function attributeDefinition(id) {
    return attributes.find(function (item) { return item.id === id; }) || attributes[0] || { id:'physique', label:'体魄' };
  }

  function migratedAttributeId(id) {
    return { insight:'perception', lore:'knowledge', rapport:'will' }[id] || id;
  }

  function skillDefinition(idOrLabel) {
    return skills.find(function (item) { return item.id === idOrLabel || item.label === idOrLabel; }) || null;
  }

  function skillLevel(value) {
    if (value === 'trained') return 1;
    if (value === 'expert') return 2;
    return clampInteger(value, 0, 2, 0);
  }

  function skillBonus(value) {
    return skillLevel(value) * 2;
  }

  function blankAttributes() {
    var output = {};
    attributes.forEach(function (item) { output[item.id] = 0; });
    return output;
  }

  function blankSkills() {
    var output = {};
    skills.forEach(function (item) { output[item.id] = 0; });
    return output;
  }

  function derivedCharacterValues(character) {
    var values = character && character.attributes || {};
    var servant = character && character.identityType === 'servant';
    var magus = character && character.identityType === 'magus';
    return {
      maxHp:(servant ? 18 : 8) + Number(values.endurance || 0) * (servant ? 3 : 2),
      maxMp:servant ? 6 + Number(values.mana || 0) * 2 : (magus ? 4 + Number(values.mana || 0) * 2 : 0)
    };
  }

  function bandDefinition(id) {
    return resultBands.find(function (item) { return item.id === id; }) || { id:id, label:id };
  }

  function normalizeCharacter(raw, createWhenMissing) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (raw.character && typeof raw.character === 'object') raw = raw.character;
    if (coc7 && (raw.protocol === coc7.protocol || raw.rulesetId === coc7.rulesetId)) {
      try {
        var investigator = coc7.normalizeCharacter(raw, createWhenMissing !== false ? function () { return createId('coc7'); } : false);
        if (!investigator.id || !investigator.name) return investigator;
        investigator.updatedAt = safeText(raw.updatedAt, 40) || new Date().toISOString();
        return investigator;
      } catch (error) { return null; }
    }
    if (!compatibleCharacterProtocol(raw.protocol) || !compatibleRulesetId(raw.rulesetId)) return null;

    var legacyExistence = safeText(raw.existenceType, 24);
    var identityType = ['mortal','magus','servant'].indexOf(raw.identityType) !== -1
      ? raw.identityType
      : (legacyExistence === 'servant' ? 'servant' : 'mortal');
    var output = {
      protocol:CHARACTER_PROTOCOL,
      rulesetId:RULESET_ID,
      rulesetVersion:safeText(raw.rulesetVersion, 80) || 'v2.0·车卡增订',
      id:normalizeId(raw.id, 'pc', createWhenMissing !== false),
      name:safeText(raw.name, 80),
      playerName:safeText(raw.playerName, 80),
      pronouns:safeText(raw.pronouns, 80),
      origin:safeText(firstDefined(raw.origin, raw.realIdentity), 160),
      identity:safeText(firstDefined(raw.identity, raw.realIdentity), 400),
      wish:safeText(firstDefined(raw.wish, raw.wishMotivation), 600),
      boundary:safeText(firstDefined(raw.boundary, raw.fearedIdentity, raw.boundaryFear), 500),
      identityType:identityType,
      isMaster:identityType !== 'servant' && (raw.isMaster === true || legacyExistence === 'master'),
      attributes:blankAttributes(),
      skills:blankSkills(),
      ordinary:{ backgroundId:'', realAdvantage:'', contacts:['',''], safePlace:'', equipment:'', signatureTalent:'' },
      magus:{ lineages:[], spellIds:[], mysticCodeId:'', limitation:'' },
      servant:{ classId:'saber', publicTitle:'', trueName:'', legendCore:'', luck:'C', weaknesses:['',''], refusedCommand:'', retainedSkills:[], noblePhantasm:{ name:'', rank:'C', type:'对人', cost:'5 MP', effect:'', counter:'' } },
      master:{ servantName:'', supplyLevel:'stable', communicationDistance:'', source:'', termination:'', masterRefusal:'', servantRefusal:'', commandSeals:3 },
      current:{ hp:null, mp:null, resolve:3, armor:0, conditions:[], notes:'' },
      createdAt:safeText(raw.createdAt, 40) || new Date().toISOString(),
      updatedAt:safeText(raw.updatedAt, 40) || new Date().toISOString()
    };

    var suppliedAttributes = raw.attributes && typeof raw.attributes === 'object' ? raw.attributes : {};
    var legacyApproaches = raw.approaches && typeof raw.approaches === 'object' ? raw.approaches : null;
    attributes.forEach(function (definition) {
      var legacyValue;
      if (legacyApproaches) {
        if (definition.id === 'physique') legacyValue = legacyApproaches.physique;
        if (definition.id === 'perception') legacyValue = legacyApproaches.insight;
        if (definition.id === 'knowledge') legacyValue = legacyApproaches.lore;
        if (definition.id === 'will') legacyValue = Math.max(Number(legacyApproaches.will || 0), Number(legacyApproaches.rapport || 0));
      }
      output.attributes[definition.id] = clampInteger(firstDefined(suppliedAttributes[definition.id], legacyValue), 0, 4, 0);
    });

    var suppliedSkills = raw.skills && typeof raw.skills === 'object' ? raw.skills : {};
    skills.forEach(function (definition) { output.skills[definition.id] = skillLevel(suppliedSkills[definition.id]); });
    var unmappedSpecialties = [];
    if (Array.isArray(raw.specialties)) raw.specialties.slice(0, 12).forEach(function (entry) {
      var name = safeText(typeof entry === 'string' ? entry : entry && entry.name, 80);
      var definition = skillDefinition(name);
      if (definition) output.skills[definition.id] = Math.max(output.skills[definition.id], 1);
      else if (name && unmappedSpecialties.indexOf(name) === -1) unmappedSpecialties.push(name);
    });

    var ordinary = raw.ordinary || {};
    output.ordinary.backgroundId = safeText(firstDefined(ordinary.backgroundId, raw.backgroundId), 80);
    output.ordinary.realAdvantage = safeText(firstDefined(ordinary.realAdvantage, ordinary.realAdvantageId, raw.realAdvantageId), 160);
    var contacts = firstDefined(ordinary.contacts, raw.contacts);
    output.ordinary.contacts = Array.isArray(contacts) ? contacts.slice(0, 2).map(function (item) { return safeText(item, 120); }) : ['',''];
    while (output.ordinary.contacts.length < 2) output.ordinary.contacts.push('');
    output.ordinary.safePlace = safeText(firstDefined(ordinary.safePlace, raw.safePlace), 160);
    var equipment = firstDefined(ordinary.equipment, raw.equipment);
    output.ordinary.equipment = safeText(Array.isArray(equipment) ? equipment.join('、') : equipment, 220);
    var signatureTalent = firstDefined(ordinary.signatureTalent, raw.signatureTalent);
    output.ordinary.signatureTalent = safeText(typeof signatureTalent === 'object' ? JSON.stringify(signatureTalent) : signatureTalent, 1000);

    var magus = raw.magus || {};
    output.magus.lineages = (Array.isArray(firstDefined(magus.lineages, raw.lineages)) ? firstDefined(magus.lineages, raw.lineages) : []).map(function (item) { return safeText(item, 80); }).filter(Boolean).slice(0, 2);
    output.magus.spellIds = (Array.isArray(firstDefined(magus.spellIds, raw.spellIds)) ? firstDefined(magus.spellIds, raw.spellIds) : []).map(function (item) { return safeText(item, 100); }).filter(Boolean).slice(0, 4);
    output.magus.mysticCodeId = safeText(firstDefined(magus.mysticCodeId, raw.mysticCodeId), 100);
    output.magus.limitation = safeText(firstDefined(magus.limitation, raw.mediumRestriction, raw.mysticCodeRestriction), 300);

    var servant = raw.servant || {};
    output.servant.classId = safeText(servant.classId, 80) || 'saber';
    output.servant.publicTitle = safeText(firstDefined(servant.publicTitle, servant.publicName), 120);
    output.servant.trueName = safeText(servant.trueName, 160);
    output.servant.legendCore = safeText(servant.legendCore, 600);
    output.servant.luck = ['D','C','B','A'].indexOf(firstDefined(servant.luck, servant.luckRank)) !== -1 ? firstDefined(servant.luck, servant.luckRank) : 'C';
    var weaknesses = firstDefined(servant.weaknesses, servant.conceptWeaknesses);
    output.servant.weaknesses = Array.isArray(weaknesses) ? weaknesses.slice(0, 3).map(function (item) { return safeText(item, 180); }) : ['',''];
    while (output.servant.weaknesses.length < 2) output.servant.weaknesses.push('');
    output.servant.refusedCommand = safeText(firstDefined(servant.refusedCommand, servant.neverAccepts), 220);
    output.servant.retainedSkills = (Array.isArray(servant.retainedSkills) ? servant.retainedSkills : []).slice(0, 3).map(function (item) {
      item = item && typeof item === 'object' ? item : {};
      return { name:safeText(item.name, 120), rank:['E','D','C','B','A'].indexOf(item.rank) !== -1 ? item.rank : 'C', effect:safeText(firstDefined(item.effect, item.summary), 1200) };
    });
    while (output.servant.retainedSkills.length < 3) output.servant.retainedSkills.push({ name:'', rank:output.servant.retainedSkills.length ? 'C' : 'B', effect:'' });
    var noble = servant.noblePhantasm && typeof servant.noblePhantasm === 'object' ? servant.noblePhantasm : {};
    output.servant.noblePhantasm = {
      name:safeText(noble.name, 180), rank:['E','D','C','B','A'].indexOf(noble.rank) !== -1 ? noble.rank : 'C',
      type:safeText(noble.type, 80) || '对人', cost:safeText(noble.cost, 80) || '5 MP',
      effect:safeText(firstDefined(noble.effect, noble.summary), 1200), counter:safeText(noble.counter, 800)
    };

    var master = firstDefined(raw.master, raw.masterContract) || {};
    output.master = {
      servantName:safeText(firstDefined(master.servantName, master.servantPublicName), 160),
      supplyLevel:safeText(master.supplyLevel, 80) || 'stable',
      communicationDistance:safeText(master.communicationDistance, 160),
      source:safeText(firstDefined(master.source, master.contractSource), 220),
      termination:safeText(firstDefined(master.termination, master.terminationConditions), 220),
      masterRefusal:safeText(firstDefined(master.masterRefusal, master.masterNeverCommands), 220),
      servantRefusal:safeText(firstDefined(master.servantRefusal, master.servantNeverAccepts), 220),
      commandSeals:clampInteger(master.commandSeals, 0, 3, 3)
    };

    var current = raw.current && typeof raw.current === 'object' ? raw.current : {};
    var legacyConditions = [];
    var injury = ['light','serious','critical'].indexOf(raw.injury) !== -1 ? raw.injury : '';
    if (injury) legacyConditions.push({ light:'轻伤', serious:'重伤', critical:'濒危' }[injury]);
    var legacyStress = clampInteger(raw.stress, 0, 3, 0);
    if (legacyStress) legacyConditions.push('压力 ' + legacyStress + '/3');
    var trauma = Array.isArray(raw.trauma) ? raw.trauma : (typeof raw.trauma === 'string' ? raw.trauma.split(/\r?\n/) : []);
    trauma.forEach(function (item) { item = safeText(item, 120); if (item) legacyConditions.push(item); });
    var coreLoad = clampInteger(raw.coreLoad, 0, 3, 0);
    if (coreLoad) legacyConditions.push('灵核负荷 ' + coreLoad + '/3');
    if (raw.noblePhantasmReady === false) legacyConditions.push('宝具已使用');
    output.current.conditions = (Array.isArray(current.conditions) ? current.conditions : legacyConditions).slice(0, 12).map(function (item) { return safeText(item, 120); }).filter(Boolean);
    output.current.resolve = clampInteger(firstDefined(current.resolve, raw.resolve), 0, 3, 3);
    output.current.armor = clampInteger(firstDefined(current.armor, raw.armor), 0, 20, 0);
    var notes = safeText(firstDefined(current.notes, raw.notes), 1600);
    if (unmappedSpecialties.length && notes.indexOf('旧版专长：') === -1) notes = safeText((notes ? notes + '\n' : '') + '旧版专长：' + unmappedSpecialties.join('、'), 1600);
    output.current.notes = notes;
    var derived = derivedCharacterValues(output);
    output.current.hp = current.hp === null || current.hp === '' || current.hp === undefined ? derived.maxHp : clampInteger(current.hp, 0, 99, derived.maxHp);
    output.current.mp = current.mp === null || current.mp === '' || current.mp === undefined ? derived.maxMp : clampInteger(current.mp, 0, 99, derived.maxMp);
    return output;
  }

  function normalizeSubmission(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.character || typeof raw.character !== 'object') return null;
    var character = normalizeCharacter(raw.character, false);
    var id = normalizeId(raw.id || raw.submissionId, 'submission', false);
    if (!id || !character || !character.id || !character.name) return null;
    return { id:id, receivedAt:safeText(raw.receivedAt || raw.sentAt, 40) || new Date().toISOString(), character:character };
  }

  function isCoc7Character(character) {
    return Boolean(coc7 && character && (character.protocol === coc7.protocol || character.rulesetId === coc7.rulesetId));
  }

  function normalizeCombatScene(raw, roster) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    var validIds = (Array.isArray(roster) ? roster : []).map(function (character) { return character.id; });
    var participantIds = [];
    (Array.isArray(raw.participantIds) ? raw.participantIds : []).slice(0, 40).forEach(function (value) {
      var id = normalizeId(value, 'pc', false);
      if (id && validIds.indexOf(id) !== -1 && participantIds.indexOf(id) === -1) participantIds.push(id);
    });
    var events = [];
    (Array.isArray(raw.events) ? raw.events : []).slice(0, 160).forEach(function (event) {
      if (!event || typeof event !== 'object') return;
      events.push({
        id:normalizeId(event.id, 'combat-event', true),
        at:safeText(event.at, 40) || new Date().toISOString(),
        type:['attack','damage','heal','resource','turn','status','system'].indexOf(event.type) !== -1 ? event.type : 'system',
        label:safeText(event.label, 180),
        detail:safeText(event.detail, 1200)
      });
    });
    var status = raw.status === 'ended' ? 'ended' : 'active';
    var readyFirearmIds = [];
    (Array.isArray(raw.readyFirearmIds) ? raw.readyFirearmIds : []).forEach(function (value) {
      var id = normalizeId(value, 'pc', false);
      if (participantIds.indexOf(id) !== -1 && readyFirearmIds.indexOf(id) === -1) readyFirearmIds.push(id);
    });
    var suppliedInitiative = raw.initiativeScores && typeof raw.initiativeScores === 'object' ? raw.initiativeScores : {};
    var initiativeScores = {};
    participantIds.forEach(function (id) {
      var character = (Array.isArray(roster) ? roster : []).find(function (item) { return item.id === id; });
      var fallback = isCoc7Character(character) ? Number(character.characteristics.dex) || 0 : Math.max(Number(character && character.attributes && character.attributes.agility) || 0, Number(character && character.attributes && character.attributes.perception) || 0);
      initiativeScores[id] = clampInteger(suppliedInitiative[id], 0, 999, fallback);
    });
    return {
      id:normalizeId(raw.id, 'combat', true),
      name:safeText(raw.name, 100) || '未命名战斗',
      status:status,
      round:clampInteger(raw.round, 1, 999, 1),
      turnIndex:participantIds.length ? clampInteger(raw.turnIndex, 0, participantIds.length - 1, 0) : 0,
      participantIds:participantIds,
      readyFirearmIds:readyFirearmIds,
      initiativeScores:initiativeScores,
      events:events,
      createdAt:safeText(raw.createdAt, 40) || new Date().toISOString(),
      updatedAt:safeText(raw.updatedAt, 40) || new Date().toISOString()
    };
  }

  function normalizeCheckRequest(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (!compatibleCheckProtocol(raw.protocol) || !compatibleRulesetId(raw.rulesetId)) return null;
    var id = normalizeId(raw.id, 'request', false);
    var characterId = normalizeId(raw.characterId, 'pc', false);
    var goal = safeText(raw.goal, 500);
    if (!id || !characterId || !goal) return null;
    var attribute = attributeDefinition(migratedAttributeId(safeText(firstDefined(raw.attributeId, raw.approachId), 24)));
    var requestedSkill = skillDefinition(safeText(firstDefined(raw.skillId, raw.skillLabel, raw.specialty), 80));
    var legacySkillLabel = safeText(firstDefined(raw.skillLabel, raw.specialty), 80);
    return {
      id:id,
      characterId:characterId,
      characterName:safeText(raw.characterName, 80) || '未命名角色',
      goal:goal,
      risk:safeText(raw.risk, 500),
      attributeId:attribute.id,
      attributeLabel:attribute.label,
      attributeValue:clampInteger(firstDefined(raw.attributeValue, raw.approachValue), 0, 5, 0),
      skillId:requestedSkill ? requestedSkill.id : '',
      skillLabel:requestedSkill ? requestedSkill.label : legacySkillLabel,
      skillBonus:clampInteger(firstDefined(raw.skillBonus, raw.specialtyBonus), 0, 4, legacySkillLabel ? 2 : 0),
      mode:['normal','advantage','disadvantage'].indexOf(raw.mode) !== -1 ? raw.mode : 'normal',
      assist:clampInteger(raw.assist, 0, 3, 0),
      modifier:clampInteger(raw.modifier, -20, 20, 0),
      suggestedDc:clampInteger(raw.suggestedDc, 0, 40, 0),
      createdAt:safeText(raw.createdAt, 40) || new Date().toISOString()
    };
  }

  function normalizeCheckResult(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    var id = normalizeId(raw.id, 'result', false);
    var tier = ['exceptional','success','costly','severe'].indexOf(raw.tier) !== -1 ? raw.tier : '';
    var dice = Array.isArray(raw.dice) ? raw.dice.slice(0, 2).map(function (die) { return clampInteger(die, 1, 20, 1); }) : [];
    if (!id || !tier || !dice.length) return null;
    var attribute = attributeDefinition(migratedAttributeId(safeText(firstDefined(raw.attributeId, raw.approachId), 24)));
    var resultSkill = skillDefinition(safeText(firstDefined(raw.skillId, raw.skillLabel, raw.specialty), 80));
    var legacySkillLabel = safeText(firstDefined(raw.skillLabel, raw.specialty), 80);
    return {
      id:id,
      requestId:normalizeId(raw.requestId, 'request', false),
      targetCharacterId:normalizeId(raw.targetCharacterId, 'pc', false) || 'all',
      characterName:safeText(raw.characterName, 80) || '全体玩家',
      goal:safeText(raw.goal, 500),
      risk:safeText(raw.risk, 500),
      costOwner:safeText(raw.costOwner, 80),
      attributeId:attribute.id,
      attributeLabel:attribute.label,
      attributeValue:clampInteger(firstDefined(raw.attributeValue, raw.approachValue), 0, 5, 0),
      skillId:resultSkill ? resultSkill.id : '',
      skillLabel:resultSkill ? resultSkill.label : legacySkillLabel,
      skillBonus:clampInteger(firstDefined(raw.skillBonus, raw.specialtyBonus), 0, 4, 0),
      assist:clampInteger(raw.assist, 0, 3, 0),
      modifier:clampInteger(raw.modifier, -20, 20, 0),
      mode:['normal','advantage','disadvantage'].indexOf(raw.mode) !== -1 ? raw.mode : 'normal',
      dice:dice,
      kept:clampInteger(raw.kept, 1, 20, dice[0]),
      dc:clampInteger(raw.dc, 1, 40, 13),
      total:clampInteger(raw.total, -50, 100, 0),
      tier:tier,
      tierLabel:bandDefinition(tier).label,
      publicNote:safeText(raw.publicNote, 800),
      createdAt:safeText(raw.createdAt, 40) || new Date().toISOString()
    };
  }

  function migrateState(raw) {
    var source = raw && typeof raw === 'object' ? clone(raw) : {};
    var base = freshState();
    var migrated = Object.assign(base, source);
    migrated.schemaVersion = STATE_SCHEMA_VERSION;
    migrated.trackers = Object.assign(base.trackers, source.trackers || {});
    migrated.sceneClues = Object.assign({}, source.sceneClues || {});
    migrated.knownTruthSources = Object.assign({}, source.knownTruthSources || {});
    migrated.npcLocations = Object.assign({}, source.npcLocations || {});
    migrated.sceneResults = Object.assign({}, source.sceneResults || {});
    var runbookState = normalizeSceneRunbookState(source.sceneClockProgress, source.sceneSideObjectives, source.sceneAssignments);
    migrated.sceneClockProgress = runbookState.clocks;
    migrated.sceneSideObjectives = runbookState.objectives;
    migrated.sceneAssignments = runbookState.assignments;
    var sourcePublicMap = source.publicMap && typeof source.publicMap === 'object' ? source.publicMap : {};
    migrated.publicMap = {
      visible:sourcePublicMap.visible === true,
      activeLocationId:safeText(sourcePublicMap.activeLocationId, 16) || null,
      locationIds:Array.isArray(sourcePublicMap.locationIds) ? sourcePublicMap.locationIds.map(function (id) { return safeText(id, 16); }).filter(function (id, index, list) { return byId(data.locations, id) && list.indexOf(id) === index; }) : [],
      sceneIds:Array.isArray(sourcePublicMap.sceneIds) ? sourcePublicMap.sceneIds.map(function (id) { return safeText(id, 16); }).filter(function (id, index, list) { return byId(data.scenes, id) && list.indexOf(id) === index; }) : [],
      updatedAt:safeText(sourcePublicMap.updatedAt, 40)
    };
    if (migrated.publicMap.activeLocationId && migrated.publicMap.locationIds.indexOf(migrated.publicMap.activeLocationId) === -1) migrated.publicMap.activeLocationId = null;
    migrated.playerProjection = ['curtain','handout','map'].indexOf(source.playerProjection) !== -1 ? source.playerProjection : (source.activeHandoutId ? 'handout' : migrated.publicMap.visible ? 'map' : 'curtain');
    migrated.conflictClocks = Object.assign({}, base.conflictClocks, source.conflictClocks || {});
    migrated.conflictClocks.goal = clampNumber(migrated.conflictClocks.goal, 0, 4, 0);
    migrated.conflictClocks.threat = clampNumber(migrated.conflictClocks.threat, 0, 4, 0);
    migrated.sessionAudit = normalizeSessionAudit(source.sessionAudit);
    migrated.seals = Array.isArray(source.seals) ? source.seals.slice(0, 3) : base.seals.slice();
    while (migrated.seals.length < 3) migrated.seals.push('blank');
    migrated.seals = migrated.seals.map(function (seal) { return allowedSealStates.indexOf(seal) !== -1 ? seal : 'used'; });
    migrated.sealMeta = Array.isArray(source.sealMeta) ? source.sealMeta.slice(0, 3) : [];
    while (migrated.sealMeta.length < 3) migrated.sealMeta.push({ reflownLoop:-1, note:'' });
    migrated.sealMeta = migrated.sealMeta.map(function (item) {
      return { reflownLoop:clampNumber(item && item.reflownLoop, -1, 2, -1), note:String(item && item.note || '').slice(0, 200) };
    });
    ['completedScenes','resolvedNodes','resetHistory','anchoredFacts','revealedHandouts','visitedLocations','roster','combatScenes','characterInbox','checkRequests','checkHistory','log','activeNpcs'].forEach(function (key) {
      if (!Array.isArray(migrated[key])) migrated[key] = [];
    });
    migrated.roster = migrated.roster.map(function (item) { return normalizeCharacter(item, false); }).filter(function (item) { return item && item.id && item.name; }).slice(0, 40);
    migrated.combatScenes = migrated.combatScenes.map(function (item) { return normalizeCombatScene(item, migrated.roster); }).filter(Boolean).slice(0, 12);
    migrated.activeCombatId = normalizeId(migrated.activeCombatId, 'combat', false) || null;
    if (!migrated.combatScenes.some(function (scene) { return scene.id === migrated.activeCombatId; })) migrated.activeCombatId = null;
    migrated.characterInbox = migrated.characterInbox.map(normalizeSubmission).filter(Boolean).slice(0, 40);
    migrated.checkRequests = migrated.checkRequests.map(normalizeCheckRequest).filter(Boolean).slice(0, 60);
    migrated.checkHistory = migrated.checkHistory.map(normalizeCheckResult).filter(Boolean).slice(0, 100);
    migrated.loop = clampNumber(migrated.loop, 0, 2, 0);
    migrated.reflowsThisSession = clampNumber(migrated.reflowsThisSession, 0, 1, 0);
    if (!byId(data.days, migrated.dayId)) migrated.dayId = 'D1';
    if (migrated.activeHandoutId && !byId(data.handouts, migrated.activeHandoutId)) migrated.activeHandoutId = null;
    return migrated;
  }

  function loadState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return migrateState(parsed);
    } catch (error) {
      return freshState();
    }
  }

  var state = loadState();
  var restoredHandout = state.activeHandoutId ? byId(data.handouts, state.activeHandoutId) : null;
  if (restoredHandout) lastPlayerPayload = playerPayload(restoredHandout);

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (char) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char];
    });
  }
  function byId(list, id) { return list.find(function (item) { return item.id === id; }); }
  function currentDay() { return byId(data.days, state.dayId) || data.days[0]; }
  function nowLabel() { return new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }); }

  function playerPayload(item) {
    return {
      id: item.id,
      title: item.title,
      day: item.day,
      image: item.image,
      source: item.source || 'PLAYER SAFE 资料',
      factLabel: item.factLabel || '资料要点',
      body: item.body,
      playerFacts: Array.isArray(item.playerFacts) ? item.playerFacts.slice() : [],
      playerPrompt: item.playerPrompt || ''
    };
  }

  function publicMapPayload() {
    var publishedLocations = state.publicMap && Array.isArray(state.publicMap.locationIds) ? state.publicMap.locationIds : [];
    var publishedScenes = state.publicMap && Array.isArray(state.publicMap.sceneIds) ? state.publicMap.sceneIds : [];
    var activeScene = byId(data.scenes || [], state.activeSceneId);
    var publicCast = (Array.isArray(state.activeNpcs) ? state.activeNpcs : []).map(function (npcId) {
      var npc = byId(data.npcs || [], npcId);
      if (!npc || !npc.playerSafe || !safeText(npc.playerSafe.opening, 800)) return null;
      var locationId = activeScene && Array.isArray(activeScene.npcs) && activeScene.npcs.indexOf(npc.id) !== -1
        ? activeScene.location
        : state.npcLocations && state.npcLocations[npc.id] || npc.location;
      var image = safeText(npc.image, 200).replace(/\\/g, '/');
      if (!/^assets\/art\/[a-z0-9._-]+$/i.test(image)) image = 'assets/art/hero-null-grail.webp';
      return {
        id:safeText(npc.id, 40),
        name:safeText(npc.publicName || npc.name, 120) || '未署名人物',
        kind:safeText(npc.playerSafe.kind, 32) || '登场人物',
        image:image,
        summary:safeText(npc.playerSafe.opening, 800),
        locationId:safeText(locationId, 16)
      };
    }).filter(Boolean);
    return {
      version:2,
      title:'东湖市玩家地图',
      image:'assets/art/eastlake-map.webp',
      visible:Boolean(state.publicMap && state.publicMap.visible),
      activeLocationId:state.publicMap && state.publicMap.activeLocationId || null,
      updatedAt:state.publicMap && state.publicMap.updatedAt || '',
      locations:data.locations.filter(function (loc) { return publishedLocations.indexOf(loc.id) !== -1; }).map(function (loc) {
        var publicLocationName = safeText(loc.publicName, 160) || ('已公开地点 ' + loc.id);
        var scenes = data.scenes.filter(function (scene) { return scene.location === loc.id && publishedScenes.indexOf(scene.id) !== -1; }).map(function (scene) {
          var revealed = state.sceneClues[scene.id] || [];
          var result = state.sceneResults[scene.id] || null;
          var publicTitle = safeText(scene.publicTitle || scene.playerTitle, 160) || (publicLocationName + ' · 已公开现场');
          var publicTime = safeText(scene.publicTime || scene.playerTime, 80) || (state.activeSceneId === scene.id ? '进行中' : state.completedScenes.indexOf(scene.id) !== -1 ? '已结束' : '时间待公开');
          return {
            id:scene.id,
            title:publicTitle,
            time:publicTime,
            visible:scene.visible,
            active:state.activeSceneId === scene.id,
            completed:state.completedScenes.indexOf(scene.id) !== -1,
            resultNote:result && result.note || '',
            clues:scene.clues.filter(function (clue, index) { return revealed.indexOf(index) !== -1; }),
            handouts:scene.handouts.filter(function (id) { return state.revealedHandouts.indexOf(id) !== -1; }).map(function (id) {
              var item = byId(data.handouts, id);
              return item ? { id:item.id, title:item.title } : null;
            }).filter(Boolean)
          };
        });
        return {
          id:loc.id,
          name:publicLocationName,
          shortName:safeText(loc.shortName, 80) || publicLocationName,
          icon:loc.icon || 'plaza',
          x:loc.x,
          y:loc.y,
          pinX:loc.pinX || 0,
          pinY:loc.pinY || 0,
          summary:loc.visible || '',
          tags:Array.isArray(loc.playerTags) ? loc.playerTags.slice(0, 6) : [],
          routeNote:loc.routeNote || '',
          current:Boolean(state.publicMap && state.publicMap.activeLocationId === loc.id),
          visited:state.visitedLocations.indexOf(loc.id) !== -1,
          scenes:scenes,
          characters:publicCast.filter(function (character) { return character.locationId === loc.id; }).map(function (character) {
            return { id:character.id, name:character.name, kind:character.kind, image:character.image, summary:character.summary };
          })
        };
      })
    };
  }

  function sendPlayerMapState(options) {
    options = options || {};
    sendPlayerMessage({
      type:'map-state',
      map:publicMapPayload(),
      focusLocationId:options.focusLocationId || state.publicMap && state.publicMap.activeLocationId || null,
      openMap:options.openMap === true
    });
  }

  function publishLocationOnDraft(draft, id) {
    if (!byId(data.locations, id)) return;
    if (!draft.publicMap || typeof draft.publicMap !== 'object') draft.publicMap = { visible:false, activeLocationId:null, locationIds:[], sceneIds:[], updatedAt:'' };
    if (!Array.isArray(draft.publicMap.locationIds)) draft.publicMap.locationIds = [];
    if (!Array.isArray(draft.publicMap.sceneIds)) draft.publicMap.sceneIds = [];
    if (draft.publicMap.locationIds.indexOf(id) === -1) draft.publicMap.locationIds.push(id);
    draft.publicMap.visible = true;
    draft.publicMap.activeLocationId = id;
    draft.publicMap.updatedAt = new Date().toISOString();
  }

  function publishSceneOnDraft(draft, scene) {
    if (!scene) return;
    publishLocationOnDraft(draft, scene.location);
    if (draft.publicMap.sceneIds.indexOf(scene.id) === -1) draft.publicMap.sceneIds.push(scene.id);
  }

  function publishLocation(id, includeSceneIds, label) {
    var loc = byId(data.locations, id);
    if (!loc) return;
    includeSceneIds = Array.isArray(includeSceneIds) ? includeSceneIds : [];
    commit(label || '投送玩家地图地点：' + (loc.publicName || loc.name), function (draft) {
      publishLocationOnDraft(draft, id);
      includeSceneIds.forEach(function (sceneId) { publishSceneOnDraft(draft, byId(data.scenes, sceneId)); });
      draft.playerProjection = 'map';
    });
    sendPlayerMapState({ focusLocationId:id, openMap:true });
  }

  function publishScene(scene, label) {
    if (!scene) return;
    commit(label || '投送玩家地图场景 ' + scene.id + '：' + scene.title, function (draft) {
      publishSceneOnDraft(draft, scene);
      draft.playerProjection = 'map';
    });
    sendPlayerMapState({ focusLocationId:scene.location, openMap:true });
  }

  function effectiveNpcMapLocation(npc, snapshot) {
    snapshot = snapshot || state;
    if (!npc) return null;
    var activeScene = byId(data.scenes, snapshot.activeSceneId);
    if (activeScene && Array.isArray(activeScene.npcs) && activeScene.npcs.indexOf(npc.id) !== -1) return activeScene.location;
    return snapshot.npcLocations && snapshot.npcLocations[npc.id] || npc.location || null;
  }

  function toggleNpcMapPresence(id, preferredLocationId) {
    var npc = byId(data.npcs, id);
    if (!npc || !npc.playerSafe || !npc.playerSafe.opening) { showToast('该人物缺少 PLAYER SAFE 登场资料，未向玩家投送'); return; }
    var wasActive = state.activeNpcs.indexOf(id) !== -1;
    var locationId = wasActive ? effectiveNpcMapLocation(npc, state) : preferredLocationId || effectiveNpcMapLocation(npc, state);
    if (!byId(data.locations, locationId)) { showToast('请先为人物指定有效地点'); return; }
    var loc = byId(data.locations, locationId);
    commit((wasActive ? '人物离场：' : '人物登场：') + npc.name + ' · ' + (loc.publicName || loc.name), function (draft) {
      var at = draft.activeNpcs.indexOf(id);
      if (wasActive) {
        while (at !== -1) { draft.activeNpcs.splice(at, 1); at = draft.activeNpcs.indexOf(id); }
      } else {
        if (at === -1) draft.activeNpcs.push(id);
        if (!draft.npcLocations || typeof draft.npcLocations !== 'object') draft.npcLocations = {};
        draft.npcLocations[id] = locationId;
        publishLocationOnDraft(draft, locationId);
        draft.playerProjection = 'map';
      }
      if (draft.publicMap && draft.publicMap.locationIds.indexOf(locationId) !== -1) draft.publicMap.updatedAt = new Date().toISOString();
    });
    sendPlayerMapState({ focusLocationId:locationId, openMap:wasActive ? state.playerProjection === 'map' : true });
  }

  function executeNpcDeparture(npc) {
    if (!npc) return;
    var locationId = effectiveNpcMapLocation(npc, state);
    var wasActive = state.activeNpcs.indexOf(npc.id) !== -1;
    commit('执行离场行动：' + npc.name + ' — ' + npc.action, function (draft) {
      draft.activeNpcs = draft.activeNpcs.filter(function (item) { return item !== npc.id; });
      if (wasActive && draft.publicMap && draft.publicMap.locationIds.indexOf(locationId) !== -1) draft.publicMap.updatedAt = new Date().toISOString();
    });
    if (wasActive) sendPlayerMapState({ focusLocationId:locationId, openMap:state.playerProjection === 'map' });
  }

  function toggleSceneClueProjection(scene, index) {
    if (!scene || !scene.clues || !scene.clues[index]) return;
    var revealing = (state.sceneClues[scene.id] || []).indexOf(index) === -1;
    commit((revealing ? '投放' : '收回') + '地图线索 ' + scene.id + '：' + scene.clues[index], function (draft) {
      var list = (draft.sceneClues[scene.id] || []).slice();
      var at = list.indexOf(index);
      if (revealing && at === -1) list.push(index);
      if (!revealing && at !== -1) list.splice(at, 1);
      draft.sceneClues[scene.id] = list;
      if (revealing) publishSceneOnDraft(draft, scene);
      if (draft.publicMap.sceneIds.indexOf(scene.id) !== -1) {
        draft.publicMap.activeLocationId = scene.location;
        draft.publicMap.updatedAt = new Date().toISOString();
        draft.playerProjection = 'map';
      }
    });
    if (state.publicMap.sceneIds.indexOf(scene.id) !== -1) sendPlayerMapState({ focusLocationId:scene.location, openMap:true });
  }

  function retractLocationFromPlayers(id) {
    var loc = byId(data.locations, id);
    if (!loc || !state.publicMap || state.publicMap.locationIds.indexOf(id) === -1) { showToast('该地点尚未投送到玩家地图'); return; }
    commit('从玩家地图撤回地点：' + (loc.publicName || loc.name), function (draft) {
      draft.publicMap.locationIds = draft.publicMap.locationIds.filter(function (item) { return item !== id; });
      draft.publicMap.sceneIds = draft.publicMap.sceneIds.filter(function (sceneId) { var scene = byId(data.scenes, sceneId); return scene && scene.location !== id; });
      if (draft.publicMap.activeLocationId === id) draft.publicMap.activeLocationId = draft.publicMap.locationIds[0] || null;
      draft.publicMap.visible = draft.publicMap.locationIds.length > 0;
      draft.publicMap.updatedAt = new Date().toISOString();
      if (!draft.publicMap.visible) draft.playerProjection = 'curtain';
    });
    sendPlayerMapState({ openMap:state.publicMap.visible });
    if (!state.publicMap.visible) sendPlayerMessage({ type:'curtain' });
  }

  function sendPlayerMessage(message) {
    message = Object.assign({}, message || {}, { protocol:MESSAGE_PROTOCOL });
    if (channel) channel.postMessage(message);
    playerWindows = playerWindows.filter(function (playerWindow) {
      if (!playerWindow || playerWindow.closed) return false;
      try { playerWindow.postMessage(message, messageOrigin); } catch (error) {}
      return true;
    });
  }

  function openPlayerWindow(url, name) {
    var playerWindow = window.open(url, name);
    if (!playerWindow) {
      showToast('浏览器拦截了玩家窗口，请允许本站打开新窗口');
      return null;
    }
    if (playerWindows.indexOf(playerWindow) === -1) playerWindows.push(playerWindow);
    [250, 700, 1400].forEach(function (delay) {
      window.setTimeout(function () {
        if (!playerWindow.closed) {
          try {
            playerWindow.postMessage(lastPlayerPayload
              ? { protocol:MESSAGE_PROTOCOL, type:'show', handout:lastPlayerPayload }
              : { protocol:MESSAGE_PROTOCOL, type:'curtain' }, messageOrigin);
            playerWindow.postMessage({ protocol:MESSAGE_PROTOCOL, type:'map-state', map:publicMapPayload(), focusLocationId:state.publicMap.activeLocationId, openMap:state.playerProjection === 'map' }, messageOrigin);
          } catch (error) {}
        }
      }, delay);
    });
    return playerWindow;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    var saveStatus = document.getElementById('save-status');
    if (saveStatus) {
      saveStatus.textContent = '正在保存…';
      window.setTimeout(function () { saveStatus.textContent = '已自动保存'; }, 260);
    }
  }

  function addLog(label) {
    state.log.unshift({ at: new Date().toISOString(), label: label });
    state.log = state.log.slice(0, 160);
  }

  function commit(label, mutate) {
    undoStack.push(clone(state));
    if (undoStack.length > 40) undoStack.shift();
    mutate(state);
    addLog(label);
    saveState();
    renderAll();
    showToast(label);
  }

  function showToast(message) {
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove('show'); }, 2200);
  }

  function startServerResourceDownload(resourceId) {
    var anchor = document.createElement('a');
    anchor.href = '/api/modules/null-grail/resources/' + encodeURIComponent(resourceId);
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  function downloadKeeperVolume(button) {
    var access = window.NG_ACCESS;
    var secureResource = button.getAttribute('data-secure-resource');
    var serverResource = button.getAttribute('data-server-resource');
    var status = button.querySelector('small');
    var originalStatus = status.textContent;

    if (!access || !secureResource || !serverResource) {
      showToast('正文下载配置不完整');
      return;
    }

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.textContent = access.getMode && access.getMode() === 'server' ? '正在准备下载…' : '正在本机解密…';

    if (access.getMode && access.getMode() === 'server') {
      startServerResourceDownload(serverResource);
      window.setTimeout(function () {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        status.textContent = originalStatus;
      }, 600);
      showToast('正文下载已开始');
      return;
    }

    access.downloadSecureResource(secureResource).then(function () {
      showToast('正文已在本机解密并开始下载');
    }).catch(function () {
      showToast('无法解密正文，请重新验证访问密钥');
    }).finally(function () {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      status.textContent = originalStatus;
    });
  }

  function openView(view) {
    currentView = view;
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.classList.toggle('active', panel.getAttribute('data-panel') === view);
    });
    document.querySelectorAll('[data-view]').forEach(function (button) {
      var active = button.getAttribute('data-view') === view;
      button.classList.toggle('active', active);
      if (button.closest('.side-nav')) {
        if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
      }
    });
    if (view === 'combat') renderCombat();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function dayScenes(day) {
    return day.sceneIds.map(function (id) { return byId(data.scenes, id); }).filter(Boolean);
  }

  function todayNpcIds() {
    var ids = [];
    dayScenes(currentDay()).forEach(function (scene) {
      scene.npcs.forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
    });
    state.activeNpcs.forEach(function (id) { if (ids.indexOf(id) === -1) ids.unshift(id); });
    return ids;
  }

  function renderCurrent() {
    var day = currentDay();
    document.getElementById('top-day').textContent = '第' + ['一','二','三','四','五','六','七'][day.index - 1] + '日';
    document.getElementById('top-title').textContent = day.title;
    document.getElementById('day-image').src = day.image;
    document.getElementById('day-image').alt = day.title + '的场景插画';
    document.getElementById('day-kicker').textContent = 'DAY ' + String(day.index).padStart(2, '0') + ' · ' + day.date;
    document.getElementById('current-heading').textContent = day.title;
    document.getElementById('day-question').textContent = day.question;
    document.getElementById('day-priority').textContent = day.priority;
    document.getElementById('day-windows').innerHTML = day.windows.map(function (item) { return '<span>' + escapeHtml(item) + '</span>'; }).join('');
    document.getElementById('today-goals').innerHTML = day.goals.map(function (goal) { return '<li>' + escapeHtml(goal) + '</li>'; }).join('');

    var scenes = dayScenes(day);
    var completed = scenes.filter(function (scene) { return state.completedScenes.indexOf(scene.id) !== -1; }).length;
    document.getElementById('scene-progress').textContent = completed + ' / ' + scenes.length + ' 已结算';
    document.getElementById('today-scenes').innerHTML = scenes.map(function (scene) {
      var done = state.completedScenes.indexOf(scene.id) !== -1;
      var active = state.activeSceneId === scene.id;
      return '<button class="scene-row' + (done ? ' completed' : '') + '" type="button" data-scene="' + scene.id + '">' +
        '<span class="scene-code">' + scene.id + '</span>' +
        '<span><h3>' + escapeHtml(scene.title) + '</h3><p>' + escapeHtml(scene.visible) + '</p><span class="scene-meta"><i>' + escapeHtml(scene.time) + '</i><i>' + escapeHtml(byId(data.locations, scene.location).name) + '</i></span></span>' +
        '<span class="scene-state">' + (active ? '正在运行' : done ? '已结算 ✓' : '打开 ↗') + '</span>' +
      '</button>';
    }).join('');

    var npcIds = todayNpcIds().slice(0, 7);
    document.getElementById('active-cast').innerHTML = npcIds.map(function (id) {
      var npc = byId(data.npcs, id);
      var servant = npc.crop != null;
      return '<button class="cast-mini" type="button" data-npc="' + id + '"><img class="' + (servant ? 'servant-crop' : '') + '" style="--crop:' + (npc.crop || '50%') + '" src="' + npc.image + '" alt="' + escapeHtml(npc.name) + '肖像"><span>' + escapeHtml(npc.name) + '</span></button>';
    }).join('');

    var pending = day.handouts.map(function (id) { return byId(data.handouts, id); }).filter(Boolean).slice(0, 4);
    document.getElementById('pending-handouts').innerHTML = pending.map(function (item) {
      var sent = state.revealedHandouts.indexOf(item.id) !== -1;
      return '<button class="pending-item" type="button" data-handout="' + item.id + '"><img src="' + item.image + '" alt=""><span><strong>' + item.id + ' · ' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.trigger) + '</small></span><i>' + (sent ? '✓' : '↗') + '</i></button>';
    }).join('');

    document.querySelectorAll('#view-current [data-scene]').forEach(function (button) { button.addEventListener('click', function () { openScene(button.getAttribute('data-scene')); }); });
    document.querySelectorAll('#view-current [data-npc]').forEach(function (button) { button.addEventListener('click', function () { openNpc(button.getAttribute('data-npc')); }); });
    document.querySelectorAll('#view-current [data-handout]').forEach(function (button) { button.addEventListener('click', function () { openHandout(button.getAttribute('data-handout')); }); });
  }

  function auditSelectOptions(definitions, selected) {
    return definitions.map(function (item) {
      return '<option value="' + escapeHtml(item.id) + '"' + (item.id === selected ? ' selected' : '') + '>' + escapeHtml(item.label) + '</option>';
    }).join('');
  }

  function auditClockSegments(value) {
    var segments = '';
    for (var index = 1; index <= 4; index += 1) segments += '<i' + (index <= value ? ' class="filled"' : '') + '></i>';
    return segments;
  }

  function localAuditDateTime() {
    var now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function renderSessionAudit() {
    var audit = state.sessionAudit;
    document.getElementById('audit-faction-clocks').innerHTML = audit.factionClocks.map(function (clock, index) {
      return '<div class="audit-clock-row">' +
        '<label class="audit-clock-name"><span>阵营名称</span><input type="text" maxlength="80" value="' + escapeHtml(clock.name) + '" data-audit-faction-index="' + index + '" data-audit-field="name" aria-label="第 ' + (index + 1) + ' 个阵营名称"></label>' +
        '<div class="audit-clock-control"><button type="button" data-audit-clock-index="' + index + '" data-audit-clock-delta="-1" aria-label="' + escapeHtml(clock.name) + '时钟减一">−</button><span class="audit-clock-segments" aria-hidden="true">' + auditClockSegments(clock.value) + '</span><button type="button" data-audit-clock-index="' + index + '" data-audit-clock-delta="1" aria-label="' + escapeHtml(clock.name) + '时钟加一">＋</button></div>' +
        '<strong class="audit-clock-value" aria-label="当前 ' + clock.value + ' 格">' + clock.value + '/4</strong>' +
      '</div>';
    }).join('');

    document.getElementById('audit-alliance-promises').innerHTML = audit.alliancePromises.map(function (promise, index) {
      return '<div class="audit-promise-row">' +
        '<label><span>对象</span><input type="text" maxlength="120" value="' + escapeHtml(promise.target) + '" placeholder="人物／阵营" data-audit-alliance-index="' + index + '" data-audit-field="target"></label>' +
        '<label><span>承诺</span><input type="text" maxlength="500" value="' + escapeHtml(promise.promise) + '" placeholder="交换条件、责任与撤回方式" data-audit-alliance-index="' + index + '" data-audit-field="promise"></label>' +
        '<label><span>状态</span><select data-audit-alliance-index="' + index + '" data-audit-field="status">' + auditSelectOptions(AUDIT_ALLIANCE_STATES, promise.status) + '</select></label>' +
      '</div>';
    }).join('');

    document.getElementById('audit-fragment-list').innerHTML = audit.fragments.map(function (fragment, index) {
      return '<div class="audit-fragment-row"><strong>' + escapeHtml(fragment.label) + '</strong><div class="audit-fragment-fields">' +
        '<label><span>持有人</span><input type="text" maxlength="120" value="' + escapeHtml(fragment.holder) + '" placeholder="当前保管者" data-audit-fragment-index="' + index + '" data-audit-field="holder"></label>' +
        '<label><span>偏向</span><input type="text" maxlength="300" value="' + escapeHtml(fragment.leaning) + '" placeholder="这份证据最可能把方案推向哪里" data-audit-fragment-index="' + index + '" data-audit-field="leaning"></label>' +
        '<label><span>交付意愿</span><select data-audit-fragment-index="' + index + '" data-audit-field="willingness">' + auditSelectOptions(AUDIT_FRAGMENT_WILLINGNESS, fragment.willingness) + '</select></label>' +
      '</div></div>';
    }).join('');

    var consentPeople = [
      { id:'tano', label:'田乃' },
      { id:'shigeru', label:'茂' }
    ];
    document.getElementById('audit-consent-list').innerHTML = consentPeople.map(function (person) {
      var consent = audit.finaleConsent[person.id];
      return '<div class="audit-consent-row"><strong>' + person.label + '</strong>' +
        '<label><span>当前状态</span><select data-audit-consent-person="' + person.id + '" data-audit-field="status">' + auditSelectOptions(AUDIT_CONSENT_STATES, consent.status) + '</select></label>' +
        '<label><span>当事人原话／条件</span><textarea rows="3" maxlength="1000" placeholder="逐字记录；不要改写成检定结果。" data-audit-consent-person="' + person.id + '" data-audit-field="quote">' + escapeHtml(consent.quote) + '</textarea></label>' +
      '</div>';
    }).join('');

    var deliveries = audit.deliveryFollowUps;
    document.getElementById('audit-delivery-count').textContent = deliveries.length + ' 条';
    document.getElementById('audit-delivery-log').innerHTML = deliveries.length ? deliveries.map(function (entry) {
      return '<article class="audit-delivery-entry">' +
        '<div class="audit-delivery-meta"><strong>' + escapeHtml(entry.handout) + '</strong><span>' + escapeHtml(entry.deliveredAt ? entry.deliveredAt.replace('T', ' ') : '未记录时间') + ' · ' + escapeHtml(entry.target) + '</span></div>' +
        '<div class="audit-delivery-notes"><div><b>玩家误读／遗漏</b><p>' + escapeHtml(entry.misread || '已确认理解／尚待观察') + '</p></div><div><b>GM 跟进</b><p>' + escapeHtml(entry.followUp || '尚未填写跟进') + '</p></div></div>' +
        '<button class="audit-delete-delivery" type="button" data-audit-delete-delivery="' + escapeHtml(entry.id) + '">删除</button>' +
      '</article>';
    }).join('') : '<p class="audit-delivery-empty">尚无投送跟进记录。每次关键手卡发放后，补记对象、误读和下一步。</p>';
    var timeInput = document.getElementById('audit-delivery-time');
    if (timeInput && !timeInput.value) timeInput.value = localAuditDateTime();
  }

  function renderTimeline() {
    document.getElementById('timeline-list').innerHTML = data.days.map(function (day) {
      var scenes = dayScenes(day);
      var completed = scenes.filter(function (scene) { return state.completedScenes.indexOf(scene.id) !== -1; }).length;
      var current = day.id === state.dayId;
      return '<article class="timeline-day' + (current ? ' current' : '') + '">' +
        '<div class="timeline-day-image"><img src="' + day.image + '" alt=""><span>DAY ' + String(day.index).padStart(2, '0') + '</span></div>' +
        '<div class="timeline-day-copy"><p>' + escapeHtml(day.date) + ' · ' + scenes.length + ' 个节点</p><h2>' + escapeHtml(day.title) + '</h2><blockquote>' + escapeHtml(day.question) + '</blockquote><small>' + escapeHtml(day.priority) + '</small></div>' +
        '<div class="timeline-day-actions"><button type="button" data-select-day="' + day.id + '">' + (current ? '当前主持桌面' : '切换到这一天') + '</button><button type="button" data-day-first="' + day.id + '">打开首个节点</button><span class="timeline-progress">' + completed + ' / ' + scenes.length + ' 已结算</span></div>' +
      '</article>';
    }).join('');
    document.querySelectorAll('[data-select-day]').forEach(function (button) {
      button.addEventListener('click', function () { selectDay(button.getAttribute('data-select-day')); });
    });
    document.querySelectorAll('[data-day-first]').forEach(function (button) {
      button.addEventListener('click', function () { var day = byId(data.days, button.getAttribute('data-day-first')); openScene(day.sceneIds[0]); });
    });
  }

  function selectDay(dayId) {
    if (dayId === state.dayId) { openView('current'); return; }
    var day = byId(data.days, dayId);
    commit('切换到第 ' + day.index + ' 日：' + day.title, function (draft) {
      draft.dayId = dayId;
      draft.activeSceneId = null;
      draft.activeNpcs = [];
      if (day.index > 1 && draft.trackers.grail < day.index - 1) draft.trackers.grail = Math.min(6, day.index - 1);
    });
    if (state.publicMap.visible) sendPlayerMapState({ focusLocationId:state.publicMap.activeLocationId, openMap:state.playerProjection === 'map' });
    openView('current');
  }

  function mapIconSvg(icon) {
    var icons = {
      crossroad: '<path d="M4 12h16M12 4v16M4 12l3-3m-3 3 3 3M12 4l-3 3m3-3 3 3"/>',
      school: '<path d="m4 10 8-5 8 5-8 5-8-5Zm3 3v5h10v-5M9 19h6"/>',
      construction: '<path d="M5 19h14M7 19V9h10v10M9 9V6h6v3M7 13h10"/>',
      church: '<path d="M12 3v5M9.5 5.5h5M7 21V10h10v11M10 21v-5h4v5"/>',
      shrine: '<path d="M4 8h16M6 8l1-4h10l1 4M7 8v12m10-12v12M4 20h16M9 12h6"/>',
      food: '<path d="M5 10h14c0 5-2.5 8-7 8s-7-3-7-8Zm2 9h10M8 6c0-1 1-1.5 1-2.5M12 6c0-1 1-1.5 1-2.5M16 6c0-1 1-1.5 1-2.5"/>',
      repair: '<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5L16 12l-4-4 2.5-2.5Z"/>',
      library: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 9H12v10H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 9H12v10h4.5A3.5 3.5 0 0 1 20 22V5.5Z"/>',
      mansion: '<path d="m4 10 8-6 8 6M6 9v11h12V9M9 20v-6h6v6M9 10h.01M15 10h.01"/>',
      workshop: '<path d="M4 20h16M6 20V9l5 3V9l7 4v7M8 6h3M9.5 4.5v3M14 16h2"/>',
      clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2M8 3h8"/>',
      plaza: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
      factory: '<path d="M4 20V10l5 3v-3l5 3V7h4l2 13H4ZM7 17h2m3 0h2m3 0h2"/>',
      water: '<path d="M3 8c2 0 2 1.5 4 1.5S9 8 11 8s2 1.5 4 1.5S17 8 19 8s2 1.5 2 1.5M3 13c2 0 2 1.5 4 1.5S9 13 11 13s2 1.5 4 1.5S17 13 19 13s2 1.5 2 1.5M5 18h14"/>',
      memorial: '<path d="M8 20h8M9 17h6l-1-11h-4L9 17ZM8 6h8M12 3v3"/>',
      core: '<path d="m12 3 6 9-6 9-6-9 6-9Z"/><circle cx="12" cy="12" r="3"/><path d="M3 12h3m12 0h3"/>'
    };
    return '<svg aria-hidden="true" viewBox="0 0 24 24">' + (icons[icon] || icons.plaza) + '</svg>';
  }

  function riskLabel(level) {
    return level >= 3 ? '高危' : level === 2 ? '警戒' : '常规';
  }

  function renderMap() {
    var todayLocations = dayScenes(currentDay()).map(function (scene) { return scene.location; });
    var activeMapCast = state.activeNpcs.map(function (id) { return byId(data.npcs, id); }).filter(function (npc) { return npc && npc.playerSafe && npc.playerSafe.opening; });
    var publishedClueCount = state.publicMap.sceneIds.reduce(function (total, sceneId) { return total + (state.sceneClues[sceneId] || []).length; }, 0);
    var playerVisibleCastCount = activeMapCast.filter(function (npc) { return state.publicMap.locationIds.indexOf(effectiveNpcMapLocation(npc, state)) !== -1; }).length;
    var broadcastStatus = document.getElementById('map-broadcast-status');
    if (broadcastStatus) broadcastStatus.textContent = '玩家地图 · ' + state.publicMap.locationIds.length + ' 地点 · ' + publishedClueCount + ' 线索 · ' + playerVisibleCastCount + ' 人登场';
    var hotspots = data.locations.map(function (loc) {
      var isToday = todayLocations.indexOf(loc.id) !== -1;
      var visited = state.visitedLocations.indexOf(loc.id) !== -1;
      var selected = selectedLocationId === loc.id;
      var published = state.publicMap.locationIds.indexOf(loc.id) !== -1;
      var castHere = activeMapCast.filter(function (npc) { return effectiveNpcMapLocation(npc, state) === loc.id; });
      var castLabel = castHere.map(function (npc) { return npc.name; }).join('、');
      var hidden = (mapFilter === 'today' && !isToday) || (mapFilter === 'danger' && loc.riskLevel < 3);
      var style = 'left:' + loc.x + '%;top:' + loc.y + '%;--pin-x:' + (loc.pinX || 0) + 'px;--pin-y:' + (loc.pinY || 0) + 'px';
      var tooltip = loc.name + (published ? ' · 已投送玩家' : '') + (castLabel ? ' · 登场：' + castLabel : '');
      return '<button class="map-hotspot risk-' + loc.riskLevel + (isToday ? ' today' : '') + (visited ? ' visited' : '') + (published ? ' player-published' : '') + (castHere.length ? ' has-cast' : '') + (selected ? ' active' : '') + '" type="button" style="' + style + '" data-location="' + loc.id + '" data-tooltip="' + escapeHtml(tooltip) + '" aria-label="' + escapeHtml(loc.name) + '，' + riskLabel(loc.riskLevel) + (published ? '，已投送玩家' : '') + (castLabel ? '，登场人物：' + escapeHtml(castLabel) : '') + '" aria-pressed="' + String(selected) + '"' + (hidden ? ' hidden' : '') + '>' + mapIconSvg(loc.icon) + '<span>' + escapeHtml(loc.shortName || loc.name) + '</span>' + (castHere.length ? '<span class="map-cast-badge" aria-hidden="true">' + castHere.length + '</span>' : '') + '</button>';
    }).join('');
    document.getElementById('map-hotspots').innerHTML = hotspots;
    document.getElementById('location-list').innerHTML = data.locations.map(function (loc) {
      var selected = selectedLocationId === loc.id;
      var published = state.publicMap.locationIds.indexOf(loc.id) !== -1;
      var castCount = activeMapCast.filter(function (npc) { return effectiveNpcMapLocation(npc, state) === loc.id; }).length;
      return '<button class="' + (selected ? 'active' : '') + '" type="button" data-location="' + loc.id + '" aria-pressed="' + String(selected) + '">' + mapIconSvg(loc.icon) + '<span>' + escapeHtml(loc.name) + '</span><small>' + (published ? '玩家已见 · ' : '') + riskLabel(loc.riskLevel) + ' · 第' + loc.unlockDay + '日' + (castCount ? ' · ' + castCount + '人登场' : '') + '</small></button>';
    }).join('');
    document.querySelectorAll('#map-hotspots [data-location], #location-list [data-location]').forEach(function (button) {
      button.addEventListener('click', function () { showLocation(button.getAttribute('data-location'), { scroll:true }); });
    });
    if (selectedLocationId && byId(data.locations, selectedLocationId)) showLocation(selectedLocationId, { quiet:true, scroll:false });
  }

  function sceneStatus(scene) {
    var day = byId(data.days, scene.day);
    if (!day) return { label:'阶段未定', className:'future' };
    if (day.index < currentDay().index) return { label:'已过阶段', className:'past' };
    if (day.index === currentDay().index) return { label:'当前日可触发', className:'current' };
    return { label:'第' + day.index + '日开放', className:'future' };
  }

  function showLocation(id, options) {
    options = options || {};
    var loc = byId(data.locations, id);
    if (!loc) return;
    selectedLocationId = id;
    var drawer = document.getElementById('map-drawer');
    var unlocked = currentDay().index >= loc.unlockDay;
    var locationPublished = state.publicMap.locationIds.indexOf(id) !== -1;
    var liveCast = state.activeNpcs.map(function (npcId) { return byId(data.npcs, npcId); }).filter(function (npc) { return npc && npc.playerSafe && npc.playerSafe.opening && effectiveNpcMapLocation(npc, state) === id; });
    var publishedClueCount = loc.sceneIds.reduce(function (total, sceneId) {
      return total + (state.publicMap.sceneIds.indexOf(sceneId) !== -1 ? (state.sceneClues[sceneId] || []).length : 0);
    }, 0);
    var liveCastRows = liveCast.map(function (npc) {
      return '<div class="location-live-cast-row"><button type="button" data-npc="' + npc.id + '">' + escapeHtml(npc.name) + '</button><button type="button" data-live-npc-toggle="' + npc.id + '" data-live-npc-location="' + id + '">离场</button></div>';
    }).join('');
    var liveCastPanel = '<section class="location-live-cast"><header><span>PLAYER LIVE CAST · 当前可见人物</span><b>' + liveCast.length + ' 人</b></header>' + (liveCastRows ? '<div class="location-live-cast-list">' + liveCastRows + '</div>' : '<div class="location-list-empty">尚无人物登场；可在下方场景人物中选择登场。</div>') + '</section>';
    var sceneCards = loc.sceneIds.map(function (sceneId) {
      var scene = byId(data.scenes, sceneId);
      if (!scene) return '';
      var day = byId(data.days, scene.day);
      var status = sceneStatus(scene);
      var scenePublished = state.publicMap.sceneIds.indexOf(scene.id) !== -1;
      var revealed = state.sceneClues[scene.id] || [];
      var clues = scene.clues.map(function (clue, index) {
        var isRevealed = revealed.indexOf(index) !== -1;
        return '<li class="' + (isRevealed ? 'revealed' : '') + '"><button class="location-clue-toggle" type="button" data-map-clue-scene="' + scene.id + '" data-map-clue-index="' + index + '"><i>' + (isRevealed ? '✓' : String(index + 1)) + '</i><span>' + escapeHtml(clue) + '</span><b>' + (isRevealed ? '收回' : '投放') + '</b></button></li>';
      }).join('');
      var npcButtons = scene.npcs.map(function (npcId) {
        var npc = byId(data.npcs, npcId);
        if (!npc) return '';
        var active = state.activeNpcs.indexOf(npcId) !== -1;
        var activeLocationId = active ? effectiveNpcMapLocation(npc, state) : null;
        var actionLocationId = active ? activeLocationId : id;
        var activeLocation = activeLocationId ? byId(data.locations, activeLocationId) : null;
        var actionLabel = active ? (activeLocationId === id ? '离场' : '从' + (activeLocation ? activeLocation.shortName || activeLocation.name : '当前地点') + '离场') : '登场';
        return '<div class="location-cast-control' + (activeLocationId === id ? ' visible' : '') + '"><button type="button" data-npc="' + npcId + '">' + escapeHtml(npc.name) + '</button><button type="button" data-stage-npc="' + npcId + '" data-stage-location="' + actionLocationId + '">' + escapeHtml(actionLabel) + '</button></div>';
      }).join('');
      var handoutButtons = scene.handouts.map(function (handoutId) {
        var item = byId(data.handouts, handoutId);
        return item ? '<button type="button" data-handout="' + handoutId + '">' + handoutId + ' · ' + escapeHtml(item.title) + '</button>' : '';
      }).join('');
      return '<article class="location-scene-card ' + status.className + (scenePublished ? ' player-published' : '') + '"><header><div><span>' + scene.id + '</span><h3>' + escapeHtml(scene.title) + '</h3></div><b>' + (scenePublished ? '玩家已见' : status.label) + '</b></header>' +
        '<div class="location-scene-trigger"><span>建议触发</span><strong>' + escapeHtml(day ? day.date : scene.day) + ' · ' + escapeHtml(scene.time) + '</strong></div>' +
        '<section class="location-readaloud"><span>开场朗读</span><p>' + escapeHtml(scene.visible) + '</p></section>' +
        '<section><span>守秘人目标</span><p>' + escapeHtml(scene.objective) + '</p></section>' +
        '<section class="location-scene-risk"><span>忽视／失败后的推进</span><p>' + escapeHtml(scene.risk) + '</p></section>' +
        '<section><span>可得线索</span><ul class="location-clues">' + clues + '</ul></section>' +
        '<section><span>人物登场控制</span><div class="location-cast-controls">' + (npcButtons || '<em>无固定人物</em>') + '</div></section>' +
        '<section><span>关联手卡</span><div class="location-link-buttons">' + (handoutButtons || '<em>无独立手卡</em>') + '</div></section>' +
        '<div class="location-scene-actions"><button class="location-scene-button" type="button" data-scene="' + scene.id + '">打开完整场景 <span>↗</span></button><button class="location-scene-publish' + (scenePublished ? ' published' : '') + '" type="button" data-publish-scene="' + scene.id + '">' + (scenePublished ? '重新聚焦玩家地图' : '投送场景到玩家地图') + '</button></div></article>';
    }).join('');
    drawer.innerHTML = '<div class="drawer-location-head"><div><p class="drawer-code">' + escapeHtml(loc.group) + ' · ' + riskLabel(loc.riskLevel) + '</p><h2>' + escapeHtml(loc.name) + '</h2></div><div class="drawer-location-icon">' + mapIconSvg(loc.icon) + '</div></div>' +
      '<p class="drawer-location-copy">' + escapeHtml(loc.visible) + '</p>' +
      '<div class="location-player-state' + (locationPublished ? ' published' : '') + '"><span>玩家地图状态</span><strong>' + (locationPublished ? '已投送 · ' + publishedClueCount + ' 线索 · ' + liveCast.length + ' 人登场' : '尚未投送地点') + '</strong></div>' +
      '<div class="location-player-actions"><button type="button" data-publish-location="' + loc.id + '">' + (locationPublished ? '重新聚焦此地点' : '投送此地点到玩家地图') + '</button>' + (locationPublished ? '<button class="retract" type="button" data-retract-location="' + loc.id + '">撤回地点</button>' : '<button type="button" data-publish-location-scenes="' + loc.id + '">连同当前阶段场景</button>') + '</div>' +
      liveCastPanel +
      '<div class="location-stage ' + (unlocked ? 'unlocked' : 'preview') + '"><span>' + (unlocked ? '当前战役已开放' : '阶段预览') + '</span><strong>' + (unlocked ? '可从下方节点直接开始' : '第' + loc.unlockDay + '日开放；守秘人仍可提前备团') + '</strong></div>' +
      '<div class="location-danger risk-' + loc.riskLevel + '"><span>地点风险</span><strong>' + escapeHtml(loc.danger) + '</strong></div>' +
      '<div class="location-scene-list"><div class="location-scene-list-head"><span>关联场景</span><b>' + loc.sceneIds.length + ' 个节点</b></div>' + sceneCards + '</div>';
    drawer.querySelectorAll('[data-scene]').forEach(function (button) { button.addEventListener('click', function () { openScene(button.getAttribute('data-scene')); }); });
    drawer.querySelectorAll('[data-publish-scene]').forEach(function (button) { button.addEventListener('click', function () { publishScene(byId(data.scenes, button.getAttribute('data-publish-scene'))); }); });
    drawer.querySelectorAll('[data-map-clue-scene]').forEach(function (button) {
      button.addEventListener('click', function () { toggleSceneClueProjection(byId(data.scenes, button.getAttribute('data-map-clue-scene')), Number(button.getAttribute('data-map-clue-index'))); });
    });
    drawer.querySelectorAll('[data-stage-npc]').forEach(function (button) {
      button.addEventListener('click', function () { toggleNpcMapPresence(button.getAttribute('data-stage-npc'), button.getAttribute('data-stage-location')); });
    });
    drawer.querySelectorAll('[data-live-npc-toggle]').forEach(function (button) {
      button.addEventListener('click', function () { toggleNpcMapPresence(button.getAttribute('data-live-npc-toggle'), button.getAttribute('data-live-npc-location')); });
    });
    var publishLocationButton = drawer.querySelector('[data-publish-location]');
    if (publishLocationButton) publishLocationButton.addEventListener('click', function () { publishLocation(id, [], locationPublished ? '重新聚焦玩家地图地点：' + (loc.publicName || loc.name) : null); });
    var publishLocationScenesButton = drawer.querySelector('[data-publish-location-scenes]');
    if (publishLocationScenesButton) publishLocationScenesButton.addEventListener('click', function () {
      var currentOrPast = loc.sceneIds.filter(function (sceneId) { var scene = byId(data.scenes, sceneId); var day = scene && byId(data.days, scene.day); return scene && (!day || day.index <= currentDay().index); });
      publishLocation(id, currentOrPast, '投送地点与当前阶段场景：' + (loc.publicName || loc.name));
    });
    var retractLocationButton = drawer.querySelector('[data-retract-location]');
    if (retractLocationButton) retractLocationButton.addEventListener('click', function () { retractLocationFromPlayers(id); });
    drawer.querySelectorAll('[data-npc]').forEach(function (button) { button.addEventListener('click', function () { openNpc(button.getAttribute('data-npc')); }); });
    drawer.querySelectorAll('[data-handout]').forEach(function (button) { button.addEventListener('click', function () { openHandout(button.getAttribute('data-handout')); }); });
    document.querySelectorAll('#map-hotspots [data-location], #location-list [data-location]').forEach(function (button) {
      var selected = button.getAttribute('data-location') === id;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (!options.quiet) {
      drawer.classList.remove('is-updating');
      void drawer.offsetWidth;
      drawer.classList.add('is-updating');
      window.setTimeout(function () { drawer.classList.remove('is-updating'); }, 420);
    }
    if (options.scroll && window.matchMedia('(max-width: 1040px)').matches) {
      window.requestAnimationFrame(function () { drawer.scrollIntoView({ behavior:'smooth', block:'start' }); });
    }
  }

  function renderNpcs() {
    var query = document.getElementById('npc-search').value.trim().toLowerCase();
    var today = todayNpcIds();
    var servantCount = data.npcs.filter(function (npc) { return npc.crop != null; }).length;
    var filterLabels = {
      all:'全部 ' + data.npcs.length,
      human:'人物／群体 ' + (data.npcs.length - servantCount),
      servant:'英灵 ' + servantCount,
      today:'今日在场 ' + today.length
    };
    document.querySelectorAll('[data-npc-filter]').forEach(function (button) {
      var filter = button.getAttribute('data-npc-filter');
      if (filterLabels[filter]) button.textContent = filterLabels[filter];
    });
    var filtered = data.npcs.filter(function (npc) {
      var isServant = npc.crop != null;
      if (npcFilter === 'human' && isServant) return false;
      if (npcFilter === 'servant' && !isServant) return false;
      if (npcFilter === 'today' && today.indexOf(npc.id) === -1) return false;
      if (query && (npc.name + npc.role + (state.npcLocations[npc.id] || npc.location)).toLowerCase().indexOf(query) === -1) return false;
      return true;
    });
    document.getElementById('npc-grid').innerHTML = filtered.map(function (npc) {
      var loc = byId(data.locations, state.npcLocations[npc.id] || npc.location);
      var servant = npc.crop != null;
      return '<article class="npc-card" tabindex="0" role="button" data-npc="' + npc.id + '">' +
        '<div class="npc-card-image"><img class="' + (servant ? 'servant-crop' : '') + '" style="--crop:' + (npc.crop || '50%') + '" src="' + npc.image + '" alt="' + escapeHtml(npc.name) + '肖像"><span class="npc-card-code">' + (servant ? 'HEROIC SPIRIT' : 'NPC DOSSIER') + '</span></div>' +
        '<div class="npc-card-body"><h2>' + escapeHtml(npc.name) + '</h2><span>' + escapeHtml(npc.role) + '</span><p>' + escapeHtml(npc.intro) + '</p><div class="npc-card-foot"><span>⌖ ' + escapeHtml(loc ? loc.name : '位置未知') + '</span><span>打开档案 ↗</span></div></div>' +
      '</article>';
    }).join('');
    document.querySelectorAll('#npc-grid [data-npc]').forEach(function (card) {
      card.addEventListener('click', function () { openNpc(card.getAttribute('data-npc')); });
      card.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openNpc(card.getAttribute('data-npc')); } });
    });
  }

  function renderTruths() {
    document.getElementById('truth-grid').innerHTML = data.truths.map(function (truth) {
      var known = state.knownTruthSources[truth.id] || [];
      var revealed = known.length >= 2;
      return '<article class="truth-card' + (revealed ? ' revealed' : '') + '"><header class="truth-card-head"><span class="truth-code">' + truth.id + '</span><h2>' + escapeHtml(truth.title) + '</h2><span class="truth-status">' + known.length + ' / 3 ' + (revealed ? '已确认' : '来源') + '</span></header><div class="truth-sources">' + truth.sources.map(function (source, index) {
        var sourceKnown = known.indexOf(index) !== -1;
        return '<button class="truth-source' + (sourceKnown ? ' known' : '') + '" type="button" data-truth="' + truth.id + '" data-source="' + index + '">' + escapeHtml(source) + '</button>';
      }).join('') + '</div></article>';
    }).join('');
    document.querySelectorAll('[data-truth]').forEach(function (button) {
      button.addEventListener('click', function () {
        var truthId = button.getAttribute('data-truth');
        var sourceIndex = Number(button.getAttribute('data-source'));
        commit((button.classList.contains('known') ? '收回' : '公开') + '线索来源：' + button.textContent.trim(), function (draft) {
          var known = (draft.knownTruthSources[truthId] || []).slice();
          var at = known.indexOf(sourceIndex);
          if (at === -1) known.push(sourceIndex); else known.splice(at, 1);
          draft.knownTruthSources[truthId] = known;
        });
      });
    });
    document.getElementById('clue-notes').value = state.clueNotes;
  }

  function renderHandouts() {
    document.getElementById('handout-grid').innerHTML = data.handouts.map(function (item) {
      var sent = state.revealedHandouts.indexOf(item.id) !== -1;
      var facts = (item.playerFacts || []).slice(0, 2).map(function (fact) { return '<li>' + escapeHtml(fact) + '</li>'; }).join('');
      var remaining = Math.max(0, (item.playerFacts || []).length - 2);
      return '<article class="handout-card' + (sent ? ' sent' : '') + '"><div class="handout-art"><img src="' + item.image + '" alt="' + escapeHtml(item.title) + '视觉手卡"><span class="handout-id">' + item.id + (sent ? ' · 已发放' : '') + '</span></div><div class="handout-body"><span>' + escapeHtml(item.day) + ' · ' + escapeHtml(item.trigger) + '</span><h2>' + escapeHtml(item.title) + '</h2><small class="handout-card-source">' + escapeHtml(item.source || 'PLAYER SAFE 资料') + '</small><p>' + escapeHtml(item.body) + '</p><ul class="handout-fact-preview">' + facts + '</ul>' + (remaining ? '<small class="handout-more">另有 ' + remaining + ' 条资料要点</small>' : '') + '<div class="handout-actions"><button type="button" data-send-handout="' + item.id + '">' + (sent ? '再次投放' : '预览并发放') + '</button><button type="button" data-handout="' + item.id + '" aria-label="打开' + escapeHtml(item.title) + '完整预览">完整预览</button>' + (sent ? '<button class="danger-action" type="button" data-retract-handout="' + item.id + '">撤回投屏</button>' : '') + '</div></div></article>';
    }).join('');
    document.querySelectorAll('#handout-grid [data-handout]').forEach(function (button) { button.addEventListener('click', function () { openHandout(button.getAttribute('data-handout')); }); });
    document.querySelectorAll('#handout-grid [data-send-handout]').forEach(function (button) { button.addEventListener('click', function () { openHandout(button.getAttribute('data-send-handout')); }); });
    document.querySelectorAll('#handout-grid [data-retract-handout]').forEach(function (button) { button.addEventListener('click', function () { var item = byId(data.handouts, button.getAttribute('data-retract-handout')); if (item) retractHandout(item); }); });
  }

  function receiveCharacterSubmission(message) {
    var submission = normalizeSubmission({
      id: message && message.submissionId,
      sentAt: message && message.sentAt,
      character: message && message.character
    });
    if (!submission) return;
    if (state.characterInbox.some(function (item) { return item.id === submission.id; })) return;
    state.characterInbox.unshift(submission);
    state.characterInbox = state.characterInbox.slice(0, 40);
    addLog('收到角色卡：' + submission.character.name);
    saveState();
    renderTabletop();
    showToast('收到 ' + submission.character.name + ' 的角色卡');
  }

  function receiveCheckRequest(rawRequest) {
    var request = normalizeCheckRequest(rawRequest);
    if (!request) return;
    if (state.checkRequests.some(function (item) { return item.id === request.id; })) return;
    state.checkRequests.unshift(request);
    state.checkRequests = state.checkRequests.slice(0, 60);
    addLog('收到判定申请：' + request.characterName + ' — ' + request.goal);
    saveState();
    renderTabletop();
    sendPlayerMessage({ type:'check-ack', requestId:request.id, characterId:request.characterId, status:'received' });
    showToast('收到 ' + request.characterName + ' 的判定申请');
  }

  function upsertCharacter(rawCharacter, createWhenMissing) {
    var character = normalizeCharacter(rawCharacter, createWhenMissing === true);
    if (!character || !character.id || !character.name) return null;
    var index = state.roster.findIndex(function (item) { return item.id === character.id; });
    if (index === -1) state.roster.unshift(character); else state.roster[index] = character;
    state.roster = state.roster.slice(0, 40);
    return character;
  }

  function acceptCharacterSubmission(id) {
    var index = state.characterInbox.findIndex(function (item) { return item.id === id; });
    if (index === -1) return;
    var submission = state.characterInbox[index];
    var character = upsertCharacter(submission.character);
    if (!character) { showToast('这份角色卡无法通过协议校验'); return; }
    state.characterInbox.splice(index, 1);
    addLog('接收角色卡：' + character.name);
    saveState();
    renderTabletop();
    sendPlayerMessage({ type:'character-ack', submissionId:submission.id, characterId:character.id, accepted:true });
    showToast(character.name + ' 已加入角色列表');
  }

  function rejectCharacterSubmission(id) {
    var index = state.characterInbox.findIndex(function (item) { return item.id === id; });
    if (index === -1) return;
    var submission = state.characterInbox[index];
    state.characterInbox.splice(index, 1);
    addLog('退回角色卡：' + submission.character.name);
    saveState();
    renderTabletop();
    sendPlayerMessage({ type:'character-ack', submissionId:submission.id, characterId:submission.character.id, accepted:false });
    showToast('已从收件箱移除这份角色卡');
  }

  function downloadJson(payload, filename) {
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportCharacter(character) {
    var prefix = isCoc7Character(character) ? 'COC7-调查员-' : '零之圣杯-角色卡-';
    downloadJson(character, prefix + character.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) + '.json');
    showToast('已导出 ' + character.name + ' 的角色卡');
  }

  function exportRoster() {
    if (!state.roster.length) { showToast('角色列表还是空的'); return; }
    var containsCoc7 = state.roster.some(isCoc7Character);
    downloadJson({
      protocol:containsCoc7 ? 'zero-grail-mixed-character-collection-v1' : CHARACTER_COLLECTION_PROTOCOL,
      rulesetId:containsCoc7 ? undefined : RULESET_ID,
      systems:containsCoc7 ? [RULESET_ID].concat(coc7 ? [coc7.rulesetId] : []) : undefined,
      exportedAt:new Date().toISOString(),
      characters:state.roster
    }, '零之圣杯-全队角色-' + new Date().toISOString().slice(0,10) + '.json');
    showToast('全队角色 JSON 已导出');
  }

  function importCharacters(file) {
    if (!file) return;
    if (/\.xlsx$/i.test(file.name)) {
      if (!coc7Xlsx || !coc7) { showToast('当前浏览器未载入 COC7 Excel 导入器'); return; }
      if (file.size > 15728640) { showToast('Excel 角色卡过大，上限 15 MB'); return; }
      showToast('正在读取 Excel 角色卡…');
      coc7Xlsx.importCharacter(file).then(function (rawCharacter) {
        var character = upsertCharacter(rawCharacter, true);
        if (!character) throw new Error('character');
        addLog('导入 COC7 Excel 角色卡：' + character.name);
        saveState();
        renderAll();
        showToast(character.name + ' 已加入战团，可直接建立战斗');
      }).catch(function (error) {
        showToast('Excel 导入失败：请确认文件是 COC7 七版 .xlsx 角色卡');
      });
      return;
    }
    if (file.size > 2097152) { showToast('JSON 角色文件过大，上限 2 MB'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var payload = JSON.parse(reader.result);
        var list = [];
        if (payload && Array.isArray(payload.characters)) list = payload.characters.slice(0, 40);
        else if (payload && typeof payload === 'object') list = [payload];
        if (!list.length) throw new Error('protocol');
        var accepted = 0;
        list.forEach(function (entry) { if (upsertCharacter(entry)) accepted += 1; });
        if (!accepted) throw new Error('characters');
        addLog('导入 ' + accepted + ' 份角色卡');
        saveState();
        renderTabletop();
        showToast('已导入 ' + accepted + ' 份角色卡');
      } catch (error) {
        showToast('无法导入：请选择本站导出的角色 JSON，或 COC7 七版角色卡');
      }
    };
    reader.readAsText(file);
  }

  function refreshGmSkillOptions(extraSkill) {
    var characterSelect = document.getElementById('gm-check-character');
    var skillSelect = document.getElementById('gm-check-skill');
    if (!characterSelect || !skillSelect) return;
    var previous = skillSelect.value;
    var character = state.roster.find(function (item) { return item.id === characterSelect.value; });
    var extra = extraSkill && typeof extraSkill === 'object' ? extraSkill : { skillLabel:safeText(extraSkill, 80), skillBonus:extraSkill ? 2 : 0 };
    var requestedId = safeText(extra.skillId, 80);
    var requestedLabel = safeText(extra.skillLabel, 80);
    var requestedBonus = clampInteger(extra.skillBonus, 0, 4, requestedLabel ? 2 : 0);
    var options = '<option value="" data-skill-label="" data-skill-bonus="0">不加入通用技能（+0）</option>';
    options += skills.map(function (definition) {
      var bonus = character && !isCoc7Character(character)
        ? skillBonus(character.skills && character.skills[definition.id])
        : (requestedId === definition.id ? requestedBonus : 0);
      return '<option value="' + escapeHtml(definition.id) + '" data-skill-label="' + escapeHtml(definition.label) + '" data-skill-bonus="' + bonus + '">' + escapeHtml(definition.label) + '（+' + bonus + '）</option>';
    }).join('');
    if (requestedLabel && !skillDefinition(requestedId || requestedLabel)) {
      options += '<option value="__legacy__" data-skill-label="' + escapeHtml(requestedLabel) + '" data-skill-bonus="' + requestedBonus + '">' + escapeHtml(requestedLabel) + '（旧版，+' + requestedBonus + '）</option>';
    }
    skillSelect.innerHTML = options;
    var preferred = requestedId && skillDefinition(requestedId) ? requestedId : (requestedLabel && !skillDefinition(requestedId || requestedLabel) ? '__legacy__' : previous);
    if (Array.from(skillSelect.options).some(function (option) { return option.value === preferred; })) skillSelect.value = preferred;
  }

  function coc7StatusLabels(character) {
    if (!isCoc7Character(character)) return [];
    var labels = [];
    var status = character.status || {};
    if (status.dead) labels.push('死亡');
    else if (status.dying) labels.push('濒死');
    if (status.unconscious && !status.dead) labels.push('昏迷');
    if (status.majorWound) labels.push('重伤');
    if (status.prone) labels.push('倒地');
    if (status.temporaryInsanity) labels.push('临时疯狂');
    if (status.indefiniteInsanity) labels.push('不定期疯狂');
    if (status.permanentInsanity) labels.push('永久疯狂');
    return labels;
  }

  function renderRosterCharacter(character) {
    if (isCoc7Character(character)) {
      var cocAttributes = character.characteristics || {};
      var dodge = character.derived && Number.isFinite(Number(character.derived.dodge)) ? character.derived.dodge : Math.floor((cocAttributes.dex || 0) / 2);
      var stats = [
        ['HP', character.hp + '/' + character.maxHp], ['SAN', character.san + '/' + character.maxSan],
        ['MP', character.mp + '/' + character.maxMp], ['幸运', character.luck], ['DEX', cocAttributes.dex || 0],
        ['闪避', dodge], ['DB', character.damageBonus || '0'], ['体格', character.build], ['护甲', character.armor || 0]
      ].map(function (entry) { return '<i>' + entry[0] + ' ' + escapeHtml(entry[1]) + '</i>'; }).join('');
      var conditions = coc7StatusLabels(character);
      return '<article class="roster-row coc7-roster" data-roster-id="' + character.id + '"><div class="roster-row-main"><span class="roster-rule-badge">COC7 调查员</span><strong>' + escapeHtml(character.name) + '</strong><span>' + escapeHtml(character.playerName || '未填写玩家名') + ' · ' + escapeHtml(character.occupation || '职业未填写') + '</span><p>' + escapeHtml((character.age ? character.age + ' 岁 · ' : '') + (character.era || '时代未填写') + (conditions.length ? ' · ' + conditions.join(' / ') : '')) + '</p><div class="character-statline">' + stats + '</div><div class="roster-resource-editor"><label><span>HP</span><input type="number" min="0" max="' + character.maxHp + '" value="' + character.hp + '" data-coc-resource="hp"></label><label><span>SAN</span><input type="number" min="0" max="' + character.maxSan + '" value="' + character.san + '" data-coc-resource="san"></label><label><span>MP</span><input type="number" min="0" max="' + character.maxMp + '" value="' + character.mp + '" data-coc-resource="mp"></label><label><span>幸运</span><input type="number" min="0" max="99" value="' + character.luck + '" data-coc-resource="luck"></label><label><span>护甲</span><input type="number" min="0" max="999" value="' + character.armor + '" data-coc-resource="armor"></label></div></div><div class="row-actions"><button type="button" data-roster-combat="' + character.id + '">加入战斗</button><button type="button" data-roster-export="' + character.id + '">导出</button><button class="danger-action" type="button" data-roster-remove="' + character.id + '">移除</button></div></article>';
    }
    var attributeStats = attributes.map(function (definition) { return '<i>' + escapeHtml(definition.label) + ' ' + character.attributes[definition.id] + '</i>'; }).join('');
    var trainedSkills = skills.filter(function (definition) { return skillLevel(character.skills[definition.id]) > 0; }).map(function (definition) { return '<i>' + escapeHtml(definition.label) + ' +' + skillBonus(character.skills[definition.id]) + '</i>'; }).join('');
    var derived = derivedCharacterValues(character);
    var identityLabel = { mortal:'普通人', magus:'魔术师', servant:'从者' }[character.identityType] || '普通人';
    return '<article class="roster-row" data-roster-id="' + character.id + '"><div class="roster-row-main"><span class="roster-rule-badge">零之圣杯 v2.0 · ' + identityLabel + (character.isMaster ? '／御主' : '') + '</span><strong>' + escapeHtml(character.name) + '</strong><span>' + escapeHtml(character.playerName || '未填写玩家名') + ' · ' + escapeHtml(character.origin || '来源未填写') + '</span><p>' + escapeHtml(character.identity || '尚未填写一句角色概念') + '</p><div class="character-statline">' + attributeStats + trainedSkills + '</div><div class="roster-resource-editor"><label><span>HP／' + derived.maxHp + '</span><input type="number" min="0" max="99" value="' + character.current.hp + '" data-roster-resource="hp"></label><label><span>MP／' + derived.maxMp + '</span><input type="number" min="0" max="99" value="' + character.current.mp + '" data-roster-resource="mp"></label><label><span>决意</span><input type="number" min="0" max="3" value="' + character.current.resolve + '" data-roster-resource="resolve"></label><label><span>护甲</span><input type="number" min="0" max="20" value="' + character.current.armor + '" data-roster-resource="armor"></label><label class="roster-trauma"><span>状态（每行一项）</span><textarea rows="2" data-roster-resource="conditions">' + escapeHtml(character.current.conditions.join('\n')) + '</textarea></label></div></div><div class="row-actions"><button type="button" data-roster-combat="' + character.id + '">加入战斗</button><button type="button" data-roster-check="' + character.id + '">判定</button><button type="button" data-roster-export="' + character.id + '">导出</button><button class="danger-action" type="button" data-roster-remove="' + character.id + '">移除</button></div></article>';
  }

  function renderTabletop() {
    var roster = document.getElementById('gm-roster');
    if (!roster) return;
    roster.innerHTML = state.roster.length ? state.roster.map(renderRosterCharacter).join('') : '<p class="tabletop-empty">尚无角色。可导入本站角色 JSON、COC7 Excel 卡，或让玩家在线提交。</p>';

    document.getElementById('character-inbox-count').textContent = state.characterInbox.length + ' 份';
    document.getElementById('gm-character-inbox').innerHTML = state.characterInbox.length ? state.characterInbox.map(function (submission) {
      var cocCard = isCoc7Character(submission.character);
      return '<article class="inbox-row"><div class="inbox-row-main"><strong>' + escapeHtml(submission.character.name) + '</strong><span>' + escapeHtml(submission.character.playerName || '未填写玩家名') + ' · ' + (cocCard ? 'COC7' : '零之圣杯') + '</span><p>' + escapeHtml(cocCard ? (submission.character.occupation || '职业未填写') : (submission.character.identity || '未填写一句身份')) + '</p></div><div class="row-actions"><button type="button" data-submission-accept="' + submission.id + '">接收</button><button class="danger-action" type="button" data-submission-reject="' + submission.id + '">移除</button></div></article>';
    }).join('') : '<p class="tabletop-empty">没有待确认的玩家角色卡。</p>';

    document.getElementById('check-request-count').textContent = state.checkRequests.length + ' 条';
    document.getElementById('gm-check-requests').innerHTML = state.checkRequests.length ? state.checkRequests.map(function (request) {
      return '<article class="inbox-row"><div class="inbox-row-main"><strong>' + escapeHtml(request.characterName) + '</strong><span>' + escapeHtml(request.attributeLabel) + (request.skillLabel ? ' ＋ ' + escapeHtml(request.skillLabel) + ' +' + request.skillBonus : '') + (request.suggestedDc ? ' · 建议 DC ' + request.suggestedDc : '') + '</span><p>' + escapeHtml(request.goal) + '</p></div><div class="row-actions"><button type="button" data-request-load="' + request.id + '">载入</button><button class="danger-action" type="button" data-request-dismiss="' + request.id + '">忽略</button></div></article>';
    }).join('') : '<p class="tabletop-empty">没有等待处理的判定申请。</p>';

    var characterSelect = document.getElementById('gm-check-character');
    var previousCharacter = characterSelect.value;
    var nullGrailRoster = state.roster.filter(function (character) { return !isCoc7Character(character); });
    characterSelect.innerHTML = '<option value="all">全体玩家／公开判定</option>' + nullGrailRoster.map(function (character) {
      return '<option value="' + character.id + '">' + escapeHtml(character.name) + '</option>';
    }).join('');
    if (previousCharacter === 'all' || nullGrailRoster.some(function (item) { return item.id === previousCharacter; })) characterSelect.value = previousCharacter;

    var attributeSelect = document.getElementById('gm-check-attribute');
    if (!attributeSelect.options.length) attributeSelect.innerHTML = attributes.map(function (definition) {
      return '<option value="' + definition.id + '">' + escapeHtml(definition.label) + '</option>';
    }).join('');
    var dcSelect = document.getElementById('gm-check-dc');
    if (!dcSelect.options.length) dcSelect.innerHTML = difficulties.map(function (definition) {
      return '<option value="' + definition.value + '"' + (definition.value === 13 ? ' selected' : '') + '>' + escapeHtml(definition.label) + '</option>';
    }).join('');
    refreshGmSkillOptions();

    var history = document.getElementById('gm-check-history');
    history.innerHTML = state.checkHistory.length ? state.checkHistory.map(function (result) {
      var modeLabel = result.mode === 'advantage' ? '优势' : result.mode === 'disadvantage' ? '劣势' : '正常';
      var formula = result.dice.join(' / ') + '（' + modeLabel + '取 ' + result.kept + '）＋' + result.attributeLabel + ' ' + result.attributeValue + (result.skillLabel ? '＋' + result.skillLabel + ' ' + result.skillBonus : '') + '＋协助 ' + result.assist + '＋修正 ' + result.modifier;
      return '<li class="check-history-item"><div class="result-tier ' + result.tier + '"><strong>' + result.total + '</strong><span>' + escapeHtml(result.tierLabel) + '</span></div><div class="check-history-copy"><strong>' + escapeHtml(result.goal || '未命名判定') + '</strong><span>' + escapeHtml(result.characterName) + ' · DC ' + result.dc + '</span><p>' + escapeHtml(formula) + '</p>' + (result.publicNote ? '<p>公开结果：' + escapeHtml(result.publicNote) + '</p>' : '') + '</div><div class="check-history-meta"><time>' + escapeHtml(new Date(result.createdAt).toLocaleString('zh-CN')) + '</time><div class="row-actions"><button type="button" data-result-resend="' + result.id + '">再次发送</button></div></div></li>';
    }).join('') : '<li class="tabletop-empty">尚无判定历史。</li>';

    document.querySelectorAll('[data-roster-check]').forEach(function (button) { button.addEventListener('click', function () { clearCheckForm(); document.getElementById('gm-check-character').value = button.getAttribute('data-roster-check'); refreshGmSkillOptions(); openView('tabletop'); document.getElementById('gm-check-goal').focus(); }); });
    document.querySelectorAll('[data-roster-id]').forEach(function (card) { card.querySelectorAll('[data-roster-resource]').forEach(function (control) { control.addEventListener('change', function () {
      var character = state.roster.find(function (item) { return item.id === card.getAttribute('data-roster-id'); }); if (!character) return;
      var key = control.getAttribute('data-roster-resource');
      if (key === 'conditions') character.current.conditions = control.value.split(/\r?\n/).map(function (item) { return safeText(item,120); }).filter(Boolean).slice(0,12);
      else if (key === 'hp' || key === 'mp') character.current[key] = clampInteger(control.value,0,99,0);
      else if (key === 'armor') character.current.armor = clampInteger(control.value,0,20,0);
      else if (key === 'resolve') character.current.resolve = clampInteger(control.value,0,3,0);
      character.updatedAt = new Date().toISOString(); addLog('更新角色资源：' + character.name + ' · ' + key); saveState(); renderTabletop();
    }); }); });
    document.querySelectorAll('[data-roster-id]').forEach(function (card) { card.querySelectorAll('[data-coc-resource]').forEach(function (control) { control.addEventListener('change', function () {
      var index = state.roster.findIndex(function (item) { return item.id === card.getAttribute('data-roster-id'); });
      if (index === -1 || !isCoc7Character(state.roster[index])) return;
      var key = control.getAttribute('data-coc-resource');
      var character = state.roster[index];
      if (key === 'armor') {
        var raw = clone(character); raw.armor = clampInteger(control.value, 0, 999, character.armor); state.roster[index] = normalizeCharacter(raw, false);
      } else {
        var desired = clampInteger(control.value, 0, key === 'hp' ? character.maxHp : key === 'mp' ? character.maxMp : key === 'san' ? character.maxSan : 99, character[key]);
        state.roster[index] = coc7.adjustResource(character, key, desired - character[key]).character;
      }
      state.roster[index].updatedAt = new Date().toISOString(); addLog('更新 COC7 资源：' + character.name + ' · ' + key); saveState(); syncCombatCharacter(state.roster[index]); renderAll();
    }); }); });
    document.querySelectorAll('[data-roster-combat]').forEach(function (button) { button.addEventListener('click', function () { addCharacterToActiveCombat(button.getAttribute('data-roster-combat')); }); });
    document.querySelectorAll('[data-roster-export]').forEach(function (button) { button.addEventListener('click', function () { var item = state.roster.find(function (character) { return character.id === button.getAttribute('data-roster-export'); }); if (item) exportCharacter(item); }); });
    document.querySelectorAll('[data-roster-remove]').forEach(function (button) { button.addEventListener('click', function () { var id = button.getAttribute('data-roster-remove'); var item = state.roster.find(function (character) { return character.id === id; }); if (!item || !window.confirm('从本次战役移除 ' + item.name + '？玩家本机角色卡不会被删除。')) return; state.roster = state.roster.filter(function (character) { return character.id !== id; }); state.combatScenes.forEach(function (scene) { scene.participantIds = scene.participantIds.filter(function (participantId) { return participantId !== id; }); scene.readyFirearmIds = scene.readyFirearmIds.filter(function (participantId) { return participantId !== id; }); if (scene.initiativeScores) delete scene.initiativeScores[id]; if (scene.turnIndex >= scene.participantIds.length) scene.turnIndex = 0; }); addLog('移除角色：' + item.name); saveState(); renderAll(); }); });
    document.querySelectorAll('[data-submission-accept]').forEach(function (button) { button.addEventListener('click', function () { acceptCharacterSubmission(button.getAttribute('data-submission-accept')); }); });
    document.querySelectorAll('[data-submission-reject]').forEach(function (button) { button.addEventListener('click', function () { rejectCharacterSubmission(button.getAttribute('data-submission-reject')); }); });
    document.querySelectorAll('[data-request-load]').forEach(function (button) { button.addEventListener('click', function () { loadCheckRequest(button.getAttribute('data-request-load')); }); });
    document.querySelectorAll('[data-request-dismiss]').forEach(function (button) { button.addEventListener('click', function () { var id = button.getAttribute('data-request-dismiss'); state.checkRequests = state.checkRequests.filter(function (request) { return request.id !== id; }); if (activeCheckRequestId === id) clearCheckForm(); saveState(); renderTabletop(); showToast('判定申请已移除'); }); });
    document.querySelectorAll('[data-result-resend]').forEach(function (button) { button.addEventListener('click', function () { var result = state.checkHistory.find(function (item) { return item.id === button.getAttribute('data-result-resend'); }); if (result) { sendPlayerMessage({ type:'check-result', result:result }); showToast('判定结果已再次发送'); } }); });
  }

  function activeCombatScene(source) {
    var campaign = source || state;
    return campaign.combatScenes.find(function (scene) { return scene.id === campaign.activeCombatId; }) || null;
  }

  function combatCharacter(id, roster) {
    return (roster || state.roster).find(function (character) { return character.id === id; }) || null;
  }

  function combatInitiative(character, scene) {
    if (!character) return -1;
    var stored = scene && scene.initiativeScores && Number(scene.initiativeScores[character.id]);
    if (isCoc7Character(character)) {
      var dexterity = Number.isFinite(stored) ? stored : Number(character.characteristics && character.characteristics.dex) || 0;
      return dexterity + (scene && Array.isArray(scene.readyFirearmIds) && scene.readyFirearmIds.indexOf(character.id) !== -1 ? 50 : 0);
    }
    return Number.isFinite(stored) ? stored : Math.max(Number(character.attributes && character.attributes.agility) || 0, Number(character.attributes && character.attributes.perception) || 0);
  }

  function rollSceneInitiative(character) {
    if (isCoc7Character(character)) return Number(character.characteristics.dex) || 0;
    var ability = Math.max(Number(character.attributes && character.attributes.agility) || 0, Number(character.attributes && character.attributes.perception) || 0);
    return Math.floor(Math.random() * 20) + 1 + ability;
  }

  function sortCombatInitiative(scene, roster, preserveCharacterId) {
    var participants = scene.participantIds.slice();
    participants.sort(function (leftId, rightId) {
      var left = combatCharacter(leftId, roster);
      var right = combatCharacter(rightId, roster);
      var difference = combatInitiative(right, scene) - combatInitiative(left, scene);
      if (difference) return difference;
      return String(left && left.name || '').localeCompare(String(right && right.name || ''), 'zh-CN');
    });
    scene.participantIds = participants;
    scene.turnIndex = preserveCharacterId && participants.indexOf(preserveCharacterId) !== -1 ? participants.indexOf(preserveCharacterId) : 0;
  }

  function recordCombatEvent(scene, type, label, detail) {
    scene.events.unshift({
      id:createId('combat-event'), at:new Date().toISOString(),
      type:type || 'system', label:safeText(label, 180), detail:safeText(detail, 1200)
    });
    scene.events = scene.events.slice(0, 160);
    scene.updatedAt = new Date().toISOString();
  }

  function replaceRosterCharacter(campaign, character) {
    var index = campaign.roster.findIndex(function (item) { return item.id === character.id; });
    if (index !== -1) {
      character.updatedAt = new Date().toISOString();
      campaign.roster[index] = character;
    }
  }

  function syncCombatCharacter(character) {
    if (isCoc7Character(character)) sendPlayerMessage({ type:'character-sync', character:character });
  }

  function normalizedSkillName(value) {
    return String(value == null ? '' : value).normalize('NFKC').toLowerCase().replace(/[\s_()（）:：\-\/]+/g, '');
  }

  function coc7SkillValue(character, names, fallback) {
    var skills = character && character.skills && typeof character.skills === 'object' ? character.skills : {};
    var wanted = names.map(normalizedSkillName);
    var keys = Object.keys(skills);
    for (var index = 0; index < keys.length; index += 1) {
      var normalized = normalizedSkillName(keys[index]);
      if (wanted.indexOf(normalized) !== -1) return clampInteger(skills[keys[index]], 0, 999, fallback || 0);
    }
    return clampInteger(fallback, 0, 999, 0);
  }

  function defaultBrawlWeapon(character) {
    return {
      id:'builtin-brawl', name:'徒手格斗', skill:'斗殴',
      skillValue:coc7SkillValue(character, ['斗殴','Fighting (Brawl)','Fighting','Brawl'], 25),
      damage:'1D3+DB', impale:false, type:'melee'
    };
  }

  function combatWeapons(character) {
    if (!character) return [];
    if (!isCoc7Character(character)) {
      var options = [
        { id:'ng-unarmed', name:'徒手／临时武器', system:'null-grail', attributeId:'physique', skillId:'melee', damage:1, modifier:0, mystic:false },
        { id:'ng-light-melee', name:'刀具／轻型近战', system:'null-grail', attributeId:'physique', skillId:'melee', damage:2, modifier:0, mystic:false },
        { id:'ng-ranged', name:'步枪／霰弹枪／专业武器', system:'null-grail', attributeId:'agility', skillId:'ranged', damage:3, modifier:0, mystic:false }
      ];
      if (character.identityType === 'magus') options.push({ id:'ng-spell-2', name:'二阶攻击术式（2 MP）', system:'null-grail', attributeId:'mana', skillId:'magecraft', damage:4, modifier:0, mpCost:2, mystic:true });
      if (character.identityType === 'servant') {
        options.push({ id:'ng-servant-normal', name:'从者普通攻击', system:'null-grail', attributeId:'physique', skillId:'melee', damage:5, modifier:0, mystic:true });
        options.push({ id:'ng-servant-heavy', name:'从者重型攻击（命中 -4）', system:'null-grail', attributeId:'physique', skillId:'melee', damage:7, modifier:-4, mystic:true });
      }
      return options;
    }
    var weapons = Array.isArray(character.weapons) ? character.weapons.filter(function (weapon) { return weapon && weapon.name; }).map(function (weapon) { return clone(weapon); }) : [];
    if (!weapons.some(function (weapon) { return /(徒手|拳|brawl|unarmed)/i.test((weapon.name || '') + ' ' + (weapon.skill || '')); })) weapons.unshift(defaultBrawlWeapon(character));
    return weapons;
  }

  function weaponSkillValue(character, weapon) {
    if (weapon && weapon.system === 'null-grail') return (Number(character.attributes && character.attributes[weapon.attributeId]) || 0) + skillBonus(character.skills && character.skills[weapon.skillId]) + (Number(weapon.modifier) || 0);
    var explicit = Number(weapon && weapon.skillValue);
    if (Number.isFinite(explicit) && explicit > 0) return clampInteger(explicit, 0, 999, 0);
    var skill = safeText(weapon && weapon.skill, 100);
    return coc7SkillValue(character, skill ? [skill] : ['斗殴','Fighting (Brawl)','Brawl'], weapon && weapon.id === 'builtin-brawl' ? 25 : 0);
  }

  function chooseDamageExpression(expression) {
    var source = safeText(expression, 100).normalize('NFKC');
    if (!source) return { expression:'0', note:'' };
    if (source.indexOf('/') !== -1) {
      var branches = source.split('/').map(function (branch) { return branch.trim(); }).filter(Boolean);
      source = branches[0] || '0';
      return { expression:source, note:'原骰式含射程分支，自动采用第一段；请按实际射程复核。' };
    }
    var note = '';
    if (/(燃烧|眩晕|毒|窒息|震慑|burn|stun)/i.test(source)) {
      note = '附加的燃烧／眩晕等效果需守秘人手动处理。';
      source = source.replace(/[+＋]?(燃烧|眩晕|毒|窒息|震慑|burn(?:ing)?|stun(?:ning)?)/ig, '');
    }
    return { expression:source || '0', note:note };
  }

  function expressionWithoutDamageBonus(expression) {
    var source = String(expression || '0').normalize('NFKC').toUpperCase().replace(/\s+/g, '');
    source = source.replace(/[+＋]?(?:0\.5|1\/2|½)?\*?DB/g, '').replace(/-(?:0\.5|1\/2|½)?\*?DB/g, '');
    source = source.replace(/[+\-]$/, '');
    return source || '0';
  }

  function hitDamage(character, weapon, level) {
    var selected = chooseDamageExpression(weapon && weapon.damage || '1D3+DB');
    var extreme = level === 'extreme' || level === 'critical';
    if (!extreme) {
      var normal = coc7.rollDamageExpression(selected.expression, character.damageBonus || '0');
      return { total:normal.total, label:'普通伤害 ' + normal.total, note:selected.note };
    }
    var maximum = coc7.maximumDamageExpression(selected.expression, character.damageBonus || '0');
    if (weapon && weapon.impale) {
      var extraExpression = expressionWithoutDamageBonus(selected.expression);
      var extra = coc7.rollDamageExpression(extraExpression, 0);
      return { total:maximum + extra.total, label:'贯穿极难伤害 ' + maximum + '＋' + extra.total + '＝' + (maximum + extra.total), note:selected.note };
    }
    return { total:maximum, label:'极难最大伤害 ' + maximum, note:selected.note };
  }

  function rollLevelLabel(level) {
    return { critical:'大成功', extreme:'极难成功', hard:'困难成功', regular:'成功', failure:'失败', fumble:'大失败' }[level] || level;
  }

  function combatBar(label, value, maximum, color) {
    var max = Math.max(1, Number(maximum) || 1);
    var percent = Math.max(0, Math.min(100, Math.round((Number(value) || 0) / max * 100)));
    return '<div class="combatant-bar"><span>' + label + '</span><i style="--bar:' + percent + '%;--bar-color:' + color + '"></i><strong>' + value + '/' + maximum + '</strong></div>';
  }

  function renderCombatant(character, scene, index) {
    var current = index === scene.turnIndex;
    if (isCoc7Character(character)) {
      var status = character.status || {};
      var conditions = coc7StatusLabels(character).map(function (label) { return '<span' + (label === '重伤' ? ' class="major"' : '') + '>' + label + '</span>'; }).join('');
      var dead = status.dead ? ' dead' : '';
      var stats = [
        ['DEX', character.characteristics.dex], ['闪避', character.derived.dodge], ['护甲', character.armor], ['幸运', character.luck]
      ].map(function (entry) { return '<div class="combatant-stat"><span>' + entry[0] + '</span><strong>' + escapeHtml(entry[1]) + '</strong><small></small></div>'; }).join('');
      return '<article class="combatant-card' + (current ? ' current' : '') + dead + '"><header><div><span>COC7 · 先攻 ' + combatInitiative(character, scene) + '</span><h3>' + escapeHtml(character.name) + '</h3></div><i>' + (current ? '当前行动' : '等待') + '</i></header><div class="combatant-stats">' + stats + '</div><div class="combatant-bars">' + combatBar('HP', character.hp, character.maxHp, '#b35d61') + combatBar('SAN', character.san, character.maxSan, '#5f9b80') + combatBar('MP', character.mp, character.maxMp, '#6d86b2') + '</div><div class="combatant-conditions">' + (conditions || '<span class="major">状态正常</span>') + '</div></article>';
    }
    var derived = derivedCharacterValues(character);
    var currentValues = character.current || {};
    var stats = [
      ['灵巧', character.attributes.agility], ['回避', 10 + character.attributes.agility], ['护甲', currentValues.armor], ['决意', currentValues.resolve]
    ].map(function (entry) { return '<div class="combatant-stat"><span>' + entry[0] + '</span><strong>' + escapeHtml(entry[1]) + '</strong><small></small></div>'; }).join('');
    var conditions = Array.isArray(currentValues.conditions) && currentValues.conditions.length ? currentValues.conditions.map(function (condition) { return '<span class="major">' + escapeHtml(condition) + '</span>'; }).join('') : '<span class="major">状态正常</span>';
    return '<article class="combatant-card' + (current ? ' current' : '') + (currentValues.hp <= 0 ? ' dead' : '') + '"><header><div><span>零之圣杯 · 先攻 ' + combatInitiative(character, scene) + '</span><h3>' + escapeHtml(character.name) + '</h3></div><i>' + (current ? '当前行动' : '等待') + '</i></header><div class="combatant-stats">' + stats + '</div><div class="combatant-bars">' + combatBar('HP', currentValues.hp, derived.maxHp, '#b35d61') + combatBar('MP', currentValues.mp, derived.maxMp, '#6d86b2') + '</div><div class="combatant-conditions">' + conditions + '</div></article>';
  }

  function selectOptions(select, entries, previous, emptyLabel) {
    select.innerHTML = entries.length ? entries.map(function (entry) { return '<option value="' + escapeHtml(entry.value) + '">' + escapeHtml(entry.label) + '</option>'; }).join('') : '<option value="">' + escapeHtml(emptyLabel || '暂无可选项') + '</option>';
    if (entries.some(function (entry) { return entry.value === previous; })) select.value = previous;
    select.disabled = !entries.length;
  }

  function refreshCombatAttackOptions() {
    var scene = activeCombatScene();
    var attackerSelect = document.getElementById('combat-attacker');
    var weaponSelect = document.getElementById('combat-weapon');
    var targetSelect = document.getElementById('combat-target');
    if (!scene || !attackerSelect || !weaponSelect || !targetSelect) return;
    var attacker = combatCharacter(attackerSelect.value);
    var previousWeapon = weaponSelect.value;
    var weapons = combatWeapons(attacker);
    selectOptions(weaponSelect, weapons.map(function (weapon) {
      return { value:weapon.id, label:weapon.name + ' · ' + (isCoc7Character(attacker) ? weaponSkillValue(attacker, weapon) + '% · ' + (weapon.damage || '0') : '检定 +' + weaponSkillValue(attacker, weapon) + ' · 伤害 ' + weapon.damage) };
    }), previousWeapon, '该角色没有可用武器');
    var previousTarget = targetSelect.value;
    var targets = scene.participantIds.map(function (id) { return combatCharacter(id); }).filter(function (character) {
      if (!character || character.id === attackerSelect.value || isCoc7Character(character) !== isCoc7Character(attacker)) return false;
      return isCoc7Character(character) ? !(character.status && character.status.dead) : Number(character.current && character.current.hp) > 0;
    });
    selectOptions(targetSelect, targets.map(function (character) {
      var derived = isCoc7Character(character) ? null : derivedCharacterValues(character);
      return { value:character.id, label:character.name + ' · HP ' + (isCoc7Character(character) ? character.hp + '/' + character.maxHp : character.current.hp + '/' + derived.maxHp) };
    }), previousTarget, '没有同规则的其他目标');
    document.getElementById('combat-ready-firearm').disabled = !isCoc7Character(attacker);
    document.getElementById('combat-attack-hint').textContent = isCoc7Character(attacker) ? 'COC7：成功率、伤害骰、贯穿、闪避、重伤、濒死与护甲自动结算。' : '零之圣杯：1D20＋属性＋技能对回避；大成功 +2 伤害，并自动处理护甲、生命归零与从者尺度。';
  }

  function renderCombat() {
    var picker = document.getElementById('combat-roster-picker');
    if (!picker) return;
    picker.innerHTML = state.roster.length ? state.roster.map(function (character) {
      var derived = isCoc7Character(character) ? null : derivedCharacterValues(character);
      return '<label class="combat-roster-choice"><input type="checkbox" value="' + character.id + '" data-combat-roster-choice><span><strong>' + escapeHtml(character.name) + '</strong><small>' + (isCoc7Character(character) ? 'COC7 · DEX ' + character.characteristics.dex : '零之圣杯 · 灵巧 ' + character.attributes.agility) + '</small></span><i>' + (isCoc7Character(character) ? 'HP ' + character.hp + '/' + character.maxHp : 'HP ' + character.current.hp + '/' + derived.maxHp) + '</i></label>';
    }).join('') : '<p class="tabletop-empty">先到“战团”导入角色卡。</p>';

    document.getElementById('combat-scene-list').innerHTML = state.combatScenes.length ? state.combatScenes.map(function (scene) {
      return '<button type="button" class="combat-scene-button' + (scene.id === state.activeCombatId ? ' active' : '') + '" data-combat-scene="' + scene.id + '"><span><strong>' + escapeHtml(scene.name) + '</strong><span>第 ' + scene.round + ' 轮 · ' + scene.participantIds.length + ' 人</span></span><i>' + (scene.status === 'ended' ? '已结束' : '进行中') + '</i></button>';
    }).join('') : '<p class="tabletop-empty">尚无战斗场景。</p>';
    document.querySelectorAll('[data-combat-scene]').forEach(function (button) { button.addEventListener('click', function () { state.activeCombatId = button.getAttribute('data-combat-scene'); saveState(); renderCombat(); }); });

    var scene = activeCombatScene();
    var empty = document.getElementById('combat-empty');
    var active = document.getElementById('combat-active');
    if (!scene) {
      empty.hidden = false; active.hidden = true;
      document.getElementById('combat-active-title').textContent = '尚未建立战斗';
      document.getElementById('combat-round').textContent = '第 0 轮';
      document.getElementById('combat-next-turn').disabled = true;
      document.getElementById('combat-end-scene').disabled = true;
      return;
    }
    empty.hidden = true; active.hidden = false;
    document.getElementById('combat-active-title').textContent = scene.name + (scene.status === 'ended' ? ' · 已结束' : '');
    document.getElementById('combat-round').textContent = '第 ' + scene.round + ' 轮';
    var participants = scene.participantIds.map(function (id) { return combatCharacter(id); }).filter(Boolean);
    document.getElementById('combat-participants').innerHTML = participants.length ? participants.map(function (character) {
      return renderCombatant(character, scene, scene.participantIds.indexOf(character.id));
    }).join('') : '<p class="tabletop-empty">本场暂无参战者。</p>';

    var attackerSelect = document.getElementById('combat-attacker');
    var previousAttacker = attackerSelect.value;
    var combatReadyParticipants = participants.filter(function (character) { return isCoc7Character(character) ? !(character.status && character.status.dead) : Number(character.current && character.current.hp) > 0; });
    selectOptions(attackerSelect, combatReadyParticipants.map(function (character) { return { value:character.id, label:character.name + ' · ' + (isCoc7Character(character) ? 'COC7 · DEX ' + character.characteristics.dex : '零之圣杯 · 回避 ' + (10 + character.attributes.agility)) }; }), previousAttacker, '没有可攻击的角色');
    refreshCombatAttackOptions();
    var adjustSelect = document.getElementById('combat-adjust-target');
    selectOptions(adjustSelect, participants.map(function (character) { return { value:character.id, label:character.name + ' · ' + (isCoc7Character(character) ? 'COC7' : '零之圣杯') }; }), adjustSelect.value, '没有参战者');

    document.getElementById('combat-event-list').innerHTML = scene.events.length ? scene.events.map(function (event) {
      return '<li class="combat-event"><time>' + escapeHtml(new Date(event.at).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'})) + '</time><div><strong>' + escapeHtml(event.label) + '</strong>' + (event.detail ? '<p>' + escapeHtml(event.detail) + '</p>' : '') + '</div></li>';
    }).join('') : '<li class="tabletop-empty">本场尚无结算记录。</li>';
    var ended = scene.status === 'ended';
    document.getElementById('combat-next-turn').disabled = ended || !participants.length;
    document.getElementById('combat-end-scene').disabled = ended;
    document.querySelectorAll('#combat-attack-form input, #combat-attack-form select, #combat-attack-form button, #combat-adjust-form input, #combat-adjust-form select, #combat-adjust-form button').forEach(function (control) { control.disabled = ended || !participants.length; });
    if (!ended && participants.length) refreshCombatAttackOptions();
  }

  function createCombatScene(event) {
    event.preventDefault();
    var selected = Array.from(document.querySelectorAll('[data-combat-roster-choice]:checked')).map(function (input) { return input.value; });
    if (!selected.length) { showToast('请至少勾选一名参战者'); return; }
    var name = safeText(document.getElementById('combat-scene-name').value, 100) || '战斗 ' + new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
    var sceneId = createId('combat');
    commit('建立战斗场景：' + name, function (draft) {
      var scene = normalizeCombatScene({ id:sceneId, name:name, participantIds:selected, round:1, turnIndex:0, status:'active', events:[], readyFirearmIds:[] }, draft.roster);
      scene.participantIds.forEach(function (id) { scene.initiativeScores[id] = rollSceneInitiative(combatCharacter(id, draft.roster)); });
      sortCombatInitiative(scene, draft.roster);
      recordCombatEvent(scene, 'system', '战斗开始', 'COC7 按 DEX；零之圣杯已掷 1D20＋灵巧／感知较高者，并自动排列先攻。');
      draft.combatScenes.unshift(scene);
      draft.combatScenes = draft.combatScenes.slice(0, 12);
      draft.activeCombatId = scene.id;
    });
    document.getElementById('combat-create-form').reset();
    openView('combat');
  }

  function addCharacterToActiveCombat(characterId) {
    var character = combatCharacter(characterId);
    if (!character) return;
    var scene = activeCombatScene();
    if (scene && scene.status === 'active') {
      if (scene.participantIds.indexOf(characterId) !== -1) { openView('combat'); showToast(character.name + ' 已在当前战斗中'); return; }
      commit('加入战斗：' + character.name, function (draft) {
        var targetScene = activeCombatScene(draft);
        targetScene.participantIds.push(characterId);
        targetScene.initiativeScores[characterId] = rollSceneInitiative(combatCharacter(characterId, draft.roster));
        sortCombatInitiative(targetScene, draft.roster, targetScene.participantIds[targetScene.turnIndex]);
        recordCombatEvent(targetScene, 'system', character.name + ' 加入战斗', '先攻值 ' + combatInitiative(combatCharacter(characterId, draft.roster), targetScene));
      });
      openView('combat');
      return;
    }
    openView('combat');
    renderCombat();
    var checkbox = document.querySelector('[data-combat-roster-choice][value="' + CSS.escape(characterId) + '"]');
    if (checkbox) { checkbox.checked = true; document.getElementById('combat-scene-name').focus(); }
    showToast('已勾选 ' + character.name + '，填写场景名即可建立战斗');
  }

  function automaticDyingChecks(campaign, scene) {
    scene.participantIds.forEach(function (id) {
      var character = combatCharacter(id, campaign.roster);
      if (!isCoc7Character(character) || !character.status.dying || character.status.dead) return;
      var check = coc7.rollPercentile(character.characteristics.con, 0);
      if (!check.success) {
        var dead = clone(character); dead.status.dead = true; dead.status.dying = false; dead.status.unconscious = true;
        replaceRosterCharacter(campaign, coc7.normalizeCharacter(dead));
      }
      recordCombatEvent(scene, 'status', character.name + ' 的濒死 CON 检定：' + rollLevelLabel(check.level), check.roll + ' / ' + check.skill + (check.success ? '，继续濒死。' : '，检定失败，角色死亡。'));
    });
  }

  function advanceCombatTurn() {
    var scene = activeCombatScene();
    if (!scene || scene.status !== 'active' || !scene.participantIds.length) return;
    commit('推进战斗行动位', function (draft) {
      var targetScene = activeCombatScene(draft);
      var previous = targetScene.participantIds[targetScene.turnIndex];
      targetScene.turnIndex += 1;
      if (targetScene.turnIndex >= targetScene.participantIds.length) {
        targetScene.round += 1;
        targetScene.readyFirearmIds = [];
        sortCombatInitiative(targetScene, draft.roster);
        automaticDyingChecks(draft, targetScene);
        recordCombatEvent(targetScene, 'turn', '进入第 ' + targetScene.round + ' 轮', '火器准备加值已重置，并执行所有濒死 CON 检定。');
      } else {
        var next = combatCharacter(targetScene.participantIds[targetScene.turnIndex], draft.roster);
        recordCombatEvent(targetScene, 'turn', '行动位推进', (combatCharacter(previous, draft.roster) || {name:'上一位'}).name + ' → ' + (next ? next.name : '下一位'));
      }
    });
    var updatedScene = activeCombatScene();
    if (updatedScene) updatedScene.participantIds.forEach(function (id) { syncCombatCharacter(combatCharacter(id)); });
  }

  function endCombatScene() {
    var scene = activeCombatScene();
    if (!scene || scene.status !== 'active') return;
    if (!window.confirm('结束“' + scene.name + '”？角色当前 HP、SAN、MP 与状态会保留。')) return;
    commit('结束战斗：' + scene.name, function (draft) {
      var targetScene = activeCombatScene(draft);
      targetScene.status = 'ended';
      recordCombatEvent(targetScene, 'system', '战斗结束', '所有角色资源与状态已写回战团。');
    });
  }

  function rollD20WithMode(mode) {
    var modifier = clampInteger(mode, -2, 2, 0);
    var dice = [Math.floor(Math.random() * 20) + 1];
    if (modifier !== 0) dice.push(Math.floor(Math.random() * 20) + 1);
    return { dice:dice, kept:modifier > 0 ? Math.max.apply(Math, dice) : modifier < 0 ? Math.min.apply(Math, dice) : dice[0] };
  }

  function applyNullGrailDamage(target, rawDamage, attacker, weapon, ignoreArmor) {
    var next = clone(target);
    var previous = Number(next.current.hp) || 0;
    var scaleBlocked = Boolean(attacker && next.identityType === 'servant' && attacker.identityType !== 'servant' && !(weapon && weapon.mystic));
    var armor = ignoreArmor || scaleBlocked ? 0 : Math.max(0, Number(next.current.armor) || 0);
    var damage = scaleBlocked ? 0 : Math.max(0, Math.floor(Number(rawDamage) || 0) - armor);
    next.current.hp = Math.max(0, previous - damage);
    if (next.current.hp === 0) {
      var condition = next.identityType === 'servant' ? '灵基消散' : '倒地';
      if (next.current.conditions.indexOf(condition) === -1) next.current.conditions.push(condition);
    }
    return { character:next, previousHp:previous, hp:next.current.hp, armor:armor, damage:damage, scaleBlocked:scaleBlocked };
  }

  function nullGrailAttackResult(attacker, target, weapon, defense, mode) {
    var attackDie = rollD20WithMode(mode);
    var attackBonus = weaponSkillValue(attacker, weapon);
    var targetDefense = defense === 'none' ? 10 : 10 + (Number(target.attributes.agility) || 0);
    var attackTotal = attackDie.kept + attackBonus;
    var attackSuccess = attackDie.kept !== 1 && attackTotal >= targetDefense;
    var counterDie = null;
    var counterTotal = 0;
    var counterSuccess = false;
    if (defense === 'fightBack') {
      counterDie = rollD20WithMode(0);
      counterTotal = counterDie.kept + (Number(target.attributes.physique) || 0) + skillBonus(target.skills && target.skills.melee);
      counterSuccess = counterDie.kept !== 1 && counterTotal >= 10 + (Number(attacker.attributes.agility) || 0);
    }
    var attackerHits = attackSuccess;
    var defenderHits = false;
    if (defense === 'fightBack' && counterSuccess) {
      if (!attackSuccess || counterTotal >= attackTotal) { attackerHits = false; defenderHits = true; }
    }
    var critical = attackerHits && (attackDie.kept === 20 || attackTotal >= targetDefense + 10);
    var counterCritical = defenderHits && (counterDie.kept === 20 || counterTotal >= 20 + (Number(attacker.attributes.agility) || 0));
    return {
      attackDie:attackDie, attackBonus:attackBonus, attackTotal:attackTotal, targetDefense:targetDefense,
      attackerHits:attackerHits, defenderHits:defenderHits, critical:critical,
      counterDie:counterDie, counterTotal:counterTotal, counterCritical:counterCritical
    };
  }

  function resolveNullGrailAttack(scene, attacker, target, weapon, defense, bonus) {
    if (Number(weapon.mpCost) > Number(attacker.current.mp)) { showToast('MP 不足，无法使用该术式'); return; }
    var result = nullGrailAttackResult(attacker, target, weapon, defense, bonus);
    var nextAttacker = clone(attacker);
    var nextTarget = clone(target);
    if (weapon.mpCost) nextAttacker.current.mp = Math.max(0, nextAttacker.current.mp - weapon.mpCost);
    var detail = attacker.name + '：' + result.attackDie.dice.join('/') + ' 取 ' + result.attackDie.kept + '＋' + result.attackBonus + '＝' + result.attackTotal + '，目标防御 ' + result.targetDefense + '。';
    if (result.counterDie) detail += ' ' + target.name + ' 反击：' + result.counterDie.kept + '，总值 ' + result.counterTotal + '。';
    if (result.attackerHits) {
      var rawDamage = Number(weapon.damage) + (result.critical ? 2 : 0);
      var applied = applyNullGrailDamage(target, rawDamage, attacker, weapon, false);
      nextTarget = applied.character;
      detail += ' ' + (result.critical ? '战斗大成功；' : '') + '基础伤害 ' + rawDamage + '，护甲 ' + applied.armor + '，实扣 ' + applied.damage + ' HP（' + applied.previousHp + '→' + applied.hp + '）。';
      if (applied.scaleBlocked) detail += ' 普通人武器不具神秘尺度，未能削减从者生命。';
    } else if (result.defenderHits) {
      var counterWeapon = target.identityType === 'servant'
        ? { mystic:true, damage:5, name:'从者普通反击' }
        : { mystic:false, damage:1, name:'徒手反击' };
      var counterDamage = Number(counterWeapon.damage) + (result.counterCritical ? 2 : 0);
      var counterApplied = applyNullGrailDamage(attacker, counterDamage, target, counterWeapon, false);
      nextAttacker = counterApplied.character;
      detail += ' 反击命中，基础伤害 ' + counterDamage + '，护甲 ' + counterApplied.armor + '，实扣 ' + counterApplied.damage + ' HP（' + counterApplied.previousHp + '→' + counterApplied.hp + '）。';
      if (counterApplied.scaleBlocked) detail += ' 攻击缺少神秘尺度，未能削减从者生命。';
    } else detail += ' 攻击未命中。';
    var label = attacker.name + ' 使用 ' + weapon.name + ' → ' + target.name + '：' + (result.attackerHits ? '命中' : result.defenderHits ? '遭反击' : '未命中');
    var sceneId = scene.id;
    commit(label, function (draft) {
      replaceRosterCharacter(draft, nextAttacker);
      replaceRosterCharacter(draft, nextTarget);
      recordCombatEvent(draft.combatScenes.find(function (item) { return item.id === sceneId; }), 'attack', label, detail);
    });
  }

  function resolveCombatAttack(event) {
    event.preventDefault();
    var scene = activeCombatScene();
    if (!scene || scene.status !== 'active') return;
    var attacker = combatCharacter(document.getElementById('combat-attacker').value);
    var target = combatCharacter(document.getElementById('combat-target').value);
    var weapon = combatWeapons(attacker).find(function (item) { return item.id === document.getElementById('combat-weapon').value; });
    if (!weapon) { showToast('请选择有效武器'); return; }
    var defense = document.getElementById('combat-defense').value;
    var bonus = clampInteger(document.getElementById('combat-bonus').value, -2, 2, 0);
    if (attacker && target && !isCoc7Character(attacker) && !isCoc7Character(target)) {
      resolveNullGrailAttack(scene, attacker, target, weapon, defense, bonus);
      return;
    }
    if (!isCoc7Character(attacker) || !isCoc7Character(target)) { showToast('攻击者与目标必须使用同一套规则'); return; }
    var attackerSkill = weaponSkillValue(attacker, weapon);
    var prepared = document.getElementById('combat-ready-firearm').value === 'true';
    var attackRoll;
    var defenseRoll = null;
    var attackerHits = false;
    var defenderHits = false;
    var resolution;
    if (defense === 'none') {
      attackRoll = coc7.rollPercentile(attackerSkill, bonus);
      attackerHits = attackRoll.success;
    } else {
      var defenderWeapon = defaultBrawlWeapon(target);
      resolution = coc7.opposedCombat(attacker, target, {
        attackerSkill:attackerSkill, attackerBonusPenalty:bonus,
        defenderAction:defense, defenderSkill:defense === 'dodge' ? (target.derived && target.derived.dodge) : weaponSkillValue(target, defenderWeapon)
      });
      attackRoll = resolution.attacker;
      defenseRoll = resolution.defender;
      attackerHits = resolution.attackerHits;
      defenderHits = resolution.defenderHits;
    }
    var nextAttacker = attacker;
    var nextTarget = target;
    var detailParts = [attacker.name + '：' + attackRoll.roll + '/' + attackRoll.skill + '（' + rollLevelLabel(attackRoll.level) + '）'];
    if (defenseRoll) detailParts.push(target.name + '：' + defenseRoll.roll + '/' + defenseRoll.skill + '（' + rollLevelLabel(defenseRoll.level) + '）');
    try {
      if (attackerHits) {
        var damage = hitDamage(attacker, weapon, attackRoll.level);
        var applied = coc7.applyDamage(target, damage.total, target.armor);
        nextTarget = applied.character;
        detailParts.push(damage.label + '，护甲 ' + applied.armor + '，实扣 ' + applied.damage + ' HP（' + applied.previousHp + '→' + applied.hp + '）');
        if (damage.note) detailParts.push(damage.note);
        if (applied.majorWound) detailParts.push('触发重伤' + (applied.conCheck ? '，CON ' + applied.conCheck.roll + '/' + applied.conCheck.skill : '') + '。');
        if (applied.dying) detailParts.push('目标进入濒死。');
        if (applied.dead) detailParts.push('单次伤害大于最大 HP，目标立即死亡。');
      } else if (defenderHits) {
        var counterWeapon = defaultBrawlWeapon(target);
        var counterDamage = hitDamage(target, counterWeapon, defenseRoll.level);
        var counterApplied = coc7.applyDamage(attacker, counterDamage.total, attacker.armor);
        nextAttacker = counterApplied.character;
        detailParts.push('反击命中：' + counterDamage.label + '，护甲 ' + counterApplied.armor + '，实扣 ' + counterApplied.damage + ' HP（' + counterApplied.previousHp + '→' + counterApplied.hp + '）');
      } else detailParts.push(defense === 'dodge' && defenseRoll && defenseRoll.success ? '攻击被闪避。' : '攻击未命中。');
    } catch (error) {
      showToast('无法解析该武器伤害骰：' + safeText(weapon.damage, 40));
      return;
    }
    var label = attacker.name + ' 使用 ' + weapon.name + ' → ' + target.name + '：' + (attackerHits ? '命中' : defenderHits ? '遭反击' : '未命中');
    var sceneId = scene.id;
    commit(label, function (draft) {
      var targetScene = draft.combatScenes.find(function (item) { return item.id === sceneId; });
      if (prepared && targetScene.readyFirearmIds.indexOf(attacker.id) === -1) targetScene.readyFirearmIds.push(attacker.id);
      if (!prepared) targetScene.readyFirearmIds = targetScene.readyFirearmIds.filter(function (id) { return id !== attacker.id; });
      sortCombatInitiative(targetScene, draft.roster, attacker.id);
      replaceRosterCharacter(draft, nextAttacker);
      replaceRosterCharacter(draft, nextTarget);
      recordCombatEvent(targetScene, 'attack', label, detailParts.join(' '));
    });
    syncCombatCharacter(nextAttacker);
    syncCombatCharacter(nextTarget);
  }

  function rolledAmount(value) {
    var source = safeText(value, 40) || '0';
    var rolled = coc7.rollDamageExpression(source, 0);
    return { value:rolled.total, label:source + '＝' + rolled.total };
  }

  function applyCombatAdjustment(event) {
    event.preventDefault();
    var scene = activeCombatScene();
    if (!scene || scene.status !== 'active') return;
    var character = combatCharacter(document.getElementById('combat-adjust-target').value);
    if (!character) { showToast('请选择调整目标'); return; }
    var kind = document.getElementById('combat-adjust-kind').value;
    var value = safeText(document.getElementById('combat-adjust-value').value, 40) || '0';
    var next = character;
    var label = '';
    var detail = '';
    try {
      if (kind === 'stress') {
        if (isCoc7Character(character)) throw new Error('零之圣杯角色才能调整压力');
        var stressDelta = clampInteger(value, -3, 3, 0);
        next = clone(character); next.current.resolve = clampInteger(next.current.resolve + stressDelta, 0, 3, next.current.resolve);
        label = character.name + ' 决意 ' + (stressDelta >= 0 ? '＋' : '') + stressDelta; detail = '当前决意 ' + next.current.resolve + '/3。';
      } else if (kind === 'injury') {
        if (isCoc7Character(character)) throw new Error('零之圣杯角色才能升级伤势');
        next = clone(character); if (next.current.conditions.indexOf('受伤') === -1) next.current.conditions.push('受伤');
        label = character.name + ' 获得“受伤”'; detail = '状态已写回角色卡。';
      } else {
        if (!isCoc7Character(character) && kind === 'damage') {
          var nullDamage = rolledAmount(value); var nullApplied = applyNullGrailDamage(character, nullDamage.value, null, null, document.getElementById('combat-ignore-armor').checked);
          next = nullApplied.character; label = character.name + ' 受到 ' + nullApplied.damage + ' 点伤害'; detail = nullDamage.label + '，护甲 ' + nullApplied.armor + '，HP ' + nullApplied.previousHp + '→' + nullApplied.hp + '。';
        } else if (!isCoc7Character(character) && kind === 'heal') {
          var nullHealing = rolledAmount(value); next = clone(character); var nullDerived = derivedCharacterValues(character); var previousHp = next.current.hp;
          next.current.hp = Math.min(nullDerived.maxHp, next.current.hp + nullHealing.value); if (next.current.hp > 0) next.current.conditions = next.current.conditions.filter(function (condition) { return condition !== '倒地'; });
          label = character.name + ' 恢复 ' + (next.current.hp - previousHp) + ' HP'; detail = nullHealing.label + '，HP ' + previousHp + '→' + next.current.hp + '。';
        } else if (!isCoc7Character(character) && (kind === 'mp-spend' || kind === 'mp-restore')) {
          var nullMp = rolledAmount(value); next = clone(character); var maxMp = derivedCharacterValues(character).maxMp; var oldMp = next.current.mp;
          next.current.mp = Math.max(0, Math.min(maxMp, oldMp + (kind === 'mp-restore' ? nullMp.value : -nullMp.value)));
          label = character.name + (kind === 'mp-restore' ? ' 恢复 ' : ' 消耗 ') + Math.abs(next.current.mp - oldMp) + ' MP'; detail = nullMp.label + '，MP ' + oldMp + '→' + next.current.mp + '。';
        } else {
        if (!isCoc7Character(character)) throw new Error('该操作仅适用于 COC7 调查员');
        if (kind === 'damage') {
          var damageSource = chooseDamageExpression(value);
          var damageResult = coc7.applyDamage(character, damageSource.expression, document.getElementById('combat-ignore-armor').checked ? 0 : character.armor);
          next = damageResult.character; label = character.name + ' 受到 ' + damageResult.damage + ' 点伤害';
          detail = damageSource.expression + ' 掷出 ' + damageResult.rolledDamage + '，护甲 ' + damageResult.armor + '，HP ' + damageResult.previousHp + '→' + damageResult.hp + '。' + (damageSource.note || '');
        } else if (kind === 'heal') {
          var healing = rolledAmount(value); var healResult = coc7.heal(character, healing.value, { preserveMajorWound:true });
          next = healResult.character; label = character.name + ' 恢复 ' + healResult.healed + ' HP'; detail = healing.label + '，HP ' + healResult.previousHp + '→' + healResult.hp + '。';
        } else if (kind === 'sanity') {
          var sanity = coc7.applySanityLoss(character, value); next = sanity.character;
          label = character.name + ' 失去 ' + sanity.loss + ' SAN'; detail = (sanity.sanCheck ? 'SAN 检定 ' + sanity.sanCheck.roll + '/' + sanity.sanCheck.skill + '（' + rollLevelLabel(sanity.sanCheck.level) + '），' : '') + 'SAN ' + sanity.previousSan + '→' + sanity.san + '。' + (sanity.temporaryInsanity ? '触发临时疯狂 ' + sanity.temporaryInsanityHours + ' 小时。' : '') + (sanity.indefiniteInsanity ? '已达不定期疯狂阈值。' : '');
        } else if (kind === 'first-aid') {
          var aid = coc7.heal(character, 1, { stabilize:true, preserveMajorWound:true }); next = aid.character;
          label = '对 ' + character.name + ' 实施急救'; detail = (aid.stabilized ? '已稳定濒死状态；' : '') + '临时恢复 ' + aid.healed + ' HP（' + aid.previousHp + '→' + aid.hp + '）。';
        } else if (kind === 'medicine') {
          var medicine = coc7.rollDamageExpression('1D3', 0); var treated = coc7.heal(character, medicine.total, { preserveMajorWound:true }); next = treated.character;
          label = '对 ' + character.name + ' 实施医学治疗'; detail = '1D3＝' + medicine.total + '，恢复 ' + treated.healed + ' HP（' + treated.previousHp + '→' + treated.hp + '）。';
        } else if (kind === 'dying-check') {
          var conCheck = coc7.rollPercentile(character.characteristics.con, 0); next = clone(character);
          if (!conCheck.success) { next.status.dead = true; next.status.dying = false; next.status.unconscious = true; }
          next = coc7.normalizeCharacter(next); label = character.name + ' 濒死 CON 检定：' + rollLevelLabel(conCheck.level); detail = conCheck.roll + '/' + conCheck.skill + (conCheck.success ? '，维持濒死。' : '，失败并死亡。');
        } else {
          var amount = rolledAmount(value);
          var resource = kind.indexOf('mp-') === 0 ? 'mp' : 'luck';
          var delta = (kind === 'mp-restore' ? 1 : -1) * amount.value;
          var adjusted = coc7.adjustResource(character, resource, delta); next = adjusted.character;
          label = character.name + (delta >= 0 ? ' 恢复 ' : ' 消耗 ') + Math.abs(adjusted.appliedDelta) + ' ' + resource.toUpperCase(); detail = amount.label + '，当前 ' + adjusted.value + '/' + adjusted.maximum + '。';
        }
        }
      }
    } catch (error) {
      showToast(safeText(error && error.message, 100) || '无法应用该操作');
      return;
    }
    var sceneId = scene.id;
    commit(label, function (draft) {
      replaceRosterCharacter(draft, next);
      var targetScene = draft.combatScenes.find(function (item) { return item.id === sceneId; });
      recordCombatEvent(targetScene, kind === 'damage' ? 'damage' : kind === 'heal' || kind === 'first-aid' || kind === 'medicine' ? 'heal' : 'resource', label, detail);
    });
    syncCombatCharacter(next);
  }

  function clearCheckForm() {
    var form = document.getElementById('gm-check-form');
    if (!form) return;
    form.reset();
    activeCheckRequestId = null;
    document.getElementById('active-request-label').textContent = '新判定';
    document.getElementById('gm-check-preview').innerHTML = '<span>尚未掷骰</span><p>1d20 ＋ 属性 ＋ 通用技能 ＋ 协助 ＋ 修正</p>';
    renderTabletop();
  }

  function loadCheckRequest(id) {
    var request = state.checkRequests.find(function (item) { return item.id === id; });
    if (!request) return;
    activeCheckRequestId = request.id;
    var characterSelect = document.getElementById('gm-check-character');
    characterSelect.value = state.roster.some(function (item) { return item.id === request.characterId; }) ? request.characterId : 'all';
    document.getElementById('gm-check-attribute').value = request.attributeId;
    refreshGmSkillOptions(request);
    document.getElementById('gm-check-mode').value = request.mode;
    document.getElementById('gm-check-assist').value = request.assist;
    document.getElementById('gm-check-modifier').value = request.modifier;
    if (request.suggestedDc && difficulties.some(function (item) { return item.value === request.suggestedDc; })) document.getElementById('gm-check-dc').value = request.suggestedDc;
    document.getElementById('gm-check-goal').value = request.goal;
    document.getElementById('gm-check-risk').value = request.risk;
    document.getElementById('gm-check-cost-owner').value = '玩家从守秘人公开的代价中选择';
    document.getElementById('active-request-label').textContent = '来自 ' + request.characterName;
    openView('tabletop');
    document.getElementById('gm-check-risk').focus();
  }

  function rollD20() {
    try {
      var value = new Uint32Array(1);
      window.crypto.getRandomValues(value);
      return (value[0] % 20) + 1;
    } catch (error) {
      return Math.floor(Math.random() * 20) + 1;
    }
  }

  function resultTier(total, dc) {
    if (total >= dc + 5) return 'exceptional';
    if (total >= dc) return 'success';
    if (total >= dc - 4) return 'costly';
    return 'severe';
  }

  function defaultResultNote(tier) {
    if (tier === 'exceptional') return '目标达成；可额外选择 +2 伤害、提高范围、节省 1 成本、获得额外情报或取得抢先位置之一。';
    if (tier === 'success') return '目标按掷骰前的声明达成。';
    if (tier === 'costly') return '玩家可接受一个已公开代价以达成目标；若拒绝代价，则本次行动失败。';
    return '目标未达成并发生严重后果；核心线索保留新的路径、余波或替代来源。';
  }

  function publishCheckResult(event) {
    event.preventDefault();
    var goal = safeText(document.getElementById('gm-check-goal').value, 500);
    var risk = safeText(document.getElementById('gm-check-risk').value, 500);
    if (!goal || !risk) { showToast('掷骰前必须填写目标和失败风险'); return; }
    var request = activeCheckRequestId ? state.checkRequests.find(function (item) { return item.id === activeCheckRequestId; }) : null;
    var selectedId = document.getElementById('gm-check-character').value;
    var character = state.roster.find(function (item) { return item.id === selectedId; });
    var targetCharacterId = request ? request.characterId : (character ? character.id : 'all');
    var characterName = request ? request.characterName : (character ? character.name : '全体玩家');
    var attribute = attributeDefinition(document.getElementById('gm-check-attribute').value);
    var attributeValue = character ? character.attributes[attribute.id] : (request ? request.attributeValue : 0);
    var skillSelect = document.getElementById('gm-check-skill');
    var selectedSkillOption = skillSelect.options[skillSelect.selectedIndex];
    var selectedSkillId = safeText(skillSelect.value, 80);
    var selectedSkillDefinition = selectedSkillId === '__legacy__' ? null : skillDefinition(selectedSkillId);
    var selectedSkillLabel = safeText(selectedSkillOption && selectedSkillOption.getAttribute('data-skill-label'), 80);
    var selectedSkillBonus = selectedSkillDefinition && character
      ? skillBonus(character.skills[selectedSkillDefinition.id])
      : clampInteger(selectedSkillOption && selectedSkillOption.getAttribute('data-skill-bonus'), 0, 4, request ? request.skillBonus : 0);
    if (!selectedSkillLabel) selectedSkillBonus = 0;
    var assist = clampInteger(document.getElementById('gm-check-assist').value, 0, 3, 0);
    var modifier = clampInteger(document.getElementById('gm-check-modifier').value, -20, 20, 0);
    var dc = clampInteger(document.getElementById('gm-check-dc').value, 1, 40, 13);
    var mode = document.getElementById('gm-check-mode').value;
    var dice = [rollD20()];
    if (mode === 'advantage' || mode === 'disadvantage') dice.push(rollD20());
    var kept = mode === 'advantage' ? Math.max.apply(Math, dice) : mode === 'disadvantage' ? Math.min.apply(Math, dice) : dice[0];
    var total = kept + attributeValue + selectedSkillBonus + assist + modifier;
    var tier = resultTier(total, dc);
    var publicNote = safeText(document.getElementById('gm-check-public-note').value, 800) || defaultResultNote(tier);
    var result = normalizeCheckResult({
      id:createId('result'), requestId:request && request.id, targetCharacterId:targetCharacterId,
      characterName:characterName, goal:goal, risk:risk,
      costOwner:safeText(document.getElementById('gm-check-cost-owner').value, 80),
      attributeId:attribute.id, attributeValue:attributeValue,
      skillId:selectedSkillDefinition ? selectedSkillDefinition.id : '', skillLabel:selectedSkillLabel,
      skillBonus:selectedSkillBonus, assist:assist, modifier:modifier, mode:mode,
      dice:dice, kept:kept, dc:dc, total:total, tier:tier,
      publicNote:publicNote, createdAt:new Date().toISOString()
    });
    if (!result) { showToast('判定数据未通过协议校验'); return; }
    state.checkHistory.unshift(result);
    state.checkHistory = state.checkHistory.slice(0, 100);
    if (request) state.checkRequests = state.checkRequests.filter(function (item) { return item.id !== request.id; });
    activeCheckRequestId = null;
    addLog('发布判定：' + characterName + ' — ' + result.tierLabel + '（' + total + ' / DC ' + dc + '）');
    saveState();
    sendPlayerMessage({ type:'check-result', result:result });
    renderTabletop();
    document.getElementById('gm-check-preview').innerHTML = '<span>' + escapeHtml(result.tierLabel) + ' · <strong>' + total + '</strong> / DC ' + dc + '</span><p>骰点 ' + dice.join(' / ') + '，取 ' + kept + '；' + escapeHtml(attribute.label) + ' +' + attributeValue + (selectedSkillLabel ? '，' + escapeHtml(selectedSkillLabel) + ' +' + selectedSkillBonus : '') + '，协助 +' + assist + '，额外修正 ' + (modifier >= 0 ? '+' : '') + modifier + '。</p>';
    document.getElementById('active-request-label').textContent = '已发布';
    showToast('判定结果已发送给 ' + characterName);
  }

  function handleSealAction(index) {
    var status = state.seals[index];
    var meta = state.sealMeta[index];
    if (status === 'blank') {
      var action = window.prompt('第 ' + (index + 1) + ' 枚令印为空白。输入 1 普通使用；输入 2 建立双方当下同意的常驻契约。');
      if (action !== '1' && action !== '2') return;
      if (action === '1') {
        var use = window.prompt('记录本次授权／中断／见证的对象与用途（不能强迫爱、原谅、牺牲或服从）：') || '';
        commit('使用第 ' + (index + 1) + ' 枚空白令印', function (draft) { draft.seals[index] = 'used'; draft.sealMeta[index].note = use.slice(0, 200); });
      } else {
        var contract = window.prompt('记录已明确同意的契约双方与解除方式：') || '';
        if (!contract.trim()) { showToast('常驻契约必须记录双方同意与解除方式'); return; }
        commit('第 ' + (index + 1) + ' 枚令印锁定常驻契约', function (draft) { draft.seals[index] = 'locked'; draft.sealMeta[index].note = contract.slice(0, 200); });
      }
      return;
    }
    if (status === 'used') {
      if (state.reflowsThisSession >= 1) { showToast('本场游戏已经回流过 1 枚令印'); return; }
      if (meta.reflownLoop === state.loop) { showToast('这枚令印本循环已经回流过一次'); return; }
      if (!window.confirm('只在已完成可验证修复时回流。确认将这枚已用令印恢复为空白？')) return;
      var repair = window.prompt('记录可验证修复：履行承诺、修正遗漏、归还证据或同等行为。') || '';
      if (!repair.trim()) { showToast('请记录可验证修复后再回流'); return; }
      commit('第 ' + (index + 1) + ' 枚令印因可验证修复回流', function (draft) {
        draft.seals[index] = 'blank';
        draft.sealMeta[index] = { reflownLoop:draft.loop, note:'回流：' + repair.slice(0, 180) };
        draft.reflowsThisSession = 1;
      });
      return;
    }
    if (status === 'locked') {
      if (!window.confirm('任一方可解除契约；解除后令印变为已用，并应共同选择一个可见后果。确认解除？')) return;
      var consequence = window.prompt('记录解除契约的可见后果：') || '';
      commit('解除第 ' + (index + 1) + ' 枚令印维持的常驻契约', function (draft) { draft.seals[index] = 'used'; draft.sealMeta[index].note = '解除：' + consequence.slice(0, 180); });
      return;
    }
    showToast('锚定是完整重置中的暂态；重置完成后该令印变为已用');
  }

  function renderTrackers() {
    var definitions = [
      { id:'anomaly', label:'世界异常', max:6, color:'#cf5d63' },
      { id:'grail', label:'圣杯显现', max:6, color:'#d4ad6b' },
      { id:'anchor', label:'茂的自我锚点', max:6, color:'#78b6b4' },
      { id:'theory', label:'理论碎片', max:3, color:'#859ec4' },
      { id:'memory', label:'记忆碎片', max:3, color:'#c6898c' },
      { id:'observation', label:'观测碎片', max:3, color:'#9aa56d' }
    ];
    document.getElementById('loop-value').textContent = state.loop;
    document.getElementById('tracker-list').innerHTML = definitions.map(function (def) {
      var value = state.trackers[def.id] || 0;
      var dots = Array.from({ length:def.max }, function (_, index) { return '<i class="' + (index < value ? 'filled' : '') + '"></i>'; }).join('');
      return '<div class="tracker-item"><div class="tracker-item-head"><span>' + def.label + '</span><div><button type="button" data-track="' + def.id + '" data-delta="-1" aria-label="减少' + def.label + '">−</button><strong>' + value + '</strong><button type="button" data-track="' + def.id + '" data-delta="1" aria-label="增加' + def.label + '">＋</button></div></div><div class="track-dots" style="--max:' + def.max + ';--track-color:' + def.color + '">' + dots + '</div></div>';
    }).join('');
    var labels = { blank:'空白', used:'已用', anchored:'锚定', locked:'契约锁定' };
    document.getElementById('seal-list').innerHTML = state.seals.map(function (seal, index) {
      var note = state.sealMeta[index] && state.sealMeta[index].note;
      return '<button class="seal ' + seal + '" type="button" data-seal="' + index + '" title="' + escapeHtml(note || labels[seal]) + '"><span>◇</span><small>' + labels[seal] + '</small></button>';
    }).join('');
    document.getElementById('seal-rule-hint').textContent = '本场回流 ' + state.reflowsThisSession + '/1；每枚每循环最多回流一次。锚定仅在完整重置中处理。';
    var seventhNightFailed = ['E25','E26','E27'].some(function (id) { return state.sceneResults[id] && state.sceneResults[id].outcome === 'failure'; });
    document.getElementById('rail-warning').hidden = state.trackers.anomaly < 6 && !seventhNightFailed;
    document.querySelectorAll('[data-track]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-track');
        var delta = Number(button.getAttribute('data-delta'));
        var def = definitions.find(function (item) { return item.id === id; });
        commit(def.label + (delta > 0 ? '＋1' : '−1'), function (draft) { draft.trackers[id] = Math.max(0, Math.min(def.max, (draft.trackers[id] || 0) + delta)); });
      });
    });
    document.querySelectorAll('[data-seal]').forEach(function (button) {
      button.addEventListener('click', function () { handleSealAction(Number(button.getAttribute('data-seal'))); });
    });
    ['goal','threat'].forEach(function (clock) {
      var value = state.conflictClocks[clock] || 0;
      document.getElementById(clock + '-clock-value').textContent = value + ' / 4';
      document.getElementById(clock + '-clock-label').value = state.conflictClocks[clock + 'Label'];
    });
    document.getElementById('clock-resolution-hint').classList.toggle('clock-alert', state.conflictClocks.goal >= 4 || state.conflictClocks.threat >= 4);
    var finaleButton = document.getElementById('finale-seal-button');
    var finaleLabels = { unavailable:'未获得', available:'可用（仅中止崩溃／见证同意）', used:'已用' };
    finaleButton.textContent = '终局临时令印：' + finaleLabels[state.finaleSeal || 'unavailable'];
    finaleButton.disabled = state.finaleSeal === 'used';
  }

  function renderLog() {
    document.getElementById('session-notes').value = state.sessionNotes;
    document.getElementById('history-list').innerHTML = state.log.length ? state.log.map(function (entry) {
      var date = new Date(entry.at);
      return '<li><time>' + date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}) + '</time>' + escapeHtml(entry.label) + '</li>';
    }).join('') : '<li class="history-empty">尚无操作记录。打开一个场景开始本次战役。</li>';
  }

  function renderAll() {
    renderCurrent();
    renderSessionAudit();
    renderTimeline();
    renderMap();
    renderNpcs();
    renderTruths();
    renderHandouts();
    renderTrackers();
    renderTabletop();
    renderCombat();
    renderLog();
  }

  function outcomeEffects(scene, outcome) {
    var effects = {};
    if (outcome === 'success') effects = Object.assign({}, scene.effects || {});
    if (outcome === 'costly') {
      effects = Object.assign({}, scene.effects || {});
      effects.anomaly = (effects.anomaly || 0) + 1;
    }
    if (outcome === 'failure') effects = { anomaly:1 };
    return effects;
  }

  function sceneResolutionControls(scene) {
    var labels = [
      ['anomaly','世界异常'], ['grail','圣杯显现'], ['anchor','茂的锚点'],
      ['theory','理论碎片'], ['memory','记忆碎片'], ['observation','观测碎片']
    ];
    return '<section class="dialog-block scene-resolution"><span>OUTCOME · 由主持人选择</span><h3>场景结算</h3>' +
      '<label><span>结果</span><select data-scene-outcome><option value="success">成功／取得主要目标</option><option value="costly">带代价推进</option><option value="failure">失败推进／局势行动</option><option value="custom">自定义结算</option></select></label>' +
      '<div class="scene-effect-grid">' + labels.map(function (item) { return '<label><span>' + item[1] + '</span><input type="number" min="-6" max="6" step="1" value="0" data-scene-effect="' + item[0] + '"></label>'; }).join('') + '</div>' +
      '<label><span>公开代价／余波记录</span><textarea rows="2" maxlength="600" data-scene-result-note placeholder="先公开代价，再决定是否接受；核心线索必须保留替代路径。"></textarea></label>' +
      '<small>轨道不会自动套用固定值；选择结果后仍可逐项调整。</small></section>';
  }

  function fillSceneEffects(dialog, scene, outcome) {
    var effects = outcomeEffects(scene, outcome);
    dialog.querySelectorAll('[data-scene-effect]').forEach(function (input) {
      input.value = outcome === 'custom' ? input.value : String(effects[input.getAttribute('data-scene-effect')] || 0);
    });
  }

  function sceneReadAloudHtml(scene) {
    if (!Array.isArray(scene.readAloud) || !scene.readAloud.length) return '';
    return '<section class="dialog-block scene-read-aloud"><span>READ ALOUD · 可直接朗读，不自动投送</span><h3>场景开场朗读</h3><div class="scene-read-aloud-copy">' +
      scene.readAloud.map(function (paragraph) { return '<p>' + escapeHtml(paragraph) + '</p>'; }).join('') +
      '</div></section>';
  }

  function sceneCastGoalsHtml(scene) {
    if (!Array.isArray(scene.castGoals) || !scene.castGoals.length) return '';
    return '<section class="dialog-block scene-runbook-block"><span>CAST GOALS · 当场诉求</span><h3>角色此刻要什么</h3><div class="scene-cast-goals">' + scene.castGoals.map(function (item) {
      return '<article><strong>' + escapeHtml(item.actor || '在场角色') + '</strong><p>' + escapeHtml(item.goal || '') + '</p></article>';
    }).join('') + '</div></section>';
  }

  function sceneClueSourcesHtml(scene) {
    if (!Array.isArray(scene.clueSources) || !scene.clueSources.length) return '';
    return '<section class="dialog-block scene-runbook-block"><span>CLUE SOURCES · 核心信息不锁死</span><h3>来源与替代来源</h3><div class="scene-clue-source-list">' + scene.clueSources.map(function (item) {
      return '<article><header><strong>' + escapeHtml(item.clue || '线索') + '</strong>' + (item.truth ? '<b>' + escapeHtml(item.truth) + '</b>' : '') + '</header><dl><div><dt>主要来源</dt><dd>' + escapeHtml(item.source || '由现场行动确认') + '</dd></div><div><dt>替代来源</dt><dd>' + escapeHtml(item.alternate || '换一个人物、地点或投送物重新提供') + '</dd></div></dl></article>';
    }).join('') + '</div></section>';
  }

  function sceneClocksHtml(scene) {
    if (!Array.isArray(scene.clocks) || !scene.clocks.length) return '';
    var kindLabels = { 'target':'目标', 'threat':'威胁', 'shared-target':'共享目标', 'shared-threat':'共享威胁' };
    var progress = state.sceneClockProgress[scene.id] || {};
    var clockCards = scene.clocks.map(function (clock) {
      var max = Math.max(1, Math.min(12, Number(clock.max) || 4));
      var value = Math.max(0, Math.min(max, Number(progress[clock.id]) || 0));
      var cells = Array.from({ length:max }, function (_, index) { return '<i class="' + (index < value ? 'filled' : '') + '" aria-hidden="true">' + (index + 1) + '</i>'; }).join('');
      return '<article class="scene-clock scene-clock-' + (String(clock.kind || '').indexOf('threat') !== -1 ? 'threat' : 'target') + '"><header><strong>' + escapeHtml(clock.name) + '</strong><b>' + escapeHtml(kindLabels[clock.kind] || clock.kind || '时钟') + ' · ' + value + '/' + max + '</b></header><div class="scene-clock-cells" aria-label="' + escapeHtml(clock.name) + '，已填' + value + '格，共' + max + '格">' + cells + '</div><div class="scene-clock-actions"><button type="button" data-scene-clock-id="' + escapeHtml(clock.id) + '" data-scene-clock-delta="-1" aria-label="' + escapeHtml(clock.name) + '减一格">−</button><button type="button" data-scene-clock-id="' + escapeHtml(clock.id) + '" data-scene-clock-delta="1" aria-label="' + escapeHtml(clock.name) + '加一格">＋</button></div><p>' + escapeHtml(clock.onFull || '') + '</p></article>';
    }).join('');
    var rule = scene.clockRule ? '<p class="scene-runbook-note"><strong>独立结算：</strong>' + escapeHtml(scene.clockRule) + '</p>' : '';
    return '<section class="dialog-block scene-runbook-block"><span>CLOCKS · 现场推进结构</span><h3>场景时钟</h3><div class="scene-clocks">' + clockCards + '</div>' + rule + '</section>';
  }

  function sceneSideObjectivesHtml(scene) {
    if (!Array.isArray(scene.sideObjectives) || !scene.sideObjectives.length) return '';
    var completed = state.sceneSideObjectives[scene.id] || [];
    return '<section class="dialog-block scene-runbook-block"><span>SIDE OBJECTIVES · 独立勾选</span><h3>侧目标与遗漏后果</h3><div class="scene-side-objectives">' + scene.sideObjectives.map(function (item) {
      var checked = completed.indexOf(item.id) !== -1;
      return '<button class="' + (checked ? 'completed' : '') + '" type="button" data-scene-objective-id="' + escapeHtml(item.id) + '" aria-pressed="' + String(checked) + '"><header><i aria-hidden="true"></i><strong>' + escapeHtml(item.name) + '</strong></header><p>' + escapeHtml(item.completion) + '</p><small>' + escapeHtml(item.consequence) + '</small></button>';
    }).join('') + '</div></section>';
  }

  function sceneAssignmentsHtml(scene) {
    if (!Array.isArray(scene.allyAssignments) || !scene.allyAssignments.length) return '';
    var assigned = state.sceneAssignments[scene.id] || [];
    return '<section class="dialog-block scene-runbook-block"><span>ALLY ASSIGNMENTS · 每线单独记录</span><h3>建议盟友分工</h3><div class="scene-assignments">' + scene.allyAssignments.map(function (item, index) {
      var checked = assigned.indexOf(index) !== -1;
      return '<button class="' + (checked ? 'completed' : '') + '" type="button" data-scene-assignment-index="' + index + '" aria-pressed="' + String(checked) + '"><strong>' + escapeHtml(item.actors) + '</strong><span>' + escapeHtml(item.task) + '</span></button>';
    }).join('') + '</div>' + (scene.assignmentFallback ? '<p class="scene-runbook-note">' + escapeHtml(scene.assignmentFallback) + '</p>' : '') + '</section>';
  }

  function sceneStopProtocolHtml(scene) {
    if (!scene.stopProtocol) return '';
    var protocol = scene.stopProtocol;
    return '<section class="dialog-block scene-stop-protocol"><span>STOP PROTOCOL · 中止权不可绕过</span><h3>' + escapeHtml(protocol.holder) + '持有停止按钮</h3><dl><div><dt>触发</dt><dd>' + escapeHtml(protocol.trigger) + '</dd></div><div><dt>执行</dt><dd>' + escapeHtml(protocol.rule) + '</dd></div><div><dt>成立证据</dt><dd>' + escapeHtml(protocol.evidence) + '</dd></div></dl></section>';
  }

  function sceneInterventionsHtml(scene) {
    if (!Array.isArray(scene.interventions) || !scene.interventions.length) return '';
    return '<section class="dialog-block scene-runbook-block"><span>INTERVENTIONS · 行动、条件与代价</span><h3>玩家介入表</h3><div class="scene-intervention-scroll"><table class="scene-interventions"><thead><tr><th>行动</th><th>DC／条件</th><th>成功／代价</th></tr></thead><tbody>' + scene.interventions.map(function (item) {
      return '<tr><th scope="row">' + escapeHtml(item.action) + '</th><td>' + escapeHtml(item.check) + '</td><td>' + escapeHtml(item.successCost) + '</td></tr>';
    }).join('') + '</tbody></table></div></section>';
  }

  function sceneConsentAuditHtml(scene) {
    var audit = scene.consentAudit;
    if (!audit) return '';
    var subjects = Array.isArray(audit.subjects) ? audit.subjects : [];
    var checks = Array.isArray(audit.checks) ? audit.checks : [];
    var informedBy = Array.isArray(audit.informedBy) ? audit.informedBy : [];
    var outcomes = Array.isArray(audit.allowedOutcomes) ? audit.allowedOutcomes : [];
    return '<section class="dialog-block scene-consent-audit"><span>CONSENT AUDIT · 两个回答，分别记录</span><h3>知情同意审计</h3><p class="scene-consent-rule">' + escapeHtml(audit.rule || '') + '</p>' +
      (informedBy.length ? '<div class="scene-consent-facts"><strong>两人都必须听懂</strong>' + informedBy.map(function (item) { return '<span>' + escapeHtml(item) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="scene-consent-subjects">' + subjects.map(function (subject) { return '<article><strong>' + escapeHtml(subject.name) + '</strong><p>' + escapeHtml(subject.answerScope) + '</p><small>' + escapeHtml(subject.evidenceRule) + '</small></article>'; }).join('') + '</div>' +
      (checks.length ? '<div class="scene-consent-checks">' + checks.map(function (item) { return '<p><i aria-hidden="true"></i>' + escapeHtml(item) + '</p>'; }).join('') + '</div>' : '') +
      (outcomes.length ? '<div class="scene-consent-outcomes"><strong>有效现场结论</strong>' + outcomes.map(function (item) { return '<span>' + escapeHtml(item) + '</span>'; }).join('') + '</div>' : '') +
      '</section>';
  }

  function sceneRunbookHtml(scene) {
    return sceneReadAloudHtml(scene) + sceneCastGoalsHtml(scene) + sceneClocksHtml(scene) + sceneSideObjectivesHtml(scene) + sceneAssignmentsHtml(scene) + sceneStopProtocolHtml(scene) + sceneInterventionsHtml(scene) + sceneClueSourcesHtml(scene) + sceneConsentAuditHtml(scene);
  }

  function sceneKeeperConsequencesHtml(scene) {
    var output = '';
    if (scene.ifUnattended) output += '<section class="dialog-block"><span>IF UNATTENDED</span><h3>未被干预时</h3><p class="scene-risk">' + escapeHtml(scene.ifUnattended) + '</p></section>';
    if (scene.loopEcho) output += '<section class="dialog-block scene-loop-echo"><span>LOOP ECHO</span><h3>轮回回声</h3><p>' + escapeHtml(scene.loopEcho) + '</p></section>';
    if (Array.isArray(scene.exits) && scene.exits.length) output += '<section class="dialog-block scene-exits"><span>EXITS · 不封死后续</span><h3>出口与偏转</h3><dl>' + scene.exits.map(function (item) { return '<div><dt>' + escapeHtml(item.condition) + '</dt><dd>' + escapeHtml(item.result) + '</dd></div>'; }).join('') + '</dl></section>';
    return output;
  }

  function openScene(id) {
    var scene = byId(data.scenes, id);
    if (!scene) return;
    var dialog = document.getElementById('scene-dialog');
    var loc = byId(data.locations, scene.location);
    var revealed = state.sceneClues[id] || [];
    var done = state.completedScenes.indexOf(id) !== -1;
    var active = state.activeSceneId === id;
    var scenePublished = state.publicMap.sceneIds.indexOf(id) !== -1;
    var npcButtons = scene.npcs.map(function (npcId) { var npc = byId(data.npcs, npcId); return '<button type="button" data-npc="' + npcId + '">' + escapeHtml(npc.name) + '</button>'; }).join('');
    var handoutButtons = scene.handouts.map(function (handoutId) { var item = byId(data.handouts, handoutId); return '<button type="button" data-handout="' + handoutId + '">' + handoutId + ' · ' + escapeHtml(item.title) + '</button>'; }).join('');
    var runbookHtml = sceneRunbookHtml(scene);
    var keeperConsequencesHtml = sceneKeeperConsequencesHtml(scene);
    document.getElementById('scene-dialog-content').innerHTML = '<div class="scene-dialog-shell"><button class="dialog-x" type="button" data-close-dialog aria-label="关闭">×</button><div class="scene-dialog-hero"><img src="' + scene.image + '" alt="' + escapeHtml(scene.title) + '场景插画"><div class="scene-hero-copy"><span>' + scene.id + ' · ' + escapeHtml(loc.name) + '</span><h2>' + escapeHtml(scene.title) + '</h2><p>' + escapeHtml(scene.time) + '</p></div></div><div class="scene-dialog-body"><div><section class="dialog-block"><span>PLAYER VISIBLE · 可直接朗读</span><h3>场景表层</h3><p>' + escapeHtml(scene.visible) + '</p></section>' + runbookHtml + '<section class="dialog-block"><span>CLUE REVEAL · 点击逐条公开并同步地图</span><h3>可得线索</h3><div class="scene-clues">' + scene.clues.map(function (clue, index) { return '<button class="scene-clue' + (revealed.indexOf(index) !== -1 ? ' revealed' : '') + '" type="button" data-scene-clue="' + index + '">' + escapeHtml(clue) + '</button>'; }).join('') + '</div><small>公开线索会自动把本场景与地点加入玩家地图；再次点击收回时，玩家地图也会同步移除该线索。</small></section></div><aside><section class="dialog-block"><span>KEEPER ONLY</span><h3>主持目标</h3><p>' + escapeHtml(scene.objective) + '</p></section>' + keeperConsequencesHtml + '<section class="dialog-block"><span>FAIL FORWARD</span><h3>默认余波</h3><p class="scene-risk">' + escapeHtml(scene.risk) + '</p></section><section class="dialog-block"><span>CAST</span><h3>在场人物</h3><div class="dialog-cast-buttons">' + (npcButtons || '<span>按补救来源选择出场人物</span>') + '</div></section><section class="dialog-block"><span>PLAYER SAFE</span><h3>关联手卡</h3><div class="dialog-cast-buttons">' + (handoutButtons || '<span>本场无独立手卡</span>') + '</div></section>' + (done ? '<section class="dialog-block"><span>RECORDED OUTCOME</span><h3>已结算记录</h3><p>' + escapeHtml(state.sceneResults[id] && state.sceneResults[id].note || '该节点已经结算；轨道不会重复叠加。') + '</p></section>' : sceneResolutionControls(scene)) + '<section class="dialog-block"><span>PLAYER MAP · 安全投送</span><h3>' + (scenePublished ? '玩家地图已显示本场景' : '玩家地图尚未显示本场景') + '</h3><p>只发送地点名称、场景表层、已公开线索与公开结算记录；主持目标和默认余波不会发送。</p></section><div class="scene-dialog-actions"><button type="button" data-publish-scene-dialog="' + id + '">' + (scenePublished ? '重新聚焦玩家地图' : '投送场景到玩家地图') + '</button><button class="primary-action" type="button" data-start-scene="' + id + '">' + (active ? '场景正在运行' : '开始场景并投送地图') + '</button><button type="button" data-complete-scene="' + id + '">' + (done ? '已结算 · 保留记录' : '按所选结果结算') + '</button></div></aside></div></div>';
    dialog.querySelector('[data-close-dialog]').addEventListener('click', function () { dialog.close(); });
    dialog.querySelectorAll('[data-npc]').forEach(function (button) { button.addEventListener('click', function () { dialog.close(); openNpc(button.getAttribute('data-npc')); }); });
    dialog.querySelectorAll('[data-handout]').forEach(function (button) { button.addEventListener('click', function () { dialog.close(); openHandout(button.getAttribute('data-handout')); }); });
    dialog.querySelector('[data-publish-scene-dialog]').addEventListener('click', function () { dialog.close(); publishScene(scene); });
    dialog.querySelectorAll('[data-scene-clock-delta]').forEach(function (button) {
      button.addEventListener('click', function () {
        var clockId = button.getAttribute('data-scene-clock-id');
        var clock = (scene.clocks || []).find(function (item) { return item.id === clockId; });
        if (!clock) return;
        var delta = Number(button.getAttribute('data-scene-clock-delta')) || 0;
        commit(scene.id + ' · ' + clock.name + (delta > 0 ? '＋1' : '−1'), function (draft) {
          if (!draft.sceneClockProgress[scene.id]) draft.sceneClockProgress[scene.id] = {};
          draft.sceneClockProgress[scene.id][clockId] = clampInteger((draft.sceneClockProgress[scene.id][clockId] || 0) + delta, 0, Number(clock.max) || 4, 0);
        });
        dialog.close(); openScene(id);
      });
    });
    dialog.querySelectorAll('[data-scene-objective-id]').forEach(function (button) {
      button.addEventListener('click', function () {
        var objectiveId = button.getAttribute('data-scene-objective-id');
        var objective = (scene.sideObjectives || []).find(function (item) { return item.id === objectiveId; });
        if (!objective) return;
        var completing = !button.classList.contains('completed');
        commit((completing ? '完成' : '撤销') + scene.id + '侧目标：' + objective.name, function (draft) {
          var values = (draft.sceneSideObjectives[scene.id] || []).slice();
          var at = values.indexOf(objectiveId);
          if (completing && at === -1) values.push(objectiveId);
          if (!completing && at !== -1) values.splice(at, 1);
          draft.sceneSideObjectives[scene.id] = values;
        });
        dialog.close(); openScene(id);
      });
    });
    dialog.querySelectorAll('[data-scene-assignment-index]').forEach(function (button) {
      button.addEventListener('click', function () {
        var assignmentIndex = Number(button.getAttribute('data-scene-assignment-index'));
        var assignment = (scene.allyAssignments || [])[assignmentIndex];
        if (!assignment) return;
        var completing = !button.classList.contains('completed');
        commit((completing ? '确认' : '撤销') + scene.id + '盟友分工：' + assignment.actors + ' → ' + assignment.task, function (draft) {
          var values = (draft.sceneAssignments[scene.id] || []).slice();
          var at = values.indexOf(assignmentIndex);
          if (completing && at === -1) values.push(assignmentIndex);
          if (!completing && at !== -1) values.splice(at, 1);
          draft.sceneAssignments[scene.id] = values;
        });
        dialog.close(); openScene(id);
      });
    });
    dialog.querySelectorAll('[data-scene-clue]').forEach(function (button) {
      button.addEventListener('click', function () {
        var index = Number(button.getAttribute('data-scene-clue'));
        var revealing = !button.classList.contains('revealed');
        commit((revealing ? '公开' : '收回') + ' ' + scene.id + ' 线索：' + scene.clues[index], function (draft) {
          var list = (draft.sceneClues[id] || []).slice();
          var at = list.indexOf(index);
          if (at === -1) list.push(index); else list.splice(at, 1);
          draft.sceneClues[id] = list;
          if (revealing) publishSceneOnDraft(draft, scene);
          if (draft.publicMap.sceneIds.indexOf(scene.id) !== -1) {
            draft.publicMap.activeLocationId = scene.location;
            draft.publicMap.updatedAt = new Date().toISOString();
            draft.playerProjection = 'map';
          }
        });
        if (state.publicMap.sceneIds.indexOf(scene.id) !== -1) sendPlayerMapState({ focusLocationId:scene.location, openMap:true });
        dialog.close(); openScene(id);
      });
    });
    dialog.querySelector('[data-start-scene]').addEventListener('click', function () {
      if (state.activeSceneId === id) return;
      commit('开始场景并投送玩家地图 ' + id + '：' + scene.title, function (draft) { draft.activeSceneId = id; draft.activeNpcs = scene.npcs.slice(); publishSceneOnDraft(draft, scene); draft.playerProjection = 'map'; });
      sendPlayerMapState({ focusLocationId:scene.location, openMap:true });
      dialog.close(); openScene(id);
    });
    var outcomeSelect = dialog.querySelector('[data-scene-outcome]');
    if (outcomeSelect) {
      fillSceneEffects(dialog, scene, outcomeSelect.value);
      outcomeSelect.addEventListener('change', function () { fillSceneEffects(dialog, scene, outcomeSelect.value); });
    }
    dialog.querySelector('[data-complete-scene]').addEventListener('click', function () {
      if (state.completedScenes.indexOf(id) !== -1) { showToast('该场景已经结算，未重复叠加轨道'); return; }
      var effects = {};
      dialog.querySelectorAll('[data-scene-effect]').forEach(function (input) {
        var value = clampNumber(input.value, -6, 6, 0);
        if (value) effects[input.getAttribute('data-scene-effect')] = value;
      });
      var resultNote = String(dialog.querySelector('[data-scene-result-note]') && dialog.querySelector('[data-scene-result-note]').value || '').trim().slice(0, 600);
      if (outcomeSelect && (outcomeSelect.value === 'costly' || outcomeSelect.value === 'failure') && !resultNote) { showToast('带代价或失败推进必须记录已公开的代价／余波'); return; }
      completeScene(scene, {
        outcome: outcomeSelect ? outcomeSelect.value : 'custom',
        effects: effects,
        note: resultNote
      });
      dialog.close();
    });
    if (!dialog.open) dialog.showModal();
  }

  function completeScene(scene, result) {
    var labels = { success:'成功', costly:'带代价推进', failure:'失败推进', custom:'自定义' };
    result = result || { outcome:'custom', effects:{}, note:'' };
    commit('结算场景 ' + scene.id + '（' + (labels[result.outcome] || '自定义') + '）：' + scene.title, function (draft) {
      draft.completedScenes.push(scene.id);
      if (draft.resolvedNodes.indexOf(scene.id) === -1) draft.resolvedNodes.push(scene.id);
      draft.sceneResults[scene.id] = { outcome:result.outcome, effects:Object.assign({}, result.effects), note:result.note, at:new Date().toISOString(), loop:draft.loop };
      if (draft.visitedLocations.indexOf(scene.location) === -1) draft.visitedLocations.push(scene.location);
      if (draft.activeSceneId === scene.id) draft.activeSceneId = null;
      draft.activeNpcs = [];
      if (draft.publicMap.sceneIds.indexOf(scene.id) !== -1) draft.publicMap.updatedAt = new Date().toISOString();
      Object.keys(result.effects || {}).forEach(function (key) {
        var max = ['theory','memory','observation'].indexOf(key) !== -1 ? 3 : 6;
        draft.trackers[key] = Math.max(0, Math.min(max, (draft.trackers[key] || 0) + result.effects[key]));
      });
    });
    if (state.publicMap.sceneIds.indexOf(scene.id) !== -1) sendPlayerMapState({ focusLocationId:scene.location, openMap:state.playerProjection === 'map' });
  }

  function npcPlayerSafeHtml(npc) {
    var safe = npc.playerSafe;
    if (!safe) return '';
    var questions = Array.isArray(safe.questions) ? safe.questions.filter(Boolean) : [];
    return '<section class="npc-dossier-section npc-player-safe"><header><span>PLAYER SAFE · 分阶段公开</span><h3>可交给玩家的人物资料</h3></header><div class="npc-player-safe-grid"><article><strong>开场可公开</strong><p>' + escapeHtml(safe.opening || '只公开姓名、外观与当下行动。') + '</p></article><article><strong>接触后可公开</strong><p>' + escapeHtml(safe.afterEncounter || '由人物本人或现场证据逐步确认。') + '</p></article></div>' + (questions.length ? '<div class="npc-question-list"><strong>玩家可以追问</strong><ul>' + questions.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul></div>' : '') + '</section>';
  }

  function npcTimelineHtml(npc) {
    if (!Array.isArray(npc.timeline) || !npc.timeline.length) return '';
    return '<section class="npc-dossier-section"><header><span>TIMELINE · 守秘人</span><h3>背景与时间线</h3></header><div class="npc-timeline">' + npc.timeline.map(function (item) {
      return '<article><strong>' + escapeHtml(item.period || item.phase || '时间不明') + '</strong><div><b>' + escapeHtml(item.event || '') + '</b><p>' + escapeHtml(item.impact || item.effect || '') + '</p></div></article>';
    }).join('') + '</div></section>';
  }

  function npcKnowledgeHtml(npc) {
    if (!npc.knowledge) return '';
    var labels = [
      ['knows','确实知道'], ['misbelieves','误信'], ['distorts','会扭曲'],
      ['hides','主动隐瞒'], ['refuses','拒绝承认'], ['loopOnly','仅轮回后可能知道']
    ];
    return '<section class="npc-dossier-section"><header><span>KNOWLEDGE · 信息权限</span><h3>知识、偏差与隐瞒</h3></header><div class="npc-knowledge-grid">' + labels.map(function (item) {
      var value = npc.knowledge[item[0]];
      if (Array.isArray(value)) value = value.join('；');
      return '<article><strong>' + item[1] + '</strong><p>' + escapeHtml(value || '无额外记录') + '</p></article>';
    }).join('') + '</div></section>';
  }

  function npcRelationsHtml(npc) {
    if (!Array.isArray(npc.relations) || !npc.relations.length) return '';
    return '<section class="npc-dossier-section"><header><span>RELATIONS · 可介入关系</span><h3>关系矩阵</h3></header><div class="npc-relations">' + npc.relations.map(function (item) {
      return '<article><header><strong>' + escapeHtml(item.target || '未命名对象') + '</strong><span>' + escapeHtml(item.surface || item.stance || '') + '</span></header>' + (item.secret ? '<p><b>隐秘：</b>' + escapeHtml(item.secret) + '</p>' : '') + '<p><b>玩家介入：</b>' + escapeHtml(item.intervention || item.change || '通过当场对话与证据改变关系') + '</p></article>';
    }).join('') + '</div></section>';
  }

  function npcStagesHtml(npc) {
    if (!Array.isArray(npc.stages) || !npc.stages.length) return '';
    return '<section class="npc-dossier-section"><header><span>ARC · 四阶段</span><h3>可见变化与推进条件</h3></header><div class="npc-stages">' + npc.stages.map(function (item, index) {
      return '<article><i>' + escapeHtml(item.id || String(index + 1)) + '</i><div><strong>' + escapeHtml(item.label || item.stage || '阶段 ' + (index + 1)) + '</strong><p>' + escapeHtml(item.visible || item.behavior || '') + '</p><small>' + escapeHtml(item.advance || item.next || '由场景结果推进') + '</small></div></article>';
    }).join('') + '</div></section>';
  }

  function npcHooksHtml(npc) {
    if (!Array.isArray(npc.sceneHooks) || !npc.sceneHooks.length) return '';
    return '<section class="npc-dossier-section"><header><span>SCENE TOOLBOX · 临场调用</span><h3>场景钩子</h3></header><div class="npc-hooks">' + npc.sceneHooks.map(function (item) {
      return '<article><strong>' + escapeHtml(item.type || '场景') + '</strong><p>' + escapeHtml(item.hook || '') + '</p><small>' + escapeHtml(item.payoff || item.stake || '') + '</small></article>';
    }).join('') + '</div></section>';
  }

  function npcVoiceTacticsHtml(npc) {
    if (!npc.voiceLines && !npc.tactics) return '';
    var voices = npc.voiceLines ? [['平静',npc.voiceLines.neutral],['受压',npc.voiceLines.pressure],['脆弱',npc.voiceLines.vulnerable]] : [];
    var tactics = npc.tactics ? [['当前目标',npc.tactics.goal],['绝不做',npc.tactics.never],['压力动作',npc.tactics.pressure],['撤退边界',npc.tactics.retreat]] : [];
    return '<section class="npc-dossier-section"><header><span>VOICE & TACTICS · 演绎工具</span><h3>台词与行动边界</h3></header><div class="npc-voice-tactics">' + (voices.length ? '<article><h4>场景台词</h4>' + voices.map(function (item) { var value = Array.isArray(item[1]) ? item[1].join('／') : item[1]; return '<p><strong>' + item[0] + '</strong><span>' + escapeHtml(value || '') + '</span></p>'; }).join('') + '</article>' : '') + (tactics.length ? '<article><h4>压力行动</h4>' + tactics.map(function (item) { return '<p><strong>' + item[0] + '</strong><span>' + escapeHtml(item[1] || '') + '</span></p>'; }).join('') + '</article>' : '') + '</div></section>';
  }

  function npcServantToolHtml(npc) {
    if (!npc.servantTool || typeof npc.servantTool !== 'object') return '';
    var labels = { trigger:'触发', scale:'规模', check:'检定', success:'成功', failure:'失败', clock:'时钟', counter:'反制', retreat:'撤退', boundary:'权限边界', knowledge:'知识', permission:'权限', cost:'代价', effect:'效果' };
    var entries = Object.keys(npc.servantTool).filter(function (key) { return npc.servantTool[key] != null && npc.servantTool[key] !== ''; });
    if (!entries.length) return '';
    return '<section class="npc-dossier-section npc-servant-tool"><header><span>SERVANT TOOL · 规则 v2.0</span><h3>英灵专项工具</h3></header><dl>' + entries.map(function (key) {
      var value = npc.servantTool[key];
      if (Array.isArray(value)) value = value.join('；');
      else if (typeof value === 'object') value = Object.keys(value).map(function (subkey) { return (labels[subkey] || subkey) + '：' + value[subkey]; }).join('；');
      return '<div><dt>' + escapeHtml(labels[key] || key) + '</dt><dd>' + escapeHtml(value) + '</dd></div>';
    }).join('') + '</dl></section>';
  }

  function npcEndingsHtml(npc) {
    if (!Array.isArray(npc.endings) || !npc.endings.length) return '';
    return '<section class="npc-dossier-section"><header><span>ENDINGS · 结局落点</span><h3>可能的收束</h3></header><div class="npc-endings">' + npc.endings.map(function (item) { return '<article><strong>' + escapeHtml(item.label || item.name || '结局') + '</strong><p>' + escapeHtml(item.outcome || '') + '</p></article>'; }).join('') + '</div></section>';
  }

  function npcRichDossierHtml(npc) {
    return '<div class="npc-rich-dossier">' + npcPlayerSafeHtml(npc) + npcTimelineHtml(npc) + npcKnowledgeHtml(npc) + npcRelationsHtml(npc) + npcStagesHtml(npc) + npcHooksHtml(npc) + npcVoiceTacticsHtml(npc) + npcServantToolHtml(npc) + npcEndingsHtml(npc) + '</div>';
  }

  function openNpc(id) {
    var npc = byId(data.npcs, id);
    if (!npc) return;
    var dialog = document.getElementById('npc-dialog');
    var servant = npc.crop != null;
    var locId = effectiveNpcMapLocation(npc, state);
    var loc = byId(data.locations, locId);
    var active = state.activeNpcs.indexOf(id) !== -1;
    var fields = [
      ['现在想要', npc.wants], ['真正害怕', npc.fears], ['确实知道', npc.knows], ['不会接受', npc.refuses], ['离场行动', npc.action], ['声线', npc.voice], ['轮回残留', npc.loop], ['当前位置', loc ? loc.name : '未知']
    ];
    document.getElementById('npc-dialog-content').innerHTML = '<div class="npc-dialog-shell"><button class="dialog-x" type="button" data-close-dialog aria-label="关闭">×</button><div class="npc-dialog-hero"><div class="npc-dialog-image"><img class="' + (servant ? 'servant-crop' : '') + '" style="--crop:' + (npc.crop || '50%') + '" src="' + npc.image + '" alt="' + escapeHtml(npc.name) + '肖像"></div><div class="npc-dialog-copy"><span>' + (servant ? 'HEROIC SPIRIT' : 'NPC DOSSIER') + '</span><h2>' + escapeHtml(npc.name) + '</h2><small>' + escapeHtml(npc.role) + '</small><p class="npc-intro">' + escapeHtml(npc.intro) + '</p></div></div><div class="npc-fields">' + fields.map(function (field) { return '<section class="npc-field"><span>' + field[0] + '</span><p>' + escapeHtml(field[1]) + '</p></section>'; }).join('') + '</div>' + npcRichDossierHtml(npc) + '<div class="npc-dialog-actions"><button type="button" data-toggle-active="' + id + '">' + (active ? '从玩家地图离场' : '登场到玩家地图') + '</button><button type="button" data-npc-action="' + id + '">' + (active ? '执行离场行动并移除' : '记录离场行动') + '</button><button type="button" data-copy-intro="' + id + '">复制开场玩家资料</button></div></div>';
    dialog.querySelector('[data-close-dialog]').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('[data-toggle-active]').addEventListener('click', function () {
      toggleNpcMapPresence(id, locId);
      dialog.close(); openNpc(id);
    });
    dialog.querySelector('[data-npc-action]').addEventListener('click', function () {
      executeNpcDeparture(npc);
      dialog.close();
    });
    dialog.querySelector('[data-copy-intro]').addEventListener('click', function () {
      var publicOpening = npc.playerSafe && npc.playerSafe.opening ? npc.playerSafe.opening : npc.intro;
      copyText(npc.name + '｜' + publicOpening, '已复制开场 PLAYER SAFE 人物介绍');
    });
    if (!dialog.open) dialog.showModal();
  }

  function openHandout(id) {
    var item = byId(data.handouts, id);
    if (!item) return;
    var dialog = document.getElementById('handout-dialog');
    var sent = state.revealedHandouts.indexOf(id) !== -1;
    var facts = (item.playerFacts || []).map(function (fact) { return '<li>' + escapeHtml(fact) + '</li>'; }).join('');
    var relatedScenes = (item.relatedScenes || []).map(function (sceneId) {
      var scene = byId(data.scenes, sceneId);
      return scene ? '<button type="button" data-related-scene="' + sceneId + '"><strong>' + sceneId + '</strong> · ' + escapeHtml(scene.title) + '</button>' : '';
    }).join('');
    document.getElementById('handout-dialog-content').innerHTML = '<div class="handout-dialog-shell"><button class="dialog-x" type="button" data-close-dialog aria-label="关闭">×</button><div class="handout-dialog-art"><img src="' + item.image + '" alt="' + escapeHtml(item.title) + '完整视觉手卡"></div><div class="handout-dialog-copy"><span>PLAYER SAFE · ' + item.id + ' · ' + escapeHtml(item.day) + '</span><h2>' + escapeHtml(item.title) + '</h2><small class="handout-dialog-source">' + escapeHtml(item.source || 'PLAYER SAFE 资料') + '</small><p class="handout-dialog-lead">' + escapeHtml(item.body) + '</p><section class="handout-dialog-facts"><h3>' + escapeHtml(item.factLabel || '资料要点') + '</h3><ul>' + facts + '</ul></section>' + (item.playerPrompt ? '<section class="handout-player-prompt"><span>玩家可见 · 可操作提示</span><p>' + escapeHtml(item.playerPrompt) + '</p></section>' : '') + '<section class="handout-keeper-panel"><div class="handout-trigger"><span>守秘人触发条件</span><strong>' + escapeHtml(item.trigger) + '</strong></div><div class="handout-keeper-note"><span>守秘人提示 · 不随投屏发送</span><p>' + escapeHtml(item.keeperNote || '按当前场景进度发放。') + '</p></div>' + (relatedScenes ? '<div class="handout-related-scenes"><span>关联场景</span><div>' + relatedScenes + '</div></div>' : '') + '</section><div class="handout-dialog-actions"><button type="button" data-broadcast="' + id + '">' + (sent ? '再次发到玩家投屏' : '确认发到玩家投屏') + '</button><button type="button" data-open-player="' + id + '">打开并投送此卡</button><button type="button" data-copy-link="' + id + '">复制投屏地址</button>' + (sent ? '<button class="danger-action" type="button" data-retract="' + id + '">撤回投屏</button>' : '') + '</div></div></div>';
    dialog.querySelector('[data-close-dialog]').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('[data-broadcast]').addEventListener('click', function () { deliverHandout(item); dialog.close(); });
    dialog.querySelector('[data-open-player]').addEventListener('click', function () {
      openPlayerWindow('player.html?mode=single', 'ng-handout-' + id);
      deliverHandout(item);
      dialog.close();
    });
    dialog.querySelector('[data-copy-link]').addEventListener('click', function () {
      copyText(new URL('player.html?mode=projection', window.location.href).href, '已复制安全投屏地址；打开后仍需由控制台投送');
    });
    dialog.querySelectorAll('[data-related-scene]').forEach(function (button) { button.addEventListener('click', function () { dialog.close(); openScene(button.getAttribute('data-related-scene')); }); });
    var retractButton = dialog.querySelector('[data-retract]');
    if (retractButton) retractButton.addEventListener('click', function () { retractHandout(item); dialog.close(); });
    if (!dialog.open) dialog.showModal();
  }

  function deliverHandout(item) {
    lastPlayerPayload = playerPayload(item);
    commit('向玩家发放 ' + item.id + '：' + item.title, function (draft) {
      if (draft.revealedHandouts.indexOf(item.id) === -1) draft.revealedHandouts.push(item.id);
      draft.activeHandoutId = item.id;
      (item.mapLocationIds || []).forEach(function (locationId) { publishLocationOnDraft(draft, locationId); });
      (item.mapSceneIds || []).forEach(function (sceneId) { publishSceneOnDraft(draft, byId(data.scenes, sceneId)); });
      if (item.mapFocusId && draft.publicMap.locationIds.indexOf(item.mapFocusId) !== -1) draft.publicMap.activeLocationId = item.mapFocusId;
      draft.playerProjection = item.mapOpen === true ? 'map' : 'handout';
    });
    sendPlayerMessage({ type:'show', handout:lastPlayerPayload });
    if (state.publicMap.visible) sendPlayerMapState({ focusLocationId:item.mapFocusId || state.publicMap.activeLocationId, openMap:item.mapOpen === true });
  }

  function retractHandout(item) {
    if (state.revealedHandouts.indexOf(item.id) === -1) { showToast(item.id + ' 尚未投放'); return; }
    commit('从玩家投屏撤回 ' + item.id + '：' + item.title, function (draft) {
      var at = draft.revealedHandouts.indexOf(item.id);
      if (at !== -1) draft.revealedHandouts.splice(at, 1);
      if (draft.activeHandoutId === item.id) draft.activeHandoutId = null;
      draft.playerProjection = draft.publicMap.visible ? 'map' : 'curtain';
    });
    if (lastPlayerPayload && lastPlayerPayload.id === item.id) lastPlayerPayload = null;
    sendPlayerMessage({ type:'retract', handoutId:item.id });
    if (state.publicMap.visible) sendPlayerMapState({ openMap:true });
  }

  function copyText(text, success) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { showToast(success); });
    } else {
      var area = document.createElement('textarea');
      area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); showToast(success);
    }
  }

  function exportState() {
    var payload = {
      exportedAt:new Date().toISOString(),
      campaign:data.id,
      rulesetId:RULESET_ID,
      rulesetVersion:data.rulesetVersion || '3.2',
      contentVersion:data.contentVersion || data.version,
      schemaVersion:STATE_SCHEMA_VERSION,
      buildId:data.buildId || 'local',
      state:state
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '零之圣杯-守秘人备份-' + new Date().toISOString().slice(0,10) + '.json';
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('战役备份已导出');
  }

  function importState(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var payload = JSON.parse(reader.result);
        if (payload.campaign && payload.campaign !== data.id) throw new Error('campaign');
        if (!compatibleRulesetId(payload.rulesetId)) throw new Error('ruleset');
        if (Number(payload.schemaVersion || payload.state && payload.state.schemaVersion || 1) > STATE_SCHEMA_VERSION) throw new Error('newer-schema');
        var imported = payload.state || payload;
        if (!imported || !imported.dayId || !imported.trackers) throw new Error('invalid');
        undoStack.push(clone(state));
        state = migrateState(imported);
        var migratedFrom = Number(imported.schemaVersion || 1);
        addLog('导入战役备份' + (migratedFrom < STATE_SCHEMA_VERSION ? '并迁移 v' + migratedFrom + ' → v' + STATE_SCHEMA_VERSION : ''));
        var active = state.activeHandoutId ? byId(data.handouts, state.activeHandoutId) : null;
        lastPlayerPayload = active ? playerPayload(active) : null;
        saveState(); renderAll(); showToast(migratedFrom < STATE_SCHEMA_VERSION ? '旧备份已迁移并导入' : '战役备份已导入');
        sendPlayerMessage(lastPlayerPayload ? { type:'show', handout:lastPlayerPayload } : { type:'curtain' });
        sendPlayerMapState({ openMap:state.playerProjection === 'map' });
      } catch (error) {
        var message = error && error.message === 'newer-schema' ? '这份备份来自更新版控制台，当前版本无法安全读取' : '无法读取这份备份：战役、规则版本或数据结构不兼容';
        showToast(message);
      }
    };
    reader.readAsText(file);
  }

  function fullReset() {
    var seventhNightFailed = ['E25','E26','E27'].some(function (id) { return state.sceneResults[id] && state.sceneResults[id].outcome === 'failure'; });
    if (state.trackers.anomaly < 6 && !seventhNightFailed) { showToast('尚未满足完整重置触发：异常未达 6，且未记录第七夜失败'); return; }
    if (state.loop >= 2) {
      commit('第三次重置触发：转入终局变体或开放撤离，不再回档', function (draft) { draft.terminalResetTriggered = true; });
      document.getElementById('reset-guide-dialog').close();
      return;
    }
    var facts = document.getElementById('reset-anchor-facts').value.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    var usableBlankCount = state.seals.filter(function (seal) { return seal === 'blank'; }).length;
    if (facts.length > usableBlankCount || facts.length > 3) { showToast('锚定事实超过剩余空白令印数量'); return; }
    var previousAnomaly = state.trackers.anomaly;
    commit('执行完整重置，进入第 ' + (state.loop + 2) + ' 轮', function (draft) {
      var previousCompleted = draft.completedScenes.slice();
      var previousResults = clone(draft.sceneResults);
      draft.loop += 1;
      draft.dayId = 'D1';
      draft.activeSceneId = null;
      draft.activeNpcs = [];
      draft.completedScenes = [];
      draft.sceneResults = {};
      draft.sceneClues = {};
      draft.visitedLocations = [];
      previousCompleted.forEach(function (id) { if (draft.resolvedNodes.indexOf(id) === -1) draft.resolvedNodes.push(id); });
      draft.trackers.anomaly = Math.min(4, Math.max(2 + draft.loop, previousAnomaly - 2));
      draft.trackers.grail = 0;
      var factIndex = 0;
      draft.seals = draft.seals.map(function (seal, index) {
        if (seal === 'locked') { draft.sealMeta[index].note = '完整重置自动解除契约'; return 'used'; }
        if (seal === 'blank' && factIndex < facts.length) { draft.sealMeta[index].note = '锚定：' + facts[factIndex++]; return 'used'; }
        return seal === 'anchored' ? 'used' : seal;
      });
      draft.anchoredFacts = draft.anchoredFacts.concat(facts.map(function (fact) { return { loop:draft.loop, fact:fact }; }));
      draft.resetHistory.push({ at:new Date().toISOString(), loop:draft.loop, previousAnomaly:previousAnomaly, startingAnomaly:draft.trackers.anomaly, anchoredFacts:facts, resolvedNodes:previousCompleted, sceneResults:previousResults });
      draft.reflowsThisSession = 0;
      draft.finaleSeal = 'unavailable';
      draft.conflictClocks = { goal:0, threat:0, goalLabel:'玩家目标', threatLabel:'敌方／环境威胁' };
      draft.roster.forEach(function (character) {
        if (isCoc7Character(character)) return;
        var injuryAnchored = facts.some(function (fact) { return fact.indexOf(character.name) !== -1 && /(伤势|疤痕)/.test(fact); });
        var derived = derivedCharacterValues(character);
        character.current.hp = derived.maxHp;
        character.current.mp = derived.maxMp;
        character.current.resolve = 3;
        character.current.conditions = injuryAnchored ? ['伤势／疤痕（已锚定）'] : [];
        character.updatedAt = new Date().toISOString();
      });
      draft.activeHandoutId = null;
    });
    lastPlayerPayload = null;
    sendPlayerMessage({ type:'curtain' });
    sendPlayerMapState({ openMap:false });
    document.getElementById('reset-anchor-facts').value = '';
    document.getElementById('reset-guide-dialog').close();
    openView('current');
  }

  function bindSessionAuditEvents() {
    var auditRoot = document.getElementById('session-audit');
    var deliveryForm = document.getElementById('audit-delivery-form');
    document.getElementById('audit-handout-options').innerHTML = data.handouts.map(function (item) {
      return '<option value="' + escapeHtml(item.id + ' · ' + item.title) + '"></option>';
    }).join('');

    auditRoot.addEventListener('click', function (event) {
      var clockButton = event.target.closest('[data-audit-clock-index]');
      if (clockButton) {
        var clockIndex = Number(clockButton.getAttribute('data-audit-clock-index'));
        var delta = Number(clockButton.getAttribute('data-audit-clock-delta'));
        var clock = state.sessionAudit.factionClocks[clockIndex];
        if (!clock || (delta !== -1 && delta !== 1)) return;
        commit(clock.name + '阵营钟' + (delta > 0 ? '＋1' : '−1'), function (draft) {
          draft.sessionAudit.factionClocks[clockIndex].value = clampInteger(draft.sessionAudit.factionClocks[clockIndex].value + delta, 0, 4, 0);
        });
        return;
      }
      var deleteButton = event.target.closest('[data-audit-delete-delivery]');
      if (deleteButton) {
        var deliveryId = deleteButton.getAttribute('data-audit-delete-delivery');
        var entry = state.sessionAudit.deliveryFollowUps.find(function (item) { return item.id === deliveryId; });
        if (!entry) return;
        commit('删除投送跟进：' + entry.handout, function (draft) {
          draft.sessionAudit.deliveryFollowUps = draft.sessionAudit.deliveryFollowUps.filter(function (item) { return item.id !== deliveryId; });
        });
      }
    });

    auditRoot.addEventListener('change', function (event) {
      var target = event.target;
      var field = target.getAttribute('data-audit-field');
      if (!field) return;
      var factionIndex = target.getAttribute('data-audit-faction-index');
      var allianceIndex = target.getAttribute('data-audit-alliance-index');
      var fragmentIndex = target.getAttribute('data-audit-fragment-index');
      var consentPerson = target.getAttribute('data-audit-consent-person');
      if (factionIndex !== null) {
        var faction = state.sessionAudit.factionClocks[Number(factionIndex)];
        if (!faction || field !== 'name') return;
        faction.name = safeText(target.value, 80) || '未命名阵营';
        target.value = faction.name;
      } else if (allianceIndex !== null) {
        var alliance = state.sessionAudit.alliancePromises[Number(allianceIndex)];
        if (!alliance || ['target','promise','status'].indexOf(field) === -1) return;
        alliance[field] = field === 'status' ? auditStatus(target.value, AUDIT_ALLIANCE_STATES, 'unspoken') : safeText(target.value, field === 'target' ? 120 : 500);
        target.value = alliance[field];
      } else if (fragmentIndex !== null) {
        var fragment = state.sessionAudit.fragments[Number(fragmentIndex)];
        if (!fragment || ['holder','leaning','willingness'].indexOf(field) === -1) return;
        fragment[field] = field === 'willingness' ? auditStatus(target.value, AUDIT_FRAGMENT_WILLINGNESS, 'unasked') : safeText(target.value, field === 'holder' ? 120 : 300);
        target.value = fragment[field];
      } else if (consentPerson) {
        var consent = state.sessionAudit.finaleConsent[consentPerson];
        if (!consent || ['status','quote'].indexOf(field) === -1) return;
        consent[field] = field === 'status' ? auditStatus(target.value, AUDIT_CONSENT_STATES, 'unasked') : safeText(target.value, 1000);
        target.value = consent[field];
      } else {
        return;
      }
      saveState();
    });

    deliveryForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var entry = {
        id:createId('delivery'),
        handout:safeText(document.getElementById('audit-delivery-handout').value, 120),
        deliveredAt:safeText(document.getElementById('audit-delivery-time').value, 40),
        target:safeText(document.getElementById('audit-delivery-target').value, 120),
        misread:safeText(document.getElementById('audit-delivery-misread').value, 600),
        followUp:safeText(document.getElementById('audit-delivery-follow-up').value, 600)
      };
      if (!entry.handout || !entry.deliveredAt || !entry.target) { showToast('请填写手卡、投送时间与投送对象'); return; }
      commit('新增投送跟进：' + entry.handout, function (draft) {
        draft.sessionAudit.deliveryFollowUps.unshift(entry);
        draft.sessionAudit.deliveryFollowUps = draft.sessionAudit.deliveryFollowUps.slice(0, 120);
      });
      deliveryForm.reset();
      document.getElementById('audit-delivery-time').value = localAuditDateTime();
    });
  }

  function bindStaticEvents() {
    bindSessionAuditEvents();
    document.querySelectorAll('[data-view]').forEach(function (button) { button.addEventListener('click', function () { openView(button.getAttribute('data-view')); }); });
    document.querySelectorAll('[data-go]').forEach(function (button) { button.addEventListener('click', function () { openView(button.getAttribute('data-go')); }); });
    document.getElementById('start-first-scene').addEventListener('click', function () { openScene(currentDay().sceneIds[0]); });

    document.querySelectorAll('[data-map-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        mapFilter = button.getAttribute('data-map-filter');
        document.querySelectorAll('[data-map-filter]').forEach(function (item) { item.classList.toggle('active', item === button); });
        renderMap();
      });
    });
    document.getElementById('publish-today-map').addEventListener('click', function () {
      var scenes = dayScenes(currentDay());
      if (!scenes.length) { showToast('当前日没有可投送场景'); return; }
      commit('投送第 ' + currentDay().index + ' 日地点与场景到玩家地图', function (draft) {
        scenes.forEach(function (scene) { publishSceneOnDraft(draft, scene); });
        draft.publicMap.activeLocationId = scenes[0].location;
        draft.playerProjection = 'map';
      });
      sendPlayerMapState({ focusLocationId:scenes[0].location, openMap:true });
    });
    document.getElementById('sync-player-map').addEventListener('click', function () {
      if (!state.publicMap.visible || !state.publicMap.locationIds.length) { showToast('玩家地图还没有任何已投送地点'); return; }
      commit('重发当前玩家地图', function (draft) { draft.playerProjection = 'map'; draft.publicMap.updatedAt = new Date().toISOString(); });
      sendPlayerMapState({ focusLocationId:state.publicMap.activeLocationId, openMap:true });
    });
    document.querySelectorAll('[data-npc-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        npcFilter = button.getAttribute('data-npc-filter');
        document.querySelectorAll('[data-npc-filter]').forEach(function (item) { item.classList.toggle('active', item === button); });
        renderNpcs();
      });
    });
    document.getElementById('npc-search').addEventListener('input', renderNpcs);
    document.getElementById('open-recovery-scene').addEventListener('click', function () { openScene('E28'); });
    document.getElementById('clue-notes').addEventListener('input', function (event) { state.clueNotes = event.target.value; saveState(); });
    document.getElementById('session-notes').addEventListener('input', function (event) { state.sessionNotes = event.target.value; saveState(); });
    document.querySelectorAll('[data-secure-resource][data-server-resource]').forEach(function (button) {
      button.addEventListener('click', function () { downloadKeeperVolume(button); });
    });

    document.getElementById('gm-import-character').addEventListener('click', function () { document.getElementById('gm-character-file').click(); });
    document.getElementById('gm-character-file').addEventListener('change', function (event) {
      if (event.target.files[0]) importCharacters(event.target.files[0]);
      event.target.value = '';
    });
    document.getElementById('gm-export-roster').addEventListener('click', exportRoster);
    document.getElementById('gm-check-character').addEventListener('change', function () { refreshGmSkillOptions(); });
    document.getElementById('gm-check-form').addEventListener('submit', publishCheckResult);
    document.getElementById('gm-clear-check').addEventListener('click', clearCheckForm);

    document.getElementById('combat-create-form').addEventListener('submit', createCombatScene);
    document.getElementById('combat-attacker').addEventListener('change', refreshCombatAttackOptions);
    document.getElementById('combat-attack-form').addEventListener('submit', resolveCombatAttack);
    document.getElementById('combat-adjust-form').addEventListener('submit', applyCombatAdjustment);
    document.getElementById('combat-next-turn').addEventListener('click', advanceCombatTurn);
    document.getElementById('combat-end-scene').addEventListener('click', endCombatScene);
    document.getElementById('combat-clear-events').addEventListener('click', function () {
      var scene = activeCombatScene();
      if (!scene || !scene.events.length) { showToast('本场没有可清除的结算记录'); return; }
      commit('清空战斗台显示记录：' + scene.name, function (draft) { activeCombatScene(draft).events = []; });
    });

    document.getElementById('undo-button').addEventListener('click', function () {
      if (!undoStack.length) { showToast('没有可以撤销的操作'); return; }
      state = migrateState(undoStack.pop());
      var activeHandout = state.activeHandoutId ? byId(data.handouts, state.activeHandoutId) : null;
      lastPlayerPayload = activeHandout ? playerPayload(activeHandout) : null;
      addLog('撤销上一步'); saveState(); renderAll(); showToast('已撤销上一步');
      sendPlayerMessage(lastPlayerPayload ? { type:'show', handout:lastPlayerPayload } : { type:'curtain' });
      sendPlayerMapState({ openMap:state.playerProjection === 'map' });
    });
    document.getElementById('curtain-button').addEventListener('click', function () {
      lastPlayerPayload = null;
      commit('玩家投屏切回帷幕', function (draft) { draft.activeHandoutId = null; draft.playerProjection = 'curtain'; });
      sendPlayerMessage({ type:'curtain' });
    });
    document.getElementById('player-window-button').addEventListener('click', function () {
      openPlayerWindow('player.html?mode=projection', 'ng-projection');
    });
    document.getElementById('session-menu-button').addEventListener('click', function () {
      var menu = document.getElementById('session-menu'); var opening = menu.hidden; menu.hidden = !opening; this.setAttribute('aria-expanded', String(opening));
    });
    document.getElementById('export-button').addEventListener('click', exportState);
    document.getElementById('import-button').addEventListener('click', function () { document.getElementById('import-file').click(); });
    document.getElementById('import-file').addEventListener('change', function (event) { if (event.target.files[0]) importState(event.target.files[0]); event.target.value = ''; });
    document.getElementById('new-session-button').addEventListener('click', function () {
      commit('开始新的游戏场次', function (draft) { draft.reflowsThisSession = 0; draft.sessionIndex = (draft.sessionIndex || 0) + 1; });
    });
    document.getElementById('reset-button').addEventListener('click', function () {
      if (!window.confirm('新建空白战役会清除当前自动保存。建议先导出备份。是否继续？')) return;
      undoStack.push(clone(state)); state = freshState(); lastPlayerPayload = null; addLog('新建空白战役'); saveState(); renderAll(); openView('current');
      sendPlayerMessage({ type:'curtain' });
      sendPlayerMapState({ openMap:false });
    });
    document.getElementById('clear-log').addEventListener('click', function () { commit('清空场记历史', function (draft) { draft.log = []; }); });
    document.querySelectorAll('[data-loop]').forEach(function (button) { button.addEventListener('click', function () { var delta = Number(button.getAttribute('data-loop')); commit('完整重置次数' + (delta > 0 ? '＋1' : '−1'), function (draft) { draft.loop = Math.max(0, Math.min(2, draft.loop + delta)); }); }); });

    document.querySelectorAll('[data-clock]').forEach(function (button) { button.addEventListener('click', function () {
      var clock = button.getAttribute('data-clock'); var delta = Number(button.getAttribute('data-clock-delta'));
      commit((clock === 'goal' ? '目标钟' : '威胁钟') + (delta > 0 ? '＋1' : '−1'), function (draft) { draft.conflictClocks[clock] = clampNumber(draft.conflictClocks[clock] + delta, 0, 4, 0); });
    }); });
    ['goal','threat'].forEach(function (clock) { document.getElementById(clock + '-clock-label').addEventListener('change', function (event) { state.conflictClocks[clock + 'Label'] = safeText(event.target.value, 80) || (clock === 'goal' ? '玩家目标' : '敌方／环境威胁'); saveState(); }); });
    document.getElementById('finale-seal-button').addEventListener('click', function () {
      if (state.finaleSeal === 'unavailable') {
        if (!state.seals.every(function (seal) { return seal === 'used'; })) { showToast('只有三枚令印都已用时才可能获得终局临时令印'); return; }
        if (!window.confirm('确认团队已取得知情同意／决定权证据？临时令印只可中止崩溃或见证同意。')) return;
        commit('获得终局临时令印', function (draft) { draft.finaleSeal = 'available'; });
      } else if (state.finaleSeal === 'available' && window.confirm('确认使用终局临时令印？它只能中止崩溃或见证同意，终局后消失。')) {
        commit('使用终局临时令印', function (draft) { draft.finaleSeal = 'used'; });
      }
    });

    document.getElementById('tracker-collapse').addEventListener('click', function () {
      var rail = document.querySelector('.tracker-rail'); rail.classList.toggle('collapsed'); this.setAttribute('aria-expanded', String(!rail.classList.contains('collapsed')));
    });
    document.getElementById('reset-guide-button').addEventListener('click', function () {
      var resetMessage = state.loop >= 2 ? '已完成两次完整重置；再次触发只能转入终局变体或开放撤离。' : '当前可用空白令印 ' + state.seals.filter(function (seal) { return seal === 'blank'; }).length + ' 枚；契约锁定令印会先变为已用。';
      document.getElementById('reset-eligibility').textContent = resetMessage;
      document.getElementById('confirm-full-reset').textContent = state.loop >= 2 ? '记录第三次触发并转入结局' : '确认开始下一轮';
      document.getElementById('reset-guide-dialog').showModal();
    });
    document.getElementById('confirm-full-reset').addEventListener('click', fullReset);

    document.querySelectorAll('.archive-dialog').forEach(function (dialog) {
      dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') document.getElementById('session-menu').hidden = true;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { event.preventDefault(); document.getElementById('undo-button').click(); }
    });
    window.addEventListener('message', function (event) {
      if (event.origin !== window.location.origin || !event.data) return;
      if (event.data.protocol !== MESSAGE_PROTOCOL) return;
      if (event.data.type === 'ready') {
        sendPlayerMessage(lastPlayerPayload ? { type:'show', handout:lastPlayerPayload } : { type:'curtain' });
        sendPlayerMapState({ openMap:state.playerProjection === 'map' });
        return;
      }
      if (event.data.type === 'character-submit') receiveCharacterSubmission(event.data);
      if (event.data.type === 'check-request') receiveCheckRequest(event.data.request);
    });
  }

  if (window.matchMedia('(max-width: 1040px)').matches) document.querySelector('.tracker-rail').classList.add('collapsed');
  bindStaticEvents();
  sendPlayerMessage({ type:'keeper-ready' });
  renderAll();
  openView(currentView);
}());
