(function () {
  'use strict';

  var config = window.NG_PLAYER_DATA || {};
  var CHANNEL_NAME = config.channelName || 'null-grail-player';
  var MESSAGE_PROTOCOL = config.protocol || 'null-grail-player-v4';
  var RULESET_ID = config.rulesetId || 'null-grail-general-v2.0';
  var CHARACTER_PROTOCOL = config.characterProtocol || 'null-grail-character-v3';
  var SESSION_KEY = 'ng-player-current-handout:v4';
  var CHARACTER_KEY = 'ng-player-character:v3';
  var RESULTS_KEY = 'ng-player-check-results:v2';
  var ATTRIBUTE_COSTS = [0, 1, 3, 6, 10];
  var FATE_RANKS = ['E', 'D', 'C', 'B', 'A', 'EX'];
  var DEFAULT_IDENTITY_RULES = {
    mortal: { label:'普通人', attributeBudget:14, attributeCap:3, skillBudget:6, expertCap:1, minMana:0 },
    magus: { label:'魔术师', attributeBudget:15, attributeCap:3, skillBudget:6, expertCap:1, minMana:1 },
    servant: { label:'从者', attributeBudget:30, attributeCap:4, skillBudget:8, expertCap:2, minMana:0 }
  };
  var FALLBACK_ATTRIBUTES = [
    { id:'physique', label:'体魄', help:'力量、搬运、近身爆发与破坏' },
    { id:'endurance', label:'耐久', help:'生命、抗痛、抗毒与承受冲击' },
    { id:'agility', label:'灵巧', help:'速度、精确、潜行、射击与回避' },
    { id:'perception', label:'感知', help:'观察、追踪、直觉与识破埋伏' },
    { id:'knowledge', label:'学识', help:'历史、科技、医学、战术与理论' },
    { id:'will', label:'意志', help:'精神抵抗、专注、交涉与维持自我' },
    { id:'mana', label:'魔力', help:'魔术输出、回路容量与神秘承载' }
  ];
  var FALLBACK_SKILLS = [
    { id:'athletics', label:'运动', help:'奔跑、攀爬、游泳、跳跃与挣脱' },
    { id:'melee', label:'近战', help:'徒手、刀剑、长兵器与格挡', combat:true },
    { id:'ranged', label:'射击', help:'枪械、弓弩、投掷与远程瞄准', combat:true },
    { id:'stealth', label:'潜行', help:'隐藏、尾随、无声移动与藏匿物品' },
    { id:'awareness', label:'侦查', help:'警戒、搜寻、追踪与察觉魔力' },
    { id:'investigation', label:'调查', help:'现场还原、查档、讯问与比对证据' },
    { id:'academics', label:'学术', help:'历史、宗教、神话、语言、法律与理论' },
    { id:'technology', label:'技术', help:'电子、机械、爆破、驾驶、工事与黑客' },
    { id:'medicine', label:'医疗', help:'急救、诊断、稳定伤势与药理' },
    { id:'magecraft', label:'魔术', help:'施术、识别神秘、反制与灵脉操作' },
    { id:'negotiation', label:'交涉', help:'说服、安抚、欺骗、威慑与谈判' },
    { id:'command', label:'指挥', help:'战术调度、团队协同与御主支援' }
  ];

  var attributes = Array.isArray(config.attributes) && config.attributes.length ? config.attributes : FALLBACK_ATTRIBUTES;
  var skills = Array.isArray(config.skills) && config.skills.length ? config.skills : FALLBACK_SKILLS;
  var channel = null;
  var character = null;
  var results = [];
  var pendingSubmissionId = null;
  var builderStep = 0;
  var activeAttributePreset = '';
  var attributeValues = {};
  var skillLevels = {};
  var selectedLineages = [];
  var selectedSpells = [];
  var currentHpDirty = false;
  var currentMpDirty = false;
  var currentHandoutId = null;
  var mode = new URLSearchParams(location.search).get('mode');
  var curtain = document.getElementById('curtain');
  var view = document.getElementById('handout-view');

  function safeText(value, maximum) { return (typeof value === 'string' ? value : '').slice(0, maximum); }
  function safeTrim(value, maximum) { return safeText(value, maximum).trim(); }
  function clamp(value, minimum, maximum, fallback) { var number = Number(value); return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback; }
  function integer(value, minimum, maximum, fallback) { return Math.round(clamp(value, minimum, maximum, fallback)); }
  function makeId(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
  function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, function (characterValue) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[characterValue]; }); }
  function valueLabel(value) { return typeof value === 'string' ? value : safeText(value && (value.label || value.name), 180); }
  function byId(list, id) { return (list || []).find(function (item) { return item.id === id; }) || null; }
  function objectList(value) {
    if (Array.isArray(value)) return value;
    return Object.keys(value || {}).map(function (key) { return Object.assign({ id:key }, value[key]); });
  }
  function firstDefined() {
    for (var index = 0; index < arguments.length; index += 1) if (arguments[index] !== undefined && arguments[index] !== null) return arguments[index];
    return undefined;
  }
  function uniqueTrimmedList(value, maximumItems, maximumLength) {
    var output = [];
    if (!Array.isArray(value)) return output;
    value.forEach(function (item) {
      var text = safeTrim(item, maximumLength);
      if (text && output.indexOf(text) === -1 && output.length < maximumItems) output.push(text);
    });
    return output;
  }
  function distinctTextCount(value) {
    return (value || []).map(function (item) { return safeTrim(item, 1200).toLocaleLowerCase(); }).filter(Boolean).filter(function (item, index, list) { return list.indexOf(item) === index; }).length;
  }
  function fieldValue(id) { var element = document.getElementById(id); return element ? element.value : ''; }
  function setField(id, value) { var element = document.getElementById(id); if (element) element.value = value === undefined || value === null ? '' : String(value); }
  function showSync(message) { document.getElementById('player-sync-status').textContent = message; }
  function showBuilderError(message) { var element = document.getElementById('builder-error'); element.textContent = message || ''; element.hidden = !message; }
  function clearBuilderError() { showBuilderError(''); }
  function downloadJson(filename, payload) { var blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' }); var link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href); }

  function normalizePayload(value) {
    if (!value || typeof value !== 'object') return null;
    var id = safeText(value.id, 16).toUpperCase();
    if (!/^[A-Z][A-Z0-9-]{0,15}$/.test(id)) return null;
    var image = safeText(value.image, 200).replace(/\\/g, '/');
    if (!/^assets\/art\/[a-z0-9._-]+$/i.test(image)) image = 'assets/art/hero-null-grail.webp';
    return { id:id, title:safeText(value.title,160), day:safeText(value.day,40), image:image, source:safeText(value.source,180), factLabel:safeText(value.factLabel,80), body:safeText(value.body,2400), playerFacts:Array.isArray(value.playerFacts) ? value.playerFacts.slice(0,16).map(function (fact) { return safeText(fact,600); }) : [], playerPrompt:safeText(value.playerPrompt,1200) };
  }

  function rememberHandout(payload) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload)); } catch (error) {} }
  function forgetHandout() { try { sessionStorage.removeItem(SESSION_KEY); } catch (error) {} }

  function showHandout(rawPayload) {
    var item = normalizePayload(rawPayload);
    if (!item) return false;
    currentHandoutId = item.id;
    document.getElementById('handout-image').src = item.image;
    document.getElementById('handout-image').alt = item.title + '完整视觉手卡';
    document.getElementById('handout-id').textContent = 'PLAYER SAFE · ' + item.id + (item.day ? ' · ' + item.day : '');
    document.getElementById('handout-title').textContent = item.title;
    document.getElementById('handout-source').textContent = item.source || 'PLAYER SAFE 资料';
    document.getElementById('handout-body').textContent = item.body;
    var factsSection = document.getElementById('handout-facts-section');
    var facts = document.getElementById('handout-facts');
    facts.textContent = '';
    item.playerFacts.forEach(function (fact) { var row = document.createElement('li'); row.textContent = fact; facts.appendChild(row); });
    factsSection.hidden = item.playerFacts.length === 0;
    document.getElementById('handout-facts-label').textContent = item.factLabel || '资料要点';
    var promptSection = document.getElementById('handout-prompt-section');
    document.getElementById('handout-prompt').textContent = item.playerPrompt;
    promptSection.hidden = !item.playerPrompt;
    curtain.hidden = true;
    view.hidden = false;
    document.title = item.title + ' · 零之圣杯';
    rememberHandout(item);
    return true;
  }

  function showCurtain() {
    currentHandoutId = null;
    view.hidden = true;
    curtain.hidden = false;
    document.title = '零之圣杯 · PLAYER SAFE';
    forgetHandout();
  }

  function identityRule(type) {
    var configured = config.identities && config.identities[type] || {};
    var fallback = DEFAULT_IDENTITY_RULES[type] || DEFAULT_IDENTITY_RULES.mortal;
    var nestedAttributes = configured.attributes || {};
    var nestedSkills = configured.skills || {};
    return {
      id:type,
      label:configured.label || fallback.label,
      short:configured.short || configured.label || fallback.label,
      attributeBudget:Number(firstDefined(configured.attributeBudget, nestedAttributes.budget, configured.budgets && configured.budgets.attributes, fallback.attributeBudget)),
      attributeCap:Number(firstDefined(configured.attributeCap, nestedAttributes.cap, configured.maxAttribute, fallback.attributeCap)),
      skillBudget:Number(firstDefined(configured.skillBudget, nestedSkills.budget, configured.budgets && configured.budgets.skills, fallback.skillBudget)),
      expertCap:Number(firstDefined(configured.expertCap, nestedSkills.expertCap, configured.maxExperts, fallback.expertCap)),
      minMana:Number(firstDefined(configured.minMana, configured.manaMinimum, nestedAttributes.minMana, fallback.minMana)),
      origins:configured.origins || [],
      identities:configured.identities || configured.concepts || []
    };
  }

  function blankAttributes() { var output = {}; attributes.forEach(function (item) { output[item.id] = 0; }); return output; }
  function blankSkills() { var output = {}; skills.forEach(function (item) { output[item.id] = 0; }); return output; }
  function blankRetainedSkills() { return [{ name:'', rank:'B', effect:'' }, { name:'', rank:'C', effect:'' }, { name:'', rank:'C', effect:'' }]; }

  function blankCharacter(type) {
    type = ['mortal', 'magus', 'servant'].indexOf(type) !== -1 ? type : 'mortal';
    return {
      protocol:CHARACTER_PROTOCOL,
      rulesetId:RULESET_ID,
      rulesetVersion:'v2.0·车卡增订',
      id:makeId('character'),
      name:'', playerName:'', pronouns:'', origin:'', identity:'', wish:'', boundary:'',
      identityType:type,
      isMaster:false,
      attributes:blankAttributes(),
      skills:blankSkills(),
      ordinary:{ backgroundId:'', realAdvantage:'', contacts:['',''], safePlace:'', equipment:'', signatureTalent:'' },
      magus:{ lineages:[], spellIds:[], mysticCodeId:'', limitation:'' },
      servant:{ classId:'saber', publicTitle:'', trueName:'', legendCore:'', luck:'C', weaknesses:['',''], refusedCommand:'', retainedSkills:blankRetainedSkills(), noblePhantasm:{ name:'', rank:'C', type:'对人', cost:'5 MP', effect:'', counter:'' } },
      master:{ servantName:'', supplyLevel:'stable', communicationDistance:'同一场景', source:'', termination:'', masterRefusal:'', servantRefusal:'', commandSeals:3 },
      current:{ hp:null, mp:null, hpDirty:false, mpDirty:false, resolve:3, armor:0, conditions:[], notes:'' },
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };
  }

  function normalizeRetainedSkill(raw, index) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return { name:safeTrim(raw.name,120), rank:['E','D','C','B','A'].indexOf(raw.rank) !== -1 ? raw.rank : (index === 0 ? 'B' : 'C'), effect:safeTrim(raw.effect,1200) };
  }

  function normalizeCharacter(raw) {
    if (!raw || typeof raw !== 'object') return blankCharacter('mortal');
    if (raw.rulesetId && raw.rulesetId !== RULESET_ID) throw new Error('ruleset');
    var type = ['mortal','magus','servant'].indexOf(raw.identityType) !== -1 ? raw.identityType : 'mortal';
    var output = blankCharacter(type);
    output.id = safeText(raw.id,80);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(output.id)) output.id = makeId('character');
    output.name = safeTrim(raw.name,80);
    output.playerName = safeTrim(raw.playerName,80);
    output.pronouns = safeTrim(raw.pronouns,80);
    output.origin = safeTrim(raw.origin,160);
    output.identity = safeTrim(raw.identity,400);
    output.wish = safeTrim(raw.wish,600);
    output.boundary = safeTrim(raw.boundary,500);
    output.isMaster = type !== 'servant' && raw.isMaster === true;
    attributes.forEach(function (item) { output.attributes[item.id] = integer(raw.attributes && raw.attributes[item.id], 0, 4, 0); });
    skills.forEach(function (item) { output.skills[item.id] = integer(raw.skills && raw.skills[item.id], 0, 2, 0); });
    var ordinary = raw.ordinary || {};
    output.ordinary.backgroundId = safeTrim(ordinary.backgroundId,80);
    output.ordinary.realAdvantage = safeTrim(ordinary.realAdvantage,160);
    output.ordinary.contacts = Array.isArray(ordinary.contacts) ? ordinary.contacts.slice(0,2).map(function (item) { return safeTrim(item,120); }) : ['',''];
    while (output.ordinary.contacts.length < 2) output.ordinary.contacts.push('');
    output.ordinary.safePlace = safeTrim(ordinary.safePlace,160);
    output.ordinary.equipment = safeTrim(ordinary.equipment,220);
    output.ordinary.signatureTalent = safeTrim(ordinary.signatureTalent,1000);
    var magus = raw.magus || {};
    output.magus.lineages = uniqueTrimmedList(magus.lineages,2,80);
    output.magus.spellIds = uniqueTrimmedList(magus.spellIds,4,100);
    output.magus.mysticCodeId = safeTrim(magus.mysticCodeId,100);
    output.magus.limitation = safeTrim(magus.limitation,300);
    var servant = raw.servant || {};
    output.servant.classId = safeTrim(servant.classId,80);
    output.servant.publicTitle = safeTrim(servant.publicTitle,120);
    output.servant.trueName = safeTrim(servant.trueName,160);
    output.servant.legendCore = safeTrim(servant.legendCore,600);
    output.servant.luck = ['D','C','B','A'].indexOf(servant.luck) !== -1 ? servant.luck : 'C';
    output.servant.weaknesses = Array.isArray(servant.weaknesses) ? servant.weaknesses.slice(0,3).map(function (item) { return safeTrim(item,180); }).filter(Boolean) : ['',''];
    while (output.servant.weaknesses.length < 2) output.servant.weaknesses.push('');
    output.servant.refusedCommand = safeTrim(servant.refusedCommand,220);
    output.servant.retainedSkills = [0,1,2].map(function (index) { return normalizeRetainedSkill(Array.isArray(servant.retainedSkills) ? servant.retainedSkills[index] : null, index); });
    var noble = servant.noblePhantasm || {};
    output.servant.noblePhantasm = { name:safeTrim(noble.name,180), rank:['E','D','C','B','A'].indexOf(noble.rank) !== -1 ? noble.rank : 'C', type:['对人','对军','对城／对堡','结界／支援','概念／特殊'].indexOf(noble.type) !== -1 ? noble.type : '对人', cost:safeTrim(noble.cost,80), effect:safeTrim(noble.effect,1200), counter:safeTrim(noble.counter,800) };
    var master = raw.master || {};
    output.master = { servantName:safeTrim(master.servantName,160), supplyLevel:safeTrim(master.supplyLevel,80), communicationDistance:safeTrim(master.communicationDistance,160), source:safeTrim(master.source,220), termination:safeTrim(master.termination,220), masterRefusal:safeTrim(master.masterRefusal,220), servantRefusal:safeTrim(master.servantRefusal,220), commandSeals:integer(master.commandSeals,0,3,3) };
    var current = raw.current || {};
    var currentHp = current.hp === null || current.hp === '' || current.hp === undefined ? null : integer(current.hp,0,99,0);
    var currentMp = current.mp === null || current.mp === '' || current.mp === undefined ? null : integer(current.mp,0,99,0);
    var currentDerived = derivedValues(output);
    var hpDirty = currentHp !== null && (typeof current.hpDirty === 'boolean' ? current.hpDirty : currentHp !== currentDerived.maxHp);
    var mpDirty = currentMp !== null && (typeof current.mpDirty === 'boolean' ? current.mpDirty : currentMp !== currentDerived.maxMp);
    output.current = { hp:hpDirty ? currentHp : null, mp:mpDirty ? currentMp : null, hpDirty:hpDirty, mpDirty:mpDirty, resolve:integer(current.resolve,0,3,3), armor:integer(current.armor,0,20,0), conditions:Array.isArray(current.conditions) ? current.conditions.slice(0,12).map(function (item) { return safeTrim(item,120); }).filter(Boolean) : [], notes:safeText(current.notes,1600) };
    output.createdAt = safeText(raw.createdAt,40) || output.createdAt;
    output.updatedAt = safeText(raw.updatedAt,40) || new Date().toISOString();
    return output;
  }

  function readStoredCharacter() {
    try {
      var raw = JSON.parse(localStorage.getItem(CHARACTER_KEY) || 'null');
      return raw ? normalizeCharacter(raw) : blankCharacter('mortal');
    } catch (error) { return blankCharacter('mortal'); }
  }

  function derivedValues(value) {
    var attr = value.attributes || blankAttributes();
    var servant = value.identityType === 'servant';
    var magus = value.identityType === 'magus';
    return {
      evasion:10 + Number(attr.agility || 0),
      fortitude:10 + Number(attr.endurance || 0),
      spirit:10 + Number(attr.will || 0),
      awareness:10 + Number(attr.perception || 0),
      maxHp:(servant ? 18 : 8) + Number(attr.endurance || 0) * (servant ? 3 : 2),
      maxMp:servant ? 6 + Number(attr.mana || 0) * 2 : (magus ? 4 + Number(attr.mana || 0) * 2 : 0),
      resolve:3
    };
  }

  function syncDerivedCurrentFields() {
    var derived = derivedValues({ identityType:identityType(), attributes:attributeValues });
    if (!currentHpDirty) setField('character-current-hp', derived.maxHp);
    if (!currentMpDirty) setField('character-current-mp', derived.maxMp);
  }

  function saveCharacter(next) {
    character = normalizeCharacter(next);
    character.updatedAt = new Date().toISOString();
    localStorage.setItem(CHARACTER_KEY, JSON.stringify(character));
    document.getElementById('character-save-status').textContent = 'v2.0 · 已本地保存 ' + new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' });
    updateCheckOptions();
  }

  function classTemplates() { return objectList(config.classTemplates || {}); }
  function classTemplate(id) { return classTemplates().find(function (item) { return String(item.id).toLowerCase() === String(id).toLowerCase(); }) || classTemplates()[0] || null; }

  function flattenedSpells() {
    var output = [];
    (config.spellLineages || []).forEach(function (lineage) {
      (lineage.spells || []).forEach(function (spell, index) {
        var id = spell.id || String(lineage.id || lineage.label || 'lineage') + '-' + index;
        output.push(Object.assign({}, spell, { id:id, lineage:spell.lineage || lineage.id, lineageLabel:lineage.label || lineage.name || lineage.id }));
      });
    });
    return output;
  }

  function spellById(id) { return flattenedSpells().find(function (spell) { return spell.id === id; }) || null; }
  function lineageById(id) { return (config.spellLineages || []).find(function (lineage) { return lineage.id === id; }) || null; }
  function spellRank(spell) { return integer(firstDefined(spell && spell.rank, spell && spell.tier), 0, 4, 0); }
  function spellSummary(spell) { return safeText(spell && (spell.summary || spell.description || spell.effect), 900); }
  function spellTags(spell) { return Array.isArray(spell && spell.tags) ? spell.tags.map(function (item) { return String(item).toLowerCase(); }) : []; }
  function spellAction(spell) { return safeText(spell && (spell.action || spell.prep || spell.timing), 80); }
  function spellCost(spell) { var value = firstDefined(spell && spell.costMp, spell && spell.cost); return value === undefined ? '' : String(value).replace(/\s*MP$/i, '') + ' MP'; }

  function rankPoints(rank) { return { E:0, D:1, C:2, B:3, A:4 }[rank] || 0; }
  function skillBonus(level) { return integer(level,0,2,0) * 2; }
  function identityType() { return fieldValue('character-existence') || 'mortal'; }

  function listedItems(value) {
    return String(value || '').split(/[；;、，,\r\n]+/).map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function missingAbilityCardSections(value) {
    var text = String(value || '');
    return [
      ['动作', /动作\s*[：:]/], ['成本', /成本\s*[：:]/], ['检定', /检定\s*[：:]/],
      ['目标', /目标\s*[：:]/], ['效果', /效果\s*[：:]/], ['失败', /失败\s*[：:]/],
      ['持续', /持续\s*[：:]/], ['冷却', /冷却\s*[：:]/], ['反制', /反制\s*[：:]/]
    ].filter(function (section) { return !section[1].test(text); }).map(function (section) { return section[0]; });
  }

  function attributeStatus(value) {
    var rule = identityRule(value.identityType);
    var used = attributes.reduce(function (sum, item) { return sum + (ATTRIBUTE_COSTS[value.attributes[item.id]] || 0); }, 0);
    var overCap = attributes.filter(function (item) { return Number(value.attributes[item.id]) > rule.attributeCap; });
    var errors = [];
    var warnings = [];
    if (used > rule.attributeBudget) errors.push('属性点超出 ' + (used - rule.attributeBudget) + ' 点');
    if (overCap.length) errors.push(overCap.map(function (item) { return item.label; }).join('、') + ' 超过创建上限');
    if (value.identityType === 'magus' && Number(value.attributes.mana || 0) < 1) errors.push('魔术师的魔力必须至少 D／1');
    if (value.identityType === 'mortal' && Number(value.attributes.mana || 0) > 0) warnings.push('普通人的魔力通常为 E／0；高于 0 请和主持人确认设定');
    if (used < rule.attributeBudget) warnings.push('仍有 ' + (rule.attributeBudget - used) + ' 点未使用');
    return { used:used, budget:rule.attributeBudget, errors:errors, warnings:warnings, valid:errors.length === 0 };
  }

  function skillStatus(value) {
    var rule = identityRule(value.identityType);
    var used = skills.reduce(function (sum, item) { return sum + Number(value.skills[item.id] || 0); }, 0);
    var experts = skills.filter(function (item) { return Number(value.skills[item.id]) === 2; }).length;
    var errors = [];
    var warnings = [];
    if (used > rule.skillBudget) errors.push('技能点超出 ' + (used - rule.skillBudget) + ' 点');
    if (experts > rule.expertCap) errors.push('专家技能超过 ' + rule.expertCap + ' 项上限');
    if (value.identityType === 'magus' && Number(value.skills.magecraft || 0) < 1) errors.push('魔术师的“魔术”必须至少受训');
    if (value.identityType === 'servant' && Number(value.skills.melee || 0) < 1 && Number(value.skills.ranged || 0) < 1) errors.push('从者至少需要一项明确战斗技能：近战或射击');
    if (used < rule.skillBudget) warnings.push('仍有 ' + (rule.skillBudget - used) + ' 点未使用');
    return { used:used, budget:rule.skillBudget, experts:experts, expertCap:rule.expertCap, errors:errors, warnings:warnings, valid:errors.length === 0 };
  }

  function spellStatus(value) {
    var spellIds = value.magus.spellIds || [];
    var spells = spellIds.map(spellById).filter(Boolean);
    var lineages = value.magus.lineages || [];
    var baseRank = spells.reduce(function (sum, spell) { return sum + spellRank(spell); }, 0);
    var crossLineage = spells.filter(function (spell) { return lineages.indexOf(spell.lineage) === -1; }).length;
    var adjusted = baseRank + crossLineage;
    var tags = spells.reduce(function (all, spell) { return all.concat(spellTags(spell)); }, []);
    var nonCombatTags = ['noncombat','utility','investigation','social','healing','defense','retreat','support','ritual','警戒','侦测','调查','工具','治疗','召唤','通信','工房','恢复','仪式','预知','定位','追踪','供能','支援','保护','防御','撤退','移动','传送','稳定','救援'];
    var defenseTags = ['defense','retreat','healing','escape','protection','防御','减伤','撤退','保护','救援','稳定','治疗','附身防护','移动','传送','团队移动','反制','护甲','防护'];
    var nonCombat = tags.some(function (tag) { return nonCombatTags.indexOf(tag) !== -1; });
    var defenseOrRetreat = tags.some(function (tag) { return defenseTags.indexOf(tag) !== -1; });
    var errors = [];
    var warnings = [];
    if (lineages.length !== 2) errors.push('必须正好选择 2 个不同系谱');
    if (distinctTextCount(lineages) !== lineages.length) errors.push('两个系谱不能重复');
    if (lineages.some(function (id) { return !lineageById(id); })) errors.push('所选系谱不在当前 v2.0 资源库中');
    if (spellIds.length !== 4) errors.push('必须正好选择 4 项不同术式');
    if (distinctTextCount(spellIds) !== spellIds.length) errors.push('四项术式不能重复');
    if (spellIds.some(function (id) { return !spellById(id); })) errors.push('所选术式不在当前 v2.0 资源库中');
    if (adjusted > 9) errors.push('术式阶位和（含跨系谱）超过 9');
    if (spells.filter(function (spell) { return spellRank(spell) === 4; }).length > 1) errors.push('四阶术式最多 1 项');
    if (spells.length === 4 && !nonCombat) errors.push('至少需要 1 项非战斗术式');
    if (spells.length === 4 && !defenseOrRetreat) {
      if (spells.every(function (spell) { return Array.isArray(spell.tags) && spell.tags.length; })) errors.push('至少需要 1 项防御／撤退术式');
      else warnings.push('目录标签不足，无法确认防御／撤退覆盖，请由主持人复核所选术式');
    }
    return { spells:spells, baseRank:baseRank, crossLineage:crossLineage, adjusted:adjusted, errors:errors, warnings:warnings, valid:errors.length === 0 };
  }

  function nobleDefinition(rank) {
    var list = config.noblePhantasmRanks || [];
    return list.find(function (item) { return String(item.id || item.rank || item.label).replace(/[^A-E]/g,'') === rank; }) || ({ E:{ cost:'3 MP', skillCap:7 }, D:{ cost:'4 MP', skillCap:7 }, C:{ cost:'5 MP', skillCap:7 }, B:{ cost:'6 MP', skillCap:6 }, A:{ cost:'8 MP', skillCap:5 } }[rank]);
  }

  function retainedSkillStatus(value) {
    var retained = value.servant.retainedSkills || [];
    var nobleRank = value.servant.noblePhantasm.rank || 'C';
    var noble = nobleDefinition(nobleRank) || {};
    var cap = Number(firstDefined(noble.skillCap, noble.retainedSkillCap, noble.retainedSkillBudgetCap, nobleRank === 'B' ? 6 : nobleRank === 'A' ? 5 : 7));
    var used = retained.reduce(function (sum, item) { return sum + rankPoints(item.rank); }, 0);
    var errors = [];
    var warnings = [];
    if (retained.length !== 3 || retained.some(function (item) { return !item.name || !item.effect; })) errors.push('三项保有技能都要填写名称与完整能力卡');
    else if (retained.some(function (item) { return missingAbilityCardSections(item.effect).length; })) errors.push('每项保有技能都要写清动作、成本、检定、目标、效果、失败、持续、冷却与反制');
    if (retained.length === 3 && distinctTextCount(retained.map(function (item) { return item.name; })) !== 3) errors.push('三项保有技能名称不能重复');
    if (used > cap) errors.push('保有技能阶位和超过当前宝具允许的 ' + cap);
    if (retained.filter(function (item) { return item.rank === 'A'; }).length > 1) errors.push('A 阶保有技能最多 1 项');
    if (value.servant.luck === 'B' && retained.filter(function (item) { return rankPoints(item.rank) <= 2; }).length < 2) errors.push('幸运 B 要求至少两项保有技能不高于 C');
    if (value.servant.luck === 'A') warnings.push('幸运 A 需要主持人许可并增加第三项概念弱点');
    if (retained.some(function (item) { return item.rank === 'A' && !/(每场|MP|代价|失去|副作用|一次)/i.test(item.effect); })) warnings.push('A 阶技能应明确每场次数、MP 或副作用');
    return { used:used, cap:cap, errors:errors, warnings:warnings, valid:errors.length === 0 };
  }

  function masterStatus(value) {
    var errors = [];
    if (!value.isMaster) return { errors:errors, valid:true };
    var master = value.master;
    if (!master.servantName || !master.supplyLevel || !master.communicationDistance || !master.source || !master.termination || !master.masterRefusal || !master.servantRefusal) errors.push('御主契约模块仍有必填字段');
    if (master.supplyLevel && !(config.masterSupplyLevels || []).some(function (item) { return (item.id || item.value) === master.supplyLevel; })) errors.push('供魔等级不在当前 v2.0 的四档规则中');
    if (value.identityType === 'servant') errors.push('御主模块不能附加在从者基础卡上');
    return { errors:errors, valid:errors.length === 0 };
  }

  function resourceStatus(value) {
    var errors = [];
    var warnings = [];
    if (value.identityType === 'mortal') {
      if (!value.ordinary.backgroundId) errors.push('请选择快速背景');
      if (!value.ordinary.realAdvantage) errors.push('请选择现实优势');
      var contacts = value.ordinary.contacts.filter(Boolean);
      if (contacts.length !== 2) errors.push('请填写两名联系人');
      else if (distinctTextCount(contacts) !== 2) errors.push('两名联系人不能重复');
      if (!value.ordinary.safePlace) errors.push('请填写安全地点');
      var equipmentItems = listedItems(value.ordinary.equipment);
      if (equipmentItems.length < 2) errors.push('请用分号或换行分开填写两件常用装备');
      else if (distinctTextCount(equipmentItems) < 2) errors.push('两件常用装备不能重复');
      if (!value.ordinary.signatureTalent) errors.push('请填写标志才能的完整能力卡');
      else if (missingAbilityCardSections(value.ordinary.signatureTalent).length) errors.push('标志才能要写清动作、成本、检定、目标、效果、失败、持续、冷却与反制');
    }
    if (value.identityType === 'magus') {
      var magic = spellStatus(value);
      errors = errors.concat(magic.errors);
      warnings = warnings.concat(magic.warnings);
      if (!value.magus.mysticCodeId) errors.push('请选择一件起始魔术礼装');
      else if (!byId(config.mysticCodes || [], value.magus.mysticCodeId)) errors.push('所选魔术礼装不在当前 v2.0 资源库中');
      if (!value.magus.limitation) errors.push('请写一项明确限制');
      var code = byId(config.mysticCodes || [], value.magus.mysticCodeId);
      var level = String(code && (code.level || code.grade) || '');
      if (/禁忌/.test(level)) errors.push('禁忌礼装不能默认开局');
      if (/传承/.test(level)) warnings.push('传承礼装需要主持人许可，并增加一项额外限制');
    }
    if (value.identityType === 'servant') {
      if (!value.servant.classId) errors.push('请选择职阶');
      else if (!classTemplates().some(function (item) { return item.id === value.servant.classId; })) errors.push('所选职阶不在当前 v2.0 的七个基础职阶中');
      if (!value.servant.publicTitle || !value.servant.trueName || !value.servant.legendCore) errors.push('请填写公开称谓、真名与传说核心');
      var weaknessCount = value.servant.weaknesses.filter(Boolean).length;
      if (weaknessCount < (value.servant.luck === 'A' ? 3 : 2)) errors.push('概念弱点数量不足');
      else if (distinctTextCount(value.servant.weaknesses.filter(Boolean)) !== weaknessCount) errors.push('多项概念弱点不能重复');
      if (!value.servant.refusedCommand) errors.push('请填写不会接受的命令');
      var retained = retainedSkillStatus(value);
      errors = errors.concat(retained.errors);
      warnings = warnings.concat(retained.warnings);
      var noble = value.servant.noblePhantasm;
      if (!noble.name || !noble.effect || !noble.counter) errors.push('宝具必须填写名称、触发／效果与可执行反制');
      else if (missingAbilityCardSections('成本：' + noble.cost + '｜' + noble.effect + '｜反制：' + noble.counter).length) errors.push('宝具能力卡要写清动作、成本、检定、目标、效果、失败、持续、冷却与反制');
      if (noble.rank === 'A' && !/(代价|触发|需要|每场|仅当)/.test(noble.effect + noble.counter)) errors.push('A 阶宝具必须增加一个额外触发或代价');
    }
    errors = errors.concat(masterStatus(value).errors);
    return { errors:errors, warnings:warnings, valid:errors.length === 0 };
  }

  function identityStatus(value) {
    var errors = [];
    if (!value.name) errors.push('请填写角色名');
    if (!value.origin) errors.push('请填写现实身份／来历');
    if (!value.identity) errors.push('请填写一句话角色概念');
    if (!value.wish) errors.push('请填写愿望／动机');
    if (!value.boundary) errors.push('请填写底线／恐惧');
    return { errors:errors, valid:errors.length === 0 };
  }

  function validation(value) {
    var identity = identityStatus(value);
    var attribute = attributeStatus(value);
    var skill = skillStatus(value);
    var resource = resourceStatus(value);
    return {
      identity:identity,
      attribute:attribute,
      skill:skill,
      resource:resource,
      errors:identity.errors.concat(attribute.errors, skill.errors, resource.errors),
      warnings:attribute.warnings.concat(skill.warnings, resource.warnings)
    };
  }

  function initializeStaticUi() {
    document.getElementById('attribute-grid').innerHTML = attributes.map(function (item) {
      return '<article class="attribute-point-card"><span>' + escapeHtml(item.label) + '</span><small>' + escapeHtml(item.help || '') + '</small><div class="attribute-controls"><button type="button" data-attribute-delta="-1" data-attribute-id="' + escapeHtml(item.id) + '" aria-label="降低' + escapeHtml(item.label) + '">−</button><input type="number" min="0" max="4" step="1" data-attribute-input="' + escapeHtml(item.id) + '" aria-label="' + escapeHtml(item.label) + '数值"><button type="button" data-attribute-delta="1" data-attribute-id="' + escapeHtml(item.id) + '" aria-label="提高' + escapeHtml(item.label) + '">＋</button></div><b data-attribute-rank="' + escapeHtml(item.id) + '">E／0</b><i data-attribute-cost="' + escapeHtml(item.id) + '">成本 0</i></article>';
    }).join('');
    document.getElementById('skill-grid').innerHTML = skills.map(function (item) {
      return '<article class="skill-training-card"><div><strong>' + escapeHtml(item.label) + '</strong><small>' + escapeHtml(item.help || '') + '</small></div><select data-skill-level="' + escapeHtml(item.id) + '" aria-label="' + escapeHtml(item.label) + '训练等级"><option value="0">未受训 +0</option><option value="1">受训 +2</option><option value="2">专家 +4</option></select></article>';
    }).join('');
    initializeResourceOptions();
    document.getElementById('player-check-approach').innerHTML = attributes.map(function (item) { return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.label) + '</option>'; }).join('');
    document.getElementById('player-check-dc').innerHTML = (config.difficulties || [{ value:10,label:'DC 10 · 有压力但常规' },{ value:13,label:'DC 13 · 标准挑战' },{ value:16,label:'DC 16 · 困难' },{ value:19,label:'DC 19 · 英雄级' },{ value:22,label:'DC 22 · 奇迹级' }]).map(function (item) { return '<option value="' + item.value + '">' + escapeHtml(item.label) + '</option>'; }).join('');
    renderStorySuggestions();
  }

  function initializeResourceOptions() {
    var backgrounds = config.backgrounds || [];
    document.getElementById('character-background').innerHTML = '<option value="">请选择背景</option>' + backgrounds.map(function (item) { var id = item.id || item.label || item.name; return '<option value="' + escapeHtml(id) + '">' + escapeHtml(item.label || item.name || id) + '</option>'; }).join('');
    document.getElementById('character-real-advantage').innerHTML = '<option value="">请选择现实优势</option>' + (config.realAdvantages || ['机构权限','财富','媒体','医疗','工程','情报','军警训练','社区信任']).map(function (item) { var label = valueLabel(item); return '<option value="' + escapeHtml(label) + '">' + escapeHtml(label) + '</option>'; }).join('');
    document.getElementById('spell-lineage-filter').innerHTML = '<option value="all">全部系谱</option>' + (config.spellLineages || []).map(function (item) { return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.label || item.name || item.id) + '</option>'; }).join('');
    document.getElementById('character-mystic-code').innerHTML = '<option value="">请选择礼装</option>' + (config.mysticCodes || []).map(function (item) { var level = item.level || item.grade || ''; return '<option value="' + escapeHtml(item.id) + '"' + (/禁忌/.test(level) ? ' disabled' : '') + '>' + escapeHtml(item.name || item.label) + ' · ' + escapeHtml(level) + '</option>'; }).join('');
    var classes = classTemplates();
    document.getElementById('character-class').innerHTML = classes.map(function (item) { return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.label || item.name || item.id) + '</option>'; }).join('');
    var supplies = config.masterSupplyLevels || [{ id:'insufficient',label:'不足' },{ id:'stable',label:'稳定（默认）' },{ id:'abundant',label:'充足' },{ id:'system',label:'系统供给' }];
    document.getElementById('character-supply-level').innerHTML = supplies.map(function (item) { return '<option value="' + escapeHtml(item.id || item.value) + '">' + escapeHtml(item.label || item.name) + '</option>'; }).join('');
    var retainedRanks = config.retainedSkillRanks || [{ id:'E',label:'E／0点' },{ id:'D',label:'D／1点' },{ id:'C',label:'C／2点' },{ id:'B',label:'B／3点' },{ id:'A',label:'A／4点' }];
    document.getElementById('retained-skill-list').innerHTML = [0,1,2].map(function (index) {
      return '<article class="retained-skill-row"><label><span>保有技能 ' + (index + 1) + ' · 名称</span><input id="retained-name-' + index + '" maxlength="120"></label><label><span>阶位</span><select id="retained-rank-' + index + '">' + retainedRanks.map(function (item) { var rank = item.id || item.rank || item.value; return '<option value="' + escapeHtml(rank) + '">' + escapeHtml(item.label || rank) + '</option>'; }).join('') + '</select></label><label><span>完整能力卡</span><textarea id="retained-effect-' + index + '" rows="4" maxlength="1200" placeholder="动作／成本／检定／目标／成功／失败／持续／反制"></textarea></label></article>';
    }).join('');
    var nobleRanks = config.noblePhantasmRanks || [{ id:'E',label:'E' },{ id:'D',label:'D' },{ id:'C',label:'C（默认）' },{ id:'B',label:'B' },{ id:'A',label:'A' }];
    document.getElementById('character-noble-rank').innerHTML = nobleRanks.filter(function (item) { return ['E','D','C','B','A'].indexOf(item.id || item.rank) !== -1; }).map(function (item) { var rank = item.id || item.rank; return '<option value="' + escapeHtml(rank) + '">' + escapeHtml(item.label || rank) + '</option>'; }).join('');
  }

  function renderStorySuggestions() {
    var groups = config.storySuggestions || {};
    var targets = { wish:'character-wish', boundary:'character-boundary' };
    Object.keys(targets).forEach(function (key) {
      var container = document.querySelector('[data-suggestion-group="' + key + '"]');
      if (!container) return;
      var items = groups[key] || (key === 'boundary' ? groups.fear : []);
      container.innerHTML = (items || []).map(function (value) { return '<button type="button" data-fill-target="' + targets[key] + '" data-fill-value="' + escapeHtml(value) + '">' + escapeHtml(value) + '</button>'; }).join('');
    });
  }

  function attributePresetsFor(type) {
    if (type === 'servant') return classTemplates().map(function (item) { return { id:item.id, label:item.label || item.name || item.id, help:'职阶推荐数组 · 总预算不变', values:item.attributes || item.values || item.recommendedAttributes || item.recommended || {} }; });
    var configured = config.attributePresets && config.attributePresets[type];
    if (Array.isArray(configured) && configured.length) return configured;
    var fixed = type === 'magus' ? { physique:0,endurance:1,agility:1,perception:2,knowledge:3,will:2,mana:1 } : { physique:1,endurance:2,agility:1,perception:2,knowledge:3,will:0,mana:0 };
    return [{ id:type + '-fixed', label:'规则固定数组', help:type === 'magus' ? '3／2／2／1／1／1／0' : '3／2／2／1／1／0／0', values:fixed }];
  }

  function renderAttributePresets() {
    var presets = attributePresetsFor(identityType());
    document.getElementById('attribute-presets').innerHTML = presets.map(function (preset) {
      return '<button type="button" data-attribute-preset="' + escapeHtml(preset.id) + '" class="' + (activeAttributePreset === preset.id ? 'selected' : '') + '"><span>' + escapeHtml((preset.icon || preset.label || '?').slice(0,1)) + '</span><strong>' + escapeHtml(preset.label || preset.name || preset.id) + '</strong><small>' + escapeHtml(preset.help || '规则合法预设') + '</small></button>';
    }).join('');
  }

  function applyAttributePreset(id) {
    var preset = attributePresetsFor(identityType()).find(function (item) { return item.id === id; });
    if (!preset) return;
    var values = preset.values || preset.attributes || preset.ranking || {};
    attributes.forEach(function (item, index) {
      if (Array.isArray(values)) attributeValues[item.id] = integer(values[index],0,4,0);
      else attributeValues[item.id] = integer(values[item.id],0,4,0);
    });
    activeAttributePreset = id;
    if (identityType() === 'servant') setField('character-class', id);
    renderAttributes();
    renderClassUi();
  }

  function renderAttributes() {
    var rule = identityRule(identityType());
    attributes.forEach(function (item) {
      attributeValues[item.id] = integer(attributeValues[item.id],0,rule.attributeCap,0);
      var input = document.querySelector('[data-attribute-input="' + item.id + '"]');
      if (input) { input.max = String(rule.attributeCap); input.value = String(attributeValues[item.id]); }
      var rank = document.querySelector('[data-attribute-rank="' + item.id + '"]');
      if (rank) rank.textContent = FATE_RANKS[attributeValues[item.id]] + '／' + attributeValues[item.id];
      var cost = document.querySelector('[data-attribute-cost="' + item.id + '"]');
      if (cost) cost.textContent = '总成本 ' + (ATTRIBUTE_COSTS[attributeValues[item.id]] || 0);
    });
    syncDerivedCurrentFields();
    renderAttributePresets();
    var temporary = collectCharacter(false);
    var status = attributeStatus(temporary);
    var element = document.getElementById('attribute-budget-status');
    element.className = 'budget-meter ' + (status.errors.length ? 'invalid' : status.warnings.length ? 'warning' : 'ready');
    element.innerHTML = '<span><strong>属性点 ' + status.used + ' / ' + status.budget + '</strong><br>' + escapeHtml((status.errors.concat(status.warnings)[0] || '预算与创建上限已通过')) + '</span><b>' + escapeHtml(identityRule(temporary.identityType).label) + ' · 上限 ' + FATE_RANKS[identityRule(temporary.identityType).attributeCap] + '</b>';
    updateBuilderCompletion();
  }

  function renderSkills() {
    skills.forEach(function (item) {
      skillLevels[item.id] = integer(skillLevels[item.id],0,2,0);
      var select = document.querySelector('[data-skill-level="' + item.id + '"]');
      if (select) select.value = String(skillLevels[item.id]);
    });
    var temporary = collectCharacter(false);
    var status = skillStatus(temporary);
    var element = document.getElementById('skill-budget-status');
    element.className = 'budget-meter ' + (status.errors.length ? 'invalid' : status.warnings.length ? 'warning' : 'ready');
    element.innerHTML = '<span><strong>技能点 ' + status.used + ' / ' + status.budget + '</strong><br>' + escapeHtml((status.errors.concat(status.warnings)[0] || '训练等级与专家数量已通过')) + '</span><b>专家 ' + status.experts + ' / ' + status.expertCap + '</b>';
    document.getElementById('skill-rule-note').textContent = temporary.identityType === 'magus' ? '魔术必须至少受训。' : temporary.identityType === 'servant' ? '至少一项近战／射击；最多两项专家。' : '最多一项专家。';
    updateBuilderCompletion();
  }

  function applySkillPreset() {
    skillLevels = blankSkills();
    if (identityType() === 'mortal') Object.assign(skillLevels, { medicine:2, awareness:1, investigation:1, negotiation:1, command:1 });
    if (identityType() === 'magus') Object.assign(skillLevels, { magecraft:2, awareness:1, investigation:1, academics:1, technology:1 });
    if (identityType() === 'servant') Object.assign(skillLevels, { melee:2, athletics:2, ranged:1, awareness:1, stealth:1, command:1 });
    renderSkills();
  }

  function renderArchetypeUi() {
    var type = identityType();
    Array.prototype.forEach.call(document.querySelectorAll('[data-archetype]'), function (button) {
      var selected = button.getAttribute('data-archetype') === type;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    var rule = identityRule(type);
    document.getElementById('origin-suggestions').innerHTML = (rule.origins || []).map(function (value) { return '<button type="button" data-fill-target="character-origin" data-fill-value="' + escapeHtml(value) + '">' + escapeHtml(value) + '</button>'; }).join('');
    document.getElementById('identity-suggestions').innerHTML = (rule.identities || []).map(function (value) { return '<button type="button" data-fill-target="character-identity" data-fill-value="' + escapeHtml(value) + '">' + escapeHtml(value) + '</button>'; }).join('');
    document.getElementById('character-origin-label').textContent = type === 'servant' ? '传说来历／时代 *' : type === 'magus' ? '魔术家系／现实身份 *' : '现实身份／来历 *';
    var masterToggle = document.getElementById('master-module-toggle');
    masterToggle.hidden = type === 'servant';
    if (type === 'servant') document.getElementById('character-is-master').checked = false;
    updateResourcePanels();
    renderAttributePresets();
  }

  function selectArchetype(type, applyDefaults) {
    var previousType = identityType();
    if (['mortal','magus','servant'].indexOf(type) === -1) type = 'mortal';
    if (applyDefaults && type !== previousType) {
      currentHpDirty = false;
      currentMpDirty = false;
    }
    setField('character-existence', type);
    activeAttributePreset = '';
    renderArchetypeUi();
    if (applyDefaults) {
      var presets = attributePresetsFor(type);
      if (presets.length) applyAttributePreset(presets[0].id);
      applySkillPreset();
    } else {
      renderAttributes();
      renderSkills();
    }
    clearBuilderError();
    updateBuilderCompletion();
  }

  function renderLineages() {
    document.getElementById('lineage-grid').innerHTML = (config.spellLineages || []).map(function (lineage) {
      var selected = selectedLineages.indexOf(lineage.id) !== -1;
      return '<button type="button" data-lineage="' + escapeHtml(lineage.id) + '" class="' + (selected ? 'selected' : '') + '"><strong>' + escapeHtml(lineage.label || lineage.name || lineage.id) + '</strong><small>' + (selected ? '已选择' : '点击选择') + '</small></button>';
    }).join('');
  }

  function renderSpellCatalog() {
    var filter = fieldValue('spell-lineage-filter') || 'all';
    var list = flattenedSpells().filter(function (spell) { return filter === 'all' || spell.lineage === filter; });
    document.getElementById('spell-catalog').innerHTML = list.map(function (spell) {
      var selected = selectedSpells.indexOf(spell.id) !== -1;
      return '<button type="button" class="resource-catalog-card ' + (selected ? 'selected' : '') + '" data-spell="' + escapeHtml(spell.id) + '"><div><strong>' + escapeHtml(spell.name || spell.label) + '</strong><em>' + escapeHtml(spell.lineageLabel) + ' · ' + spellRank(spell) + ' 阶 · ' + escapeHtml(spellAction(spell)) + (spellCost(spell) ? ' · ' + escapeHtml(spellCost(spell)) : '') + '</em></div><span>' + (selected ? '✓' : '＋') + '</span><p>' + escapeHtml(spellSummary(spell)) + '</p></button>';
    }).join('');
    document.getElementById('selected-spells').innerHTML = selectedSpells.length ? selectedSpells.map(function (id) {
      var spell = spellById(id);
      if (!spell) return '';
      return '<article><div><strong>' + escapeHtml(spell.name || spell.label) + ' · ' + spellRank(spell) + ' 阶</strong><small>' + escapeHtml(spell.lineageLabel) + ' · ' + escapeHtml(spellAction(spell)) + ' · ' + escapeHtml(spellCost(spell)) + '</small></div><button type="button" data-remove-spell="' + escapeHtml(id) + '">移除</button></article>';
    }).join('') : '<p class="resource-warning">尚未选择术式。</p>';
    var value = collectCharacter(false);
    var status = spellStatus(value);
    var element = document.getElementById('spell-budget-status');
    element.className = 'budget-meter ' + (status.errors.length ? 'invalid' : status.warnings.length ? 'warning' : 'ready');
    element.innerHTML = '<span><strong>术式 ' + status.spells.length + ' / 4 · 调整后阶位和 ' + status.adjusted + ' / 9</strong><br>' + escapeHtml((status.errors.concat(status.warnings)[0] || '数量、阶位和与功能覆盖已通过')) + '</span><b>跨系谱 +' + status.crossLineage + '</b>';
    updateBuilderCompletion();
  }

  function renderMysticCodeWarning() {
    var code = byId(config.mysticCodes || [], fieldValue('character-mystic-code'));
    var level = String(code && (code.level || code.grade) || '');
    var message = '';
    if (/传承/.test(level)) message = '传承礼装需要主持人许可，并增加一项额外限制。';
    if (/禁忌/.test(level)) message = '禁忌礼装不能作为默认起始礼装。';
    document.getElementById('mystic-code-warning').textContent = message;
  }

  function renderClassUi() {
    var item = classTemplate(fieldValue('character-class'));
    var card = document.getElementById('class-trait-card');
    if (!item) { card.innerHTML = '<strong>职阶特性</strong>请先选择职阶。'; return; }
    card.innerHTML = '<strong>' + escapeHtml(item.label || item.name || item.id) + ' · 职阶特性</strong>' + escapeHtml(item.trait || item.feature || item.description || '按规则书职阶模板处理。');
  }

  function renderNobleAndRetainedStatus() {
    var rank = fieldValue('character-noble-rank') || 'C';
    var definition = nobleDefinition(rank) || {};
    var cost = firstDefined(definition.cost, definition.costMp);
    if (typeof cost === 'number') cost = cost + ' MP';
    if (!cost) cost = ({E:'3 MP',D:'4 MP',C:'5 MP',B:'6 MP',A:'8 MP'}[rank]);
    setField('character-noble-cost', cost);
    var value = collectCharacter(false);
    var status = retainedSkillStatus(value);
    var element = document.getElementById('retained-skill-budget-status');
    element.className = 'budget-meter ' + (status.errors.length ? 'invalid' : status.warnings.length ? 'warning' : 'ready');
    element.innerHTML = '<span><strong>保有技能阶位和 ' + status.used + ' / ' + status.cap + '</strong><br>' + escapeHtml((status.errors.concat(status.warnings)[0] || '三项技能与宝具联动预算已通过')) + '</span><b>宝具 ' + escapeHtml(rank) + '</b>';
    var luck = fieldValue('character-luck') || 'C';
    document.getElementById('character-weakness-3-field').hidden = luck !== 'A';
    updateBuilderCompletion();
  }

  function updateResourcePanels() {
    var type = identityType();
    Array.prototype.forEach.call(document.querySelectorAll('[data-resource-panel]'), function (panel) { panel.hidden = panel.getAttribute('data-resource-panel') !== type; });
    document.getElementById('master-contract-panel').hidden = !(type !== 'servant' && document.getElementById('character-is-master').checked);
    document.getElementById('character-current-mp-field').hidden = type === 'mortal';
    renderLineages();
    renderSpellCatalog();
    renderClassUi();
    renderNobleAndRetainedStatus();
    renderMysticCodeWarning();
  }

  function backgroundById(id) { return (config.backgrounds || []).find(function (item) { return (item.id || item.label || item.name) === id; }) || null; }

  function applyBackgroundSuggestion() {
    var background = backgroundById(fieldValue('character-background'));
    if (!background) return;
    var talent = background.signatureTalent || background.talent || background.signature || '';
    if (typeof talent === 'object') talent = (talent.name || '') + '｜请补充动作、成本、检定、目标、失败、持续与反制｜效果：' + (talent.summary || talent.description || talent.effect || '');
    if (talent) setField('character-signature-talent', talent);
  }

  function collectCharacter(includeTimestamp) {
    var raw = character ? deepClone(character) : blankCharacter(identityType());
    raw.protocol = CHARACTER_PROTOCOL;
    raw.rulesetId = RULESET_ID;
    raw.rulesetVersion = 'v2.0·车卡增订';
    raw.identityType = identityType();
    raw.isMaster = raw.identityType !== 'servant' && document.getElementById('character-is-master').checked;
    raw.name = fieldValue('character-name');
    raw.playerName = fieldValue('character-player-name');
    raw.pronouns = fieldValue('character-pronouns');
    raw.origin = fieldValue('character-origin');
    raw.identity = fieldValue('character-identity');
    raw.wish = fieldValue('character-wish');
    raw.boundary = fieldValue('character-boundary');
    raw.attributes = Object.assign({}, attributeValues);
    raw.skills = Object.assign({}, skillLevels);
    raw.ordinary = { backgroundId:fieldValue('character-background'), realAdvantage:fieldValue('character-real-advantage'), contacts:[fieldValue('character-contact-1'),fieldValue('character-contact-2')], safePlace:fieldValue('character-safe-place'), equipment:fieldValue('character-equipment'), signatureTalent:fieldValue('character-signature-talent') };
    raw.magus = { lineages:selectedLineages.slice(0,2), spellIds:selectedSpells.slice(0,4), mysticCodeId:fieldValue('character-mystic-code'), limitation:fieldValue('character-magus-limit') };
    raw.servant = {
      classId:fieldValue('character-class'), publicTitle:fieldValue('character-servant-title'), trueName:fieldValue('character-true-name'), legendCore:fieldValue('character-legend-core'), luck:fieldValue('character-luck'),
      weaknesses:[fieldValue('character-weakness-1'),fieldValue('character-weakness-2'),fieldValue('character-weakness-3')].filter(Boolean),
      refusedCommand:fieldValue('character-refused-command'),
      retainedSkills:[0,1,2].map(function (index) { return { name:fieldValue('retained-name-' + index), rank:fieldValue('retained-rank-' + index), effect:fieldValue('retained-effect-' + index) }; }),
      noblePhantasm:{ name:fieldValue('character-noble-name'), rank:fieldValue('character-noble-rank'), type:fieldValue('character-noble-type'), cost:fieldValue('character-noble-cost'), effect:fieldValue('character-noble-effect'), counter:fieldValue('character-noble-counter') }
    };
    raw.master = { servantName:fieldValue('character-contract-servant'), supplyLevel:fieldValue('character-supply-level'), communicationDistance:fieldValue('character-contract-distance'), source:fieldValue('character-contract-source'), termination:fieldValue('character-contract-end'), masterRefusal:fieldValue('character-master-refusal'), servantRefusal:fieldValue('character-servant-refusal'), commandSeals:fieldValue('character-command-seals') };
    raw.current = { hp:currentHpDirty ? fieldValue('character-current-hp') : null, mp:currentMpDirty ? fieldValue('character-current-mp') : null, hpDirty:currentHpDirty, mpDirty:currentMpDirty, resolve:fieldValue('character-resolve'), armor:fieldValue('character-armor'), conditions:fieldValue('character-conditions').split(/\r?\n/), notes:fieldValue('character-notes') };
    if (includeTimestamp !== false) raw.updatedAt = new Date().toISOString();
    return normalizeCharacter(raw);
  }

  function fillCharacterForm(value) {
    character = normalizeCharacter(value);
    setField('character-existence', character.identityType);
    document.getElementById('character-is-master').checked = character.isMaster;
    setField('character-name', character.name);
    setField('character-player-name', character.playerName);
    setField('character-pronouns', character.pronouns);
    setField('character-origin', character.origin);
    setField('character-identity', character.identity);
    setField('character-wish', character.wish);
    setField('character-boundary', character.boundary);
    attributeValues = Object.assign(blankAttributes(), character.attributes);
    skillLevels = Object.assign(blankSkills(), character.skills);
    setField('character-background', character.ordinary.backgroundId);
    setField('character-real-advantage', character.ordinary.realAdvantage);
    setField('character-contact-1', character.ordinary.contacts[0]);
    setField('character-contact-2', character.ordinary.contacts[1]);
    setField('character-safe-place', character.ordinary.safePlace);
    setField('character-equipment', character.ordinary.equipment);
    setField('character-signature-talent', character.ordinary.signatureTalent);
    selectedLineages = character.magus.lineages.slice(0,2);
    selectedSpells = character.magus.spellIds.slice(0,4);
    setField('character-mystic-code', character.magus.mysticCodeId);
    setField('character-magus-limit', character.magus.limitation);
    setField('character-class', character.servant.classId);
    setField('character-servant-title', character.servant.publicTitle);
    setField('character-true-name', character.servant.trueName);
    setField('character-legend-core', character.servant.legendCore);
    setField('character-luck', character.servant.luck);
    setField('character-weakness-1', character.servant.weaknesses[0] || '');
    setField('character-weakness-2', character.servant.weaknesses[1] || '');
    setField('character-weakness-3', character.servant.weaknesses[2] || '');
    setField('character-refused-command', character.servant.refusedCommand);
    character.servant.retainedSkills.forEach(function (item, index) { setField('retained-name-' + index, item.name); setField('retained-rank-' + index, item.rank); setField('retained-effect-' + index, item.effect); });
    setField('character-noble-name', character.servant.noblePhantasm.name);
    setField('character-noble-rank', character.servant.noblePhantasm.rank);
    setField('character-noble-type', character.servant.noblePhantasm.type);
    setField('character-noble-effect', character.servant.noblePhantasm.effect);
    setField('character-noble-counter', character.servant.noblePhantasm.counter);
    setField('character-contract-servant', character.master.servantName);
    setField('character-supply-level', character.master.supplyLevel);
    setField('character-contract-distance', character.master.communicationDistance);
    setField('character-contract-source', character.master.source);
    setField('character-contract-end', character.master.termination);
    setField('character-master-refusal', character.master.masterRefusal);
    setField('character-servant-refusal', character.master.servantRefusal);
    setField('character-command-seals', character.master.commandSeals);
    var derived = derivedValues(character);
    currentHpDirty = character.current.hpDirty === true;
    currentMpDirty = character.current.mpDirty === true;
    setField('character-current-hp', currentHpDirty ? character.current.hp : derived.maxHp);
    setField('character-current-mp', currentMpDirty ? character.current.mp : derived.maxMp);
    setField('character-resolve', character.current.resolve);
    setField('character-armor', character.current.armor);
    setField('character-conditions', character.current.conditions.join('\n'));
    setField('character-notes', character.current.notes);
    activeAttributePreset = '';
    renderArchetypeUi();
    renderAttributes();
    renderSkills();
    updateResourcePanels();
    updateCheckOptions();
    updateBuilderCompletion();
  }

  function fallbackQuickBuild(type) {
    var output = blankCharacter(type);
    output.name = type === 'servant' ? '无名从者' : type === 'magus' ? '未命名魔术师' : '未命名普通人';
    output.origin = type === 'servant' ? '来自尚未公开的传说' : type === 'magus' ? '研究结界与灵脉的现代魔术师' : '在神秘灾害中坚持救人的专业人士';
    output.identity = type === 'servant' ? '回应召唤、寻找传说另一种结局的从者' : type === 'magus' ? '把魔术当作可验证工程的现场术者' : '在神秘战争中用现实专业保护同伴的普通人';
    output.wish = '让重要的人活着走到圣杯战争之后。';
    output.boundary = '绝不以胜利为由夺走同伴的选择。';
    if (type === 'mortal') {
      output.attributes = { physique:1,endurance:2,agility:1,perception:2,knowledge:3,will:0,mana:0 };
      output.skills = Object.assign(blankSkills(), { medicine:2,awareness:1,investigation:1,negotiation:1,command:1 });
      var background = (config.backgrounds || [])[0];
      var backgroundTalent = background && (background.signatureTalent || background.talent || background.signature);
      if (backgroundTalent && typeof backgroundTalent === 'object') backgroundTalent = (backgroundTalent.name || '') + '｜主要动作｜每场一次或 1 决意｜学识＋医疗，对当前治疗 DC｜接触目标｜' + (backgroundTalent.summary || backgroundTalent.effect || '') + '｜失败仍可稳定目标｜需要可用工具。';
      output.ordinary = { backgroundId:background && (background.id || background.label || background.name) || 'medical', realAdvantage:valueLabel((config.realAdvantages || ['医疗'])[0]), contacts:['急诊科值班主任／匿名收治','救护车调度员／现场路线'], safePlace:'可封闭的医院夜间观察室', equipment:'急救包；救护车', signatureTalent:backgroundTalent || '黄金十分钟｜主要动作｜每目标每场一次｜学识＋医疗 DC13｜接触目标恢复 3 生命并止血；失败仍可稳定；需要急救工具。' };
    }
    if (type === 'magus') {
      output.attributes = { physique:0,endurance:1,agility:1,perception:2,knowledge:3,will:2,mana:1 };
      output.skills = Object.assign(blankSkills(), { magecraft:2,awareness:1,investigation:1,academics:1,technology:1 });
      var lineages = (config.spellLineages || []).slice(0,2);
      output.magus.lineages = lineages.map(function (item) { return item.id; });
      var pool = flattenedSpells();
      var preferredNames = ['魔力警戒','偏转盾','疾步','神秘武装化'];
      output.magus.spellIds = preferredNames.map(function (name) { var spell = pool.find(function (item) { return item.name === name; }); return spell && spell.id; }).filter(Boolean);
      while (output.magus.spellIds.length < 4 && pool[output.magus.spellIds.length]) output.magus.spellIds.push(pool[output.magus.spellIds.length].id);
      var code = (config.mysticCodes || []).find(function (item) { return !/传承|禁忌/.test(String(item.level || item.grade)); });
      output.magus.mysticCodeId = code && code.id || '';
      output.magus.limitation = '施术必须使用可被夺走或破坏的折叠阵盘作为媒介。';
    }
    if (type === 'servant') {
      var saber = classTemplate('saber') || classTemplates()[0];
      output.servant.classId = saber && saber.id || 'saber';
      output.attributes = Object.assign(blankAttributes(), saber && (saber.attributes || saber.values || saber.recommendedAttributes) || { physique:4,endurance:3,agility:2,perception:2,knowledge:1,will:3,mana:1 });
      output.skills = Object.assign(blankSkills(), { melee:2,athletics:2,ranged:1,awareness:1,stealth:1,command:1 });
      output.servant.publicTitle = 'Saber';
      output.servant.trueName = '尚未命名的守誓者';
      output.servant.legendCore = '曾在城破之夜守住最后一道门，为未能救下的人再次回应召唤。';
      output.servant.weaknesses = ['违背自愿立下的守护誓言','封闭且无法保护他人的孤立战场'];
      output.servant.refusedCommand = '伤害无辜者或把盟友当作消耗品。';
      output.servant.retainedSkills = [
        { name:'战斗续行',rank:'B',effect:'反应｜每场一次｜生命将降至 0 时保留 1 生命并获得“受伤”；直到下回合结束不能解放宝具。' },
        { name:'直感',rank:'C',effect:'次要｜1 MP｜感知＋侦查，对隐藏威胁；成功询问最危险的立即行动，大成功本轮回避 +2；冷却 2 轮。' },
        { name:'守护誓约',rank:'C',effect:'反应｜2 MP｜替相邻盟友承受一次攻击；本次获得减伤 2；每轮一次，可由强制位移反制。' }
      ];
      output.servant.noblePhantasm = { name:'不落王城的最后一夜',rank:'C',type:'结界／支援',cost:'5 MP',effect:'主要动作｜真名解放｜近距区域建立护盾 8，持续 2 轮；区域内盟友回避 +2。',counter:'破坏四个锚点、对城宝具或使使用者离开中心可终止。' };
    }
    return output;
  }

  function abilityCardText(value) {
    if (!value || typeof value !== 'object') return safeText(value,1200);
    return [value.name, value.action && '动作：' + value.action, value.cost && '成本：' + value.cost, value.check && '检定：' + value.check, value.target && '目标：' + value.target, value.effect && '效果：' + value.effect, value.failure && '失败：' + value.failure, value.duration && '持续：' + value.duration, value.cooldown && '冷却：' + value.cooldown, value.counter && '反制：' + value.counter].filter(Boolean).join('｜');
  }

  function configuredSkillLevels(value) {
    var output = blankSkills();
    Object.keys(value || {}).forEach(function (id) { output[id] = value[id] === 'expert' ? 2 : value[id] === 'trained' ? 1 : integer(value[id],0,2,0); });
    return output;
  }

  function mergeQuickBuild(base, configured) {
    if (!configured || typeof configured !== 'object') return base;
    var output = deepClone(base);
    output.name = configured.name || output.name;
    output.origin = configured.realIdentity || configured.legendCore || configured.origin || output.origin;
    output.identity = configured.realIdentity || configured.identity || configured.legendCore || output.identity;
    output.wish = configured.wishMotivation || configured.wish || output.wish;
    output.boundary = configured.boundaryFear || configured.neverAccepts || configured.boundary || output.boundary;
    if (configured.attributes) output.attributes = Object.assign(blankAttributes(), configured.attributes);
    if (configured.skills) output.skills = configuredSkillLevels(configured.skills);
    if (base.identityType === 'mortal') {
      var advantage = (config.realAdvantages || []).find(function (item) { return item.id === configured.realAdvantageId; });
      output.ordinary.backgroundId = configured.backgroundId || output.ordinary.backgroundId;
      output.ordinary.realAdvantage = advantage ? advantage.label : configured.realAdvantageId || output.ordinary.realAdvantage;
      output.ordinary.contacts = Array.isArray(configured.contacts) ? configured.contacts.slice(0,2) : output.ordinary.contacts;
      output.ordinary.equipment = Array.isArray(configured.equipment) ? configured.equipment.join('；') : configured.equipment || output.ordinary.equipment;
      output.ordinary.safePlace = configured.safePlace || output.ordinary.safePlace;
      output.ordinary.signatureTalent = configured.signatureTalent ? abilityCardText(configured.signatureTalent) : output.ordinary.signatureTalent;
    }
    if (base.identityType === 'magus') {
      output.magus.lineages = Array.isArray(configured.lineages) ? configured.lineages.slice(0,2) : output.magus.lineages;
      output.magus.spellIds = Array.isArray(configured.spellIds) ? configured.spellIds.slice(0,4) : output.magus.spellIds;
      output.magus.mysticCodeId = configured.mysticCodeId || output.magus.mysticCodeId;
      output.magus.limitation = configured.mediumRestriction || configured.limitation || output.magus.limitation;
    }
    if (base.identityType === 'servant') {
      output.servant.publicTitle = configured.publicName || configured.publicTitle || output.servant.publicTitle;
      output.servant.trueName = configured.trueName || output.servant.trueName;
      output.servant.classId = configured.classId || output.servant.classId;
      output.servant.legendCore = configured.legendCore || output.servant.legendCore;
      output.servant.weaknesses = Array.isArray(configured.conceptWeaknesses) ? configured.conceptWeaknesses.slice(0,3) : output.servant.weaknesses;
      output.servant.refusedCommand = configured.neverAccepts || output.servant.refusedCommand;
      output.servant.luck = configured.luckRank || output.servant.luck;
      if (Array.isArray(configured.retainedSkills)) output.servant.retainedSkills = configured.retainedSkills.slice(0,3).map(function (item) { return { name:item.name || '', rank:item.rank || 'C', effect:abilityCardText(item) }; });
      if (configured.noblePhantasm) {
        var noble = configured.noblePhantasm;
        output.servant.noblePhantasm = { name:[noble.name,noble.trueNameRelease].filter(Boolean).join('／'), rank:noble.rank || 'C', type:noble.type || '对人', cost:noble.cost || '5 MP', effect:abilityCardText(noble), counter:noble.counter || '' };
      }
    }
    return output;
  }

  function applyMasterQuickBuild(output) {
    output.master = {
      servantName:'待命名契约从者／公开称谓',
      supplyLevel:'stable',
      communicationDistance:'同一场景内可直接通信；同城可感知大致方向',
      source:'双方在召唤仪式中自愿缔结契约',
      termination:'任一方明确提出解除，或契约媒介被彻底破坏',
      masterRefusal:'绝不命令从者主动伤害无辜者',
      servantRefusal:'拒绝把平民或盟友当作一次性消耗品的命令',
      commandSeals:3
    };
    return output;
  }

  function applyQuickBuild() {
    var type = identityType();
    var output = mergeQuickBuild(fallbackQuickBuild(type), config.quickBuilds && config.quickBuilds[type]);
    output.identityType = type;
    output.isMaster = type !== 'servant' && document.getElementById('character-is-master').checked;
    if (output.isMaster) applyMasterQuickBuild(output);
    fillCharacterForm(normalizeCharacter(output));
    goBuilderStep(5, true);
    renderBuilderReview();
    showSync('v2.0 合法底稿已生成；可直接保存，也可以返回任一步修改');
  }

  function builderStepError(step) {
    var value = collectCharacter(false);
    if (step === 0 && ['mortal','magus','servant'].indexOf(value.identityType) === -1) return '请选择普通人、魔术师或从者。';
    if (step === 1) return identityStatus(value).errors[0] || '';
    if (step === 2) return attributeStatus(value).errors[0] || '';
    if (step === 3) return skillStatus(value).errors[0] || '';
    if (step === 4) return resourceStatus(value).errors[0] || '';
    return '';
  }

  function firstIncompleteStep() {
    for (var step = 0; step < 5; step += 1) if (builderStepError(step)) return step;
    return 5;
  }

  function updateBuilderCompletion() {
    if (!document.getElementById('character-existence')) return;
    var completed = 1;
    try {
      var value = collectCharacter(false);
      if (identityStatus(value).valid) completed += 1;
      if (attributeStatus(value).valid) completed += 1;
      if (skillStatus(value).valid) completed += 1;
      if (resourceStatus(value).valid) completed += 1;
      if (validation(value).errors.length === 0) completed += 1;
    } catch (error) {}
    document.getElementById('builder-completion').textContent = '已完成 ' + Math.round(completed / 6 * 100) + '%';
  }

  function resourceSummary(value) {
    if (value.identityType === 'mortal') {
      var background = backgroundById(value.ordinary.backgroundId);
      return '<h5>现实资源</h5><dl><div><dt>背景</dt><dd>' + escapeHtml(background && (background.label || background.name) || value.ordinary.backgroundId) + '</dd></div><div><dt>现实优势</dt><dd>' + escapeHtml(value.ordinary.realAdvantage) + '</dd></div><div><dt>标志才能</dt><dd>' + escapeHtml(value.ordinary.signatureTalent) + '</dd></div></dl>';
    }
    if (value.identityType === 'magus') {
      return '<h5>魔术资源</h5><dl><div><dt>系谱</dt><dd>' + escapeHtml(value.magus.lineages.map(function (id) { var lineage = (config.spellLineages || []).find(function (item) { return item.id === id; }); return lineage && (lineage.label || lineage.name) || id; }).join('、')) + '</dd></div><div><dt>术式</dt><dd>' + escapeHtml(value.magus.spellIds.map(function (id) { var spell = spellById(id); return spell && spell.name || id; }).join('、')) + '</dd></div><div><dt>明确限制</dt><dd>' + escapeHtml(value.magus.limitation) + '</dd></div></dl>';
    }
    return '<h5>英灵资源</h5><dl><div><dt>职阶／幸运</dt><dd>' + escapeHtml((classTemplate(value.servant.classId) || {}).label || value.servant.classId) + '／' + escapeHtml(value.servant.luck) + '</dd></div><div><dt>保有技能</dt><dd>' + escapeHtml(value.servant.retainedSkills.map(function (item) { return item.name + ' ' + item.rank; }).join('、')) + '</dd></div><div><dt>宝具</dt><dd>' + escapeHtml(value.servant.noblePhantasm.name + ' ' + value.servant.noblePhantasm.rank) + '</dd></div></dl>';
  }

  function renderBuilderReview() {
    syncDerivedCurrentFields();
    var value = collectCharacter(false);
    var derived = derivedValues(value);
    var attributeChips = attributes.map(function (item) { var number = value.attributes[item.id]; return '<span><b>' + escapeHtml(item.label) + '</b> ' + FATE_RANKS[number] + '／' + number + '</span>'; }).join('');
    var trained = skills.filter(function (item) { return value.skills[item.id] > 0; }).map(function (item) { return '<span><b>' + escapeHtml(item.label) + '</b> +' + skillBonus(value.skills[item.id]) + '</span>'; }).join('');
    document.getElementById('builder-review').innerHTML = [
      '<article class="review-identity"><p>RULESET v2.0</p><h5>', escapeHtml(value.name || '未命名角色'), '</h5><strong>', escapeHtml(identityRule(value.identityType).label + (value.isMaster ? '／御主' : '')), '</strong><small>', escapeHtml(value.origin), '</small><blockquote>', escapeHtml(value.identity), '</blockquote></article>',
      '<article><h5>属性与派生</h5><div class="review-chips">', attributeChips, '</div><div class="review-stat-table"><span>生命 <b>', derived.maxHp, '</b></span><span>MP <b>', derived.maxMp || '—', '</b></span><span>回避 <b>', derived.evasion, '</b></span><span>坚韧 <b>', derived.fortitude, '</b></span><span>精神 <b>', derived.spirit, '</b></span><span>察觉 <b>', derived.awareness, '</b></span></div><h5>通用技能</h5><div class="review-chips specialties">', trained || '<span>暂无训练技能</span>', '</div></article>',
      '<article>', resourceSummary(value), '</article>'
    ].join('');
    var report = validation(value);
    var masterReport = masterStatus(value);
    var checks = [
      { severity:report.identity.valid ? 'ready' : 'missing', label:'人物概念', detail:report.identity.errors[0] || '姓名、概念、愿望与底线完整' },
      { severity:report.attribute.errors.length ? 'missing' : report.attribute.warnings.length ? 'warning' : 'ready', label:'七项属性', detail:report.attribute.errors[0] || report.attribute.warnings[0] || '预算与上限通过' },
      { severity:report.skill.errors.length ? 'missing' : report.skill.warnings.length ? 'warning' : 'ready', label:'通用技能', detail:report.skill.errors[0] || report.skill.warnings[0] || '预算与专家数通过' },
      { severity:report.resource.errors.length ? 'missing' : report.resource.warnings.length ? 'warning' : 'ready', label:'身份资源', detail:report.resource.errors[0] || report.resource.warnings[0] || '专属资源通过' },
      { severity:masterReport.errors.length ? 'missing' : 'ready', label:'御主模块', detail:masterReport.errors[0] || (value.isMaster ? '契约字段完整 · 独立令咒 ' + value.master.commandSeals + ' / 3' : '未附加；符合基础身份规则') },
      { severity:report.errors.length ? 'missing' : report.warnings.length ? 'warning' : 'ready', label:'最终结果', detail:report.errors[0] || report.warnings[0] || '角色卡合法，可保存并提交' }
    ];
    document.getElementById('builder-checklist').innerHTML = checks.map(function (check) { var icon = check.severity === 'ready' ? '✓' : check.severity === 'warning' ? '?' : '!'; return '<div class="' + check.severity + '"><span>' + icon + '</span><strong>' + escapeHtml(check.label) + '</strong><small>' + escapeHtml(check.detail) + '</small></div>'; }).join('');
    var valid = report.errors.length === 0;
    document.querySelector('#player-character-form [type="submit"]').disabled = !valid;
    document.getElementById('player-submit-character').disabled = !valid;
  }

  function goBuilderStep(target, skipValidation) {
    target = Math.max(0, Math.min(5, Number(target)));
    if (!skipValidation && target > builderStep) {
      var error = builderStepError(builderStep);
      if (error) { showBuilderError(error); return false; }
    }
    clearBuilderError();
    builderStep = target;
    Array.prototype.forEach.call(document.querySelectorAll('[data-builder-panel]'), function (panel) { panel.classList.toggle('active', Number(panel.getAttribute('data-builder-panel')) === builderStep); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-builder-step]'), function (button) {
      var step = Number(button.getAttribute('data-builder-step'));
      button.classList.toggle('active', step === builderStep);
      button.classList.toggle('complete', step < builderStep && !builderStepError(step));
      button.setAttribute('aria-current', step === builderStep ? 'step' : 'false');
    });
    var nextLabels = ['下一步：人物概念 →','下一步：七项属性 →','下一步：通用技能 →','下一步：身份资源 →','下一步：合法性终检 →','已经到最后一步'];
    document.getElementById('builder-back').disabled = builderStep === 0;
    document.getElementById('builder-next').hidden = builderStep === 5;
    document.getElementById('builder-next').textContent = nextLabels[builderStep];
    document.getElementById('builder-step-label').textContent = '第 ' + (builderStep + 1) + ' 步，共 6 步';
    if (builderStep === 2) renderAttributes();
    if (builderStep === 3) renderSkills();
    if (builderStep === 4) updateResourcePanels();
    if (builderStep === 5) renderBuilderReview();
    var editor = document.querySelector('.character-editor');
    if (editor && editor.getBoundingClientRect().top < 0) editor.scrollIntoView({ behavior:'smooth', block:'start' });
    return true;
  }

  function updateCheckOptions() {
    var current = character || collectCharacter(false);
    document.getElementById('player-check-specialty').innerHTML = '<option value="">不加入通用技能（+0）</option>' + skills.map(function (item) { var bonus = skillBonus(current.skills[item.id]); return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.label) + '（+' + bonus + '）</option>'; }).join('');
  }

  function bindBuilderEvents() {
    document.getElementById('archetype-grid').addEventListener('click', function (event) { var button = event.target.closest('[data-archetype]'); if (button) selectArchetype(button.getAttribute('data-archetype'), true); });
    document.getElementById('builder-quickstart').addEventListener('click', applyQuickBuild);
    document.getElementById('character-is-master').addEventListener('change', function () { updateResourcePanels(); updateBuilderCompletion(); });
    document.getElementById('attribute-presets').addEventListener('click', function (event) { var button = event.target.closest('[data-attribute-preset]'); if (button) applyAttributePreset(button.getAttribute('data-attribute-preset')); });
    document.getElementById('attribute-grid').addEventListener('click', function (event) { var button = event.target.closest('[data-attribute-delta]'); if (!button) return; var id = button.getAttribute('data-attribute-id'); var rule = identityRule(identityType()); attributeValues[id] = integer(Number(attributeValues[id] || 0) + Number(button.getAttribute('data-attribute-delta')),0,rule.attributeCap,0); activeAttributePreset = ''; renderAttributes(); });
    document.getElementById('attribute-grid').addEventListener('change', function (event) { var input = event.target.closest('[data-attribute-input]'); if (!input) return; var id = input.getAttribute('data-attribute-input'); attributeValues[id] = integer(input.value,0,identityRule(identityType()).attributeCap,0); activeAttributePreset = ''; renderAttributes(); });
    document.getElementById('reset-attributes').addEventListener('click', function () { attributeValues = blankAttributes(); activeAttributePreset = ''; renderAttributes(); });
    document.getElementById('skill-grid').addEventListener('change', function (event) { var select = event.target.closest('[data-skill-level]'); if (!select) return; skillLevels[select.getAttribute('data-skill-level')] = integer(select.value,0,2,0); renderSkills(); });
    document.getElementById('apply-skill-preset').addEventListener('click', applySkillPreset);
    document.getElementById('clear-skills').addEventListener('click', function () { skillLevels = blankSkills(); renderSkills(); });
    document.getElementById('lineage-grid').addEventListener('click', function (event) { var button = event.target.closest('[data-lineage]'); if (!button) return; var id = button.getAttribute('data-lineage'); var index = selectedLineages.indexOf(id); if (index !== -1) selectedLineages.splice(index,1); else if (selectedLineages.length < 2) selectedLineages.push(id); else { showBuilderError('只能选择两个魔术系谱；先取消一个再选择。'); return; } clearBuilderError(); renderLineages(); renderSpellCatalog(); });
    document.getElementById('spell-catalog').addEventListener('click', function (event) { var button = event.target.closest('[data-spell]'); if (!button) return; var id = button.getAttribute('data-spell'); var index = selectedSpells.indexOf(id); if (index !== -1) selectedSpells.splice(index,1); else if (selectedSpells.length < 4) selectedSpells.push(id); else { showBuilderError('起始术式必须正好四项；先移除一项。'); return; } clearBuilderError(); renderSpellCatalog(); });
    document.getElementById('selected-spells').addEventListener('click', function (event) { var button = event.target.closest('[data-remove-spell]'); if (!button) return; selectedSpells = selectedSpells.filter(function (id) { return id !== button.getAttribute('data-remove-spell'); }); renderSpellCatalog(); });
    document.getElementById('spell-lineage-filter').addEventListener('change', renderSpellCatalog);
    document.getElementById('clear-spells').addEventListener('click', function () { selectedSpells = []; renderSpellCatalog(); });
    document.getElementById('character-mystic-code').addEventListener('change', function () { renderMysticCodeWarning(); updateBuilderCompletion(); });
    document.getElementById('character-background').addEventListener('change', function () { applyBackgroundSuggestion(); updateBuilderCompletion(); });
    document.getElementById('character-class').addEventListener('change', renderClassUi);
    document.getElementById('character-luck').addEventListener('change', renderNobleAndRetainedStatus);
    document.getElementById('character-noble-rank').addEventListener('change', renderNobleAndRetainedStatus);
    document.getElementById('retained-skill-list').addEventListener('input', renderNobleAndRetainedStatus);
    document.getElementById('character-current-hp').addEventListener('input', function (event) { currentHpDirty = event.target.value !== ''; });
    document.getElementById('character-current-mp').addEventListener('input', function (event) { currentMpDirty = event.target.value !== ''; });
    document.getElementById('character-current-hp').addEventListener('change', function () { if (!currentHpDirty) syncDerivedCurrentFields(); });
    document.getElementById('character-current-mp').addEventListener('change', function () { if (!currentMpDirty) syncDerivedCurrentFields(); });
    document.getElementById('player-character-form').addEventListener('click', function (event) { var suggestion = event.target.closest('[data-fill-target]'); if (suggestion) { setField(suggestion.getAttribute('data-fill-target'), suggestion.getAttribute('data-fill-value')); clearBuilderError(); updateBuilderCompletion(); } });
    document.getElementById('builder-back').addEventListener('click', function () { goBuilderStep(builderStep - 1, true); });
    document.getElementById('builder-next').addEventListener('click', function () { goBuilderStep(builderStep + 1, false); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-builder-step]'), function (button) { button.addEventListener('click', function () { var target = Number(button.getAttribute('data-builder-step')); goBuilderStep(target, target < builderStep); }); });
    document.getElementById('player-character-form').addEventListener('input', updateBuilderCompletion);
  }

  function sendToKeeper(message) {
    message.protocol = MESSAGE_PROTOCOL;
    if (channel) { channel.postMessage(message); return true; }
    if (window.opener && !window.opener.closed) { window.opener.postMessage(message, window.location.origin); return true; }
    return false;
  }

  function normalizeResult(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = safeText(raw.id,80);
    var dice = Array.isArray(raw.dice) ? raw.dice.slice(0,2).map(function (value) { return integer(value,1,20,1); }) : [];
    if (!id || !dice.length) return null;
    return {
      id:id, requestId:safeText(raw.requestId,80), targetCharacterId:safeText(raw.targetCharacterId,80) || 'all', characterName:safeText(raw.characterName,80), total:integer(raw.total,-99,99,0), dc:integer(raw.dc,1,99,13),
      tier:['exceptional','success','costly','severe'].indexOf(raw.tier) !== -1 ? raw.tier : 'severe', tierLabel:safeText(raw.tierLabel,80), goal:safeText(raw.goal,500), risk:safeText(raw.risk,500), publicNote:safeText(raw.publicNote,800), costOwner:safeText(raw.costOwner,80),
      attributeLabel:safeText(raw.attributeLabel || raw.approachLabel,40), attributeValue:integer(firstDefined(raw.attributeValue,raw.approachValue),0,5,0), skillLabel:safeText(raw.skillLabel || raw.specialty,80), skillBonus:integer(firstDefined(raw.skillBonus,raw.specialtyBonus),0,4,0),
      assist:integer(raw.assist,0,20,0), modifier:integer(raw.modifier,-20,20,0), mode:['normal','advantage','disadvantage'].indexOf(raw.mode) !== -1 ? raw.mode : 'normal', dice:dice, kept:integer(raw.kept,1,20,dice[0]), createdAt:safeText(raw.createdAt,40)
    };
  }

  function renderResults() {
    var list = document.getElementById('player-result-list');
    list.innerHTML = results.length ? results.map(function (result) {
      var time = result.createdAt ? new Date(result.createdAt).toLocaleTimeString('zh-CN',{ hour:'2-digit',minute:'2-digit' }) : '';
      var modeLabel = result.mode === 'advantage' ? '优势' : result.mode === 'disadvantage' ? '劣势' : '正常';
      var formula = result.dice.join(' / ') + '（' + modeLabel + '取 ' + result.kept + '）＋' + (result.attributeLabel || '属性') + ' ' + result.attributeValue + (result.skillLabel ? '＋' + result.skillLabel + ' ' + result.skillBonus : '') + '＋协助 ' + result.assist + '＋修正 ' + result.modifier;
      return '<li class="player-result-item"><div class="player-result-tier ' + result.tier + '"><strong>' + result.total + '</strong><span>' + escapeHtml(result.tierLabel) + '</span></div><div class="player-result-copy"><h4>' + escapeHtml(result.goal || '公开判定') + '</h4><span>' + escapeHtml(result.characterName || '公开判定') + ' · DC ' + result.dc + '</span><p>' + escapeHtml(formula) + '</p>' + (result.risk ? '<p>已公开风险：' + escapeHtml(result.risk) + '</p>' : '') + (result.publicNote ? '<p>现场结果：' + escapeHtml(result.publicNote) + '</p>' : '') + (result.costOwner ? '<p>代价选择者：' + escapeHtml(result.costOwner) + '</p>' : '') + '</div><time class="player-result-time">' + time + '</time></li>';
    }).join('') : '<li class="player-result-empty">尚未收到守秘人的判定结果。</li>';
  }

  function rememberResults() { try { localStorage.setItem(RESULTS_KEY, JSON.stringify(results)); } catch (error) {} }

  function handleMessage(message) {
    if (!message || typeof message !== 'object') return;
    if (message.protocol && message.protocol !== MESSAGE_PROTOCOL) return;
    if (message.type === 'show' && message.handout) showHandout(message.handout);
    if (message.type === 'curtain') showCurtain();
    if (message.type === 'retract' && String(message.handoutId || '').toUpperCase() === currentHandoutId) showCurtain();
    if (message.type === 'character-ack' && character && message.characterId === character.id && (!pendingSubmissionId || message.submissionId === pendingSubmissionId)) { showSync(message.accepted ? '守秘人已确认 v2.0 角色卡' : '守秘人未接收这份角色卡'); if (message.submissionId === pendingSubmissionId) pendingSubmissionId = null; }
    if (message.type === 'check-ack' && character && message.characterId === character.id) showSync('守秘人已收到判定申请');
    if (message.type === 'check-result') { var result = normalizeResult(message.result); if (result && (result.targetCharacterId === 'all' || character && result.targetCharacterId === character.id) && !results.some(function (item) { return item.id === result.id; })) { results.unshift(result); results = results.slice(0,50); rememberResults(); renderResults(); showSync('已收到判定结果：' + result.tierLabel); } }
  }

  initializeStaticUi();
  character = readStoredCharacter();
  fillCharacterForm(character);
  bindBuilderEvents();
  goBuilderStep(0, true);
  try { results = JSON.parse(localStorage.getItem(RESULTS_KEY) || '[]').map(normalizeResult).filter(Boolean); } catch (error) { results = []; }
  renderResults();

  document.getElementById('player-character-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var next = collectCharacter();
    var missing = firstIncompleteStep();
    var report = validation(next);
    if (missing !== 5 || report.errors.length) { goBuilderStep(missing,true); showBuilderError(builderStepError(missing) || report.errors[0] || '角色卡还有未完成项目。'); showSync('请先修正 v2.0 合法性检查中的红色项目'); return; }
    saveCharacter(next);
    renderBuilderReview();
    showSync('v2.0 角色卡已生成并保存在本机；现在可以提交给守秘人');
  });
  document.getElementById('player-submit-character').addEventListener('click', function () {
    var next = collectCharacter();
    var missing = firstIncompleteStep();
    var report = validation(next);
    if (missing !== 5 || report.errors.length) { goBuilderStep(missing,true); showBuilderError(builderStepError(missing) || report.errors[0] || '角色卡还有未完成项目。'); showSync('提交前请完成全部六步'); return; }
    saveCharacter(next);
    pendingSubmissionId = makeId('submission');
    showSync(sendToKeeper({ type:'character-submit',submissionId:pendingSubmissionId,sentAt:new Date().toISOString(),character:next }) ? 'v2.0 角色已发送；守秘人页面打开时会收到确认' : '未找到同源本机守秘人标签页；可导出 JSON 交付');
  });
  document.getElementById('player-export-character').addEventListener('click', function () {
    var next = collectCharacter();
    var missing = firstIncompleteStep();
    var report = validation(next);
    if (missing !== 5 || report.errors.length) {
      goBuilderStep(missing === 5 ? 5 : missing,true);
      showBuilderError(builderStepError(missing) || report.errors[0] || '角色卡还有未完成项目。');
      showSync('导出前请先通过 v2.0 合法性终检；本次没有保存或下载');
      return;
    }
    saveCharacter(next);
    downloadJson('零之圣杯-v2.0-角色-' + (next.name || '未命名') + '.json', next);
  });
  document.getElementById('player-import-character').addEventListener('click', function () { document.getElementById('player-character-file').click(); });
  document.getElementById('player-character-file').addEventListener('change', function (event) {
    var file = event.target.files[0];
    if (!file) return;
    if (file.size > 524288) { showSync('角色 JSON 过大，上限 512 KB'); event.target.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (parsed.protocol !== CHARACTER_PROTOCOL || parsed.rulesetId !== RULESET_ID) throw new Error('protocol');
        var imported = normalizeCharacter(parsed);
        fillCharacterForm(imported);
        goBuilderStep(5,true);
        var reviewed = collectCharacter(false);
        var report = validation(reviewed);
        if (report.errors.length) {
          showBuilderError(report.errors[0]);
          showSync('角色 JSON 已载入终检，但存在不合法项目；修正前不会保存到本机');
          return;
        }
        saveCharacter(reviewed);
        renderBuilderReview();
        showSync('v2.0 角色 JSON 已导入、通过终检并保存在本机');
      } catch (error) { showSync('角色 JSON 无效，或不是当前 v2.0 车卡协议'); }
    };
    reader.readAsText(file);
    event.target.value = '';
  });
  document.getElementById('player-check-request-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var next = collectCharacter();
    if (!next.name || validation(next).errors.length) { showSync('请先生成并保存合法的 v2.0 角色卡'); return; }
    saveCharacter(next);
    var attributeId = fieldValue('player-check-approach');
    var skillId = fieldValue('player-check-specialty');
    var attribute = byId(attributes, attributeId) || { id:attributeId,label:attributeId };
    var skill = byId(skills, skillId);
    var bonus = skill ? skillBonus(next.skills[skill.id]) : 0;
    var request = {
      id:makeId('request'), protocol:config.checkProtocol || 'null-grail-check-v2', rulesetId:RULESET_ID, characterId:next.id, characterName:next.name,
      attributeId:attributeId, attributeLabel:attribute.label, attributeValue:next.attributes[attributeId], skillId:skillId, skillLabel:skill && skill.label || '', skillBonus:bonus,
      approachId:attributeId, approachValue:next.attributes[attributeId], specialty:skill && skill.label || '', specialtyBonus:bonus,
      mode:fieldValue('player-check-mode'), assist:fieldValue('player-check-assist'), modifier:fieldValue('player-check-modifier'), suggestedDc:fieldValue('player-check-dc'), goal:fieldValue('player-check-goal'), risk:fieldValue('player-check-risk'), createdAt:new Date().toISOString()
    };
    showSync(sendToKeeper({ type:'check-request',request:request }) ? '判定申请已发送；等待守秘人公开风险并掷骰' : '未找到同源本机守秘人标签页');
  });
  document.getElementById('player-clear-results').addEventListener('click', function () { results = []; rememberResults(); renderResults(); });

  try { channel = new BroadcastChannel(CHANNEL_NAME); channel.onmessage = function (event) { handleMessage(event.data); }; channel.postMessage({ protocol:MESSAGE_PROTOCOL,type:'ready',mode:mode || 'player',characterId:character && character.id }); } catch (error) { channel = null; }
  window.addEventListener('message', function (event) { if (event.origin === window.location.origin) handleMessage(event.data); });
  try { var restored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || sessionStorage.getItem('ng-player-current-handout:v3') || 'null'); if (!showHandout(restored)) showCurtain(); } catch (error) { showCurtain(); }
  if (mode === 'projection') document.body.classList.add('projection-mode');
  else if (mode === 'builder') { document.body.classList.add('builder-mode'); document.getElementById('projection-note').hidden = true; document.title = '零之圣杯 v2.0 · 傻瓜车卡'; }
  else document.getElementById('projection-note').hidden = true;
  document.getElementById('fullscreen-button').addEventListener('click', function () { if (!document.fullscreenElement) { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); } else if (document.exitFullscreen) document.exitFullscreen(); });
}());
