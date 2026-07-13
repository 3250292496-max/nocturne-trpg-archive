(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.COC7_XLSX = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  var MAX_FILE_BYTES = 12 * 1024 * 1024;

  function cleanText(value, maximum) {
    return String(value == null ? '' : value).replace(/\u0000/g, '').trim().slice(0, maximum || 500);
  }

  function normalizePath(value) {
    var parts = [];
    String(value || '').replace(/\\/g, '/').split('/').forEach(function (part) {
      if (!part || part === '.') return;
      if (part === '..') parts.pop(); else parts.push(part);
    });
    return parts.join('/');
  }

  function resolvePath(base, target) {
    if (/^\//.test(target)) return normalizePath(target.replace(/^\/+/, ''));
    var prefix = String(base || '').replace(/[^/]+$/, '');
    return normalizePath(prefix + target);
  }

  function decode(bytes) {
    if (textDecoder) return textDecoder.decode(bytes);
    var output = '';
    for (var index = 0; index < bytes.length; index += 1) output += String.fromCharCode(bytes[index]);
    try { return decodeURIComponent(escape(output)); } catch (error) { return output; }
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'undefined' && typeof Blob !== 'undefined' && typeof Response !== 'undefined') {
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new Error('当前浏览器不支持离线解压 XLSX；请使用最新版 Chrome、Edge 或导入本站 JSON。');
  }

  async function unzip(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var eocd = -1;
    var minimum = Math.max(0, bytes.length - 65557);
    for (var cursor = bytes.length - 22; cursor >= minimum; cursor -= 1) {
      if (view.getUint32(cursor, true) === 0x06054b50) { eocd = cursor; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 XLSX 文件（找不到 ZIP 目录）。');
    var entryCount = view.getUint16(eocd + 10, true);
    var centralOffset = view.getUint32(eocd + 16, true);
    var entries = {};
    cursor = centralOffset;
    for (var entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
      if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('XLSX 中央目录损坏。');
      var flags = view.getUint16(cursor + 8, true);
      var method = view.getUint16(cursor + 10, true);
      var compressedSize = view.getUint32(cursor + 20, true);
      var uncompressedSize = view.getUint32(cursor + 24, true);
      var fileNameLength = view.getUint16(cursor + 28, true);
      var extraLength = view.getUint16(cursor + 30, true);
      var commentLength = view.getUint16(cursor + 32, true);
      var localOffset = view.getUint32(cursor + 42, true);
      var name = normalizePath(decode(bytes.subarray(cursor + 46, cursor + 46 + fileNameLength)));
      if (!(flags & 1) && name && !name.endsWith('/')) {
        entries[name] = { method:method, compressedSize:compressedSize, uncompressedSize:uncompressedSize, localOffset:localOffset };
      }
      cursor += 46 + fileNameLength + extraLength + commentLength;
    }

    var cache = {};
    async function read(name) {
      name = normalizePath(name);
      if (cache[name]) return cache[name];
      var entry = entries[name];
      if (!entry) return null;
      if (view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new Error('XLSX 本地文件头损坏。');
      var localNameLength = view.getUint16(entry.localOffset + 26, true);
      var localExtraLength = view.getUint16(entry.localOffset + 28, true);
      var start = entry.localOffset + 30 + localNameLength + localExtraLength;
      var packed = bytes.subarray(start, start + entry.compressedSize);
      var unpacked;
      if (entry.method === 0) unpacked = packed.slice();
      else if (entry.method === 8) unpacked = await inflateRaw(packed);
      else throw new Error('XLSX 使用了不支持的压缩方式：' + entry.method);
      if (entry.uncompressedSize && unpacked.length !== entry.uncompressedSize) throw new Error('XLSX 解压长度不一致。');
      cache[name] = unpacked;
      return unpacked;
    }
    return { names:Object.keys(entries), read:read };
  }

  function xmlDocument(text) {
    if (typeof DOMParser === 'undefined') throw new Error('当前环境缺少 XML 解析器。');
    var document = new DOMParser().parseFromString(text, 'application/xml');
    if (document.getElementsByTagName('parsererror').length) throw new Error('XLSX 内部 XML 无法解析。');
    return document;
  }

  function elements(node, localName) {
    return Array.prototype.filter.call(node.getElementsByTagName('*'), function (element) { return element.localName === localName; });
  }

  function firstElement(node, localName) {
    return elements(node, localName)[0] || null;
  }

  function cellPosition(reference) {
    var match = /^([A-Z]+)(\d+)$/i.exec(String(reference || ''));
    if (!match) return { row:0, col:0 };
    var col = 0;
    match[1].toUpperCase().split('').forEach(function (letter) { col = col * 26 + letter.charCodeAt(0) - 64; });
    return { row:Number(match[2]), col:col };
  }

  async function parseWorkbook(file) {
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('没有选择 XLSX 文件。');
    if (file.size > MAX_FILE_BYTES) throw new Error('XLSX 文件过大，上限 12 MB。');
    var archive = await unzip(await file.arrayBuffer());
    var workbookBytes = await archive.read('xl/workbook.xml');
    if (!workbookBytes) throw new Error('XLSX 缺少工作簿定义。');
    var workbook = xmlDocument(decode(workbookBytes));
    var relationshipBytes = await archive.read('xl/_rels/workbook.xml.rels');
    var relationships = {};
    if (relationshipBytes) elements(xmlDocument(decode(relationshipBytes)), 'Relationship').forEach(function (relationship) {
      relationships[relationship.getAttribute('Id')] = relationship.getAttribute('Target');
    });

    var sharedStrings = [];
    var sharedBytes = await archive.read('xl/sharedStrings.xml');
    if (sharedBytes) elements(xmlDocument(decode(sharedBytes)), 'si').forEach(function (item) {
      sharedStrings.push(elements(item, 't').map(function (textNode) { return textNode.textContent || ''; }).join(''));
    });

    var sheets = [];
    var sheetNodes = elements(workbook, 'sheet');
    for (var sheetIndex = 0; sheetIndex < sheetNodes.length; sheetIndex += 1) {
      var sheetNode = sheetNodes[sheetIndex];
      var relationshipId = sheetNode.getAttribute('r:id') || sheetNode.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      var target = relationships[relationshipId] || ('worksheets/sheet' + (sheetIndex + 1) + '.xml');
      var sheetPath = resolvePath('xl/workbook.xml', target);
      var sheetBytes = await archive.read(sheetPath);
      if (!sheetBytes) continue;
      var sheetDocument = xmlDocument(decode(sheetBytes));
      var cells = [];
      elements(sheetDocument, 'c').forEach(function (cell) {
        var reference = cell.getAttribute('r');
        var type = cell.getAttribute('t') || '';
        var valueNode = firstElement(cell, 'v');
        var value = valueNode ? valueNode.textContent : '';
        if (type === 's') value = sharedStrings[Number(value)] || '';
        else if (type === 'inlineStr') value = elements(cell, 't').map(function (node) { return node.textContent || ''; }).join('');
        else if (type === 'b') value = value === '1';
        else if (type !== 'str' && value !== '' && Number.isFinite(Number(value))) value = Number(value);
        if (value === '' || value == null) return;
        var position = cellPosition(reference);
        cells.push({ ref:reference, row:position.row, col:position.col, value:value, formula:(firstElement(cell, 'f') || {}).textContent || '' });
      });
      sheets.push({ name:sheetNode.getAttribute('name') || ('Sheet' + (sheetIndex + 1)), path:sheetPath, cells:cells });
    }
    if (!sheets.length) throw new Error('XLSX 中没有可读取的工作表。');
    return { fileName:cleanText(file.name, 180), sheets:sheets };
  }

  function normalizedLabel(value) {
    return cleanText(value, 200).normalize('NFKC').toUpperCase().replace(/[\s　:：()（）【】\[\]·.。%％/_-]/g, '');
  }

  function numericValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    var match = cleanText(value, 100).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function allCells(book) {
    var result = [];
    book.sheets.forEach(function (sheet, sheetIndex) {
      sheet.cells.forEach(function (cell) { result.push(Object.assign({ sheetIndex:sheetIndex, sheetName:sheet.name }, cell)); });
    });
    return result;
  }

  function candidateCells(cells, labelCell) {
    return cells.filter(function (candidate) {
      if (candidate.sheetIndex !== labelCell.sheetIndex || candidate === labelCell) return false;
      var rowDelta = candidate.row - labelCell.row;
      var colDelta = candidate.col - labelCell.col;
      return (rowDelta === 0 && colDelta >= 1 && colDelta <= 7) || (rowDelta >= 1 && rowDelta <= 3 && colDelta >= -1 && colDelta <= 4);
    }).sort(function (a, b) {
      var aRow = a.row - labelCell.row, aCol = a.col - labelCell.col;
      var bRow = b.row - labelCell.row, bCol = b.col - labelCell.col;
      var aScore = (aRow === 0 ? 0 : 20 + aRow * 3) + Math.abs(aCol);
      var bScore = (bRow === 0 ? 0 : 20 + bRow * 3) + Math.abs(bCol);
      return aScore - bScore;
    });
  }

  function findLabelCells(cells, aliases) {
    var normalized = aliases.map(normalizedLabel);
    return cells.filter(function (cell) {
      if (typeof cell.value !== 'string') return false;
      var label = normalizedLabel(cell.value);
      return normalized.some(function (alias) { return label === alias || label.indexOf(alias) === 0 || (alias.length >= 3 && label.indexOf(alias) !== -1); });
    });
  }

  function findNumber(cells, aliases, minimum, maximum) {
    var labels = findLabelCells(cells, aliases);
    for (var labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
      var ownNumber = numericValue(labels[labelIndex].value);
      var ownLabel = normalizedLabel(labels[labelIndex].value);
      if (ownNumber != null && !aliases.some(function (alias) { return ownLabel === normalizedLabel(alias + ownNumber); })) {
        if (ownNumber >= minimum && ownNumber <= maximum) return ownNumber;
      }
      var candidates = candidateCells(cells, labels[labelIndex]);
      for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
        var value = numericValue(candidates[candidateIndex].value);
        if (value != null && value >= minimum && value <= maximum) return value;
      }
    }
    return null;
  }

  function findText(cells, aliases, maximum) {
    var labels = findLabelCells(cells, aliases);
    for (var labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
      var candidates = candidateCells(cells, labels[labelIndex]);
      for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
        if (typeof candidates[candidateIndex].value !== 'string') continue;
        var value = cleanText(candidates[candidateIndex].value, maximum || 120);
        if (value && !findLabelCells([candidates[candidateIndex]], aliases).length) return value;
      }
    }
    return '';
  }

  function knownTemplateCharacter(book, sheet) {
    var byRef = {};
    sheet.cells.forEach(function (cell) { byRef[String(cell.ref || '').toUpperCase()] = cell.value; });
    function value(reference) { return byRef[reference] == null ? '' : byRef[reference]; }
    function number(reference, minimum, maximum) {
      var parsed = numericValue(value(reference));
      if (parsed == null || parsed < minimum || parsed > maximum) return null;
      return Math.round(parsed);
    }
    function text(reference, maximum) { return cleanText(value(reference), maximum || 160); }
    var characteristics = {
      str:number('U3', 1, 100) || 0, con:number('U5', 1, 100) || 0, siz:number('U7', 1, 100) || 0,
      dex:number('AA3', 1, 100) || 0, app:number('AA5', 1, 100) || 0, int:number('AA7', 1, 100) || 0,
      pow:number('AG3', 1, 100) || 0, edu:number('AG5', 1, 100) || 0, luck:number('AG7', 1, 100) || 0
    };
    if (Object.keys(characteristics).filter(function (key) { return key !== 'luck' && characteristics[key] >= 15; }).length < 6) return null;

    var skills = {};
    var skillRows = [];
    [['F','R'],['AB','AN']].forEach(function (columns) {
      for (var row = 16; row <= 49; row += 1) {
        var rawName = text(columns[0] + row, 100);
        var total = number(columns[1] + row, 0, 100);
        if (!rawName || total == null || /#(?:NAME|VALUE|REF|N\/A)/i.test(rawName)) continue;
        var normalized = rawName.replace(/[Ω＊*]/g, '').replace(/[：:]+/g, '：').trim();
        var unique = normalized;
        var suffix = 2;
        while (Object.prototype.hasOwnProperty.call(skills, unique)) { unique = normalized + ' ' + suffix; suffix += 1; }
        skills[unique] = total;
        skillRows.push({ name:unique, rawName:rawName, value:total, sourceCell:columns[1] + row });
      }
    });

    var weapons = [];
    for (var weaponRow = 53; weaponRow <= 56; weaponRow += 1) {
      var weaponName = text('B' + weaponRow, 100);
      var damage = text('W' + weaponRow, 60);
      if (!weaponName || /#(?:NAME|VALUE|REF|N\/A)/i.test(weaponName)) continue;
      var skillName = text('M' + weaponRow, 100) || '斗殴';
      var skillValue = number('Q' + weaponRow, 0, 100);
      if (skillValue == null) {
        var skillKey = Object.keys(skills).find(function (key) { return normalizedLabel(key).indexOf(normalizedLabel(skillName)) !== -1 || normalizedLabel(skillName).indexOf(normalizedLabel(key)) !== -1; });
        skillValue = skillKey ? skills[skillKey] : (weaponRow === 53 ? (skills['斗殴'] || skills['格斗（斗殴）'] || 25) : 0);
      }
      weapons.push({
        id:'xlsx-weapon-' + weaponRow, name:weaponName, type:text('G' + weaponRow, 50), skill:skillName,
        skillValue:skillValue, damage:damage && !/#(?:NAME|VALUE|REF|N\/A)/i.test(damage) ? damage : (weaponRow === 53 ? '1D3+DB' : '1D6'),
        range:text('AA' + weaponRow, 50), impale:/^(?:是|Y|YES|TRUE|1|可|√|✓|✔)$/i.test(text('AC' + weaponRow, 20)),
        attacks:text('AE' + weaponRow, 30) || '1', ammo:text('AG' + weaponRow, 30), malfunction:text('AJ' + weaponRow, 30),
        sourceRow:weaponRow
      });
    }
    if (!weapons.length) weapons.push({ id:'unarmed', name:'徒手', type:'近战', skill:'斗殴', skillValue:skills['斗殴'] || skills['格斗（斗殴）'] || 25, damage:'1D3+DB', range:'接触', impale:false, attacks:'1' });

    var sanSheetValue = number('N10', 0, 100);
    var sanLossToday = number('N12', 0, 100) || 0;
    var sanEffective = number('R12', 0, 100);
    if (sanEffective == null && sanSheetValue != null) sanEffective = Math.max(0, sanSheetValue - sanLossToday);
    var sanDayStart = Math.max(0, (sanEffective == null ? sanSheetValue || 0 : sanEffective) + sanLossToday);
    var healthState = text('I11', 80);
    var sanityState = text('R11', 80);
    var status = {
      majorWound:/(重伤|濒死)/.test(healthState), prone:/(倒地)/.test(healthState),
      unconscious:/(昏迷|不省人事|濒死|死亡)/.test(healthState), dying:/(濒死)/.test(healthState), dead:/(死亡|已死)/.test(healthState),
      temporaryInsanity:/(临时|短暂|疯狂发作)/.test(sanityState), indefiniteInsanity:/(不定期|不定性)/.test(sanityState), permanentInsanity:/(永久)/.test(sanityState)
    };
    var insanity = { temporary:status.temporaryInsanity, temporaryHours:0, indefinite:status.indefiniteInsanity, permanent:status.permanentInsanity };
    var warnings = [];
    if (text('E3', 80) === '雪莱') warnings.push('模板仍保留示例人物“雪莱”，请确认这确实是要导入的角色。');
    if (sanSheetValue != null && sanEffective != null && sanSheetValue !== sanEffective) warnings.push('卡面 SAN 与扣除今日损失后的有效 SAN 不同，已采用 R12 有效值。');
    if (healthState && !/(健康|正常|重伤|濒死|昏迷|不省人事|倒地|死亡)/.test(healthState)) warnings.push('健康状态“' + healthState + '”无法可靠映射，请在战斗台复核。');
    if (sanityState && !/(正常|清醒|临时|短暂|疯狂发作|不定期|不定性|永久)/.test(sanityState)) warnings.push('精神状态“' + sanityState + '”无法可靠映射，请在战斗台复核。');
    if ((number('I12', 0, 99) || 0) > 0) warnings.push('模板含临时 HP；站点不会把它并入永久 HP，请在战斗台单独复核。');
    weapons.forEach(function (weapon) { if (/[\/／]|燃烧|眩晕|毒|窒息/.test(weapon.damage || '')) warnings.push(weapon.name + ' 的伤害含射程分支或附加状态，自动攻击会采用第一段数值并提示守秘人复核。'); });
    return {
      protocol:'coc7-character-v1', rulesetId:'coc7-7e', id:'',
      name:text('E3', 80) || 'Excel 导入调查员', playerName:text('E4', 80), age:number('E6', 15, 99) || 28,
      sex:text('M6', 40), era:text('M4', 80), occupation:text('E5', 100), occupationId:'custom',
      residence:text('E7', 120), birthplace:text('M7', 120), characteristics:characteristics, skills:skills, skillRows:skillRows,
      armor:number('AN10', 0, 30) || 0, armorName:text('AN12', 80), armorCoverage:text('AP11', 80),
      current:{ hp:number('E10', 0, 99), mp:number('W10', 0, 99), san:sanEffective, luck:characteristics.luck },
      status:status, insanity:insanity, sanDayStart:sanDayStart, sanDayLoss:sanLossToday,
      runtime:{ sanDayStart:sanDayStart, sanDayLoss:sanLossToday, insanity:insanity },
      sheetDerived:{ maxHp:number('G10', 1, 99), majorWoundThreshold:number('D12', 1, 99), temporaryHp:number('I12', 0, 99),
        healthState:healthState, sanSheetValue:sanSheetValue, sanDayLoss:sanLossToday, sanityState:sanityState,
        maxMp:number('Y10', 0, 99), move:number('AF10', 0, 20), damageBonus:text('AP52', 30), build:number('AP55', -10, 30), dodge:number('AP57', 0, 100) },
      weapons:weapons, conditions:[], notes:'从 ' + book.fileName + ' 的“人物卡”导入',
      source:{ format:'xlsx', fileName:book.fileName, template:'神秘桜-2021-01', sourceSheet:'人物卡', sheetOccupationId:text('M5', 40), warnings:warnings }
    };
  }

  function extractCharacter(book) {
    var knownSheet = book.sheets.find(function (sheet) { return sheet.name === '人物卡'; });
    if (knownSheet) {
      var known = knownTemplateCharacter(book, knownSheet);
      if (known) return known;
    }
    var cells = allCells(book);
    var characteristicAliases = {
      str:['STR','力量'], con:['CON','体质'], siz:['SIZ','体型'], dex:['DEX','敏捷'], app:['APP','外貌'],
      int:['INT','智力','灵感'], pow:['POW','意志'], edu:['EDU','教育'], luck:['LUCK','幸运']
    };
    var characteristics = {};
    Object.keys(characteristicAliases).forEach(function (key) {
      var value = findNumber(cells, characteristicAliases[key], 1, 100);
      if (value != null && value > 0 && value < 1) value *= 100;
      characteristics[key] = value == null ? 0 : Math.round(value);
    });
    var populated = Object.keys(characteristics).filter(function (key) { return key !== 'luck' && characteristics[key] >= 15; });
    if (populated.length < 6) throw new Error('没有在 Excel 中找到完整的 STR/CON/SIZ/DEX/APP/INT/POW/EDU 数值；请先填写角色卡。');

    var skillAliases = {
      '会计':['会计','ACCOUNTING'], '人类学':['人类学','ANTHROPOLOGY'], '考古学':['考古学','ARCHAEOLOGY'], '估价':['估价','APPRAISE'],
      '魅惑':['魅惑','CHARM'], '攀爬':['攀爬','CLIMB'], '计算机使用':['计算机使用','COMPUTERUSE'], '信用评级':['信用评级','CREDITRATING'],
      '乔装':['乔装','DISGUISE'], '闪避':['闪避','DODGE'], '驾驶汽车':['驾驶汽车','DRIVEAUTO'], '电气维修':['电气维修','ELECTRICALREPAIR'],
      '电子学':['电子学','ELECTRONICS'], '话术':['话术','FASTTALK'], '斗殴':['斗殴','格斗斗殴','FIGHTINGBRAWL'], '手枪':['手枪','FIREARMSHANDGUN'],
      '步枪/霰弹枪':['步枪霰弹枪','FIREARMSRIFLESHOTGUN'], '急救':['急救','FIRSTAID'], '历史':['历史','HISTORY'], '威吓':['威吓','INTIMIDATE'],
      '跳跃':['跳跃','JUMP'], '法律':['法律','LAW'], '图书馆使用':['图书馆使用','LIBRARYUSE'], '聆听':['聆听','LISTEN'], '锁匠':['锁匠','LOCKSMITH'],
      '机械维修':['机械维修','MECHANICALREPAIR'], '医学':['医学','MEDICINE'], '博物学':['博物学','NATURALWORLD'], '导航':['导航','NAVIGATE'],
      '神秘学':['神秘学','OCCULT'], '操作重型机械':['操作重型机械','OPERATEHEAVYMACHINERY'], '说服':['说服','PERSUADE'], '精神分析':['精神分析','PSYCHOANALYSIS'],
      '心理学':['心理学','PSYCHOLOGY'], '骑术':['骑术','RIDE'], '妙手':['妙手','SLEIGHTOFHAND'], '侦查':['侦查','SPOTHIDDEN'],
      '潜行':['潜行','STEALTH'], '游泳':['游泳','SWIM'], '投掷':['投掷','THROW'], '追踪':['追踪','TRACK']
    };
    var skills = {};
    Object.keys(skillAliases).forEach(function (name) {
      var value = findNumber(cells, skillAliases[name], 0, 100);
      if (value != null) {
        if (value > 0 && value < 1) value *= 100;
        skills[name] = Math.round(value);
      }
    });

    var name = findText(cells, ['调查员姓名','角色姓名','姓名','NAME'], 80) || 'Excel 导入调查员';
    var playerName = findText(cells, ['玩家姓名','玩家','PLAYER'], 80);
    var occupation = findText(cells, ['职业','OCCUPATION'], 100);
    var residence = findText(cells, ['居住地','住址','RESIDENCE'], 120);
    var birthplace = findText(cells, ['出生地','BIRTHPLACE'], 120);
    var age = findNumber(cells, ['年龄','AGE'], 15, 99) || 28;
    var armor = findNumber(cells, ['护甲','ARMOR'], 0, 30) || 0;
    var raw = {
      protocol:'coc7-character-v1', rulesetId:'coc7-7e', id:'',
      name:name, playerName:playerName, age:Math.round(age), occupation:occupation, occupationId:'custom',
      residence:residence, birthplace:birthplace, characteristics:characteristics, skills:skills, armor:Math.round(armor),
      current:{
        hp:findNumber(cells, ['当前生命值','生命值','HP'], 0, 99),
        mp:findNumber(cells, ['当前魔法值','魔法值','MP'], 0, 99),
        san:findNumber(cells, ['当前理智','理智值','SAN'], 0, 100),
        luck:findNumber(cells, ['当前幸运','幸运值','LUCK'], 0, 100)
      },
      weapons:[], conditions:[], notes:'从 ' + book.fileName + ' 导入', source:{ format:'xlsx', fileName:book.fileName }
    };
    return raw;
  }

  async function importCharacter(file) {
    var book = await parseWorkbook(file);
    return extractCharacter(book);
  }

  async function importFromUrl(url) {
    if (!root.location || typeof root.fetch !== 'function') throw new Error('URL import is only available in a browser');
    var resolved = new root.URL(String(url || ''), root.location.href);
    if (resolved.origin !== root.location.origin) throw new Error('only same-origin workbook URLs are allowed');
    var response = await root.fetch(resolved.href, { credentials:'same-origin' });
    if (!response.ok) throw new Error('unable to load workbook: HTTP ' + response.status);
    var bytes = await response.arrayBuffer();
    var fileName = decodeURIComponent(resolved.pathname.split('/').pop() || 'character.xlsx');
    return importCharacter({ name:fileName, arrayBuffer:function () { return Promise.resolve(bytes); } });
  }

  return Object.freeze({
    parseWorkbook:parseWorkbook,
    extractCharacter:extractCharacter,
    importCharacter:importCharacter,
    importFromUrl:importFromUrl,
    normalizedLabel:normalizedLabel,
    numericValue:numericValue
  });
}));
