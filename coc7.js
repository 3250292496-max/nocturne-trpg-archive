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
  var keeperAvailable = false;
  var selectedRuleCategory = 'all';
  var pdfUrl = '';
  var pendingPdfPage = 1;
  var toastTimer = null;
  var newCardArmed = false;
  var newCardTimer = null;
  var CUSTOM_OCCUPATION_ID = 'custom';
  var MAX_CUSTOM_SKILLS = 8;
  var featuredOccupationIds = [
    'doctor', 'journalist', 'policeDetective', 'privateInvestigator', 'professor',
    'antiquarian', 'author', 'engineer', 'soldier', 'militaryOfficer',
    'policePatrol', 'sheriff', 'federalAgent', CUSTOM_OCCUPATION_ID
  ];

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]; }); }
  function clamp(value, minimum, maximum, fallback) { var number = Number(value); return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback; }
  function makeId(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  function rollDie(sides) { return Math.floor(Math.random() * sides) + 1; }
  function rollDice(count, sides, add) { var total = Number(add || 0); for (var index = 0; index < count; index += 1) total += rollDie(sides); return total; }
  function occupationById(id) { return data.occupations.find(function (occupation) { return occupation.id === id; }) || null; }
  function skillById(id) { return data.skillById[id] || null; }
  function skillName(id) { var skill = skillById(id); return skill ? skill.name : id; }

  function occupationEntries() {
    var entries = data.occupations.filter(function (occupation) { return occupation.id !== CUSTOM_OCCUPATION_ID; }).slice();
    var customEntry = occupationById(CUSTOM_OCCUPATION_ID) || {
      id:CUSTOM_OCCUPATION_ID,
      name:'自定义职业',
      pointFormula:'与守秘人商定',
      summary:'自行填写职业名称、信用范围、职业属性公式与最多八项本职技能。'
    };
    entries.push(customEntry);
    return entries;
  }

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
    if (skill.id === 'dodge') return Math.floor(characteristics.dex / 2);
    if (skill.id === 'languageOwn') return characteristics.edu;
    if (skill.base !== null && skill.base !== undefined && skill.base !== '' && Number.isFinite(Number(skill.base))) return Number(skill.base);
    return 0;
  }

  function customSkillChoices() {
    return data.skills.filter(function (skill) {
      return skill.id !== 'creditRating' && skill.id !== 'cthulhuMythos' && !skill.lockedAtCreation;
    });
  }

  function populateCustomSkillOptions() {
    var select = byId('custom-occupation-skills');
    select.innerHTML = customSkillChoices().map(function (skill) {
      var suffix = skill.era === 'modern' ? ' · 现代' : '';
      return '<option value="' + escapeHtml(skill.id) + '">' + escapeHtml(skill.name + suffix) + '</option>';
    }).join('');
    refreshCustomSkillAvailability();
    updateCustomSkillCount();
  }

  function selectedCustomSkillIds() {
    return Array.from(byId('custom-occupation-skills').selectedOptions).filter(function (option) { return !option.disabled; }).map(function (option) { return option.value; }).slice(0, MAX_CUSTOM_SKILLS);
  }

  function updateCustomSkillCount(message) {
    var selected = selectedCustomSkillIds();
    var count = byId('custom-skill-count');
    count.textContent = message || ('已选择 ' + selected.length + ' / ' + MAX_CUSTOM_SKILLS + ' 项');
    count.classList.toggle('invalid', selected.length === 0 || selected.length > MAX_CUSTOM_SKILLS);
  }

  function enforceCustomSkillLimit() {
    var selected = Array.from(byId('custom-occupation-skills').selectedOptions).filter(function (option) { return !option.disabled; });
    if (selected.length > MAX_CUSTOM_SKILLS) {
      selected.slice(MAX_CUSTOM_SKILLS).forEach(function (option) { option.selected = false; });
      showToast('自定义职业最多选择八项本职技能');
    }
    updateCustomSkillCount();
  }

  function refreshCustomSkillAvailability() {
    var modern = byId('coc-era').value === 'modern';
    Array.from(byId('custom-occupation-skills').options).forEach(function (option) {
      var skill = skillById(option.value);
      option.disabled = Boolean(skill && skill.era === 'modern' && !modern);
      if (option.disabled) option.selected = false;
    });
    updateCustomSkillCount();
  }

  function syncCustomFormulaUi() {
    var usesSecond = byId('custom-occupation-formula').value === 'edu2plus';
    byId('custom-second-attribute').disabled = !usesSecond;
    var label = document.querySelector('.custom-second-attribute');
    if (label) label.hidden = !usesSecond;
  }

  function toggleCustomOccupationPanel() {
    var custom = byId('coc-occupation').value === CUSTOM_OCCUPATION_ID;
    byId('custom-occupation-panel').hidden = !custom;
    byId('custom-occupation-name').required = custom;
    byId('custom-occupation-skills').required = custom;
    byId('custom-occupation-agreed').required = custom;
    byId('coc-formula-strategy').disabled = custom;
    syncCustomFormulaUi();
  }

  function setCustomSkillIds(ids) {
    var selected = Array.isArray(ids) ? ids.slice(0, MAX_CUSTOM_SKILLS) : [];
    Array.from(byId('custom-occupation-skills').options).forEach(function (option) { option.selected = selected.indexOf(option.value) !== -1 && !option.disabled; });
    updateCustomSkillCount();
  }

  function customOccupationFromForm() {
    var name = byId('custom-occupation-name').value.trim();
    var creditMin = Math.round(clamp(byId('custom-credit-min').value, 0, 99, 9));
    var creditMax = Math.round(clamp(byId('custom-credit-max').value, 0, 99, 30));
    var skillIds = selectedCustomSkillIds();
    var formulaMode = byId('custom-occupation-formula').value === 'edu2plus' ? 'edu2plus' : 'edu4';
    var secondAttribute = String(byId('custom-second-attribute').value || 'dex').toLowerCase();
    var allowedAttributes = ['str','dex','app','pow','con','siz','int','edu'];
    if (allowedAttributes.indexOf(secondAttribute) === -1) secondAttribute = 'dex';
    if (!name) { showToast('请填写自定义职业名称'); byId('custom-occupation-name').focus(); return null; }
    if (creditMin > creditMax) { showToast('信用评级下限不能高于上限'); byId('custom-credit-min').focus(); return null; }
    if (!skillIds.length || skillIds.length > MAX_CUSTOM_SKILLS) { showToast('请选择一至八项本职技能'); byId('custom-occupation-skills').focus(); return null; }
    if (!byId('custom-occupation-agreed').checked) { showToast('请先与守秘人商量并确认自定义职业'); byId('custom-occupation-agreed').focus(); return null; }
    var secondCode = secondAttribute.toUpperCase();
    var pointFormula = formulaMode === 'edu4' ? 'EDU×4' : 'EDU×2 + ' + secondCode + '×2';
    var config = {
      name:name,
      creditRating:{ min:creditMin, max:creditMax },
      formulaMode:formulaMode,
      secondAttribute:secondAttribute,
      pointFormula:pointFormula,
      skillIds:skillIds.slice(),
      agreed:true
    };
    return {
      id:CUSTOM_OCCUPATION_ID,
      name:name,
      era:['1920s','modern'],
      creditRating:{ min:creditMin, max:creditMax },
      pointFormula:pointFormula,
      characteristicPriority:['EDU', secondCode],
      occupationalSkills:skillIds.map(function (id) { return { type:'skill', id:id, label:skillName(id) }; }),
      weapons:[],
      summary:'由玩家与守秘人协商的自定义职业。',
      custom:true,
      customConfig:config
    };
  }

  function inferCustomOccupationConfig(character) {
    var stored = character && character.buildInfo && character.buildInfo.customOccupation;
    if (stored && typeof stored === 'object') {
      return {
        name:String(stored.name || character.occupation || '自定义职业').slice(0, 80),
        creditRating:{
          min:Math.round(clamp(stored.creditRating && stored.creditRating.min, 0, 99, 9)),
          max:Math.round(clamp(stored.creditRating && stored.creditRating.max, 0, 99, 30))
        },
        formulaMode:stored.formulaMode === 'edu2plus' ? 'edu2plus' : 'edu4',
        secondAttribute:['str','dex','app','pow','con','siz','int','edu'].indexOf(String(stored.secondAttribute || '').toLowerCase()) !== -1 ? String(stored.secondAttribute).toLowerCase() : 'dex',
        skillIds:Array.isArray(stored.skillIds) ? stored.skillIds.filter(function (id) { var skill = skillById(id); return skill && !skill.lockedAtCreation && id !== 'creditRating' && id !== 'cthulhuMythos'; }).slice(0, MAX_CUSTOM_SKILLS) : [],
        agreed:Boolean(stored.agreed)
      };
    }
    var skillIds = [];
    if (character && character.skills) {
      customSkillChoices().map(function (skill) {
        return { id:skill.id, delta:Number(character.skills[skill.name] || 0) - skillBase(skill, character.characteristics || {}) };
      }).filter(function (item) { return item.delta > 0; }).sort(function (a, b) { return b.delta - a.delta; }).slice(0, MAX_CUSTOM_SKILLS).forEach(function (item) { skillIds.push(item.id); });
    }
    return {
      name:String(character && character.occupation || '自定义职业').slice(0, 80),
      creditRating:{ min:9, max:30 },
      formulaMode:'edu4',
      secondAttribute:'dex',
      skillIds:skillIds,
      agreed:false
    };
  }

  function loadCustomOccupationForm(config) {
    config = config || inferCustomOccupationConfig(current);
    byId('custom-occupation-name').value = config.name || '自定义职业';
    byId('custom-credit-min').value = Math.round(clamp(config.creditRating && config.creditRating.min, 0, 99, 9));
    byId('custom-credit-max').value = Math.round(clamp(config.creditRating && config.creditRating.max, 0, 99, 30));
    byId('custom-occupation-formula').value = config.formulaMode === 'edu2plus' ? 'edu2plus' : 'edu4';
    byId('custom-second-attribute').value = config.secondAttribute || 'dex';
    byId('custom-occupation-agreed').checked = Boolean(config.agreed);
    syncCustomFormulaUi();
    setCustomSkillIds(config.skillIds);
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
    var remainingPenalty = profile.physicalPenalty;
    if (physicalKeys.indexOf(strategy) !== -1) {
      physicalKeys = [strategy].concat(physicalKeys.filter(function (key) { return key !== strategy; }));
      physicalKeys.forEach(function (key) {
        var available = Math.max(0, values[key] - 5);
        var deduction = Math.min(remainingPenalty, available);
        values[key] -= deduction;
        remainingPenalty -= deduction;
      });
    } else {
      var cursor = 0;
      while (remainingPenalty > 0 && physicalKeys.some(function (key) { return values[key] > 5; })) {
        var balancedKey = physicalKeys[cursor % physicalKeys.length];
        if (values[balancedKey] > 5) { values[balancedKey] -= 1; remainingPenalty -= 1; }
        cursor += 1;
      }
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
      if (!occupation.custom) id = concreteSkillId(id);
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
    if (!occupation.custom) fallback.forEach(function (id) { if (chosen.length < 8) add(id); });
    return chosen.slice(0, 8);
  }

  function formulaBudget(occupation, characteristics, strategy) {
    var formula = String(occupation.pointFormula || 'EDU×4').toUpperCase();
    if (formula.indexOf('EDU×4') !== -1 || formula.indexOf('EDU*4') !== -1) return { value:characteristics.edu * 4, chosen:'EDU' };
    if ((formula.match(/EDU/g) || []).length > 1 && !/(STR|DEX|APP|POW|CON|SIZ|INT)/.test(formula)) return { value:characteristics.edu * 4, chosen:'EDU' };
    var options = ['STR','DEX','APP','POW','CON','SIZ','INT'].filter(function (key) { return formula.indexOf(key) !== -1; });
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
    var selectedOccupationId = byId('coc-occupation').value;
    var occupation = selectedOccupationId === CUSTOM_OCCUPATION_ID ? customOccupationFromForm() : occupationById(selectedOccupationId);
    if (!occupation) { showToast('没有找到所选职业，请重新选择或使用自定义职业'); return; }
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
    if (occupation.custom && occupation.customConfig) current.buildInfo.customOccupation = occupation.customConfig;
    saveCurrent(); renderCharacter();
    showToast('角色已完整生成：派生值和技能点均已自动计算');
  }

  function loadStored() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed) return null;
      var normalized = core.normalizeCharacter(parsed, true);
      if (parsed.buildInfo && typeof parsed.buildInfo === 'object' && !Array.isArray(parsed.buildInfo)) normalized.buildInfo = parsed.buildInfo;
      if (!occupationById(normalized.occupationId) || normalized.occupationId === CUSTOM_OCCUPATION_ID) {
        normalized.buildInfo = normalized.buildInfo || {};
        normalized.buildInfo.customOccupation = inferCustomOccupationConfig(normalized);
      }
      return normalized;
    } catch (error) { return null; }
  }

  function startNewCharacter() {
    var button = byId('coc-new-character');
    if (current && !newCardArmed) {
      newCardArmed = true;
      button.textContent = '再次点击确认新建';
      showToast('当前卡未导出的修改会被清空；请在 5 秒内再次点击确认。', 5000);
      window.clearTimeout(newCardTimer);
      newCardTimer = window.setTimeout(function () { newCardArmed = false; button.textContent = '新建另一张卡'; }, 5000);
      return;
    }
    newCardArmed = false;
    window.clearTimeout(newCardTimer);
    button.textContent = '新建另一张卡';
    current = null;
    localStorage.removeItem(STORAGE_KEY);
    byId('coc-builder-form').reset();
    byId('coc-occupation-search').value = '';
    updateAgeStrategyOptions();
    refreshCustomSkillAvailability();
    renderOccupationOptions('', data.occupations[0] && data.occupations[0].id);
    renderCharacter();
    showToast('已打开一张新的调查员卡');
  }

  function saveCurrent() {
    if (!current) return;
    current.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    byId('coc-save-status').textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' });
  }

  function syncEditableFields(shouldRender) {
    if (!current) return;
    var raw = JSON.parse(JSON.stringify(current));
    var buildInfo = current.buildInfo;
    raw.name = byId('coc-name').value.trim() || '未命名调查员';
    raw.playerName = byId('coc-player-name').value.trim();
    raw.backstory = byId('coc-backstory').value.trim();
    raw.era = byId('coc-era').value === 'modern' ? '现代' : '经典 1920 年代';
    current = core.normalizeCharacter(raw);
    if (buildInfo) current.buildInfo = buildInfo;
    saveCurrent();
    if (shouldRender) renderCharacter();
  }

  function updateAgeStrategyOptions() {
    var youth = Number(byId('coc-age').value) < 20;
    var select = byId('coc-age-strategy');
    Array.from(select.options).forEach(function (option) {
      if (option.value === 'balanced') option.textContent = youth ? '力量／体型均衡（推荐）' : '三项均衡（推荐）';
      if (option.value === 'siz') option.disabled = !youth;
      if (option.value === 'con' || option.value === 'dex') option.disabled = youth;
    });
    if (select.selectedOptions[0] && select.selectedOptions[0].disabled) select.value = 'balanced';
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
    var names = emphasized.concat(Object.keys(current.skills).filter(function (name) { return emphasized.indexOf(name) === -1; })).sort(function (a, b) { return current.skills[b] - current.skills[a] || a.localeCompare(b, 'zh-CN'); });
    byId('skill-grid').innerHTML = names.map(function (name) { return '<div class="skill-pill"><span>' + escapeHtml(name) + '</span><strong>' + current.skills[name] + '%</strong></div>'; }).join('');
    byId('weapon-grid').innerHTML = current.weapons.length ? current.weapons.map(function (weapon) {
      var chance = weapon.skillValue || current.skills[weapon.skill] || 0;
      return '<div class="weapon-row"><strong>' + escapeHtml(weapon.name || '未命名武器') + '</strong><span>' + escapeHtml(weapon.skill || '—') + ' ' + chance + '%</span><span>' + escapeHtml(weapon.damage || '—') + '</span><span>' + (weapon.impale ? '贯穿' : '普通') + '</span></div>';
    }).join('') : '<p class="tabletop-empty">没有记录武器。</p>';
    byId('sheet-backstory').textContent = current.backstory || current.notes || '';
    byId('coc-name').value = current.name || '';
    byId('coc-player-name').value = current.playerName || '';
    byId('coc-age').value = current.age || 28;
    byId('coc-era').value = /现代/.test(current.era || '') ? 'modern' : 'classic';
    updateAgeStrategyOptions();
    refreshCustomSkillAvailability();
    var knownOccupation = occupationById(current.occupationId) || data.occupations.find(function (occupation) { return occupation.id !== CUSTOM_OCCUPATION_ID && occupation.name === current.occupation; }) || null;
    var selectedOccupationId = knownOccupation && knownOccupation.id !== CUSTOM_OCCUPATION_ID ? knownOccupation.id : CUSTOM_OCCUPATION_ID;
    byId('coc-occupation-search').value = '';
    renderOccupationOptions('', selectedOccupationId);
    if (selectedOccupationId === CUSTOM_OCCUPATION_ID) loadCustomOccupationForm(inferCustomOccupationConfig(current));
    byId('coc-backstory').value = current.backstory || '';
  }

  function occupationMatches(occupation, query) {
    if (!query) return true;
    var haystack = [occupation.id, occupation.name, occupation.summary, occupation.pointFormula].join(' ').toLowerCase();
    return haystack.indexOf(String(query).trim().toLowerCase()) !== -1;
  }

  function renderOccupationOptions(query, preferredId) {
    var select = byId('coc-occupation');
    var entries = occupationEntries();
    var selected = preferredId || select.value || (entries[0] && entries[0].id) || CUSTOM_OCCUPATION_ID;
    var filtered = entries.filter(function (occupation) { return occupationMatches(occupation, query); });
    var selectedEntry = entries.find(function (occupation) { return occupation.id === selected; });
    var customEntry = entries.find(function (occupation) { return occupation.id === CUSTOM_OCCUPATION_ID; });
    if (selectedEntry && !filtered.some(function (occupation) { return occupation.id === selectedEntry.id; })) filtered.unshift(selectedEntry);
    if (customEntry && !filtered.some(function (occupation) { return occupation.id === CUSTOM_OCCUPATION_ID; })) filtered.push(customEntry);
    if (!selectedEntry) selected = CUSTOM_OCCUPATION_ID;
    select.innerHTML = filtered.map(function (occupation) {
      return '<option value="' + escapeHtml(occupation.id) + '">' + escapeHtml(occupation.name) + ' · ' + escapeHtml(occupation.pointFormula || '职业公式自定') + '</option>';
    }).join('');
    select.value = filtered.some(function (occupation) { return occupation.id === selected; }) ? selected : (filtered[0] && filtered[0].id || CUSTOM_OCCUPATION_ID);
    toggleCustomOccupationPanel();
    renderOccupationPresets(query);
  }

  function renderOccupationPresets(query) {
    var selected = byId('coc-occupation').value;
    var entries = occupationEntries();
    entries = query
      ? entries.filter(function (occupation) { return occupationMatches(occupation, query); })
      : featuredOccupationIds.map(function (id) { return entries.find(function (occupation) { return occupation.id === id; }); }).filter(Boolean);
    byId('occupation-presets').innerHTML = entries.length ? entries.map(function (occupation) {
      return '<button type="button" data-occupation="' + escapeHtml(occupation.id) + '" class="' + (occupation.id === selected ? 'selected' : '') + '"><strong>' + escapeHtml(occupation.name) + '</strong><small>' + escapeHtml(occupation.summary) + '</small></button>';
    }).join('') : '<p class="custom-occupation-note">没有找到匹配职业；可以清空搜索或选择“自定义职业”。</p>';
    document.querySelectorAll('[data-occupation]').forEach(function (button) {
      button.addEventListener('click', function () {
        byId('coc-occupation-search').value = '';
        renderOccupationOptions('', button.getAttribute('data-occupation'));
        if (byId('coc-occupation').value === CUSTOM_OCCUPATION_ID && !byId('custom-occupation-name').value) loadCustomOccupationForm(inferCustomOccupationConfig(null));
      });
    });
  }

  function downloadJson() {
    if (!current) { showToast('请先生成或导入角色'); return; }
    syncEditableFields(false);
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
      var imported = core.normalizeCharacter(raw, true);
      if (!imported.name || Object.keys(imported.characteristics).filter(function (key) { return key !== 'luck' && imported.characteristics[key] >= 1; }).length < 6) throw new Error('角色姓名或八项基础属性不完整');
      current = imported;
      if (raw.buildInfo && typeof raw.buildInfo === 'object' && !Array.isArray(raw.buildInfo)) current.buildInfo = raw.buildInfo;
      if (!occupationById(current.occupationId) || current.occupationId === CUSTOM_OCCUPATION_ID) {
        current.buildInfo = current.buildInfo || {};
        current.buildInfo.customOccupation = inferCustomOccupationConfig(current);
      }
      saveCurrent(); renderCharacter();
      var warnings = raw.source && Array.isArray(raw.source.warnings) ? raw.source.warnings : [];
      showToast(warnings.length ? '角色已导入；请注意：' + warnings.join(' ') : '角色卡已导入，所有战斗派生值已重新核对', warnings.length ? 7000 : 3200);
    } catch (error) {
      showToast('导入失败：' + (error && error.message ? error.message : '文件格式不兼容'), 6000);
    }
  }

  async function loadBundledExample() {
    if (!xlsx || typeof xlsx.importFromUrl !== 'function') { showToast('示例模板导入器未加载'); return; }
    try {
      var raw = await xlsx.importFromUrl('assets/rules/COC七版规则空白卡.xlsx');
      current = core.normalizeCharacter(raw, true);
      if (!occupationById(current.occupationId) || current.occupationId === CUSTOM_OCCUPATION_ID) {
        current.buildInfo = { customOccupation:inferCustomOccupationConfig(current) };
      }
      saveCurrent(); renderCharacter();
      var warnings = raw.source && Array.isArray(raw.source.warnings) ? raw.source.warnings : [];
      showToast('已载入“雪莱”示例。' + (warnings.length ? warnings.join(' ') : ''), 7000);
    } catch (error) { showToast('示例模板读取失败：' + (error && error.message ? error.message : '未知错误'), 6000); }
  }

  function submitKeeper() {
    if (!current || !current.name) { showToast('请先生成或导入角色'); return; }
    syncEditableFields(false);
    saveCurrent();
    pendingSubmissionId = makeId('submission');
    if (!channel) { showToast('未找到同源守秘人标签页；请导出 JSON 后交给守秘人'); return; }
    var submissionId = pendingSubmissionId;
    channel.postMessage({ protocol:MESSAGE_PROTOCOL, type:'ready', mode:'coc7', characterId:current.id });
    channel.postMessage({ protocol:MESSAGE_PROTOCOL, type:'character-submit', submissionId:submissionId, sentAt:new Date().toISOString(), character:current });
    showToast(keeperAvailable ? '角色已发送，等待守秘人接收确认…' : '已尝试发送；收到守秘人确认才算成功', 4200);
    window.setTimeout(function () {
      if (pendingSubmissionId === submissionId) showToast('尚未收到守秘人确认。请打开同源守秘人页面重试，或导出 JSON 交给守秘人。', 7000);
    }, 4500);
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
    byId('coc-new-character').addEventListener('click', startNewCharacter);
    byId('coc-occupation-search').addEventListener('input', function () { renderOccupationOptions(byId('coc-occupation-search').value, byId('coc-occupation').value); });
    byId('coc-occupation').addEventListener('change', function () {
      toggleCustomOccupationPanel();
      renderOccupationPresets(byId('coc-occupation-search').value);
      if (byId('coc-occupation').value === CUSTOM_OCCUPATION_ID && !byId('custom-occupation-name').value) loadCustomOccupationForm(inferCustomOccupationConfig(null));
    });
    byId('custom-occupation-formula').addEventListener('change', syncCustomFormulaUi);
    byId('custom-occupation-skills').addEventListener('change', enforceCustomSkillLimit);
    ['coc-name','coc-player-name','coc-backstory'].forEach(function (id) { byId(id).addEventListener('change', function () { syncEditableFields(true); }); });
    byId('coc-era').addEventListener('change', function () { refreshCustomSkillAvailability(); syncEditableFields(true); });
    byId('coc-age').addEventListener('input', updateAgeStrategyOptions);
    byId('coc-age').addEventListener('change', function () { if (current && Number(byId('coc-age').value) !== current.age) showToast('年龄会改变属性减值与 MOV；请点击“一键生成”重新按年龄计算。', 5200); });
    byId('coc-import').addEventListener('click', function () { byId('coc-import-file').click(); });
    byId('coc-load-example').addEventListener('click', loadBundledExample);
    byId('coc-import-file').addEventListener('change', function (event) { importFile(event.target.files[0]); event.target.value = ''; });
    byId('coc-export-json').addEventListener('click', downloadJson);
    byId('coc-submit-keeper').addEventListener('click', submitKeeper);
    byId('coc-download-blank').addEventListener('click', function () { var link = document.createElement('a'); link.href = 'assets/rules/COC七版规则空白卡.xlsx'; link.download = 'COC7-示例模板卡-含雪莱.xlsx'; link.click(); });
    byId('rule-search').addEventListener('input', renderRules);
    byId('rulebook-choose').addEventListener('click', function () { byId('rulebook-file').click(); });
    byId('rulebook-file').addEventListener('change', function (event) { loadPdf(event.target.files[0]); event.target.value = ''; });
    byId('rulebook-open').addEventListener('click', function () { if (pdfUrl) window.open(pdfUrl + '#page=' + pendingPdfPage, '_blank', 'noopener'); });
    document.addEventListener('keydown', function (event) { if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { event.preventDefault(); activateTab('rules'); byId('rule-search').focus(); } });
    window.addEventListener('beforeunload', function () { if (pdfUrl) URL.revokeObjectURL(pdfUrl); });
  }

  function initialize() {
    populateCustomSkillOptions();
    renderOccupationOptions('', data.occupations[0] && data.occupations[0].id);
    current = loadStored();
    renderCharacter(); renderRules(); bindEvents();
    activateTab(new URL(window.location.href).searchParams.get('tab') === 'rules' ? 'rules' : 'builder', false);
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = function (event) {
        var message = event.data;
        if (!message || message.protocol && message.protocol !== MESSAGE_PROTOCOL) return;
        if (message.type === 'keeper-ready') keeperAvailable = true;
        if (message.type === 'character-ack' && message.submissionId === pendingSubmissionId) { pendingSubmissionId = ''; showToast(message.accepted ? '守秘人已接收角色，可直接加入战斗场景' : '守秘人退回了这份角色卡'); }
        if (message.type === 'character-sync' && current && message.character && message.character.id === current.id) {
          var synced = core.normalizeCharacter(message.character, true);
          if (message.character.buildInfo && typeof message.character.buildInfo === 'object' && !Array.isArray(message.character.buildInfo)) synced.buildInfo = message.character.buildInfo;
          if (!occupationById(synced.occupationId) || synced.occupationId === CUSTOM_OCCUPATION_ID) {
            synced.buildInfo = synced.buildInfo || {};
            synced.buildInfo.customOccupation = inferCustomOccupationConfig(synced);
          }
          current = synced; saveCurrent(); renderCharacter(); showToast('已同步守秘人战斗台上的资源变化');
        }
      };
      channel.postMessage({ protocol:MESSAGE_PROTOCOL, type:'ready', mode:'coc7', characterId:current && current.id });
    } catch (error) { channel = null; }
  }

  initialize();
}());
