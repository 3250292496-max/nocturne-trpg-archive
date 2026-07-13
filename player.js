(function () {
  'use strict';

  var config = window.NG_PLAYER_DATA || {};
  var CHANNEL_NAME = config.channelName || 'null-grail-player';
  var MESSAGE_PROTOCOL = config.protocol || 'null-grail-player-v3';
  var SESSION_KEY = 'ng-player-current-handout:v3';
  var CHARACTER_KEY = 'ng-player-character:v2';
  var RESULTS_KEY = 'ng-player-check-results:v1';
  var channel = null;
  var currentHandoutId = null;
  var curtain = document.getElementById('curtain');
  var view = document.getElementById('handout-view');
  var mode = new URLSearchParams(location.search).get('mode');
  var character = null;
  var results = [];
  var pendingSubmissionId = null;
  var builderStep = 0;
  var approachRanking = [];
  var rankingDraft = [];
  var rankingCustom = false;
  var currentPresetId = '';
  var specialtySelections = [];
  var approachScores = [3, 2, 2, 1, 0];

  function safeText(value, maximum) { return (typeof value === 'string' ? value : '').slice(0, maximum); }
  function clamp(value, minimum, maximum, fallback) { var number = Number(value); return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback; }
  function makeId(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

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
    var item = normalizePayload(rawPayload); if (!item) return false;
    currentHandoutId = item.id;
    document.getElementById('handout-image').src = item.image;
    document.getElementById('handout-image').alt = item.title + '完整视觉手卡';
    document.getElementById('handout-id').textContent = 'PLAYER SAFE · ' + item.id + (item.day ? ' · ' + item.day : '');
    document.getElementById('handout-title').textContent = item.title;
    document.getElementById('handout-source').textContent = item.source || 'PLAYER SAFE 资料';
    document.getElementById('handout-body').textContent = item.body;
    var factsSection = document.getElementById('handout-facts-section'); var facts = document.getElementById('handout-facts'); facts.textContent = '';
    item.playerFacts.forEach(function (fact) { var row = document.createElement('li'); row.textContent = fact; facts.appendChild(row); });
    factsSection.hidden = item.playerFacts.length === 0;
    document.getElementById('handout-facts-label').textContent = item.factLabel || '资料要点';
    var promptSection = document.getElementById('handout-prompt-section'); document.getElementById('handout-prompt').textContent = item.playerPrompt; promptSection.hidden = !item.playerPrompt;
    curtain.hidden = true; view.hidden = false; document.title = item.title + ' · 零之圣杯'; rememberHandout(item); return true;
  }

  function showCurtain() { currentHandoutId = null; view.hidden = true; curtain.hidden = false; document.title = '零之圣杯 · PLAYER SAFE'; forgetHandout(); }

  function blankCharacter() {
    var base = config.blankCharacter || {};
    return { protocol:config.characterProtocol || 'null-grail-character-v2', rulesetId:config.rulesetId || 'null-grail-v3.2-light-d20', id:makeId('character'), name:'', playerName:'', pronouns:'', origin:'', identity:'', wish:'', fearedIdentity:'', anchor:'', existenceType:'present', approaches:Object.assign({ physique:3, insight:2, lore:2, rapport:1, will:0 }, base.approaches || {}), specialties:[], resolve:3, stress:0, injury:'none', trauma:[], coreLoad:0, noblePhantasmReady:true, notes:'' };
  }

  function normalizeCharacter(raw) {
    if (!raw || typeof raw !== 'object') return blankCharacter();
    if (raw.rulesetId && raw.rulesetId !== config.rulesetId) throw new Error('ruleset');
    var normalized = blankCharacter();
    normalized.id = safeText(raw.id,80); if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(normalized.id))normalized.id=makeId('character'); normalized.name = safeText(raw.name,80).trim(); normalized.playerName = safeText(raw.playerName,80).trim(); normalized.pronouns = safeText(raw.pronouns,80).trim(); normalized.origin = safeText(raw.origin,120).trim();
    normalized.identity = safeText(raw.identity,400); normalized.wish = safeText(raw.wish,600); normalized.fearedIdentity = safeText(raw.fearedIdentity,400); normalized.anchor = safeText(raw.anchor,400);
    normalized.existenceType = ['present','master','servant'].indexOf(raw.existenceType) !== -1 ? raw.existenceType : 'present';
    (config.approaches || []).forEach(function (item) { normalized.approaches[item.id] = clamp(raw.approaches && raw.approaches[item.id],0,3,0); });
    normalized.specialties = Array.isArray(raw.specialties) ? raw.specialties.map(function (item) { return safeText(item,80).trim(); }).filter(Boolean).slice(0,3) : [];
    normalized.resolve = clamp(raw.resolve,0,3,3); normalized.stress = clamp(raw.stress,0,3,0); normalized.injury = ['none','light','serious','critical'].indexOf(raw.injury) !== -1 ? raw.injury : 'none';
    normalized.trauma = Array.isArray(raw.trauma) ? raw.trauma.map(function (item) { return safeText(item,200).trim(); }).filter(Boolean).slice(0,8) : [];
    normalized.coreLoad = clamp(raw.coreLoad,0,3,0); normalized.noblePhantasmReady = raw.noblePhantasmReady !== false; normalized.notes = safeText(raw.notes,1600); return normalized;
  }

  function readStoredCharacter() { try { return normalizeCharacter(JSON.parse(localStorage.getItem(CHARACTER_KEY) || 'null')); } catch (error) { return blankCharacter(); } }
  function saveCharacter(next) { character = normalizeCharacter(next); localStorage.setItem(CHARACTER_KEY, JSON.stringify(character)); document.getElementById('character-save-status').textContent = '已本地保存 ' + new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}); updateCheckOptions(); }

  function initializeApproaches() {
    document.getElementById('player-approach-inputs').innerHTML = (config.approaches || []).map(function (item) { return '<input type="hidden" data-approach="' + item.id + '" value="0">'; }).join('');
    document.getElementById('player-check-approach').innerHTML = (config.approaches || []).map(function (item) { return '<option value="' + item.id + '">' + item.label + '</option>'; }).join('');
    document.getElementById('player-check-dc').innerHTML = (config.difficulties || []).map(function (item) { return '<option value="' + item.value + '">' + item.label + '</option>'; }).join('');
    document.getElementById('approach-presets').innerHTML = (config.approachPresets || []).map(function (preset) {
      return '<button type="button" data-approach-preset="' + escapeHtml(preset.id) + '"><span>' + escapeHtml(preset.icon) + '</span><strong>' + escapeHtml(preset.label) + '</strong><small>' + escapeHtml(preset.help) + '</small></button>';
    }).join('');
    document.getElementById('specialty-option-grid').innerHTML = (config.specialtyOptions || []).map(function (option) {
      return '<button type="button" data-specialty="' + escapeHtml(option.label) + '"><strong>' + escapeHtml(option.label) + '</strong><small>' + escapeHtml(option.help) + '</small><span>＋</span></button>';
    }).join('');
    renderStorySuggestions();
  }

  function approachDefinition(id) {
    return (config.approaches || []).find(function (item) { return item.id === id; }) || { id:id, label:id, help:'' };
  }

  function normalizedRanking(ranking) {
    var ids = (config.approaches || []).map(function (item) { return item.id; });
    var clean = Array.isArray(ranking) ? ranking.filter(function (id, index) { return ids.indexOf(id) !== -1 && ranking.indexOf(id) === index; }) : [];
    return clean.concat(ids.filter(function (id) { return clean.indexOf(id) === -1; })).slice(0, ids.length);
  }

  function presetForRanking(ranking) {
    var key = normalizedRanking(ranking).join(',');
    return (config.approachPresets || []).find(function (preset) { return preset.ranking.join(',') === key; }) || null;
  }

  function applyApproachRanking(ranking, presetId) {
    approachRanking = normalizedRanking(ranking);
    rankingDraft = [];
    rankingCustom = false;
    currentPresetId = presetId || '';
    renderApproachRanking();
  }

  function renderApproachRanking() {
    approachRanking = normalizedRanking(approachRanking);
    var rankNames = ['最擅长', '很擅长', '很擅长', '普通', '最不擅长'];
    approachRanking.forEach(function (id, index) {
      var input = document.querySelector('[data-approach="' + id + '"]');
      if (input) input.value = String(approachScores[index]);
    });
    document.getElementById('approach-ranking').innerHTML = approachRanking.map(function (id, index) {
      var item = approachDefinition(id);
      var confirmed = !rankingCustom || rankingDraft.indexOf(id) !== -1;
      return '<button type="button" data-rank-approach="' + escapeHtml(id) + '" class="' + (confirmed ? 'ranked' : 'pending') + '"><span>' + (index + 1) + '</span><div><strong>' + escapeHtml(item.label) + ' <b>＋' + approachScores[index] + '</b></strong><small>' + escapeHtml(item.help) + '</small></div><i>' + (confirmed ? rankNames[index] : '待点击确认') + '</i></button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('[data-approach-preset]'), function (button) {
      button.classList.toggle('selected', button.getAttribute('data-approach-preset') === currentPresetId);
    });
    document.getElementById('approach-status').textContent = rankingCustom
      ? (rankingDraft.length === 5 ? '自定义排序已完成' : '已确认 ' + rankingDraft.length + ' / 5 · 继续依次点击')
      : '数值已自动正确分配';
    updateBuilderCompletion();
  }

  function chooseRankApproach(id) {
    if (!rankingCustom) {
      rankingCustom = true;
      rankingDraft = [];
      currentPresetId = '';
    }
    if (rankingDraft.indexOf(id) !== -1) return;
    rankingDraft.push(id);
    approachRanking = normalizedRanking(rankingDraft);
    renderApproachRanking();
  }

  function renderSpecialties() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-specialty]'), function (button) {
      var selected = specialtySelections.indexOf(button.getAttribute('data-specialty')) !== -1;
      button.classList.toggle('selected', selected);
      button.disabled = !selected && specialtySelections.length >= 3;
      button.querySelector('span').textContent = selected ? '✓' : '＋';
    });
    document.getElementById('specialty-count').textContent = specialtySelections.length + ' / 3';
    document.getElementById('selected-specialties').innerHTML = specialtySelections.length
      ? specialtySelections.map(function (item) { return '<button type="button" data-remove-specialty="' + escapeHtml(item) + '">' + escapeHtml(item) + '<span>×</span></button>'; }).join('')
      : '<p>还没有选择。上方任意点三项即可。</p>';
    Array.prototype.forEach.call(document.querySelectorAll('.character-specialty'), function (input, index) { input.value = specialtySelections[index] || ''; });
    updateBuilderCompletion();
  }

  function toggleSpecialty(value) {
    value = safeText(value, 80).trim();
    if (!value) return;
    var index = specialtySelections.indexOf(value);
    if (index !== -1) specialtySelections.splice(index, 1);
    else if (specialtySelections.length < 3) specialtySelections.push(value);
    else { showBuilderError('已经选满三项。先移除一项，再添加新的专长。'); return; }
    clearBuilderError();
    renderSpecialties();
  }

  function suggestionButtons(items, target) {
    return (items || []).map(function (value) { return '<button type="button" data-fill-target="' + escapeHtml(target) + '" data-fill-value="' + escapeHtml(value) + '">' + escapeHtml(value) + '</button>'; }).join('');
  }

  function renderStorySuggestions() {
    var groups = config.storySuggestions || {};
    var targets = { wish:'character-wish', fear:'character-feared-identity', anchor:'character-anchor' };
    Object.keys(targets).forEach(function (key) {
      var container = document.querySelector('[data-suggestion-group="' + key + '"]');
      if (container) container.innerHTML = suggestionButtons(groups[key], targets[key]);
    });
  }

  function renderArchetypeUi() {
    var value = document.getElementById('character-existence').value;
    Array.prototype.forEach.call(document.querySelectorAll('[data-archetype]'), function (button) {
      var selected = button.getAttribute('data-archetype') === value;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    var archetype = config.archetypes && config.archetypes[value] || {};
    document.getElementById('origin-suggestions').innerHTML = suggestionButtons(archetype.origins, 'character-origin');
    document.getElementById('identity-suggestions').innerHTML = suggestionButtons(archetype.identities, 'character-identity');
  }

  function selectArchetype(value, recommendApproach) {
    if (['present','master','servant'].indexOf(value) === -1) value = 'present';
    document.getElementById('character-existence').value = value;
    renderArchetypeUi();
    updateServantFields();
    if (recommendApproach) {
      var build = config.quickBuilds && config.quickBuilds[value];
      if (build && build.ranking) applyApproachRanking(build.ranking, '');
    }
    updateBuilderCompletion();
  }

  function fillCharacterForm(value) {
    character = normalizeCharacter(value);
    var fields = { 'character-name':'name','character-player-name':'playerName','character-pronouns':'pronouns','character-origin':'origin','character-identity':'identity','character-wish':'wish','character-feared-identity':'fearedIdentity','character-anchor':'anchor','character-existence':'existenceType','character-resolve':'resolve','character-stress':'stress','character-injury':'injury','character-core-load':'coreLoad','character-notes':'notes' };
    Object.keys(fields).forEach(function (id) { document.getElementById(id).value = character[fields[id]]; });
    document.getElementById('character-noble-ready').value = character.noblePhantasmReady ? 'ready' : 'used';
    document.getElementById('character-trauma').value = character.trauma.join('\n');
    var approachIds = (config.approaches || []).map(function (item) { return item.id; });
    var ranking = approachIds.slice().sort(function (a, b) { return character.approaches[b] - character.approaches[a] || approachIds.indexOf(a) - approachIds.indexOf(b); });
    var matchedPreset = presetForRanking(ranking);
    applyApproachRanking(ranking, matchedPreset ? matchedPreset.id : '');
    specialtySelections = character.specialties.slice(0, 3);
    renderSpecialties();
    renderArchetypeUi(); updateServantFields(); updateCheckOptions(); updateBuilderCompletion();
  }

  function collectCharacter() {
    var raw = Object.assign({}, character || blankCharacter());
    var fields = { 'character-name':'name','character-player-name':'playerName','character-pronouns':'pronouns','character-origin':'origin','character-identity':'identity','character-wish':'wish','character-feared-identity':'fearedIdentity','character-anchor':'anchor','character-existence':'existenceType','character-resolve':'resolve','character-stress':'stress','character-injury':'injury','character-core-load':'coreLoad','character-notes':'notes' };
    Object.keys(fields).forEach(function (id) { raw[fields[id]] = document.getElementById(id).value; });
    raw.noblePhantasmReady = document.getElementById('character-noble-ready').value === 'ready'; raw.trauma = document.getElementById('character-trauma').value.split(/\r?\n/);
    raw.approaches = {}; document.querySelectorAll('[data-approach]').forEach(function (input) { raw.approaches[input.getAttribute('data-approach')] = input.value; });
    raw.specialties = specialtySelections.slice(0, 3); raw.updatedAt = new Date().toISOString(); return normalizeCharacter(raw);
  }

  function validBuild(value) { return Object.keys(value.approaches).map(function (key) { return value.approaches[key]; }).sort().join(',') === '0,1,2,2,3' && value.specialties.length === 3 && new Set(value.specialties).size === 3; }
  function updateServantFields() { var servant = document.getElementById('character-existence').value === 'servant'; document.getElementById('character-core-load-field').hidden = !servant; document.getElementById('character-noble-field').hidden = !servant; }
  function updateCheckOptions() { var select = document.getElementById('player-check-specialty'); select.innerHTML = '<option value="">不使用专长</option>' + (character && character.specialties || []).map(function (item) { return '<option value="' + item.replace(/&/g,'&amp;').replace(/"/g,'&quot;') + '">' + item.replace(/</g,'&lt;') + '（＋2）</option>'; }).join(''); }

  function builderStepError(step) {
    if (step === 1) {
      if (!document.getElementById('character-name').value.trim()) return '请填写角色名；不知道叫什么时，可以先保留一键底稿生成的代称。';
      if (!document.getElementById('character-origin').value.trim()) return '请选择或填写角色从哪里来。';
      if (!document.getElementById('character-identity').value.trim()) return '请用一句话说明角色是谁；点击下方任意建议也可以。';
    }
    if (step === 2) {
      if (!document.getElementById('character-wish').value.trim()) return '请选择或填写一个未竟愿望。';
      if (!document.getElementById('character-feared-identity').value.trim()) return '请选择或填写最害怕成为的身份。';
      if (!document.getElementById('character-anchor').value.trim()) return '请选择或填写一个个人锚点。';
    }
    if (step === 3 && !validBuild(Object.assign(collectCharacter(), { specialties:['一','二','三'] }))) return '行动方式还没有形成正确分配，请选择一个模板或完成五项排序。';
    if (step === 4 && specialtySelections.length !== 3) return '请正好选择三项专长；还差 ' + (3 - specialtySelections.length) + ' 项。';
    return '';
  }

  function firstIncompleteStep() {
    for (var step = 1; step <= 4; step += 1) if (builderStepError(step)) return step;
    return 5;
  }

  function showBuilderError(value) { var element = document.getElementById('builder-error'); element.textContent = value; element.hidden = !value; }
  function clearBuilderError() { showBuilderError(''); }

  function updateBuilderCompletion() {
    var ready = [
      Boolean(document.getElementById('character-existence').value),
      Boolean(document.getElementById('character-name').value.trim()),
      Boolean(document.getElementById('character-origin').value.trim()),
      Boolean(document.getElementById('character-identity').value.trim()),
      Boolean(document.getElementById('character-wish').value.trim()),
      Boolean(document.getElementById('character-feared-identity').value.trim()),
      Boolean(document.getElementById('character-anchor').value.trim()),
      approachRanking.length === 5,
      specialtySelections.length === 3
    ];
    var percent = Math.round(ready.filter(Boolean).length / ready.length * 100);
    document.getElementById('builder-completion').textContent = '已完成 ' + percent + '%';
  }

  function renderBuilderReview() {
    var value = collectCharacter();
    var archetype = config.archetypes && config.archetypes[value.existenceType] || {};
    var approaches = approachRanking.map(function (id, index) { return '<span><b>' + escapeHtml(approachDefinition(id).label) + '</b> ＋' + approachScores[index] + '</span>'; }).join('');
    var specialties = value.specialties.map(function (item) { return '<span>✦ ' + escapeHtml(item) + '</span>'; }).join('');
    document.getElementById('builder-review').innerHTML = [
      '<article class="review-identity"><p>READY CHARACTER</p><h5>', escapeHtml(value.name || '未命名角色'), '</h5><strong>', escapeHtml(archetype.label || value.existenceType), '</strong><small>', escapeHtml(value.origin), '</small><blockquote>', escapeHtml(value.identity), '</blockquote></article>',
      '<article><h5>人物核心</h5><dl><div><dt>未竟愿望</dt><dd>', escapeHtml(value.wish), '</dd></div><div><dt>害怕身份</dt><dd>', escapeHtml(value.fearedIdentity), '</dd></div><div><dt>个人锚点</dt><dd>', escapeHtml(value.anchor), '</dd></div></dl></article>',
      '<article><h5>行动方式</h5><div class="review-chips">', approaches, '</div><h5>三项专长</h5><div class="review-chips specialties">', specialties, '</div></article>'
    ].join('');
    var checks = [
      { ready:Boolean(value.name && value.origin && value.identity), label:'身份信息完整' },
      { ready:Boolean(value.wish && value.fearedIdentity && value.anchor), label:'三个故事问题完整' },
      { ready:validBuild(Object.assign({}, value, { specialties:['一','二','三'] })), label:'行动方式自动分配正确' },
      { ready:value.specialties.length === 3 && new Set(value.specialties).size === 3, label:'正好三项不重复专长' },
      { ready:validBuild(value), label:'角色卡可保存并提交' }
    ];
    document.getElementById('builder-checklist').innerHTML = checks.map(function (check) { return '<div class="' + (check.ready ? 'ready' : 'missing') + '"><span>' + (check.ready ? '✓' : '!') + '</span><strong>' + escapeHtml(check.label) + '</strong><small>' + (check.ready ? '已通过' : '需要补充') + '</small></div>'; }).join('');
    document.querySelector('#player-character-form [type="submit"]').disabled = !checks[4].ready;
    document.getElementById('player-submit-character').disabled = !checks[4].ready;
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
    var nextLabels = ['下一步：基本身份 →','下一步：人物核心 →','下一步：行动方式 →','下一步：三项专长 →','下一步：确认生成 →','已经到最后一步'];
    document.getElementById('builder-back').disabled = builderStep === 0;
    document.getElementById('builder-next').hidden = builderStep === 5;
    document.getElementById('builder-next').textContent = nextLabels[builderStep];
    document.getElementById('builder-step-label').textContent = '第 ' + (builderStep + 1) + ' 步，共 6 步';
    if (builderStep === 5) renderBuilderReview();
    var editor = document.querySelector('.character-editor');
    if (editor && editor.getBoundingClientRect().top < 0) editor.scrollIntoView({ behavior:'smooth', block:'start' });
    return true;
  }

  function applyQuickBuild() {
    var type = document.getElementById('character-existence').value;
    var build = config.quickBuilds && config.quickBuilds[type];
    if (!build) return;
    ['name','origin','identity','wish','fearedIdentity','anchor'].forEach(function (field) {
      var ids = { name:'character-name', origin:'character-origin', identity:'character-identity', wish:'character-wish', fearedIdentity:'character-feared-identity', anchor:'character-anchor' };
      document.getElementById(ids[field]).value = build[field] || '';
    });
    applyApproachRanking(build.ranking, '');
    specialtySelections = build.specialties.slice(0, 3);
    renderSpecialties();
    updateBuilderCompletion();
    goBuilderStep(5, true);
    showSync('完整底稿已生成；检查后即可保存，也可以返回任一步修改');
  }

  function bindBuilderEvents() {
    document.getElementById('archetype-grid').addEventListener('click', function (event) { var button = event.target.closest('[data-archetype]'); if (button) selectArchetype(button.getAttribute('data-archetype'), true); });
    document.getElementById('builder-quickstart').addEventListener('click', applyQuickBuild);
    document.getElementById('player-character-form').addEventListener('click', function (event) {
      var suggestion = event.target.closest('[data-fill-target]');
      var preset = event.target.closest('[data-approach-preset]');
      var rank = event.target.closest('[data-rank-approach]');
      var specialty = event.target.closest('[data-specialty]');
      var remove = event.target.closest('[data-remove-specialty]');
      if (suggestion) { document.getElementById(suggestion.getAttribute('data-fill-target')).value = suggestion.getAttribute('data-fill-value'); clearBuilderError(); updateBuilderCompletion(); }
      if (preset) { var definition = (config.approachPresets || []).find(function (item) { return item.id === preset.getAttribute('data-approach-preset'); }); if (definition) applyApproachRanking(definition.ranking, definition.id); }
      if (rank) chooseRankApproach(rank.getAttribute('data-rank-approach'));
      if (specialty) toggleSpecialty(specialty.getAttribute('data-specialty'));
      if (remove) toggleSpecialty(remove.getAttribute('data-remove-specialty'));
    });
    document.getElementById('clear-specialties').addEventListener('click', function () { specialtySelections = []; renderSpecialties(); clearBuilderError(); });
    document.getElementById('add-custom-specialty').addEventListener('click', function () { var input = document.getElementById('custom-specialty-input'); toggleSpecialty(input.value); input.value = ''; });
    document.getElementById('custom-specialty-input').addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); document.getElementById('add-custom-specialty').click(); } });
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

  function showSync(message) { document.getElementById('player-sync-status').textContent = message; }
  function downloadJson(filename,payload) { var blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); var link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=filename; link.click(); URL.revokeObjectURL(link.href); }

  function normalizeResult(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id=safeText(raw.id,80); var dice=Array.isArray(raw.dice)?raw.dice.slice(0,2).map(function(value){return clamp(value,1,20,1);}):[];
    if(!id||!dice.length)return null;
    return { id:id, requestId:safeText(raw.requestId,80), targetCharacterId:safeText(raw.targetCharacterId,80)||'all', characterName:safeText(raw.characterName,80), total:clamp(raw.total,-99,99,0), dc:clamp(raw.dc,1,99,13), tier:['exceptional','success','costly','severe'].indexOf(raw.tier)!==-1?raw.tier:'severe', tierLabel:safeText(raw.tierLabel,80), goal:safeText(raw.goal,500), risk:safeText(raw.risk,500), publicNote:safeText(raw.publicNote,800), costOwner:safeText(raw.costOwner,80), approachLabel:safeText(raw.approachLabel,40), approachValue:clamp(raw.approachValue,0,5,0), specialty:safeText(raw.specialty,80), specialtyBonus:clamp(raw.specialtyBonus,0,2,0), assist:clamp(raw.assist,0,3,0), modifier:clamp(raw.modifier,-20,20,0), mode:['normal','advantage','disadvantage'].indexOf(raw.mode)!==-1?raw.mode:'normal', dice:dice, kept:clamp(raw.kept,1,20,dice[0]), createdAt:safeText(raw.createdAt,40) };
  }

  function renderResults() {
    var list=document.getElementById('player-result-list');
    list.innerHTML=results.length?results.map(function (result) { var time=result.createdAt?new Date(result.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):''; var modeLabel=result.mode==='advantage'?'优势':result.mode==='disadvantage'?'劣势':'正常'; var formula=result.dice.join(' / ')+'（'+modeLabel+'取 '+result.kept+'）＋'+(result.approachLabel||'行动方式')+' '+result.approachValue+(result.specialty?'＋'+result.specialty+' '+result.specialtyBonus:'')+'＋协助 '+result.assist+'＋修正 '+result.modifier; return '<li class="player-result-item"><div class="player-result-tier '+result.tier+'"><strong>'+result.total+'</strong><span>'+escapeHtml(result.tierLabel)+'</span></div><div class="player-result-copy"><h4>'+escapeHtml(result.goal||'公开判定')+'</h4><span>'+escapeHtml(result.characterName||'公开判定')+' · DC '+result.dc+'</span><p>'+escapeHtml(formula)+'</p>'+(result.risk?'<p>已公开风险：'+escapeHtml(result.risk)+'</p>':'')+(result.publicNote?'<p>现场结果：'+escapeHtml(result.publicNote)+'</p>':'')+(result.costOwner?'<p>代价选择者：'+escapeHtml(result.costOwner)+'</p>':'')+'</div><time class="player-result-time">'+time+'</time></li>'; }).join(''):'<li class="player-result-empty">尚未收到守秘人的判定结果。</li>';
  }
  function escapeHtml(value) { return String(value||'').replace(/[&<>"']/g,function (char) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]; }); }
  function rememberResults() { try { localStorage.setItem(RESULTS_KEY,JSON.stringify(results)); } catch(error){} }

  function handleMessage(message) {
    if (!message || typeof message !== 'object') return;
    if(message.protocol&&message.protocol!==MESSAGE_PROTOCOL)return;
    if (message.type === 'show' && message.handout) showHandout(message.handout);
    if (message.type === 'curtain') showCurtain();
    if (message.type === 'retract' && String(message.handoutId||'').toUpperCase()===currentHandoutId) showCurtain();
    if (message.type === 'character-ack' && character && message.characterId === character.id && (!pendingSubmissionId||message.submissionId===pendingSubmissionId)) { showSync(message.accepted ? '守秘人已确认角色' : '守秘人未接收这份角色卡'); if(message.submissionId===pendingSubmissionId)pendingSubmissionId=null; }
    if (message.type === 'check-ack' && character && message.characterId === character.id) showSync('守秘人已收到判定申请');
    if (message.type === 'check-result') { var result=normalizeResult(message.result); if (result && (result.targetCharacterId==='all' || character && result.targetCharacterId===character.id) && !results.some(function(item){return item.id===result.id;})) { results.unshift(result); results=results.slice(0,50); rememberResults(); renderResults(); showSync('已收到判定结果：'+result.tierLabel); } }
  }

  initializeApproaches();
  character=readStoredCharacter(); fillCharacterForm(character);
  bindBuilderEvents();
  goBuilderStep(0, true);
  try { results=JSON.parse(localStorage.getItem(RESULTS_KEY)||'[]').map(normalizeResult).filter(Boolean); } catch(error) { results=[]; } renderResults();

  document.getElementById('player-character-form').addEventListener('submit',function(event){ event.preventDefault(); var next=collectCharacter(); var missing=firstIncompleteStep(); if(missing!==5||!validBuild(next)){goBuilderStep(missing,true);showBuilderError(builderStepError(missing)||'角色卡还有未完成项目。');showSync('请先补齐车卡向导中的红色提示');return;} saveCharacter(next); renderBuilderReview(); showSync('角色卡已生成并保存在本机；现在可以提交给守秘人'); });
  document.getElementById('character-existence').addEventListener('change',updateServantFields);
  document.getElementById('player-submit-character').addEventListener('click',function(){ var next=collectCharacter(); var missing=firstIncompleteStep(); if(missing!==5||!validBuild(next)){goBuilderStep(missing,true);showBuilderError(builderStepError(missing)||'角色卡还有未完成项目。');showSync('提交前请先完成全部六步');return;} saveCharacter(next); pendingSubmissionId=makeId('submission'); showSync(sendToKeeper({type:'character-submit',submissionId:pendingSubmissionId,sentAt:new Date().toISOString(),character:next})?'角色已发送；如果守秘人页面已打开，会收到确认':'未找到同源本机守秘人标签页；可导出 JSON 交付'); });
  document.getElementById('player-export-character').addEventListener('click',function(){ var next=collectCharacter(); saveCharacter(next); downloadJson('零之圣杯-角色-'+(next.name||'未命名')+'.json',next); });
  document.getElementById('player-import-character').addEventListener('click',function(){document.getElementById('player-character-file').click();});
  document.getElementById('player-character-file').addEventListener('change',function(event){var file=event.target.files[0];if(!file)return;if(file.size>262144){showSync('角色 JSON 过大，上限 256 KB');event.target.value='';return;}var reader=new FileReader();reader.onload=function(){try{var parsed=JSON.parse(reader.result);if((parsed.protocol!==config.characterProtocol&&parsed.protocol!=='null-grail-character-v1')||parsed.rulesetId!==config.rulesetId)throw new Error('protocol');var imported=normalizeCharacter(parsed);saveCharacter(imported);fillCharacterForm(imported);goBuilderStep(5,true);showSync(parsed.protocol===config.characterProtocol?'角色 JSON 已导入并通过向导检查':'旧版角色 JSON 已迁移并导入');}catch(error){showSync('角色 JSON 无效或规则版本不兼容');}};reader.readAsText(file);event.target.value='';});
  document.getElementById('player-check-request-form').addEventListener('submit',function(event){event.preventDefault();var next=collectCharacter();if(!next.name){showSync('请先保存角色卡');return;}saveCharacter(next);var approachId=document.getElementById('player-check-approach').value;var specialty=document.getElementById('player-check-specialty').value;var request={id:makeId('request'),protocol:config.checkProtocol||'null-grail-check-v1',rulesetId:config.rulesetId,characterId:next.id,characterName:next.name,approachId:approachId,approachValue:next.approaches[approachId],specialty:specialty,specialtyBonus:specialty?2:0,mode:document.getElementById('player-check-mode').value,assist:document.getElementById('player-check-assist').value,modifier:document.getElementById('player-check-modifier').value,suggestedDc:document.getElementById('player-check-dc').value,goal:document.getElementById('player-check-goal').value,risk:document.getElementById('player-check-risk').value,createdAt:new Date().toISOString()};showSync(sendToKeeper({type:'check-request',request:request})?'判定申请已发送；等待守秘人公开风险并掷骰':'未找到同源本机守秘人标签页');});
  document.getElementById('player-clear-results').addEventListener('click',function(){results=[];rememberResults();renderResults();});

  try { channel=new BroadcastChannel(CHANNEL_NAME); channel.onmessage=function(event){handleMessage(event.data);}; channel.postMessage({protocol:MESSAGE_PROTOCOL,type:'ready',mode:mode||'player',characterId:character&&character.id}); } catch(error){channel=null;}
  window.addEventListener('message',function(event){if(event.origin===window.location.origin)handleMessage(event.data);});
  try { var restored=JSON.parse(sessionStorage.getItem(SESSION_KEY)||sessionStorage.getItem('ng-player-current-handout:v2')||'null'); if(!showHandout(restored))showCurtain(); } catch(error){showCurtain();}
  if(mode==='projection'){document.body.classList.add('projection-mode');}
  else if(mode==='builder'){document.body.classList.add('builder-mode');document.getElementById('projection-note').hidden=true;document.title='零之圣杯 · 傻瓜车卡';}
  else{document.getElementById('projection-note').hidden=true;}
  document.getElementById('fullscreen-button').addEventListener('click',function(){if(!document.fullscreenElement){if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();}else if(document.exitFullscreen)document.exitFullscreen();});
}());
