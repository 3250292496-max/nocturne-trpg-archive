(function () {
  'use strict';

  var core = window.COC7_CORE;
  var xlsx = window.COC7_XLSX;
  var playerData = window.NG_PLAYER_DATA || {};
  if (!core) return;

  var STORAGE_KEY = 'nocturne-combat:coc7:v1';
  var STATE_VERSION = 1;
  var CHANNEL_NAME = playerData.channelName || 'null-grail-player';
  var MESSAGE_PROTOCOL = playerData.protocol || 'null-grail-player-v4';
  var MAX_ROSTER = 60;
  var MAX_SCENES = 12;
  var MAX_EVENTS = 200;
  var state = loadState();
  var undoStack = [];
  var channel = null;
  var toastTimer = null;

  function byId(id) { return document.getElementById(id); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function cleanText(value, maximum) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maximum || 500);
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character];
    });
  }
  function clampInteger(value, minimum, maximum, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) number = fallback;
    return Math.max(minimum, Math.min(maximum, Math.round(number)));
  }
  function createId(prefix) {
    var random = '';
    try {
      var bytes = new Uint32Array(2);
      window.crypto.getRandomValues(bytes);
      random = bytes[0].toString(36) + bytes[1].toString(36);
    } catch (error) { random = Math.random().toString(36).slice(2, 16); }
    return prefix + '-' + Date.now().toString(36) + '-' + random.slice(0, 16);
  }
  function validId(value, prefix, createWhenMissing) {
    var id = cleanText(value, 80);
    return /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id) ? id : createWhenMissing ? createId(prefix) : '';
  }
  function showToast(message, duration) {
    var toast = byId('combat-toast');
    toast.textContent = cleanText(message, 500);
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove('show'); }, duration || 2600);
  }

  function freshState() {
    return { schemaVersion:STATE_VERSION, rulesetId:core.rulesetId, roster:[], scenes:[], activeSceneId:null, updatedAt:new Date().toISOString() };
  }

  function normalizeCharacter(raw, createWhenMissing) {
    if (raw && raw.character && typeof raw.character === 'object') raw = raw.character;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    try {
      var character = core.normalizeCharacter(raw, createWhenMissing === true);
      if (!character.id || !character.name) return null;
      character.updatedAt = cleanText(raw.updatedAt, 40) || new Date().toISOString();
      return character;
    } catch (error) { return null; }
  }

  function normalizeEvent(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      id:validId(raw.id, 'event', true),
      at:cleanText(raw.at, 40) || new Date().toISOString(),
      type:['attack','damage','heal','resource','turn','status','system'].indexOf(raw.type) !== -1 ? raw.type : 'system',
      label:cleanText(raw.label, 180),
      detail:cleanText(raw.detail, 1400)
    };
  }

  function normalizeScene(raw, roster) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    var validIds = (roster || []).map(function (character) { return character.id; });
    var participantIds = [];
    (Array.isArray(raw.participantIds) ? raw.participantIds : []).slice(0, MAX_ROSTER).forEach(function (value) {
      var id = validId(value, 'coc7', false);
      if (id && validIds.indexOf(id) !== -1 && participantIds.indexOf(id) === -1) participantIds.push(id);
    });
    var suppliedScores = raw.initiativeScores && typeof raw.initiativeScores === 'object' ? raw.initiativeScores : {};
    var initiativeScores = {};
    participantIds.forEach(function (id) {
      var character = roster.find(function (item) { return item.id === id; });
      initiativeScores[id] = clampInteger(suppliedScores[id], 0, 999, Number(character && character.characteristics && character.characteristics.dex) || 0);
    });
    var readyFirearmIds = [];
    (Array.isArray(raw.readyFirearmIds) ? raw.readyFirearmIds : []).forEach(function (value) {
      if (participantIds.indexOf(value) !== -1 && readyFirearmIds.indexOf(value) === -1) readyFirearmIds.push(value);
    });
    return {
      id:validId(raw.id, 'scene', true),
      name:cleanText(raw.name, 100) || '未命名战斗',
      status:raw.status === 'ended' ? 'ended' : 'active',
      round:clampInteger(raw.round, 1, 999, 1),
      turnIndex:participantIds.length ? clampInteger(raw.turnIndex, 0, participantIds.length - 1, 0) : 0,
      participantIds:participantIds,
      readyFirearmIds:readyFirearmIds,
      initiativeScores:initiativeScores,
      events:(Array.isArray(raw.events) ? raw.events : []).slice(0, MAX_EVENTS).map(normalizeEvent).filter(Boolean),
      createdAt:cleanText(raw.createdAt, 40) || new Date().toISOString(),
      updatedAt:cleanText(raw.updatedAt, 40) || new Date().toISOString()
    };
  }

  function migrateState(raw) {
    var output = freshState();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return output;
    output.roster = (Array.isArray(raw.roster) ? raw.roster : []).map(function (item) { return normalizeCharacter(item, false); }).filter(Boolean).slice(0, MAX_ROSTER);
    output.scenes = (Array.isArray(raw.scenes) ? raw.scenes : []).map(function (item) { return normalizeScene(item, output.roster); }).filter(Boolean).slice(0, MAX_SCENES);
    output.activeSceneId = validId(raw.activeSceneId, 'scene', false) || null;
    if (!output.scenes.some(function (scene) { return scene.id === output.activeSceneId; })) output.activeSceneId = null;
    output.updatedAt = cleanText(raw.updatedAt, 40) || output.updatedAt;
    return output;
  }

  function loadState() {
    try { return migrateState(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')); }
    catch (error) { return freshState(); }
  }
  function saveState() {
    state.updatedAt = new Date().toISOString();
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (error) { showToast('浏览器无法保存战斗状态；请检查站点存储权限', 5000); }
  }
  function activeScene(source) {
    var value = source || state;
    return value.scenes.find(function (scene) { return scene.id === value.activeSceneId; }) || null;
  }
  function characterById(id, roster) {
    return (roster || state.roster).find(function (character) { return character.id === id; }) || null;
  }
  function replaceCharacter(targetState, character) {
    var index = targetState.roster.findIndex(function (item) { return item.id === character.id; });
    if (index !== -1) {
      character.updatedAt = new Date().toISOString();
      targetState.roster[index] = character;
    }
  }
  function upsertCharacter(targetState, raw, createWhenMissing) {
    var character = normalizeCharacter(raw, createWhenMissing);
    if (!character) return null;
    var index = targetState.roster.findIndex(function (item) { return item.id === character.id; });
    if (index === -1) targetState.roster.unshift(character); else targetState.roster[index] = character;
    targetState.roster = targetState.roster.slice(0, MAX_ROSTER);
    return character;
  }
  function recordEvent(scene, type, label, detail) {
    if (!scene) return;
    scene.events.unshift({ id:createId('event'), at:new Date().toISOString(), type:type || 'system', label:cleanText(label, 180), detail:cleanText(detail, 1400) });
    scene.events = scene.events.slice(0, MAX_EVENTS);
    scene.updatedAt = new Date().toISOString();
  }
  function commit(label, mutate) {
    var previous = clone(state);
    mutate(state);
    undoStack.push(previous);
    if (undoStack.length > 40) undoStack.shift();
    saveState();
    renderAll();
    showToast(label);
  }

  function postMessage(message) {
    if (!channel) return;
    try { channel.postMessage(Object.assign({ protocol:MESSAGE_PROTOCOL }, message || {})); }
    catch (error) {}
  }
  function syncCharacter(character) { if (character) postMessage({ type:'character-sync', character:character }); }

  function canonicalName(value) {
    return String(value == null ? '' : value).normalize('NFKC').toLowerCase().replace(/[\s_()（）:：\-\/]+/g, '');
  }
  function skillValue(character, names, fallback) {
    var skills = character && character.skills && typeof character.skills === 'object' ? character.skills : {};
    var wanted = names.map(canonicalName);
    var keys = Object.keys(skills);
    for (var index = 0; index < keys.length; index += 1) {
      if (wanted.indexOf(canonicalName(keys[index])) !== -1) return clampInteger(skills[keys[index]], 0, 999, fallback || 0);
    }
    return clampInteger(fallback, 0, 999, 0);
  }
  function defaultBrawlWeapon(character) {
    return { id:'builtin-brawl', name:'徒手格斗', type:'近战', skill:'斗殴', skillValue:skillValue(character, ['斗殴','格斗（斗殴）','Fighting (Brawl)','Fighting','Brawl'], 25), damage:'1D3+DB', impale:false };
  }
  function dodgeValue(character) {
    return skillValue(character, ['闪避','Dodge'], Number(character && character.derived && character.derived.dodge) || Math.floor((Number(character && character.characteristics && character.characteristics.dex) || 0) / 2));
  }
  function weaponsFor(character) {
    if (!character) return [];
    var weapons = Array.isArray(character.weapons) ? character.weapons.filter(function (weapon) { return weapon && weapon.name; }).map(clone) : [];
    if (!weapons.some(function (weapon) { return /(徒手|拳|brawl|unarmed)/i.test((weapon.name || '') + ' ' + (weapon.skill || '')); })) weapons.unshift(defaultBrawlWeapon(character));
    return weapons;
  }
  function weaponSkillValue(character, weapon) {
    var explicit = Number(weapon && weapon.skillValue);
    if (Number.isFinite(explicit) && explicit > 0) return clampInteger(explicit, 0, 999, 0);
    var name = cleanText(weapon && weapon.skill, 100);
    return skillValue(character, name ? [name] : ['斗殴','格斗（斗殴）','Fighting (Brawl)','Brawl'], weapon && weapon.id === 'builtin-brawl' ? 25 : 0);
  }
  function isFirearm(weapon) {
    return Boolean(weapon && /(射击|枪|步枪|霰弹|弓|firearm|handgun|rifle|shotgun|smg|machine gun)/i.test([weapon.type, weapon.skill, weapon.name].join(' ')));
  }
  function hasFirearm(character) { return weaponsFor(character).some(isFirearm); }
  function highestCombatSkill(character) {
    var values = Object.keys(character && character.skills || {}).filter(function (key) { return /(格斗|射击|fighting|firearms|brawl|dodge|闪避)/i.test(key); }).map(function (key) { return Number(character.skills[key]) || 0; });
    return values.length ? Math.max.apply(Math, values) : 0;
  }
  function initiativeValue(character, scene) {
    if (!character) return -1;
    var base = Number(scene && scene.initiativeScores && scene.initiativeScores[character.id]);
    if (!Number.isFinite(base)) base = Number(character.characteristics && character.characteristics.dex) || 0;
    return base + (scene && scene.readyFirearmIds.indexOf(character.id) !== -1 ? 50 : 0);
  }
  function sortInitiative(scene, roster, preserveId) {
    scene.participantIds.sort(function (leftId, rightId) {
      var left = characterById(leftId, roster);
      var right = characterById(rightId, roster);
      var difference = initiativeValue(right, scene) - initiativeValue(left, scene);
      if (difference) return difference;
      difference = highestCombatSkill(right) - highestCombatSkill(left);
      if (difference) return difference;
      return String(left && left.name || '').localeCompare(String(right && right.name || ''), 'zh-CN');
    });
    scene.turnIndex = preserveId && scene.participantIds.indexOf(preserveId) !== -1 ? scene.participantIds.indexOf(preserveId) : 0;
  }

  function statusLabels(character) {
    var status = character && character.status || {};
    var labels = [];
    if (status.dead) labels.push('死亡'); else if (status.dying) labels.push('濒死');
    if (status.unconscious && !status.dead) labels.push('昏迷');
    if (status.majorWound) labels.push('重伤');
    if (status.prone) labels.push('倒地');
    if (status.temporaryInsanity) labels.push('临时疯狂');
    if (status.indefiniteInsanity) labels.push('不定期疯狂');
    if (status.permanentInsanity) labels.push('永久疯狂');
    return labels;
  }
  function resourceBar(label, value, maximum, color) {
    var max = Math.max(1, Number(maximum) || 1);
    var percent = Math.max(0, Math.min(100, Math.round((Number(value) || 0) / max * 100)));
    return '<div class="resource-bar"><span>' + label + '</span><i style="--bar:' + percent + '%;--bar-color:' + color + '"></i><strong>' + value + '/' + maximum + '</strong></div>';
  }

  function renderRoster() {
    byId('roster-list').innerHTML = state.roster.length ? state.roster.map(function (character) {
      var labels = statusLabels(character);
      return '<article class="roster-item"><div><strong>' + escapeHtml(character.name) + '</strong><p>' + escapeHtml((character.occupation || '临时角色') + (labels.length ? ' · ' + labels.join(' / ') : '')) + '</p><div class="roster-stats"><span>HP ' + character.hp + '/' + character.maxHp + '</span><span>DEX ' + character.characteristics.dex + '</span><span>闪避 ' + dodgeValue(character) + '</span><span>护甲 ' + character.armor + '</span></div></div><button type="button" data-remove-character="' + character.id + '">移除</button></article>';
    }).join('') : '<p class="empty-note">角色库为空。点击顶部“导入 JSON / XLSX”、快速添加对手，或从同源 COC7 车卡页直接提交。</p>';

    byId('scene-roster-picker').innerHTML = state.roster.length ? state.roster.map(function (character) {
      return '<label class="roster-choice"><input type="checkbox" value="' + character.id + '" data-roster-choice><span><strong>' + escapeHtml(character.name) + '</strong><small>' + escapeHtml(character.occupation || '临时角色') + ' · DEX ' + character.characteristics.dex + '</small></span><i>HP ' + character.hp + '/' + character.maxHp + '</i></label>';
    }).join('') : '<p class="empty-note">请先导入或添加角色。</p>';
  }

  function renderScenes() {
    byId('scene-list').innerHTML = state.scenes.length ? state.scenes.map(function (scene) {
      return '<button type="button" class="scene-button' + (scene.id === state.activeSceneId ? ' active' : '') + '" data-scene-id="' + scene.id + '"><span><strong>' + escapeHtml(scene.name) + '</strong><small>第 ' + scene.round + ' 轮 · ' + scene.participantIds.length + ' 人</small></span><i>' + (scene.status === 'ended' ? '已结束' : '进行中') + '</i></button>';
    }).join('') : '<p class="empty-note">尚无战斗场景。</p>';
  }

  function renderParticipant(character, scene, index) {
    var labels = statusLabels(character);
    var ready = scene.readyFirearmIds.indexOf(character.id) !== -1;
    var current = index === scene.turnIndex;
    return '<article class="participant-card' + (current ? ' current' : '') + (character.status.dead ? ' dead' : '') + '"><header><div><span>先攻 ' + initiativeValue(character, scene) + (ready ? ' · 枪械已准备' : '') + '</span><h3>' + escapeHtml(character.name) + '</h3></div><i class="turn-badge">' + (current ? '当前行动' : '等待') + '</i></header><div class="participant-stats"><div><span>DEX</span><strong>' + character.characteristics.dex + '</strong><small></small></div><div><span>闪避</span><strong>' + dodgeValue(character) + '</strong><small></small></div><div><span>护甲</span><strong>' + character.armor + '</strong><small></small></div><div><span>幸运</span><strong>' + character.luck + '</strong><small></small></div></div><div class="resource-bars">' + resourceBar('HP', character.hp, character.maxHp, '#c36b70') + resourceBar('SAN', character.san, character.maxSan, '#78b49a') + resourceBar('MP', character.mp, character.maxMp, '#748cb7') + '</div><div class="condition-list">' + (labels.length ? labels.map(function (label) { return '<span>' + escapeHtml(label) + '</span>'; }).join('') : '<span class="healthy">状态正常</span>') + '</div><div class="participant-actions">' + (hasFirearm(character) ? '<button type="button" class="' + (ready ? 'ready' : '') + '" data-toggle-ready="' + character.id + '">' + (ready ? '取消枪械准备' : '备好枪械') + '</button>' : '') + '<button class="danger" type="button" data-remove-participant="' + character.id + '">移出本场</button></div></article>';
  }

  function selectOptions(select, entries, previous, emptyLabel) {
    select.innerHTML = entries.length ? entries.map(function (entry) { return '<option value="' + escapeHtml(entry.value) + '">' + escapeHtml(entry.label) + '</option>'; }).join('') : '<option value="">' + escapeHtml(emptyLabel || '暂无可选项') + '</option>';
    if (entries.some(function (entry) { return entry.value === previous; })) select.value = previous;
    select.disabled = entries.length === 0;
  }

  function refreshAttackOptions() {
    var scene = activeScene();
    if (!scene) return;
    var participants = scene.participantIds.map(function (id) { return characterById(id); }).filter(Boolean);
    var ready = participants.filter(function (character) { return !character.status.dead; });
    var attackerSelect = byId('attack-attacker');
    var preferredAttacker = attackerSelect.value || scene.participantIds[scene.turnIndex];
    selectOptions(attackerSelect, ready.map(function (character) { return { value:character.id, label:character.name + ' · DEX ' + character.characteristics.dex }; }), preferredAttacker, '没有可行动角色');
    var attacker = characterById(attackerSelect.value);
    var weaponSelect = byId('attack-weapon');
    var previousWeapon = weaponSelect.value;
    var weapons = weaponsFor(attacker);
    selectOptions(weaponSelect, weapons.map(function (weapon) { return { value:weapon.id, label:weapon.name + ' · ' + weaponSkillValue(attacker, weapon) + '% · ' + (weapon.damage || '0') }; }), previousWeapon, '没有可用武器');
    var weapon = weapons.find(function (item) { return item.id === weaponSelect.value; }) || weapons[0];
    var targetSelect = byId('attack-target');
    var previousTarget = targetSelect.value;
    var targets = ready.filter(function (character) { return !attacker || character.id !== attacker.id; });
    selectOptions(targetSelect, targets.map(function (character) { return { value:character.id, label:character.name + ' · HP ' + character.hp + '/' + character.maxHp }; }), previousTarget, '没有其他目标');
    var firearm = isFirearm(weapon);
    var defense = byId('attack-defense');
    if (firearm) defense.value = 'none';
    defense.disabled = firearm || !targets.length;
    byId('attack-hint').textContent = firearm
      ? '射击按攻击者技能独立检定，目标不能用闪避／反击对抗；射程、掩体、瞄准与连射请折算为奖励／惩罚骰。'
      : '近战按双方成功等级比较：同等级时反击由攻击者胜，闪避由防御者胜。';
    byId('attack-form').querySelector('[type="submit"]').disabled = !attacker || !weapon || !targets.length;
  }

  function renderActiveScene() {
    var scene = activeScene();
    var empty = byId('combat-empty');
    var active = byId('combat-active');
    if (!scene) {
      empty.hidden = false;
      active.hidden = true;
      byId('active-scene-title').textContent = '尚未建立战斗';
      byId('round-label').textContent = '第 0 轮';
      byId('next-turn').disabled = true;
      byId('end-scene').disabled = true;
      return;
    }
    empty.hidden = true;
    active.hidden = false;
    byId('active-scene-title').textContent = scene.name + (scene.status === 'ended' ? ' · 已结束' : '');
    byId('round-label').textContent = '第 ' + scene.round + ' 轮';
    var participants = scene.participantIds.map(function (id) { return characterById(id); }).filter(Boolean);
    byId('participant-list').innerHTML = participants.length ? participants.map(function (character) { return renderParticipant(character, scene, scene.participantIds.indexOf(character.id)); }).join('') : '<p class="empty-note">本场暂无参战者。</p>';
    selectOptions(byId('adjust-target'), participants.map(function (character) { return { value:character.id, label:character.name + ' · HP ' + character.hp + '/' + character.maxHp }; }), byId('adjust-target').value, '没有参战者');
    byId('event-list').innerHTML = scene.events.length ? scene.events.map(function (event) {
      var date = new Date(event.at);
      var time = Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' });
      return '<li class="event-item"><time>' + escapeHtml(time) + '</time><div><strong>' + escapeHtml(event.label) + '</strong>' + (event.detail ? '<p>' + escapeHtml(event.detail) + '</p>' : '') + '</div></li>';
    }).join('') : '<li class="empty-note">本场尚无结算记录。</li>';
    document.querySelectorAll('#attack-form input, #attack-form select, #attack-form button, #adjust-form input, #adjust-form select, #adjust-form button').forEach(function (control) { control.disabled = false; });
    updateAdjustmentFields();
    refreshAttackOptions();
    var ended = scene.status === 'ended';
    byId('next-turn').disabled = ended || !participants.length;
    byId('end-scene').disabled = ended;
    document.querySelectorAll('#attack-form input, #attack-form select, #attack-form button, #adjust-form input, #adjust-form select, #adjust-form button').forEach(function (control) {
      if (ended || !participants.length) control.disabled = true;
    });
  }

  function renderAll() {
    renderRoster();
    renderScenes();
    renderActiveScene();
    byId('undo-action').disabled = undoStack.length === 0;
  }

  function importCharacterFile(file) {
    if (!file) return;
    if (/\.xlsx$/i.test(file.name)) {
      if (!xlsx || typeof xlsx.importCharacter !== 'function') { showToast('当前浏览器未载入 Excel 角色卡解析器'); return; }
      if (file.size > 15 * 1024 * 1024) { showToast('Excel 角色卡过大，上限 15 MB'); return; }
      showToast('正在本机读取 Excel 角色卡…');
      xlsx.importCharacter(file).then(function (raw) {
        var imported = null;
        commit('已导入 ' + (raw.name || 'COC7 角色卡'), function (draft) { imported = upsertCharacter(draft, raw, true); if (!imported) throw new Error('invalid'); });
        var warnings = raw.source && Array.isArray(raw.source.warnings) ? raw.source.warnings : [];
        if (warnings.length) showToast('角色已导入；请复核：' + warnings.join(' '), 7000);
      }).catch(function () { showToast('Excel 导入失败：请确认文件是 COC7 七版 `.xlsx` 角色卡', 5000); });
      return;
    }
    if (file.size > 3 * 1024 * 1024) { showToast('JSON 角色文件过大，上限 3 MB'); return; }
    file.text().then(function (text) {
      var payload = JSON.parse(text);
      var list = Array.isArray(payload) ? payload : payload && Array.isArray(payload.characters) ? payload.characters : [payload];
      var normalized = list.slice(0, MAX_ROSTER).map(function (entry) { return normalizeCharacter(entry, true); }).filter(Boolean);
      if (!normalized.length) throw new Error('invalid');
      commit('已导入 ' + normalized.length + ' 份 COC7 角色卡', function (draft) { normalized.forEach(function (character) { upsertCharacter(draft, character, true); }); });
    }).catch(function () { showToast('JSON 导入失败：请选择本站导出的 COC7 角色或角色合集', 5000); });
  }

  function createQuickOpponent(event) {
    event.preventDefault();
    var name = cleanText(byId('quick-name').value, 80);
    if (!name) { showToast('请填写对手名称'); return; }
    var dex = clampInteger(byId('quick-dex').value, 0, 999, 50);
    var con = clampInteger(byId('quick-con').value, 0, 999, 50);
    var siz = clampInteger(byId('quick-siz').value, 0, 999, 50);
    var attack = clampInteger(byId('quick-brawl').value, 0, 999, 40);
    var dodge = clampInteger(byId('quick-dodge').value, 0, 999, Math.floor(dex / 2));
    var firearm = byId('quick-weapon-type').value === 'firearm';
    var skillName = firearm ? '射击（手枪）' : '格斗（斗殴）';
    var raw = {
      name:name, occupation:'临时对手', era:'未指定',
      characteristics:{ str:50, con:con, siz:siz, dex:dex, app:50, int:50, pow:50, edu:50, luck:50 },
      skills:(function () { var output = { '闪避':dodge }; output[skillName] = attack; return output; }()),
      armor:clampInteger(byId('quick-armor').value, 0, 999, 0),
      weapons:[{
        id:'quick-weapon', name:cleanText(byId('quick-weapon-name').value, 80) || (firearm ? '手枪' : '徒手格斗'),
        type:firearm ? '射击' : '近战', skill:skillName, skillValue:attack,
        damage:cleanText(byId('quick-weapon-damage').value, 40) || (firearm ? '1D10' : '1D3+DB'),
        range:firearm ? '15m' : '接触', impale:byId('quick-impale').checked
      }],
      notes:'由独立自动战斗台快速建立', updatedAt:new Date().toISOString()
    };
    commit('已添加临时对手：' + name, function (draft) { if (!upsertCharacter(draft, raw, true)) throw new Error('invalid'); });
    byId('quick-add-form').reset();
    byId('quick-dex').value = '50'; byId('quick-con').value = '50'; byId('quick-siz').value = '50';
    byId('quick-dodge').value = '25'; byId('quick-brawl').value = '40'; byId('quick-armor').value = '0';
    byId('quick-weapon-name').value = '爪击'; byId('quick-weapon-damage').value = '1D6+DB';
    byId('quick-add-dialog').close();
  }

  function createScene(event) {
    event.preventDefault();
    var selected = Array.from(document.querySelectorAll('[data-roster-choice]:checked')).map(function (input) { return input.value; });
    if (!selected.length) { showToast('请至少勾选一名参战者'); return; }
    var name = cleanText(byId('scene-name').value, 100) || '战斗 ' + new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' });
    var sceneId = createId('scene');
    commit('建立战斗场景：' + name, function (draft) {
      var scene = normalizeScene({ id:sceneId, name:name, participantIds:selected, round:1, status:'active', events:[], readyFirearmIds:[] }, draft.roster);
      scene.participantIds.forEach(function (id) { scene.initiativeScores[id] = Number(characterById(id, draft.roster).characteristics.dex) || 0; });
      sortInitiative(scene, draft.roster);
      recordEvent(scene, 'system', '战斗开始', '按 DEX 从高到低排列；同 DEX 时比较最高战斗技能。可对已备好枪械者应用 DEX +50。');
      draft.scenes.unshift(scene);
      draft.scenes = draft.scenes.slice(0, MAX_SCENES);
      draft.activeSceneId = scene.id;
    });
    byId('scene-create-form').reset();
  }

  function removeCharacter(id) {
    var character = characterById(id);
    if (!character || !window.confirm('从战斗台移除“' + character.name + '”？历史日志会保留文字，但该角色将退出所有场景。')) return;
    commit('已移除角色：' + character.name, function (draft) {
      draft.roster = draft.roster.filter(function (item) { return item.id !== id; });
      draft.scenes.forEach(function (scene) {
        scene.participantIds = scene.participantIds.filter(function (value) { return value !== id; });
        scene.readyFirearmIds = scene.readyFirearmIds.filter(function (value) { return value !== id; });
        delete scene.initiativeScores[id];
        if (scene.turnIndex >= scene.participantIds.length) scene.turnIndex = 0;
      });
    });
  }

  function removeParticipant(id) {
    var scene = activeScene();
    var character = characterById(id);
    if (!scene || !character || scene.status !== 'active') return;
    commit(character.name + ' 已移出本场', function (draft) {
      var target = activeScene(draft);
      var currentId = target.participantIds[target.turnIndex];
      target.participantIds = target.participantIds.filter(function (value) { return value !== id; });
      target.readyFirearmIds = target.readyFirearmIds.filter(function (value) { return value !== id; });
      delete target.initiativeScores[id];
      target.turnIndex = currentId && target.participantIds.indexOf(currentId) !== -1 ? target.participantIds.indexOf(currentId) : Math.min(target.turnIndex, Math.max(0, target.participantIds.length - 1));
      recordEvent(target, 'system', character.name + ' 离开战斗', '角色仍保留在角色库中。');
    });
  }

  function toggleFirearmReady(id) {
    var scene = activeScene();
    var character = characterById(id);
    if (!scene || !character || scene.status !== 'active' || !hasFirearm(character)) return;
    var isReady = scene.readyFirearmIds.indexOf(id) !== -1;
    commit((isReady ? '取消枪械准备：' : '枪械已准备：') + character.name, function (draft) {
      var target = activeScene(draft);
      var preserve = target.participantIds[target.turnIndex];
      if (isReady) target.readyFirearmIds = target.readyFirearmIds.filter(function (value) { return value !== id; });
      else target.readyFirearmIds.push(id);
      sortInitiative(target, draft.roster, preserve);
      recordEvent(target, 'turn', character.name + (isReady ? ' 取消枪械准备' : ' 备好枪械'), isReady ? '恢复按 DEX 排序。' : '本轮先攻按 DEX +50 计算。');
    });
  }

  function automaticDyingChecks(draft, scene) {
    scene.participantIds.forEach(function (id) {
      var character = characterById(id, draft.roster);
      if (!character || !character.status.dying || character.status.dead) return;
      var check = core.rollPercentile(character.characteristics.con, 0);
      var next = character;
      if (!check.success) {
        next = clone(character);
        next.status.dead = true; next.status.dying = false; next.status.unconscious = true;
        next = core.normalizeCharacter(next);
        replaceCharacter(draft, next);
      }
      recordEvent(scene, 'status', character.name + ' 的濒死 CON 检定：' + rollLevelLabel(check.level), check.roll + '/' + check.skill + (check.success ? '，继续濒死。' : '，检定失败，角色死亡。'));
    });
  }

  function advanceTurn() {
    var scene = activeScene();
    if (!scene || scene.status !== 'active' || !scene.participantIds.length) return;
    commit('推进战斗行动位', function (draft) {
      var target = activeScene(draft);
      var previousId = target.participantIds[target.turnIndex];
      target.turnIndex += 1;
      if (target.turnIndex >= target.participantIds.length) {
        target.round += 1;
        target.readyFirearmIds = [];
        sortInitiative(target, draft.roster);
        automaticDyingChecks(draft, target);
        recordEvent(target, 'turn', '进入第 ' + target.round + ' 轮', '枪械准备加值已重置，并执行所有濒死 CON 检定。');
      } else {
        var next = characterById(target.participantIds[target.turnIndex], draft.roster);
        var previous = characterById(previousId, draft.roster);
        recordEvent(target, 'turn', '行动位推进', (previous ? previous.name : '上一位') + ' → ' + (next ? next.name : '下一位'));
      }
    });
    var updated = activeScene();
    if (updated) updated.participantIds.forEach(function (id) { syncCharacter(characterById(id)); });
  }

  function endScene() {
    var scene = activeScene();
    if (!scene || scene.status !== 'active' || !window.confirm('结束“' + scene.name + '”？当前 HP、SAN、MP、幸运与状态都会保留。')) return;
    commit('结束战斗：' + scene.name, function (draft) { var target = activeScene(draft); target.status = 'ended'; recordEvent(target, 'system', '战斗结束', '角色当前资源与状态已保存在独立战斗台。'); });
  }

  function chooseDamageExpression(value) {
    var source = cleanText(value, 100).normalize('NFKC').replace(/(?:半DB|½DB|1\s*\/\s*2\s*DB|DB\s*\/\s*2)/ig, '0.5DB');
    if (!source) return { expression:'0', note:'' };
    if (source.indexOf('/') !== -1) {
      var branches = source.split('/').map(function (item) { return item.trim(); }).filter(Boolean);
      return { expression:branches[0] || '0', note:'原骰式含射程分支，自动采用第一段；请按实际射程复核。' };
    }
    var note = '';
    if (/(燃烧|眩晕|毒|窒息|震慑|burn|stun)/i.test(source)) {
      note = '燃烧、眩晕、毒或窒息等附加效果需守秘人手动处理。';
      source = source.replace(/[+＋]?(燃烧|眩晕|毒|窒息|震慑|burn(?:ing)?|stun(?:ning)?)/ig, '');
    }
    return { expression:source || '0', note:note };
  }
  function expressionWithoutDamageBonus(value) {
    var source = String(value || '0').normalize('NFKC').toUpperCase().replace(/\s+/g, '');
    source = source.replace(/[+＋]?(?:0\.5|1\/2|½)?\*?DB/g, '').replace(/-(?:0\.5|1\/2|½)?\*?DB/g, '').replace(/[+\-]$/, '');
    return source || '0';
  }
  function hitDamage(character, weapon, level, allowExtreme) {
    var selected = chooseDamageExpression(weapon && weapon.damage || '1D3+DB');
    var extreme = allowExtreme !== false && (level === 'extreme' || level === 'critical');
    if (!extreme) {
      var rolled = core.rollDamageExpression(selected.expression, character.damageBonus || '0');
      return { total:rolled.total, label:'普通伤害 ' + rolled.total, note:selected.note };
    }
    var maximum = core.maximumDamageExpression(selected.expression, character.damageBonus || '0');
    if (weapon && weapon.impale) {
      var extra = core.rollDamageExpression(expressionWithoutDamageBonus(selected.expression), 0);
      return { total:maximum + extra.total, label:'贯穿极难伤害 ' + maximum + '＋' + extra.total + '＝' + (maximum + extra.total), note:selected.note };
    }
    return { total:maximum, label:'极难最大伤害 ' + maximum, note:selected.note };
  }
  function rollLevelLabel(level) {
    return { critical:'大成功', extreme:'极难成功', hard:'困难成功', regular:'成功', failure:'失败', fumble:'大失败' }[level] || level;
  }

  function resolveAttack(event) {
    event.preventDefault();
    var scene = activeScene();
    if (!scene || scene.status !== 'active') return;
    var attacker = characterById(byId('attack-attacker').value);
    var target = characterById(byId('attack-target').value);
    var weapon = weaponsFor(attacker).find(function (item) { return item.id === byId('attack-weapon').value; });
    if (!attacker || !target || !weapon) { showToast('请选择有效的攻击者、武器与目标'); return; }
    var bonus = clampInteger(byId('attack-bonus').value, -2, 2, 0);
    var firearm = isFirearm(weapon);
    var defense = firearm ? 'none' : byId('attack-defense').value;
    var attackRoll;
    var defenseRoll = null;
    var attackerHits = false;
    var defenderHits = false;
    if (defense === 'none') {
      attackRoll = core.rollPercentile(weaponSkillValue(attacker, weapon), bonus);
      attackerHits = attackRoll.success;
    } else {
      var defenderWeapon = defaultBrawlWeapon(target);
      var resolution = core.opposedCombat(attacker, target, {
        attackerSkill:weaponSkillValue(attacker, weapon), attackerBonusPenalty:bonus,
        defenderAction:defense,
        defenderSkill:defense === 'dodge' ? dodgeValue(target) : weaponSkillValue(target, defenderWeapon)
      });
      attackRoll = resolution.attacker;
      defenseRoll = resolution.defender;
      attackerHits = resolution.attackerHits;
      defenderHits = resolution.defenderHits;
    }
    var nextAttacker = attacker;
    var nextTarget = target;
    var details = [attacker.name + '：' + attackRoll.roll + '/' + attackRoll.skill + '（' + rollLevelLabel(attackRoll.level) + '）'];
    if (defenseRoll) details.push(target.name + '：' + defenseRoll.roll + '/' + defenseRoll.skill + '（' + rollLevelLabel(defenseRoll.level) + '）');
    try {
      if (attackerHits) {
        var damage = hitDamage(attacker, weapon, attackRoll.level, true);
        var applied = core.applyDamage(target, damage.total, target.armor);
        nextTarget = applied.character;
        details.push(damage.label + '，护甲 ' + applied.armor + '，实扣 ' + applied.damage + ' HP（' + applied.previousHp + '→' + applied.hp + '）');
        if (damage.note) details.push(damage.note);
        if (applied.majorWound) details.push('触发重伤' + (applied.conCheck ? '，CON ' + applied.conCheck.roll + '/' + applied.conCheck.skill + '（' + rollLevelLabel(applied.conCheck.level) + '）' : '') + '。');
        if (applied.dying) details.push('目标进入濒死。');
        if (applied.dead) details.push('单次实扣伤害超过最大 HP，目标立即死亡。');
      } else if (defenderHits) {
        var counterWeapon = defaultBrawlWeapon(target);
        var counterDamage = hitDamage(target, counterWeapon, defenseRoll.level, false);
        var counterApplied = core.applyDamage(attacker, counterDamage.total, attacker.armor);
        nextAttacker = counterApplied.character;
        details.push('反击命中：' + counterDamage.label + '，护甲 ' + counterApplied.armor + '，实扣 ' + counterApplied.damage + ' HP（' + counterApplied.previousHp + '→' + counterApplied.hp + '）');
      } else details.push(defense === 'dodge' && defenseRoll && defenseRoll.success ? '攻击被闪避。' : '攻击未命中。');
    } catch (error) { showToast('无法解析武器伤害骰：' + cleanText(weapon.damage, 40), 5000); return; }
    if (firearm && Number(weapon.malfunction) > 0 && attackRoll.roll >= Number(weapon.malfunction)) details.push('掷骰达到故障值 ' + weapon.malfunction + '，请处理卡壳或故障。');
    var label = attacker.name + ' 使用 ' + weapon.name + ' → ' + target.name + '：' + (attackerHits ? '命中' : defenderHits ? '遭反击' : '未命中');
    var sceneId = scene.id;
    commit(label, function (draft) {
      replaceCharacter(draft, nextAttacker);
      replaceCharacter(draft, nextTarget);
      var targetScene = draft.scenes.find(function (item) { return item.id === sceneId; });
      recordEvent(targetScene, 'attack', label, details.join(' '));
    });
    syncCharacter(nextAttacker);
    syncCharacter(nextTarget);
  }

  function rolledAmount(value) {
    var source = cleanText(value, 40) || '0';
    var rolled = core.rollDamageExpression(source, 0);
    return { value:rolled.total, label:source + '＝' + rolled.total };
  }
  function resolveAdjustment(event) {
    event.preventDefault();
    var scene = activeScene();
    if (!scene || scene.status !== 'active') return;
    var character = characterById(byId('adjust-target').value);
    if (!character) { showToast('请选择调整目标'); return; }
    var kind = byId('adjust-kind').value;
    var value = cleanText(byId('adjust-value').value, 40) || '0';
    var next = character;
    var label = '';
    var detail = '';
    try {
      if (kind === 'damage') {
        var selected = chooseDamageExpression(value);
        var damage = core.applyDamage(character, selected.expression, byId('ignore-armor').checked ? 0 : character.armor);
        next = damage.character; label = character.name + ' 受到 ' + damage.damage + ' 点伤害';
        detail = selected.expression + ' 掷出 ' + damage.rolledDamage + '，护甲 ' + damage.armor + '，HP ' + damage.previousHp + '→' + damage.hp + '。' + (selected.note || '');
      } else if (kind === 'heal') {
        var healing = rolledAmount(value); var healed = core.heal(character, healing.value, { preserveMajorWound:true });
        next = healed.character; label = character.name + ' 恢复 ' + healed.healed + ' HP'; detail = healing.label + '，HP ' + healed.previousHp + '→' + healed.hp + '。';
      } else if (kind === 'sanity') {
        var sanity = core.applySanityLoss(character, value); next = sanity.character;
        label = character.name + ' 失去 ' + sanity.loss + ' SAN';
        detail = (sanity.sanCheck ? 'SAN 检定 ' + sanity.sanCheck.roll + '/' + sanity.sanCheck.skill + '（' + rollLevelLabel(sanity.sanCheck.level) + '），' : '') + 'SAN ' + sanity.previousSan + '→' + sanity.san + '。' + (sanity.temporaryInsanity ? '触发临时疯狂 ' + sanity.temporaryInsanityHours + ' 小时。' : '') + (sanity.indefiniteInsanity ? '达到不定期疯狂阈值。' : '');
      } else if (kind === 'first-aid') {
        var aid = core.heal(character, 1, { stabilize:true, preserveMajorWound:true }); next = aid.character;
        label = '对 ' + character.name + ' 实施急救'; detail = (aid.stabilized ? '已稳定濒死状态；' : '') + '恢复 ' + aid.healed + ' HP（' + aid.previousHp + '→' + aid.hp + '）。';
      } else if (kind === 'medicine') {
        var medicineRoll = core.rollDamageExpression('1D3', 0); var medicine = core.heal(character, medicineRoll.total, { preserveMajorWound:true }); next = medicine.character;
        label = '对 ' + character.name + ' 实施医学治疗'; detail = '1D3＝' + medicineRoll.total + '，恢复 ' + medicine.healed + ' HP（' + medicine.previousHp + '→' + medicine.hp + '）。';
      } else if (kind === 'dying-check') {
        var check = core.rollPercentile(character.characteristics.con, 0); next = clone(character);
        if (!check.success) { next.status.dead = true; next.status.dying = false; next.status.unconscious = true; }
        next = core.normalizeCharacter(next); label = character.name + ' 濒死 CON 检定：' + rollLevelLabel(check.level); detail = check.roll + '/' + check.skill + (check.success ? '，维持濒死。' : '，失败并死亡。');
      } else {
        var amount = rolledAmount(value);
        var resource = kind.indexOf('mp-') === 0 ? 'mp' : kind.indexOf('luck-') === 0 ? 'luck' : 'san';
        var restore = /-restore$/.test(kind);
        var adjusted = core.adjustResource(character, resource, (restore ? 1 : -1) * amount.value); next = adjusted.character;
        label = character.name + (restore ? ' 恢复 ' : ' 消耗 ') + Math.abs(adjusted.appliedDelta) + ' ' + resource.toUpperCase(); detail = amount.label + '，当前 ' + adjusted.value + '/' + adjusted.maximum + '。';
      }
    } catch (error) { showToast(cleanText(error && error.message, 120) || '无法应用该操作', 5000); return; }
    var sceneId = scene.id;
    commit(label, function (draft) {
      replaceCharacter(draft, next);
      var targetScene = draft.scenes.find(function (item) { return item.id === sceneId; });
      recordEvent(targetScene, kind === 'damage' ? 'damage' : kind === 'heal' || kind === 'first-aid' || kind === 'medicine' ? 'heal' : 'resource', label, detail);
    });
    syncCharacter(next);
  }

  function updateAdjustmentFields() {
    var kind = byId('adjust-kind').value;
    var noValue = kind === 'first-aid' || kind === 'medicine' || kind === 'dying-check';
    byId('adjust-value').disabled = noValue;
    byId('ignore-armor').disabled = kind !== 'damage';
    if (kind === 'sanity') byId('adjust-value').placeholder = '例：0/1D6';
    else if (kind === 'damage' || kind === 'heal') byId('adjust-value').placeholder = '例：6、1D6+2';
    else byId('adjust-value').placeholder = '例：1、1D3';
  }

  function handleDynamicClick(event) {
    var sceneButton = event.target.closest('[data-scene-id]');
    if (sceneButton) { state.activeSceneId = sceneButton.getAttribute('data-scene-id'); saveState(); renderAll(); return; }
    var removeCharacterButton = event.target.closest('[data-remove-character]');
    if (removeCharacterButton) { removeCharacter(removeCharacterButton.getAttribute('data-remove-character')); return; }
    var readyButton = event.target.closest('[data-toggle-ready]');
    if (readyButton) { toggleFirearmReady(readyButton.getAttribute('data-toggle-ready')); return; }
    var removeParticipantButton = event.target.closest('[data-remove-participant]');
    if (removeParticipantButton) removeParticipant(removeParticipantButton.getAttribute('data-remove-participant'));
  }

  function initializeChannel() {
    var indicator = byId('channel-indicator').parentElement;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      indicator.classList.add('connected');
      byId('channel-status').textContent = '实时接收已开启';
      channel.onmessage = function (event) {
        var message = event.data;
        if (!message || typeof message !== 'object' || message.protocol && message.protocol !== MESSAGE_PROTOCOL) return;
        if (message.type === 'ready') {
          byId('channel-status').textContent = message.mode === 'coc7' ? 'COC7 车卡页已连接' : '同源玩家页已连接';
          postMessage({ type:'keeper-ready', mode:'combat' });
          return;
        }
        if (message.type === 'character-submit') {
          var character = normalizeCharacter(message.character, true);
          if (!character) {
            postMessage({ type:'character-ack', submissionId:message.submissionId, accepted:false });
            return;
          }
          var existed = state.roster.some(function (item) { return item.id === character.id; });
          commit((existed ? '已更新提交角色：' : '已接收提交角色：') + character.name, function (draft) {
            upsertCharacter(draft, character, true);
            var scene = activeScene(draft);
            if (scene && scene.participantIds.indexOf(character.id) !== -1) recordEvent(scene, 'system', character.name + ' 的角色卡已同步', '来自同源 COC7 车卡页的实时提交。');
          });
          postMessage({ type:'character-ack', submissionId:message.submissionId, characterId:character.id, accepted:true });
        }
      };
      postMessage({ type:'keeper-ready', mode:'combat' });
    } catch (error) {
      channel = null;
      indicator.classList.remove('connected');
      byId('channel-status').textContent = '浏览器不支持实时提交';
    }
  }

  function bindEvents() {
    byId('import-character').addEventListener('click', function () { byId('character-file').click(); });
    byId('character-file').addEventListener('change', function (event) { if (event.target.files[0]) importCharacterFile(event.target.files[0]); event.target.value = ''; });
    byId('undo-action').addEventListener('click', function () {
      if (!undoStack.length) { showToast('没有可以撤销的操作'); return; }
      state = undoStack.pop();
      saveState();
      renderAll();
      state.roster.forEach(syncCharacter);
      showToast('已撤销上一步；角色状态已同步');
    });
    byId('open-quick-add').addEventListener('click', function () { byId('quick-add-dialog').showModal(); byId('quick-name').focus(); });
    byId('quick-add-dialog').querySelector('.dialog-close').addEventListener('click', function () { byId('quick-add-dialog').close(); });
    byId('quick-add-form').addEventListener('submit', createQuickOpponent);
    byId('scene-create-form').addEventListener('submit', createScene);
    byId('attack-form').addEventListener('submit', resolveAttack);
    byId('attack-attacker').addEventListener('change', refreshAttackOptions);
    byId('attack-weapon').addEventListener('change', refreshAttackOptions);
    byId('adjust-form').addEventListener('submit', resolveAdjustment);
    byId('adjust-kind').addEventListener('change', updateAdjustmentFields);
    byId('next-turn').addEventListener('click', advanceTurn);
    byId('end-scene').addEventListener('click', endScene);
    byId('clear-events').addEventListener('click', function () {
      var scene = activeScene();
      if (!scene || !scene.events.length) { showToast('本场没有可清除的结算记录'); return; }
      commit('已清空本场显示记录', function (draft) { activeScene(draft).events = []; });
    });
    document.addEventListener('click', handleDynamicClick);
  }

  renderAll();
  updateAdjustmentFields();
  bindEvents();
  initializeChannel();
}());
