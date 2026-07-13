(function () {
  'use strict';

  var data = window.COC7_DATA;
  var core = window.COC7_CORE;
  var xlsx = window.COC7_XLSX;
  if (!data || !core) return;

  var STORAGE_KEY = 'coc7-player-character:v1';
  var playerData = window.NG_PLAYER_DATA || {};
  var CHANNEL_NAME = playerData.channelName || 'null-grail-player';
  var MESSAGE_PROTOCOL = playerData.protocol || 'null-grail-player-v3';
  var current = null;
  var channel = null;
  var pendingSubmissionId = '';
  var selectedRuleCategory = 'all';
  var pdfUrl = '';
  var pendingPdfPage = 1;
  var toastTimer = null;

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]; }); }
  function clamp(value, minimum, maximum, fallback) { var number = Number(value); return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback; }
  function makeId(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  function rollDie(sides) { return Math.floor(Math.random() * sides) + 1; }
  function rollDice(count, sides, add) { var total = Number(add || 0); for (var index = 0; index < count; index += 1) total += rollDie(sides); return total; }
  function occupationById(id) { return data.occupations.find(function (occupation) { return occupation.id === id; }) || data.occupations[0]; }
  function skillById(id) { return data.skillById[id] || null; }
  function skillName(id) { var skill = skillById(id); return skill ? skill.name : id; }

  function showToast(message, timeout) {
    var toast = byId('coc-toast');
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove('show'); }, timeout || 3200);
  }

  function activateTab(name, updateUrl) {
    name = name === 'rules' ? 'rules' : 'builder';
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      var active = panel.getAttribute('data-panel') === name;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });
    ['builder','rules'].forEach(function (tab) {
      var button = byId('tab-' + tab);
      if (button) button.setAttribute('aria-selected', String(tab === name));
    });
    if (updateUrl !== false) {
      var url = new URL(window.location.href);
      url.searchParams.set('tab', name);
      window.history.replaceState(null, '', url);
    }
  }

  function skillBase(skill, characteristics) {
    if (Number.isFinite(Number(skill.base))) return Number(skill.base);
    if (skill.id === 'dodge') return Math.floor(characteristics.dex / 2);
    if (skill.id === 'languageOwn') return characteristics.edu;
    return 0;
  }

  function rollCharacteristics(age, strategy) {
    var values = {
      str:rollDice(3, 6) * 5, con:rollDice(3, 6) * 5, siz:rollDice(2, 6, 6) * 5,
      dex:rollDice(3, 6) * 5, app:rollDice(3, 6) * 5, int:rollDice(2, 6, 6) * 5,
      pow:rollDice(3, 6) * 5, edu:rollDice(2, 6, 6) * 5, luck:rollDice(3, 6) * 5
    };
    var profile = core.derive(values, age).ageAdjustments;
    if (age < 20) values.luck = Math.max(values.luck, rollDice(3, 6) * 5);
    values.edu = Math.max(5, values.edu - profile.eduPenalty);
    values.app = Math.max(5, values.app - profile.appPenalty);
    var physicalKeys = age < 20 ? ['str','siz'] : ['str','con','dex'];
    if (physicalKeys.indexOf(strategy) !== -1) physicalKeys = [strategy].concat(physicalKeys.filter(function (key) { return key !== strategy; }));
    for (var point = 0; point < profile.physicalPenalty; point += 1) {
      var key = physicalKeys[point % physicalKeys.length];
      if (values[key] > 5) values[key] -= 1;
    }
    var eduGains = [];
    for (var checkIndex = 0; checkIndex < profile.eduImprovementChecks; checkIndex += 1) {
      var roll = rollDie(100);
      if (roll > values.edu) {
        var gain = rollDie(10);
        values.edu = Math.min(99, values.edu + gain);
        eduGains.push(gain);
      }
    }
    return { values:values, profile:profile, eduGains:eduGains, strategy:strategy };
  }

  function concreteSkillId(id) {
    return {
      artCraft:'artCraftPhotography', languageOther:'languageOtherLatin', firearms:'firearmsHandgun',
      fighting:'fightingBrawl', science:'scienceBiology', pilot:'driveAuto', survival:'survival'
    }[id] || id;
  }

  function occupationSkillIds(occupation, era) {
    var chosen = [];
    var fallback = era === 'modern'
      ? ['spotHidden','listen','libraryUse','psychology','firstAid','dodge','driveAuto','computerUse','stealth','persuade','locksmith','occult']
      : ['spotHidden','listen','libraryUse','psychology','firstAid','dodge','driveAuto','stealth','persuade','locksmith','occult','history'];
    function add(id) {
      id = concreteSkillId(id);
      var skill = skillById(id);
      if (!skill || skill.lockedAtCreation || chosen.indexOf(id) !== -1) return false;
      if (skill.era === 'modern' && era !== 'modern') return false;
      chosen.push(id); return true;
    }
    occupation.occupationalSkills.forEach(function (slot) {
      if (slot.type === 'skill') add(slot.id);
      else {
        var count = Math.max(1, Number(slot.count || 1));
        var options = Array.isArray(slot.options) ? slot.options.slice() : fallback.slice();
        for (var index = 0; index < options.length && count > 0; index += 1) if (add(options[index])) count -= 1;
        for (var fallbackIndex = 0; fallbackIndex < fallback.length && count > 0; fallbackIndex += 1) if (add(fallback[fallbackIndex])) count -= 1;
      }
    });
    fallback.forEach(function (id) { if (chosen.length < 8) add(id); });
    return chosen.slice(0, 8);
  }

  function formulaBudget(occupation, characteristics, strategy) {
    var formula = String(occupation.pointFormula || 'EDU×4').toUpperCase();
    if (formula.indexOf('EDU×4') !== -1 || formula.indexOf('EDU*4') !== -1) return { value:characteristics.edu * 4, chosen:'EDU' };
    var options = ['STR','DEX','APP','POW'].filter(function (key) { return formula.indexOf(key) !== -1; });
    var chosen = options.indexOf(String(strategy || '').toUpperCase()) !== -1 ? String(strategy).toUpperCase() : options.sort(function (a, b) { return characteristics[b.toLowerCase()] - characteristics[a.toLowerCase()]; })[0];
    chosen = chosen || 'DEX';
    return { value:characteristics.edu * 2 + characteristics[chosen.toLowerCase()] * 2, chosen:chosen };
  }

  function distributeSkills(occupation, characteristics, era, formulaStrategy) {
    var valuesById = {};
    data.skills.forEach(function (skill) {
      if (skill.era === 'modern' && era !== 'modern') return;
      valuesById[skill.id] = skillBase(skill, characteristics);
    });
    var professionIds = occupationSkillIds(occupation, era);
    var creditTarget = Math.round((occupation.creditRating.min + occupation.creditRating.max) / 2);
    valuesById.creditRating = Math.max(valuesById.creditRating || 0, creditTarget);
    var formula = formulaBudget(occupation, characteristics, formulaStrategy);
    var budget = formula.value;
    var creditSpent = Math.max(0, creditTarget - (skillById('creditRating').base || 0));
    var remaining = Math.max(0, budget - creditSpent);
    var targets = [75,70,65,60,55,55,50,45];
    professionIds.forEach(function (id, index) {
      var desired = targets[index] || 45;
      var available = Math.max(0, desired - (valuesById[id] || 0));
      var spent = Math.min(remaining, available);
      valuesById[id] = (valuesById[id] || 0) + spent;
      remaining -= spent;
    });
    var loopGuard = 0;
    while (remaining > 0 && loopGuard < 900) {
      var id = professionIds[loopGuard % professionIds.length];
      if (valuesById[id] < 80) { valuesById[id] += 1; remaining -= 1; }
      loopGuard += 1;
      if (loopGuard > professionIds.length * 90) break;
    }
    var interestBudget = characteristics.int * 2;
    var interestCandidates = ['spotHidden','listen','dodge','firstAid','psychology','stealth','occult','libraryUse','driveAuto','persuade','throw','swim'].filter(function (id) { return professionIds.indexOf(id) === -1 && valuesById[id] != null; });
    var interestSpent = 0;
    var interestGuard = 0;
    while (interestSpent < interestBudget && interestCandidates.length && interestGuard < 1400) {
      var interestId = interestCandidates[interestGuard % interestCandidates.length];
      if (valuesById[interestId] < 70) { valuesById[interestId] += 1; interestSpent += 1; }
      interestGuard += 1;
      if (interestGuard > interestCandidates.length * 100) break;
    }
    var skills = {};
    Object.keys(valuesById).forEach(function (id) { var skill = skillById(id); if (skill) skills[skill.name] = Math.round(valuesById[id]); });
    return {
      skills:skills, valuesById:valuesById, occupationalIds:professionIds,
      interestIds:interestCandidates, occupationBudget:budget, occupationSpent:budget - remaining,
      interestBudget:interestBudget, interestSpent:interestSpent, formulaChoice:formula.chosen
    };
  }

  function weaponPreset(skillId, label, skillValue) {
    var presets = {
      firearmsHandgun:{ name:label || '手枪', type:'射击', damage:'1D10', range:'15m', impale:true, attacksPerRound:'1', ammunition:'6', malfunction:100 },
      firearmsRifleShotgun:{ name:label || '步枪/霰弹枪', type:'射击', damage:'2D6+4', range:'50m', impale:true, attacksPerRound:'1', ammunition:'2', malfunction:100 }
    };
    var selected = presets[skillId] || { name:label || skillName(skillId), type:'近战', damage:'1D6+DB', range:'接触', impale:false, attacksPerRound:'1', ammunition:'', malfunction:0 };
    return Object.assign({ id:'weapon-' + skillId, skill:skillName(skillId), skillValue:skillValue || 0 }, selected);
  }

  function generateCharacter() {
    var occupation = occupationById(byId('coc-occupation').value);
    var age = Math.round(clamp(byId('coc-age').value, 15, 89, 28));
    var era = byId('coc-era').value === 'modern' ? 'modern' : 'classic';
    var ageStrategy = byId('coc-age-strategy').value;
    var rolled = rollCharacteristics(age, ageStrategy);
    var allocation = distributeSkills(occupation, rolled.values, era, byId('coc-formula-strategy').value);
    var weapons = [{ id:'unarmed', name:'徒手', type:'近战', skill:'格斗（斗殴）', skillValue:allocation.valuesById.fightingBrawl || 25, damage:'1D3+DB', range:'接触', impale:false, attacksPerRound:'1', ammunition:'', malfunction:0 }];
    (occupation.weapons || []).filter(function (weapon) { return !weapon.optional || weapons.length < 3; }).forEach(function (weapon) {
      weapons.push(weaponPreset(weapon.skillId, weapon.label, allocation.valuesById[weapon.skillId] || 0));
    });
    var raw = {
      protocol:core.protocol, rulesetId:core.rulesetId, id:current && current.id || '',
      name:byId('coc-name').value.trim() || '未命名调查员', playerName:byId('coc-player-name').value.trim(),
      age:age, era:era === 'modern' ? '现代' : '经典 1920 年代', occupation:occupation.name, occupationId:occupation.id,
      characteristics:rolled.values, skills:allocation.skills, weapons:weapons, armor:0,
      backstory:byId('coc-backstory').value.trim(), notes:'由夜航模组馆 COC7 傻瓜车卡生成', updatedAt:new Date().toISOString()
    };
    current = core.normalizeCharacter(raw, true);
    current.buildInfo = {
      occupationalIds:allocation.occupationalIds, interestIds:allocation.interestIds,
      occupationBudget:allocation.occupationBudget, occupationSpent:allocation.occupationSpent,
      interestBudget:allocation.interestBudget, interestSpent:allocation.interestSpent,
      formulaChoice:allocation.formulaChoice, pointFormula:occupation.pointFormula,
      ageStrategy:ageStrategy, physicalPenalty:rolled.profile.physicalPenalty, appPenalty:rolled.profile.appPenalty,
      eduGains:rolled.eduGains
    };
    saveCurrent(); renderCharacter();
    showToast('角色已完整生成：派生值和技能点均已自动计算');
  }

  function loadStored() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed) return null;
      var normalized = core.normalizeCharacter(parsed, true);
      if (parsed.buildInfo) normalized.buildInfo = parsed.buildInfo;
      return normalized;
    } catch (error) { return null; }
  }

  function saveCurrent() {
    if (!current) return;
    current.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    byId('coc-save-status').textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' });
  }

  function renderCharacter() {
    var empty = byId('coc-empty-preview');
    var sheet = byId('coc-character-sheet');
    if (!current) { empty.hidden = false; sheet.hidden = true; return; }
    empty.hidden = true; sheet.hidden = false;
    byId('sheet-name').textContent = current.name || '未命名调查员';
    byId('sheet-occupation').textContent = current.occupation || '职业未填写';
    byId('sheet-player').textContent = (current.playerName || '未填写玩家') + ' · ' + current.age + ' 岁';
    byId('sheet-era').textContent = current.era || '时代未填写';
    var characteristicLabels = { str:'STR 力量', con:'CON 体质', siz:'SIZ 体型', dex:'DEX 敏捷', app:'APP 外貌', int:'INT 智力', pow:'POW 意志', edu:'EDU 教育', luck:'LUCK 幸运' };
    byId('characteristic-grid').innerHTML = Object.keys(characteristicLabels).map(function (key) {
      var value = current.characteristics[key];
      return '<div class="characteristic-cell"><span>' + characteristicLabels[key] + '</span><strong>' + value + '</strong><small>' + Math.floor(value / 2) + ' / ' + Math.floor(value / 5) + '</small></div>';
    }).join('');
    var derived = [
      ['HP', current.hp + ' / ' + current.maxHp, '重伤阈值 ' + Math.ceil(current.maxHp / 2)],
      ['SAN', current.san + ' / ' + current.maxSan, '今日损失 ' + current.sanDayLoss],
      ['MP', current.mp + ' / ' + current.maxMp, 'POW ÷ 5'],
      ['MOV', current.move, '自动含年龄'], ['DB', current.damageBonus, 'STR + SIZ'], ['BUILD', current.build, '体格']
    ];
    byId('derived-grid').innerHTML = derived.map(function (item) { return '<div class="derived-cell"><span>' + item[0] + '</span><strong>' + item[1] + '</strong><small>' + item[2] + '</small></div>'; }).join('');
    var build = current.buildInfo || {};
    byId('skill-budget').textContent = build.occupationBudget != null
      ? '本职 ' + build.occupationSpent + ' / ' + build.occupationBudget + ' · 兴趣 ' + build.interestSpent + ' / ' + build.interestBudget
      : '来自导入角色卡';
    var baseByName = {};
    data.skills.forEach(function (skill) { baseByName[skill.name] = skillBase(skill, current.characteristics); });
    var emphasized = Object.keys(current.skills).filter(function (name) { return current.skills[name] > (baseByName[name] == null ? 0 : baseByName[name]); });
    var names = emphasized.concat(Object.keys(current.skills).filter(function (name) { return emphasized.indexOf(name) === -1; })).sort(function (a, b) { return current.skills[b] - current.skills[a] || a.localeCompare(b, 'zh-CN'); }).slice(0, 24);
    byId('skill-grid').innerHTML = names.map(function (name) { return '<div class="skill-pill"><span>' + escapeHtml(name) + '</span><strong>' + current.skills[name] + '%</strong></div>'; }).join('');
    byId('weapon-grid').innerHTML = current.weapons.length ? current.weapons.map(function (weapon) {
      var chance = weapon.skillValue || current.skills[weapon.skill] || 0;
      return '<div class="weapon-row"><strong>' + escapeHtml(weapon.name || '未命名武器') + '</strong><span>' + escapeHtml(weapon.skill || '—') + ' ' + chance + '%</span><span>' + escapeHtml(weapon.damage || '—') + '</span><span>' + (weapon.impale ? '贯穿' : '普通') + '</span></div>';
    }).join('') : '<p class="tabletop-empty">没有记录武器。</p>';
    byId('sheet-backstory').textContent = current.backstory || current.notes || '';
    byId('coc-name').value = current.name || '';
    byId('coc-player-name').value = current.playerName || '';
    byId('coc-age').value = current.age || 28;
    if (current.occupationId && occupationById(current.occupationId)) byId('coc-occupation').value = current.occupationId;
    byId('coc-backstory').value = current.backstory || '';
    renderOccupationPresets();
  }

  function renderOccupationPresets() {
    var selected = byId('coc-occupation').value;
    byId('occupation-presets').innerHTML = data.occupations.map(function (occupation) {
      return '<button type="button" data-occupation="' + escapeHtml(occupation.id) + '" class="' + (occupation.id === selected ? 'selected' : '') + '"><strong>' + escapeHtml(occupation.name) + '</strong><small>' + escapeHtml(occupation.summary) + '</small></button>';
    }).join('');
    document.querySelectorAll('[data-occupation]').forEach(function (button) { button.addEventListener('click', function () { byId('coc-occupation').value = button.getAttribute('data-occupation'); renderOccupationPresets(); }); });
  }

  function downloadJson() {
    if (!current) { showToast('请先生成或导入角色'); return; }
    saveCurrent();
    var blob = new Blob([JSON.stringify(current, null, 2)], { type:'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'COC7-调查员-' + (current.name || '未命名').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) + '.json';
    link.click(); URL.revokeObjectURL(link.href);
    showToast('角色 JSON 已导出');
  }

  async function importFile(file) {
    if (!file) return;
    try {
      var raw;
      if (/\.xlsx$/i.test(file.name) || /spreadsheetml/i.test(file.type)) {
        if (!xlsx) throw new Error('XLSX 解析器未加载');
        raw = await xlsx.importCharacter(file);
      } else {
        if (file.size > 2 * 1024 * 1024) throw new Error('JSON 文件过大');
        raw = JSON.parse(await file.text());
        if (raw && Array.isArray(raw.characters)) raw = raw.characters[0];
      }
      current = core.normalizeCharacter(raw, true);
      if (raw.buildInfo) current.buildInfo = raw.buildInfo;
      saveCurrent(); renderCharacter();
      var warnings = raw.source && Array.isArray(raw.source.warnings) ? raw.source.warnings : [];
      showToast(warnings.length ? '角色已导入；请注意：' + warnings.join(' ') : '角色卡已导入，所有战斗派生值已重新核对', warnings.length ? 7000 : 3200);
    } catch (error) {
      showToast('导入失败：' + (error && error.message ? error.message : '文件格式不兼容'), 6000);
    }
  }

  function submitKeeper() {
    if (!current || !current.name) { showToast('请先生成或导入角色'); return; }
    saveCurrent();
    pendingSubmissionId = makeId('submission');
    if (!channel) { showToast('未找到同源守秘人标签页；请导出 JSON 后交给守秘人'); return; }
    channel.postMessage({ protocol:MESSAGE_PROTOCOL, type:'character-submit', submissionId:pendingSubmissionId, sentAt:new Date().toISOString(), character:current });
    showToast('角色已提交；守秘人接收后会自动出现在战斗名册');
  }

  function flattenedRules() {
    var result = [];
    data.quickRules.forEach(function (group) { group.rules.forEach(function (rule) { result.push(Object.assign({ category:group.category, categoryTitle:group.title }, rule)); }); });
    return result;
  }

  function renderRules() {
    var query = byId('rule-search').value.trim().toLowerCase();
    byId('rule-category-nav').innerHTML = '<button type="button" data-rule-category="all" class="' + (selectedRuleCategory === 'all' ? 'selected' : '') + '">全部规则</button>' + data.quickRules.map(function (group) {
      return '<button type="button" data-rule-category="' + escapeHtml(group.category) + '" class="' + (selectedRuleCategory === group.category ? 'selected' : '') + '">' + escapeHtml(group.title) + ' · ' + group.rules.length + '</button>';
    }).join('');
    var rules = flattenedRules().filter(function (rule) {
      if (selectedRuleCategory !== 'all' && rule.category !== selectedRuleCategory) return false;
      if (!query) return true;
      return [rule.title, rule.summary, rule.categoryTitle, rule.source].join(' ').toLowerCase().indexOf(query) !== -1;
    });
    byId('quick-rule-title').textContent = selectedRuleCategory === 'all' ? '常用规则' : ((data.quickRules.find(function (group) { return group.category === selectedRuleCategory; }) || {}).title || '规则');
    byId('quick-rule-list').innerHTML = rules.map(function (rule) {
      var firstPage = Array.isArray(rule.pdfPages) && rule.pdfPages.length ? rule.pdfPages[0] : 1;
      return '<article class="quick-rule"><span>' + escapeHtml(rule.categoryTitle) + '</span><div><h4>' + escapeHtml(rule.title) + '</h4><p>' + escapeHtml(rule.summary) + '</p><footer><button type="button" data-pdf-page="' + firstPage + '">' + escapeHtml(rule.source || ('PDF 第 ' + firstPage + ' 页')) + ' ↗</button>' + (rule.optional ? ' · 可选规则' : '') + '</footer></div></article>';
    }).join('');
    byId('rule-empty').hidden = rules.length !== 0;
    document.querySelectorAll('[data-rule-category]').forEach(function (button) { button.addEventListener('click', function () { selectedRuleCategory = button.getAttribute('data-rule-category'); renderRules(); }); });
    document.querySelectorAll('[data-pdf-page]').forEach(function (button) { button.addEventListener('click', function () { showPdfPage(Number(button.getAttribute('data-pdf-page')) || 1); }); });
  }

  function showPdfPage(page) {
    pendingPdfPage = Math.max(1, Math.min(400, Math.round(page || 1)));
    if (!pdfUrl) { byId('rulebook-file').click(); showToast('请先选择你本机拥有的规则书 PDF'); return; }
    byId('rulebook-frame').src = pdfUrl + '#page=' + pendingPdfPage + '&view=FitH';
    byId('rulebook-frame').scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function loadPdf(file) {
    if (!file) return;
    if (file.size > 80 * 1024 * 1024 || (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf')) { showToast('请选择不超过 80 MB 的 PDF 规则书'); return; }
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(file);
    byId('rulebook-frame').src = pdfUrl + '#page=' + pendingPdfPage + '&view=FitH';
    byId('rulebook-frame').hidden = false;
    byId('rulebook-empty').hidden = true;
    byId('rulebook-open').disabled = false;
    showToast('规则书已在本机打开；不会上传到站点');
  }

  function bindEvents() {
    document.querySelectorAll('[data-tab-target]').forEach(function (button) { button.addEventListener('click', function () { activateTab(button.getAttribute('data-tab-target')); }); });
    byId('coc-builder-form').addEventListener('submit', function (event) { event.preventDefault(); generateCharacter(); });
    byId('coc-reroll').addEventListener('click', generateCharacter);
    byId('coc-occupation').addEventListener('change', renderOccupationPresets);
    byId('coc-import').addEventListener('click', function () { byId('coc-import-file').click(); });
    byId('coc-import-file').addEventListener('change', function (event) { importFile(event.target.files[0]); event.target.value = ''; });
    byId('coc-export-json').addEventListener('click', downloadJson);
    byId('coc-submit-keeper').addEventListener('click', submitKeeper);
    byId('coc-download-blank').addEventListener('click', function () { var link = document.createElement('a'); link.href = 'assets/rules/COC七版规则空白卡.xlsx'; link.download = 'COC七版规则空白卡.xlsx'; link.click(); });
    byId('rule-search').addEventListener('input', renderRules);
    byId('rulebook-choose').addEventListener('click', function () { byId('rulebook-file').click(); });
    byId('rulebook-file').addEventListener('change', function (event) { loadPdf(event.target.files[0]); event.target.value = ''; });
    byId('rulebook-open').addEventListener('click', function () { if (pdfUrl) window.open(pdfUrl + '#page=' + pendingPdfPage, '_blank', 'noopener'); });
    document.addEventListener('keydown', function (event) { if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { event.preventDefault(); activateTab('rules'); byId('rule-search').focus(); } });
    window.addEventListener('beforeunload', function () { if (pdfUrl) URL.revokeObjectURL(pdfUrl); });
  }

  function initialize() {
    byId('coc-occupation').innerHTML = data.occupations.map(function (occupation) { return '<option value="' + escapeHtml(occupation.id) + '">' + escapeHtml(occupation.name) + ' · ' + escapeHtml(occupation.pointFormula) + '</option>'; }).join('');
    renderOccupationPresets();
    current = loadStored();
    renderCharacter(); renderRules(); bindEvents();
    activateTab(new URL(window.location.href).searchParams.get('tab') === 'rules' ? 'rules' : 'builder', false);
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = function (event) {
        var message = event.data;
        if (!message || message.protocol && message.protocol !== MESSAGE_PROTOCOL) return;
        if (message.type === 'character-ack' && message.submissionId === pendingSubmissionId) showToast(message.accepted ? '守秘人已接收角色，可直接加入战斗场景' : '守秘人退回了这份角色卡');
        if (message.type === 'character-sync' && current && message.character && message.character.id === current.id) {
          current = core.normalizeCharacter(message.character, true); saveCurrent(); renderCharacter(); showToast('已同步守秘人战斗台上的资源变化');
        }
      };
      channel.postMessage({ protocol:MESSAGE_PROTOCOL, type:'ready', mode:'coc7', characterId:current && current.id });
    } catch (error) { channel = null; }
  }

  initialize();
}());
