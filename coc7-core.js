(function (root, factory) {
  'use strict';

  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  root.COC7_CORE = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var PROTOCOL = 'coc7-character-v1';
  var RULESET_ID = 'coc7-7e';
  var LEVEL_RANK = Object.freeze({ fumble:0, failure:1, regular:2, hard:3, extreme:4, critical:5 });
  var CHARACTERISTIC_KEYS = Object.freeze(['str','con','siz','dex','app','int','pow','edu','luck']);
  var CHARACTERISTIC_ALIASES = Object.freeze({
    str:['str','strength','力量'], con:['con','constitution','体质'], siz:['siz','size','体型'],
    dex:['dex','dexterity','敏捷'], app:['app','appearance','外貌'], int:['int','intelligence','智力'],
    pow:['pow','power','意志'], edu:['edu','education','教育'], luck:['luck','幸运']
  });

  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function finite(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  function integer(value, fallback) { return Math.round(finite(value, fallback)); }
  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  function cleanText(value, maximum) {
    return (typeof value === 'string' ? value : '').replace(/\u0000/g, '').trim().slice(0, maximum);
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function canonicalKey(value) {
    return String(value == null ? '' : value).normalize('NFKC').trim().toLowerCase().replace(/[\s_()（）-]+/g, '');
  }
  function firstValue(objects, names, fallback) {
    for (var objectIndex = 0; objectIndex < objects.length; objectIndex += 1) {
      var object = objects[objectIndex];
      if (!object || typeof object !== 'object') continue;
      for (var nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
        var name = names[nameIndex];
        if (own(object, name) && object[name] !== '' && object[name] != null) return object[name];
      }
      var wanted = names.map(canonicalKey);
      var keys = Object.keys(object);
      for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        if (wanted.indexOf(canonicalKey(keys[keyIndex])) !== -1 && object[keys[keyIndex]] !== '' && object[keys[keyIndex]] != null) {
          return object[keys[keyIndex]];
        }
      }
    }
    return fallback;
  }
  function percentValue(value, fallback) { return clamp(integer(value, fallback), 0, 999); }
  function resourceValue(value, fallback, maximum) { return clamp(integer(value, fallback), 0, maximum); }

  function normalizeCharacteristics(raw) {
    var sources = [];
    if (raw && typeof raw === 'object') {
      if (raw.characteristics && typeof raw.characteristics === 'object') sources.push(raw.characteristics);
      if (raw.stats && typeof raw.stats === 'object') sources.push(raw.stats);
      sources.push(raw);
    }
    var result = {};
    CHARACTERISTIC_KEYS.forEach(function (key) {
      result[key] = percentValue(firstValue(sources, CHARACTERISTIC_ALIASES[key], 0), 0);
    });
    return result;
  }

  function damageBonusAndBuild(strength, size) {
    var total = Math.max(0, integer(strength, 0)) + Math.max(0, integer(size, 0));
    if (total <= 64) return { damageBonus:'-2', build:-2 };
    if (total <= 84) return { damageBonus:'-1', build:-1 };
    if (total <= 124) return { damageBonus:'0', build:0 };
    if (total <= 164) return { damageBonus:'1d4', build:1 };
    if (total <= 204) return { damageBonus:'1d6', build:2 };
    var dice = 2 + Math.floor((total - 205) / 80);
    return { damageBonus:dice + 'd6', build:dice + 1 };
  }

  function ageProfile(age) {
    var value = clamp(integer(age, 0), 0, 150);
    if (value >= 80) return { moveModifier:-5, physicalPenalty:80, appPenalty:25, eduPenalty:0, eduImprovementChecks:4, luckRolls:1 };
    if (value >= 70) return { moveModifier:-4, physicalPenalty:40, appPenalty:20, eduPenalty:0, eduImprovementChecks:4, luckRolls:1 };
    if (value >= 60) return { moveModifier:-3, physicalPenalty:20, appPenalty:15, eduPenalty:0, eduImprovementChecks:4, luckRolls:1 };
    if (value >= 50) return { moveModifier:-2, physicalPenalty:10, appPenalty:10, eduPenalty:0, eduImprovementChecks:3, luckRolls:1 };
    if (value >= 40) return { moveModifier:-1, physicalPenalty:5, appPenalty:5, eduPenalty:0, eduImprovementChecks:2, luckRolls:1 };
    if (value >= 20) return { moveModifier:0, physicalPenalty:0, appPenalty:0, eduPenalty:0, eduImprovementChecks:1, luckRolls:1 };
    if (value >= 15) return { moveModifier:0, physicalPenalty:5, appPenalty:0, eduPenalty:5, eduImprovementChecks:0, luckRolls:2 };
    return { moveModifier:0, physicalPenalty:0, appPenalty:0, eduPenalty:0, eduImprovementChecks:0, luckRolls:1 };
  }

  function derive(characteristics, age) {
    var values = normalizeCharacteristics(characteristics || {});
    var half = {};
    var fifth = {};
    CHARACTERISTIC_KEYS.forEach(function (key) {
      half[key] = Math.floor(values[key] / 2);
      fifth[key] = Math.floor(values[key] / 5);
    });
    var maxHp = Math.floor((values.con + values.siz) / 10);
    var maxMp = Math.floor(values.pow / 5);
    var baseMove = values.str < values.siz && values.dex < values.siz ? 7
      : values.str > values.siz && values.dex > values.siz ? 9 : 8;
    var profile = ageProfile(age);
    var physical = damageBonusAndBuild(values.str, values.siz);
    return {
      characteristics:values,
      half:half,
      fifth:fifth,
      age:clamp(integer(age, 0), 0, 150),
      ageAdjustments:profile,
      maxHp:maxHp,
      hitPoints:maxHp,
      maxMp:maxMp,
      magicPoints:maxMp,
      startingSan:values.pow,
      sanity:values.pow,
      maxSan:99,
      move:Math.max(1, baseMove + profile.moveModifier),
      baseMove:baseMove,
      damageBonus:physical.damageBonus,
      build:physical.build,
      dodge:Math.floor(values.dex / 2)
    };
  }

  function normalizeSkills(raw) {
    var source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    var result = {};
    Object.keys(source).slice(0, 300).forEach(function (name) {
      var cleanName = cleanText(name, 100);
      if (!cleanName) return;
      var supplied = source[name] && typeof source[name] === 'object' ? source[name].value : source[name];
      result[cleanName] = percentValue(supplied, 0);
    });
    return result;
  }

  function skillValue(skills, names, fallback) {
    var source = skills && typeof skills === 'object' ? skills : {};
    var wanted = names.map(canonicalKey);
    var keys = Object.keys(source);
    for (var index = 0; index < keys.length; index += 1) {
      if (wanted.indexOf(canonicalKey(keys[index])) !== -1) return percentValue(source[keys[index]], fallback);
    }
    return Number(fallback) < 0 ? Number(fallback) : percentValue(fallback, 0);
  }

  function normalizeStatus(raw) {
    var status = raw && raw.status && typeof raw.status === 'object' ? raw.status : {};
    var runtime = raw && raw.runtime && typeof raw.runtime === 'object' ? raw.runtime : {};
    var insanity = raw && raw.insanity && typeof raw.insanity === 'object' ? raw.insanity
      : runtime.insanity && typeof runtime.insanity === 'object' ? runtime.insanity : {};
    function flag(name, insanityName) {
      if (own(status, name)) return Boolean(status[name]);
      if (raw && own(raw, name)) return Boolean(raw[name]);
      return Boolean(insanityName && insanity[insanityName]);
    }
    return {
      majorWound:flag('majorWound'), prone:flag('prone'), unconscious:flag('unconscious'),
      dying:flag('dying'), dead:flag('dead'), temporaryInsanity:flag('temporaryInsanity', 'temporary'),
      indefiniteInsanity:flag('indefiniteInsanity', 'indefinite'), permanentInsanity:flag('permanentInsanity', 'permanent')
    };
  }

  function defaultId() {
    var random = '';
    try {
      if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
        var bytes = new Uint32Array(2);
        root.crypto.getRandomValues(bytes);
        random = bytes[0].toString(36) + bytes[1].toString(36);
      }
    } catch (error) {}
    if (!random) random = Math.random().toString(36).slice(2, 14);
    return 'coc7-' + Date.now().toString(36) + '-' + random.slice(0, 16);
  }

  function normalizeCharacter(raw, createId) {
    if (raw == null) raw = {};
    if (typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('character must be an object');
    if (raw.protocol && raw.protocol !== PROTOCOL) throw new Error('incompatible character protocol');
    if (raw.rulesetId && raw.rulesetId !== RULESET_ID) throw new Error('incompatible ruleset');

    var age = clamp(integer(firstValue([raw], ['age','年龄'], 0), 0), 0, 150);
    var characteristics = normalizeCharacteristics(raw);
    var derived = derive(characteristics, age);
    var skills = normalizeSkills(raw.skills || raw.skillValues || {});
    var mythos = skillValue(skills, ['Cthulhu Mythos','CthulhuMythos','克苏鲁神话'], 0);
    var maxSan = clamp(99 - mythos, 0, 99);
    var resourceSource = raw.resources && typeof raw.resources === 'object' ? raw.resources : {};
    var currentSource = raw.current && typeof raw.current === 'object' ? raw.current : {};
    var suppliedId = cleanText(raw.id, 80);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(suppliedId)) suppliedId = '';
    if (!suppliedId && typeof createId === 'function') suppliedId = cleanText(createId(raw), 80);
    else if (!suppliedId && createId === true) suppliedId = defaultId();
    if (suppliedId && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(suppliedId)) throw new Error('createId returned an invalid id');

    var hpSource = resourceSource.hp && typeof resourceSource.hp === 'object' ? resourceSource.hp.current : resourceSource.hp;
    var mpSource = resourceSource.mp && typeof resourceSource.mp === 'object' ? resourceSource.mp.current : resourceSource.mp;
    var sanSource = resourceSource.san && typeof resourceSource.san === 'object' ? resourceSource.san.current : resourceSource.san;
    var hp = resourceValue(firstValue([currentSource, { hp:hpSource }, raw], ['hp','currentHp','currentHP','生命值'], derived.maxHp), derived.maxHp, derived.maxHp);
    var mp = resourceValue(firstValue([currentSource, { mp:mpSource }, raw], ['mp','currentMp','currentMP','魔法值'], derived.maxMp), derived.maxMp, derived.maxMp);
    var san = resourceValue(firstValue([currentSource, { san:sanSource }, raw], ['san','sanity','currentSan','理智'], Math.min(derived.startingSan, maxSan)), Math.min(derived.startingSan, maxSan), maxSan);
    var luck = resourceValue(firstValue([currentSource, resourceSource, raw, characteristics], ['luck','幸运'], characteristics.luck), characteristics.luck, 99);
    var status = normalizeStatus(raw);
    var runtimeSource = raw.runtime && typeof raw.runtime === 'object' ? raw.runtime : {};
    var insanitySource = raw.insanity && typeof raw.insanity === 'object' ? raw.insanity
      : runtimeSource.insanity && typeof runtimeSource.insanity === 'object' ? runtimeSource.insanity : {};
    var sanDayStart = resourceValue(firstValue([runtimeSource, raw], ['sanDayStart','sanityStartOfDay'], san), san, maxSan);
    var sanDayLoss = resourceValue(firstValue([runtimeSource, raw], ['sanDayLoss','sanityLostToday'], 0), 0, 999);
    var insanity = {
      temporary:Boolean(own(insanitySource, 'temporary') ? insanitySource.temporary : status.temporaryInsanity),
      temporaryHours:resourceValue(insanitySource.temporaryHours, 0, 10),
      indefinite:Boolean(own(insanitySource, 'indefinite') ? insanitySource.indefinite : status.indefiniteInsanity),
      permanent:Boolean(own(insanitySource, 'permanent') ? insanitySource.permanent : status.permanentInsanity)
    };
    if (hp === 0) status.unconscious = true;
    if (status.dead) { status.unconscious = true; status.dying = false; }
    if (san === 0) { status.permanentInsanity = true; insanity.permanent = true; }
    status.temporaryInsanity = insanity.temporary;
    status.indefiniteInsanity = insanity.indefinite;
    status.permanentInsanity = insanity.permanent;

    var weapons = Array.isArray(raw.weapons) ? raw.weapons.slice(0, 60).map(function (weapon, weaponIndex) {
      if (!weapon || typeof weapon !== 'object') return null;
      return {
        id:cleanText(weapon.id, 80) || ('weapon-' + (weaponIndex + 1)), name:cleanText(weapon.name, 100), type:cleanText(weapon.type, 60),
        skill:cleanText(weapon.skill, 100), skillValue:percentValue(weapon.skillValue, 0),
        damage:cleanText(weapon.damage, 80), range:cleanText(weapon.range, 80),
        impale:Boolean(weapon.impale), attacksPerRound:cleanText(weapon.attacksPerRound || weapon.attacks, 30),
        ammunition:cleanText(weapon.ammunition || weapon.ammo, 30), malfunction:resourceValue(weapon.malfunction, 0, 100)
      };
    }).filter(Boolean) : [];

    return {
      protocol:PROTOCOL,
      rulesetId:RULESET_ID,
      schemaVersion:1,
      id:suppliedId,
      name:cleanText(firstValue([raw], ['name','characterName','姓名'], ''), 100),
      playerName:cleanText(firstValue([raw], ['playerName','player','玩家'], ''), 100),
      occupation:cleanText(firstValue([raw], ['occupation','职业'], ''), 120),
      occupationId:cleanText(raw.occupationId, 80),
      era:cleanText(raw.era, 80),
      age:age,
      sex:cleanText(firstValue([raw], ['sex','gender','性别'], ''), 40),
      residence:cleanText(firstValue([raw], ['residence','住址'], ''), 160),
      birthplace:cleanText(firstValue([raw], ['birthplace','出生地'], ''), 160),
      characteristics:characteristics,
      skills:skills,
      derived:Object.assign({}, derived, { maxSan:maxSan }),
      hp:hp,
      maxHp:derived.maxHp,
      mp:mp,
      maxMp:derived.maxMp,
      san:san,
      maxSan:maxSan,
      luck:luck,
      armor:resourceValue(firstValue([raw], ['armor','护甲'], 0), 0, 999),
      armorName:cleanText(raw.armorName, 100),
      armorCoverage:cleanText(raw.armorCoverage, 100),
      damageBonus:cleanText(raw.damageBonus, 30) || derived.damageBonus,
      build:integer(raw.build, derived.build),
      move:resourceValue(raw.move, derived.move, 99),
      status:status,
      sanDayStart:sanDayStart,
      sanDayLoss:sanDayLoss,
      insanity:insanity,
      runtime:{ sanDayStart:sanDayStart, sanDayLoss:sanDayLoss, insanity:clone(insanity) },
      // Compatibility aliases for early drafts of the COC7 adapter.
      sanityStartOfDay:sanDayStart,
      sanityLostToday:sanDayLoss,
      weapons:weapons,
      backstory:cleanText(raw.backstory, 2000),
      source:raw.source && typeof raw.source === 'object' ? clone(raw.source) : null,
      notes:cleanText(raw.notes, 4000),
      updatedAt:cleanText(raw.updatedAt, 40)
    };
  }

  function validateSkill(value) {
    var number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 999) throw new RangeError('skill must be between 0 and 999');
    return Math.round(number);
  }

  function successLevel(percentile, skill) {
    var roll = Number(percentile);
    if (!Number.isInteger(roll) || roll < 1 || roll > 100) throw new RangeError('percentile must be an integer from 1 to 100');
    var target = validateSkill(skill);
    if (roll === 1) return 'critical';
    if (roll === 100 || (target < 50 && roll >= 96)) return 'fumble';
    if (roll <= Math.floor(target / 5)) return 'extreme';
    if (roll <= Math.floor(target / 2)) return 'hard';
    if (roll <= target) return 'regular';
    return 'failure';
  }

  function checkedRandom(rng) {
    var value = (typeof rng === 'function' ? rng : Math.random)();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('rng must return a number in [0, 1)');
    return value;
  }
  function randomDigit(rng) { return Math.floor(checkedRandom(rng) * 10); }
  function randomDie(sides, rng) { return Math.floor(checkedRandom(rng) * sides) + 1; }
  function percentileFromDigits(tens, units) {
    var value = tens * 10 + units;
    return value === 0 ? 100 : value;
  }

  // bonusPenalty: positive values are bonus dice; negative values are penalty dice.
  function rollPercentile(skill, bonusPenalty, rng) {
    var target = validateSkill(skill);
    var modifier = clamp(integer(bonusPenalty, 0), -2, 2);
    var units = randomDigit(rng);
    var tens = [];
    for (var index = 0; index < 1 + Math.abs(modifier); index += 1) tens.push(randomDigit(rng));
    var candidates = tens.map(function (digit) { return percentileFromDigits(digit, units); });
    var roll = modifier > 0 ? Math.min.apply(Math, candidates)
      : modifier < 0 ? Math.max.apply(Math, candidates) : candidates[0];
    var level = successLevel(roll, target);
    return {
      roll:roll, skill:target, bonusPenalty:modifier, units:units, tens:tens,
      candidates:candidates, level:level, rank:LEVEL_RANK[level],
      success:LEVEL_RANK[level] >= LEVEL_RANK.regular
    };
  }

  function normalizeDamageSource(expression) {
    if (typeof expression === 'number') {
      if (!Number.isFinite(expression)) throw new TypeError('damage expression must be finite');
      return String(Math.trunc(expression));
    }
    if (typeof expression !== 'string') throw new TypeError('damage expression must be a string or number');
    var source = expression.normalize('NFKC').toUpperCase()
      .replace(/DAMAGE\s*BONUS/g, 'DB')
      .replace(/伤害(?:加值|奖励)/g, 'DB')
      .replace(/[＋﹢]/g, '+').replace(/[－−﹣]/g, '-').replace(/[×·]/g, '*')
      .replace(/\s+/g, '');
    source = source
      .replace(/(?:半DB|½DB|1[\/⁄]2DB|DB[\/⁄]2|0\.5\*?DB)/g, '0.5DB')
      .replace(/^(NONE|无)$/i, '0');
    return source;
  }

  function parseDamageExpression(expression) {
    var source = normalizeDamageSource(expression);
    if (!source || source.length > 180) throw new Error('invalid damage expression');
    if (source.charAt(0) !== '+' && source.charAt(0) !== '-') source = '+' + source;
    var pattern = /([+-])([^+-]+)/g;
    var match;
    var cursor = 0;
    var terms = [];
    while ((match = pattern.exec(source))) {
      if (match.index !== cursor) throw new Error('invalid damage expression');
      cursor = pattern.lastIndex;
      var sign = match[1] === '-' ? -1 : 1;
      var token = match[2];
      var dice = token.match(/^(\d*)D(\d+)$/);
      var db = token.match(/^((?:\d+(?:\.\d+)?|\.\d+)\*?)?DB$/);
      var constant = token.match(/^\d+$/);
      if (dice) {
        var count = dice[1] ? Number(dice[1]) : 1;
        var sides = Number(dice[2]);
        if (!Number.isInteger(count) || count < 1 || count > 100 || !Number.isInteger(sides) || sides < 2 || sides > 1000) {
          throw new RangeError('damage dice are outside supported bounds');
        }
        terms.push({ type:'dice', sign:sign, count:count, sides:sides });
      } else if (db) {
        var multiplier = db[1] ? Number(db[1].replace('*', '')) : 1;
        if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 20) throw new RangeError('damage bonus multiplier is outside supported bounds');
        terms.push({ type:'db', sign:sign, multiplier:multiplier });
      } else if (constant) {
        terms.push({ type:'constant', sign:sign, value:Number(token) });
      } else {
        throw new Error('unsupported damage term: ' + token);
      }
      if (terms.length > 32) throw new RangeError('too many damage terms');
    }
    if (cursor !== source.length || !terms.length) throw new Error('invalid damage expression');
    return { source:source.replace(/^\+/, ''), terms:terms };
  }

  function validateParsedDamage(parsed) {
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.terms)) throw new TypeError('invalid parsed damage expression');
    var source = parsed.source || parsed.expression;
    if (source) return parseDamageExpression(source);
    var recreated = parsed.terms.map(function (term) {
      var sign = term.sign < 0 ? '-' : '+';
      if (term.type === 'dice') return sign + term.count + 'd' + term.sides;
      if (term.type === 'db') return sign + (term.multiplier === 1 ? '' : term.multiplier) + 'DB';
      if (term.type === 'constant') return sign + term.value;
      throw new Error('unsupported parsed damage term');
    }).join('').replace(/^\+/, '');
    return parseDamageExpression(recreated);
  }

  function rollParsedDamage(parsed, damageBonus, rng, allowDb) {
    var detail = [];
    var rawTotal = 0;
    parsed.terms.forEach(function (term) {
      var subtotal = 0;
      var dice = [];
      if (term.type === 'constant') subtotal = term.value;
      else if (term.type === 'dice') {
        for (var index = 0; index < term.count; index += 1) dice.push(randomDie(term.sides, rng));
        subtotal = dice.reduce(function (sum, value) { return sum + value; }, 0);
      } else if (term.type === 'db') {
        if (!allowDb) throw new Error('damage bonus cannot contain DB recursively');
        var bonus = rollDamageExpression(damageBonus == null ? 0 : damageBonus, 0, rng, false);
        subtotal = Math.floor(bonus.rawTotal * term.multiplier);
        dice = bonus.rolls;
      }
      var signed = term.sign * subtotal;
      rawTotal += signed;
      detail.push({ term:clone(term), rolled:dice, subtotal:subtotal, signedSubtotal:signed });
    });
    return { expression:parsed.source, rawTotal:rawTotal, total:Math.max(0, rawTotal), rolls:detail };
  }

  function rollDamageExpression(expression, damageBonus, rng, allowDb) {
    var parsed = expression && typeof expression === 'object' && Array.isArray(expression.terms)
      ? validateParsedDamage(expression) : parseDamageExpression(expression);
    return rollParsedDamage(parsed, damageBonus, rng, allowDb !== false);
  }

  function resolveEffectValue(value, rng) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value < 0) throw new RangeError('effect value must be a non-negative finite number');
      return { total:Math.floor(value), detail:null };
    }
    if (typeof value === 'string' || value && Array.isArray(value.terms)) {
      var rolled = rollDamageExpression(value, 0, rng);
      return { total:rolled.total, detail:rolled };
    }
    if (value && typeof value === 'object' && Number.isFinite(Number(value.total))) {
      return { total:Math.max(0, Math.floor(Number(value.total))), detail:clone(value) };
    }
    if (value && typeof value === 'object' && value.expression != null) {
      var result = rollDamageExpression(value.expression, value.damageBonus, rng);
      return { total:result.total, detail:result };
    }
    throw new TypeError('effect value must be a number, damage expression, or roll result');
  }

  function maximumDamageExpression(expression, damageBonus) {
    var parsed = expression && typeof expression === 'object' && Array.isArray(expression.terms)
      ? validateParsedDamage(expression) : parseDamageExpression(expression);
    var total = 0;
    parsed.terms.forEach(function (term) {
      var maximum = 0;
      var minimum = 0;
      if (term.type === 'constant') maximum = minimum = term.value;
      else if (term.type === 'dice') {
        minimum = term.count;
        maximum = term.count * term.sides;
      } else if (term.type === 'db') {
        var bounds = damageBounds(damageBonus == null ? 0 : damageBonus);
        minimum = Math.floor(bounds.minimum * term.multiplier);
        maximum = Math.floor(bounds.maximum * term.multiplier);
      }
      total += term.sign < 0 ? -minimum : maximum;
    });
    return Math.max(0, total);
  }

  function damageBounds(expression) {
    var parsed = expression && typeof expression === 'object' && Array.isArray(expression.terms)
      ? validateParsedDamage(expression) : parseDamageExpression(expression);
    var minimum = 0;
    var maximum = 0;
    parsed.terms.forEach(function (term) {
      if (term.type === 'db') throw new Error('damage bonus cannot contain DB recursively');
      var low = term.type === 'dice' ? term.count : term.value;
      var high = term.type === 'dice' ? term.count * term.sides : term.value;
      if (term.sign < 0) {
        minimum -= high;
        maximum -= low;
      } else {
        minimum += low;
        maximum += high;
      }
    });
    return { minimum:minimum, maximum:maximum };
  }

  function sanityLossBranches(loss) {
    if (loss && typeof loss === 'object' && !Array.isArray(loss)) {
      var success = own(loss, 'success') ? loss.success : loss.onSuccess;
      var failure = own(loss, 'failure') ? loss.failure : loss.onFailure;
      if (success != null && failure != null) return { success:success, failure:failure };
      return null;
    }
    if (typeof loss !== 'string') return null;
    var source = loss.normalize('NFKC').replace(/／/g, '/').trim();
    var separator = source.indexOf('/');
    if (separator <= 0 || separator === source.length - 1 || source.indexOf('/', separator + 1) !== -1) return null;
    return { success:source.slice(0, separator), failure:source.slice(separator + 1) };
  }

  function applyDamage(character, rawDamage, armor, rng) {
    var next = normalizeCharacter(character || {});
    if (next.maxHp < 1) throw new RangeError('character must have at least 1 maximum HP');
    var rolled = resolveEffectValue(rawDamage, rng);
    var armorValue = clamp(integer(armor == null ? next.armor : armor, 0), 0, 999);
    var inflicted = Math.max(0, rolled.total - armorValue);
    var previousHp = next.hp;
    var hp = Math.max(0, previousHp - inflicted);
    var majorWound = inflicted > 0 && inflicted * 2 >= next.maxHp;
    var instantDeath = inflicted > next.maxHp;
    var conCheck = null;

    next.hp = hp;
    if (majorWound) {
      next.status.majorWound = true;
      next.status.prone = true;
    }
    if (majorWound && !instantDeath) {
      conCheck = rollPercentile(next.characteristics.con, 0, rng);
      if (!conCheck.success) next.status.unconscious = true;
    }
    if (instantDeath) {
      next.status.dead = true;
      next.status.dying = false;
      next.status.unconscious = true;
    } else if (hp === 0) {
      next.status.unconscious = true;
      next.status.dying = Boolean(next.status.majorWound);
    }
    return {
      character:next,
      rolledDamage:rolled.total,
      roll:rolled.detail,
      armor:armorValue,
      damage:inflicted,
      previousHp:previousHp,
      hp:hp,
      majorWound:majorWound,
      conCheck:conCheck,
      prone:next.status.prone,
      unconscious:next.status.unconscious,
      dying:next.status.dying,
      dead:next.status.dead
    };
  }

  function heal(character, amount, options) {
    var next = normalizeCharacter(character || {});
    var settings = options && typeof options === 'object' ? options : {};
    var points = Number(amount);
    if (!Number.isFinite(points) || points < 0) throw new RangeError('healing amount must be non-negative');
    points = Math.floor(points);
    var previousHp = next.hp;
    if (next.status.dead && !settings.revive) {
      return { character:next, requested:points, healed:0, previousHp:previousHp, hp:previousHp, stabilized:false };
    }
    if (settings.revive) next.status.dead = false;
    next.hp = Math.min(next.maxHp, next.hp + points);
    var stabilized = Boolean(settings.stabilize && next.status.dying);
    if (settings.stabilize) next.status.dying = false;
    if (next.hp > 0 && settings.wake !== false) {
      next.status.unconscious = false;
      next.status.dying = false;
    }
    if (settings.clearProne) next.status.prone = false;
    if (settings.clearMajorWound || (!settings.preserveMajorWound && next.hp * 2 >= next.maxHp)) next.status.majorWound = false;
    return {
      character:next, requested:points, healed:next.hp - previousHp,
      previousHp:previousHp, hp:next.hp, stabilized:stabilized
    };
  }

  function applySanityLoss(character, loss, rng) {
    var next = normalizeCharacter(character || {});
    var branches = sanityLossBranches(loss);
    var sanCheck = null;
    var selectedLoss = loss;
    var fumbleMaximum = false;
    var rolled;
    if (branches) {
      sanCheck = rollPercentile(next.san, 0, rng);
      selectedLoss = sanCheck.success ? branches.success : branches.failure;
      if (sanCheck.level === 'fumble') {
        var maximum = maximumDamageExpression(branches.failure, 0);
        rolled = { total:maximum, detail:{ expression:String(branches.failure), total:maximum, maximum:true } };
        fumbleMaximum = true;
      } else {
        rolled = resolveEffectValue(selectedLoss, rng);
      }
    } else {
      rolled = resolveEffectValue(loss, rng);
    }
    var previousSan = next.san;
    var applied = Math.min(previousSan, rolled.total);
    next.san = previousSan - applied;
    next.sanDayLoss += applied;
    next.sanityLostToday = next.sanDayLoss;
    var threshold = Math.ceil(next.sanDayStart / 5);
    var intCheck = null;
    var checkRequired = applied >= 5;
    if (checkRequired) {
      intCheck = rollPercentile(next.characteristics.int, 0, rng);
      if (intCheck.success) {
        next.status.temporaryInsanity = true;
        next.insanity.temporary = true;
        next.insanity.temporaryHours = randomDie(10, rng);
      }
    }
    if (threshold > 0 && next.sanDayLoss >= threshold) {
      next.status.indefiniteInsanity = true;
      next.insanity.indefinite = true;
    }
    if (next.san === 0) {
      next.status.permanentInsanity = true;
      next.insanity.permanent = true;
    }
    next.runtime = { sanDayStart:next.sanDayStart, sanDayLoss:next.sanDayLoss, insanity:clone(next.insanity) };
    return {
      character:next,
      sanCheck:sanCheck,
      selectedLoss:selectedLoss,
      fumbleMaximum:fumbleMaximum,
      rolledLoss:rolled.total,
      roll:rolled.detail,
      loss:applied,
      previousSan:previousSan,
      san:next.san,
      temporaryInsanityCheckRequired:checkRequired,
      intCheck:intCheck,
      temporaryInsanity:next.status.temporaryInsanity,
      temporaryInsanityHours:next.insanity.temporaryHours,
      indefiniteInsanity:next.status.indefiniteInsanity,
      permanentInsanity:next.status.permanentInsanity
    };
  }

  function adjustResource(character, resource, delta) {
    var next = normalizeCharacter(character || {});
    var aliases = {
      hp:'hp', hitpoints:'hp', '生命值':'hp',
      mp:'mp', magicpoints:'mp', '魔法值':'mp',
      san:'san', sanity:'san', '理智':'san',
      luck:'luck', '幸运':'luck'
    };
    var key = aliases[canonicalKey(resource)] || aliases[String(resource || '').toLowerCase()];
    if (!key) throw new Error('unsupported resource: ' + resource);
    var change = Number(delta);
    if (!Number.isFinite(change)) throw new TypeError('resource delta must be finite');
    change = Math.trunc(change);
    var maximum = key === 'hp' ? next.maxHp : key === 'mp' ? next.maxMp : key === 'san' ? next.maxSan : 99;
    var previous = next[key];
    next[key] = clamp(previous + change, 0, maximum);
    if (key === 'hp') {
      if (next.hp === 0) next.status.unconscious = true;
      else if (!next.status.dead) { next.status.unconscious = false; next.status.dying = false; }
    }
    if (key === 'san' && next.san === 0) {
      next.status.permanentInsanity = true;
      next.insanity.permanent = true;
      next.runtime.insanity.permanent = true;
    }
    return { character:next, resource:key, requestedDelta:change, appliedDelta:next[key] - previous, previous:previous, value:next[key], maximum:maximum };
  }

  function characteristicOrSkill(character, specification, defaults) {
    if (typeof specification === 'number') return validateSkill(specification);
    var next = normalizeCharacter(character || {});
    var names = typeof specification === 'string' && specification.trim() ? [specification] : defaults;
    var fromSkill = skillValue(next.skills, names, -1);
    if (fromSkill >= 0) return fromSkill;
    var wanted = names.map(canonicalKey);
    for (var index = 0; index < CHARACTERISTIC_KEYS.length; index += 1) {
      var key = CHARACTERISTIC_KEYS[index];
      if (wanted.indexOf(canonicalKey(key)) !== -1 || CHARACTERISTIC_ALIASES[key].some(function (alias) { return wanted.indexOf(canonicalKey(alias)) !== -1; })) {
        return next.characteristics[key];
      }
    }
    return 0;
  }

  function fixedPercentile(roll, skill) {
    var level = successLevel(roll, skill);
    return { roll:roll, skill:skill, bonusPenalty:0, units:roll % 10, tens:[roll === 100 ? 0 : Math.floor(roll / 10)], candidates:[roll], level:level, rank:LEVEL_RANK[level], success:LEVEL_RANK[level] >= LEVEL_RANK.regular };
  }

  function opposedCombat(attacker, defender, options) {
    var settings = options && typeof options === 'object' ? options : {};
    var action = settings.defenderAction === 'dodge' ? 'dodge' : 'fightBack';
    var attackerSkill = characteristicOrSkill(attacker, settings.attackerSkill, ['Fighting (Brawl)','Fighting','Brawl','斗殴']);
    var defenderSkill = characteristicOrSkill(defender, settings.defenderSkill,
      action === 'dodge' ? ['Dodge','闪避'] : ['Fighting (Brawl)','Fighting','Brawl','斗殴']);
    if (action === 'dodge' && defenderSkill === 0) defenderSkill = Math.floor(normalizeCharacter(defender || {}).characteristics.dex / 2);
    var rng = settings.rng;
    var attackerRoll = Number.isInteger(settings.attackerRoll)
      ? fixedPercentile(settings.attackerRoll, attackerSkill)
      : rollPercentile(attackerSkill, settings.attackerBonusPenalty || 0, rng);
    var defenderRoll = Number.isInteger(settings.defenderRoll)
      ? fixedPercentile(settings.defenderRoll, defenderSkill)
      : rollPercentile(defenderSkill, settings.defenderBonusPenalty || 0, rng);
    var attackerSuccessful = attackerRoll.success;
    var defenderSuccessful = defenderRoll.success;
    var winner = 'none';

    if (attackerSuccessful && !defenderSuccessful) winner = 'attacker';
    else if (!attackerSuccessful && defenderSuccessful) winner = 'defender';
    else if (attackerSuccessful && defenderSuccessful) {
      if (attackerRoll.rank > defenderRoll.rank) winner = 'attacker';
      else if (defenderRoll.rank > attackerRoll.rank) winner = 'defender';
      else winner = action === 'dodge' ? 'defender' : 'attacker';
    }

    return {
      defenderAction:action,
      attacker:attackerRoll,
      defender:defenderRoll,
      winner:winner,
      outcome:winner === 'attacker' ? 'hit' : winner === 'defender' && action === 'fightBack' ? 'fightBack' : winner === 'defender' ? 'dodged' : 'miss',
      attackerHits:winner === 'attacker',
      defenderHits:winner === 'defender' && action === 'fightBack'
    };
  }

  return Object.freeze({
    protocol:PROTOCOL,
    rulesetId:RULESET_ID,
    levelRanks:LEVEL_RANK,
    derive:derive,
    normalizeCharacter:normalizeCharacter,
    successLevel:successLevel,
    rollPercentile:rollPercentile,
    parseDamageExpression:parseDamageExpression,
    rollDamageExpression:rollDamageExpression,
    maximumDamageExpression:maximumDamageExpression,
    applyDamage:applyDamage,
    heal:heal,
    applySanityLoss:applySanityLoss,
    adjustResource:adjustResource,
    opposedCombat:opposedCombat
  });
}));
