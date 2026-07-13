(function (root) {
  'use strict';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function fixedSkill(id, label, specialization) {
    var slot = { type: 'skill', id: id, label: label };
    if (specialization) slot.specialization = specialization;
    return slot;
  }

  function choiceSkill(label, count, options) {
    var slot = { type: 'choice', label: label, count: count };
    if (options && options.length) slot.options = options.slice();
    return slot;
  }

  var socialSkills = ['charm', 'fastTalk', 'intimidate', 'persuade'];

  var characteristics = [
    { id: 'STR', label: '力量', fullLabel: '力量 STR', roll: '3D6×5' },
    { id: 'CON', label: '体质', fullLabel: '体质 CON', roll: '3D6×5' },
    { id: 'SIZ', label: '体型', fullLabel: '体型 SIZ', roll: '(2D6+6)×5' },
    { id: 'DEX', label: '敏捷', fullLabel: '敏捷 DEX', roll: '3D6×5' },
    { id: 'APP', label: '外貌', fullLabel: '外貌 APP', roll: '3D6×5' },
    { id: 'INT', label: '智力', fullLabel: '智力 INT', roll: '(2D6+6)×5' },
    { id: 'POW', label: '意志', fullLabel: '意志 POW', roll: '3D6×5' },
    { id: 'EDU', label: '教育', fullLabel: '教育 EDU', roll: '(2D6+6)×5' },
    { id: 'LUCK', label: '幸运', fullLabel: '幸运 LUCK', roll: '3D6×5', derived: true },
    { id: 'SAN', label: '理智', fullLabel: '理智 SAN', formula: 'POW', derived: true },
    { id: 'HP', label: '生命值', fullLabel: '生命值 HP', formula: 'floor((CON+SIZ)/10)', derived: true },
    { id: 'MP', label: '魔法值', fullLabel: '魔法值 MP', formula: 'floor(POW/5)', derived: true },
    { id: 'MOV', label: '移动力', fullLabel: '移动力 MOV', formula: '由STR、DEX、SIZ和年龄决定', derived: true },
    { id: 'DB', label: '伤害加值', fullLabel: '伤害加值 DB', formula: '由STR+SIZ决定', derived: true },
    { id: 'BUILD', label: '体格', fullLabel: '体格 BUILD', formula: '由STR+SIZ决定', derived: true }
  ];

  var skills = [
    { id: 'accounting', name: '会计', base: 5, era: 'all' },
    { id: 'animalHandling', name: '动物驯养', base: 5, era: 'all', optional: true },
    { id: 'anthropology', name: '人类学', base: 1, era: 'all' },
    { id: 'appraise', name: '估价', base: 5, era: 'all' },
    { id: 'archaeology', name: '考古学', base: 1, era: 'all' },
    { id: 'artillery', name: '炮术', base: 1, era: 'all', optional: true },
    { id: 'charm', name: '取悦', base: 15, era: 'all', group: 'social' },
    { id: 'climb', name: '攀爬', base: 20, era: 'all' },
    { id: 'computerUse', name: '计算机使用', base: 5, era: 'modern' },
    { id: 'creditRating', name: '信用评级', base: 0, era: 'all' },
    { id: 'cthulhuMythos', name: '克苏鲁神话', base: 0, era: 'all', lockedAtCreation: true },
    { id: 'demolitions', name: '爆破', base: 1, era: 'all', optional: true },
    { id: 'disguise', name: '乔装', base: 5, era: 'all' },
    { id: 'diving', name: '潜水', base: 1, era: 'all', optional: true },
    { id: 'dodge', name: '闪避', base: null, baseFormula: 'floor(DEX/2)', era: 'all', group: 'combat' },
    { id: 'driveAuto', name: '汽车驾驶', base: 20, era: 'all' },
    { id: 'electricalRepair', name: '电气维修', base: 10, era: 'all' },
    { id: 'electronics', name: '电子学', base: 1, era: 'modern' },
    { id: 'fastTalk', name: '话术', base: 5, era: 'all', group: 'social' },
    { id: 'firstAid', name: '急救', base: 30, era: 'all' },
    { id: 'history', name: '历史', base: 5, era: 'all' },
    { id: 'hypnosis', name: '催眠', base: 1, era: 'all', optional: true },
    { id: 'intimidate', name: '恐吓', base: 15, era: 'all', group: 'social' },
    { id: 'jump', name: '跳跃', base: 20, era: 'all' },
    { id: 'languageOwn', name: '母语', base: null, baseFormula: 'EDU', era: 'all', specialized: true },
    { id: 'languageOther', name: '其他语言（专攻）', base: 1, era: 'all', specialized: true },
    { id: 'languageOtherLatin', name: '其他语言（拉丁文）', base: 1, era: 'all', parentId: 'languageOther' },
    { id: 'law', name: '法律', base: 5, era: 'all' },
    { id: 'libraryUse', name: '图书馆使用', base: 20, era: 'all' },
    { id: 'listen', name: '聆听', base: 20, era: 'all' },
    { id: 'locksmith', name: '锁匠', base: 1, era: 'all' },
    { id: 'lore', name: '学识（专攻）', base: 1, era: 'all', specialized: true, optional: true },
    { id: 'mechanicalRepair', name: '机械维修', base: 10, era: 'all' },
    { id: 'medicine', name: '医学', base: 1, era: 'all' },
    { id: 'naturalWorld', name: '博物学', base: 10, era: 'all' },
    { id: 'navigate', name: '导航', base: 10, era: 'all' },
    { id: 'occult', name: '神秘学', base: 5, era: 'all' },
    { id: 'operateHeavyMachinery', name: '操作重型机械', base: 1, era: 'all' },
    { id: 'persuade', name: '说服', base: 10, era: 'all', group: 'social' },
    { id: 'pilot', name: '驾驶（专攻）', base: 1, era: 'all', specialized: true },
    { id: 'pilotAircraft', name: '驾驶（飞行器）', base: 1, era: 'all', parentId: 'pilot' },
    { id: 'pilotBoat', name: '驾驶（船）', base: 1, era: 'all', parentId: 'pilot' },
    { id: 'psychoanalysis', name: '精神分析', base: 1, era: 'all' },
    { id: 'psychology', name: '心理学', base: 10, era: 'all' },
    { id: 'readLips', name: '读唇', base: 1, era: 'all', optional: true },
    { id: 'ride', name: '骑术', base: 5, era: 'all' },
    { id: 'sleightOfHand', name: '妙手', base: 10, era: 'all' },
    { id: 'spotHidden', name: '侦查', base: 25, era: 'all' },
    { id: 'stealth', name: '潜行', base: 20, era: 'all' },
    { id: 'survival', name: '生存（专攻）', base: 10, era: 'all', specialized: true },
    { id: 'swim', name: '游泳', base: 20, era: 'all' },
    { id: 'throw', name: '投掷', base: 20, era: 'all' },
    { id: 'track', name: '追踪', base: 10, era: 'all' },

    { id: 'artCraft', name: '艺术与手艺（专攻）', base: 5, era: 'all', specialized: true },
    { id: 'artCraftActing', name: '艺术与手艺（表演）', base: 5, era: 'all', parentId: 'artCraft' },
    { id: 'artCraftFineArt', name: '艺术与手艺（美术）', base: 5, era: 'all', parentId: 'artCraft' },
    { id: 'artCraftForgery', name: '艺术与手艺（伪造）', base: 5, era: 'all', parentId: 'artCraft' },
    { id: 'artCraftPhotography', name: '艺术与手艺（摄影）', base: 5, era: 'all', parentId: 'artCraft' },
    { id: 'artCraftLiterature', name: '艺术与手艺（文学）', base: 5, era: 'all', parentId: 'artCraft' },
    { id: 'artCraftTechnicalDrawing', name: '艺术与手艺（技术制图）', base: 5, era: 'all', parentId: 'artCraft' },
    { id: 'artCraftFarming', name: '艺术与手艺（农事）', base: 5, era: 'all', parentId: 'artCraft' },
    { id: 'artCraftInstrument', name: '艺术与手艺（乐器）', base: 5, era: 'all', parentId: 'artCraft' },

    { id: 'fighting', name: '格斗（专攻）', base: null, baseFormula: '按专攻', era: 'all', specialized: true, group: 'combat' },
    { id: 'fightingAxe', name: '格斗（斧）', base: 15, era: 'all', parentId: 'fighting', group: 'combat' },
    { id: 'fightingBrawl', name: '格斗（斗殴）', base: 25, era: 'all', parentId: 'fighting', group: 'combat' },
    { id: 'fightingChainsaw', name: '格斗（链锯）', base: 10, era: 'all', parentId: 'fighting', group: 'combat', availabilityNote: '大量生产型链锯约自1927年起出现' },
    { id: 'fightingFlail', name: '格斗（连枷）', base: 10, era: 'all', parentId: 'fighting', group: 'combat' },
    { id: 'fightingGarrote', name: '格斗（绞索）', base: 15, era: 'all', parentId: 'fighting', group: 'combat' },
    { id: 'fightingSpear', name: '格斗（矛）', base: 20, era: 'all', parentId: 'fighting', group: 'combat' },
    { id: 'fightingSword', name: '格斗（剑）', base: 20, era: 'all', parentId: 'fighting', group: 'combat' },
    { id: 'fightingWhip', name: '格斗（鞭）', base: 5, era: 'all', parentId: 'fighting', group: 'combat' },

    { id: 'firearms', name: '射击（专攻）', base: null, baseFormula: '按专攻', era: 'all', specialized: true, group: 'combat' },
    { id: 'firearmsBow', name: '射击（弓）', base: 15, era: 'all', parentId: 'firearms', group: 'combat' },
    { id: 'firearmsHandgun', name: '射击（手枪）', base: 20, era: 'all', parentId: 'firearms', group: 'combat' },
    { id: 'firearmsHeavyWeapons', name: '射击（重武器）', base: 10, era: 'all', parentId: 'firearms', group: 'combat' },
    { id: 'firearmsFlamethrower', name: '射击（火焰喷射器）', base: 10, era: 'all', parentId: 'firearms', group: 'combat' },
    { id: 'firearmsMachineGun', name: '射击（机枪）', base: 10, era: 'all', parentId: 'firearms', group: 'combat' },
    { id: 'firearmsRifleShotgun', name: '射击（步枪/霰弹枪）', base: 25, era: 'all', parentId: 'firearms', group: 'combat' },
    { id: 'firearmsSubmachineGun', name: '射击（冲锋枪）', base: 15, era: 'modern', parentId: 'firearms', group: 'combat' },

    { id: 'science', name: '科学（专攻）', base: 1, era: 'all', specialized: true },
    { id: 'scienceAstronomy', name: '科学（天文学）', base: 1, era: 'all', parentId: 'science' },
    { id: 'scienceBiology', name: '科学（生物学）', base: 1, era: 'all', parentId: 'science' },
    { id: 'scienceBotany', name: '科学（植物学）', base: 1, era: 'all', parentId: 'science' },
    { id: 'scienceChemistry', name: '科学（化学）', base: 1, era: 'all', parentId: 'science' },
    { id: 'scienceCryptography', name: '科学（密码学）', base: 1, era: 'all', parentId: 'science' },
    { id: 'scienceEngineering', name: '科学（工程学）', base: 1, era: 'all', parentId: 'science' },
    { id: 'scienceForensics', name: '科学（司法科学）', base: 1, era: 'all', parentId: 'science' },
    { id: 'scienceGeology', name: '科学（地质学）', base: 1, era: 'all', parentId: 'science' },
    { id: 'scienceMathematics', name: '科学（数学）', base: 10, era: 'all', parentId: 'science' },
    { id: 'scienceMeteorology', name: '科学（气象学）', base: 1, era: 'all', parentId: 'science' },
    { id: 'sciencePharmacy', name: '科学（药学）', base: 1, era: 'all', parentId: 'science' },
    { id: 'sciencePhysics', name: '科学（物理学）', base: 1, era: 'all', parentId: 'science' },
    { id: 'scienceZoology', name: '科学（动物学）', base: 1, era: 'all', parentId: 'science' }
  ];

  var occupations = [
    {
      id: 'doctor',
      name: '医生',
      era: ['1920s', 'modern'],
      creditRating: { min: 30, max: 80 },
      pointFormula: 'EDU×4',
      characteristicPriority: ['EDU', 'INT', 'POW'],
      occupationalSkills: [
        fixedSkill('firstAid', '急救'),
        fixedSkill('languageOtherLatin', '其他语言（拉丁文）', '拉丁文'),
        fixedSkill('medicine', '医学'),
        fixedSkill('psychology', '心理学'),
        fixedSkill('scienceBiology', '科学（生物学）'),
        fixedSkill('sciencePharmacy', '科学（药学）'),
        choiceSkill('任意两项相关学术或个人专长', 2)
      ],
      weapons: [],
      summary: '医疗与学术能力全面，适合处理伤势、疾病和专业线索。'
    },
    {
      id: 'journalist',
      name: '记者',
      era: ['1920s', 'modern'],
      creditRating: { min: 9, max: 30 },
      pointFormula: 'EDU×4',
      characteristicPriority: ['EDU', 'INT', 'APP'],
      occupationalSkills: [
        fixedSkill('artCraftPhotography', '艺术与手艺（摄影）'),
        fixedSkill('history', '历史'),
        fixedSkill('libraryUse', '图书馆使用'),
        fixedSkill('languageOwn', '母语'),
        choiceSkill('一种社交技能', 1, socialSkills),
        fixedSkill('psychology', '心理学'),
        choiceSkill('任意技能', 2)
      ],
      weapons: [],
      summary: '擅长查档、采访、辨人和追踪社会信息，适合调查型团队。'
    },
    {
      id: 'policeDetective',
      name: '警探',
      era: ['1920s', 'modern'],
      creditRating: { min: 20, max: 50 },
      pointFormula: 'EDU×2 + DEX×2 或 STR×2',
      characteristicPriority: ['EDU', 'DEX', 'STR', 'POW'],
      occupationalSkills: [
        choiceSkill('艺术与手艺（表演）或乔装', 1, ['artCraftActing', 'disguise']),
        fixedSkill('firearms', '射击（任选专攻）'),
        fixedSkill('law', '法律'),
        fixedSkill('listen', '聆听'),
        choiceSkill('一种社交技能', 1, socialSkills),
        fixedSkill('psychology', '心理学'),
        fixedSkill('spotHidden', '侦查'),
        choiceSkill('任意技能', 1)
      ],
      weapons: [
        { skillId: 'firearmsHandgun', label: '手枪', optional: false },
        { skillId: 'firearmsRifleShotgun', label: '步枪/霰弹枪', optional: true }
      ],
      summary: '兼顾执法知识、观察、询问与枪械，适合现场调查和冲突处置。'
    },
    {
      id: 'privateInvestigator',
      name: '私家侦探',
      era: ['1920s', 'modern'],
      creditRating: { min: 9, max: 30 },
      pointFormula: 'EDU×2 + DEX×2 或 STR×2',
      characteristicPriority: ['EDU', 'DEX', 'INT', 'STR'],
      occupationalSkills: [
        fixedSkill('artCraftPhotography', '艺术与手艺（摄影）'),
        fixedSkill('disguise', '乔装'),
        fixedSkill('law', '法律'),
        fixedSkill('libraryUse', '图书馆使用'),
        choiceSkill('一种社交技能', 1, socialSkills),
        fixedSkill('psychology', '心理学'),
        fixedSkill('spotHidden', '侦查'),
        choiceSkill('任意技能，例如计算机使用、锁匠或射击', 1)
      ],
      weapons: [
        { skillId: 'firearmsHandgun', label: '手枪', optional: true }
      ],
      summary: '技能选择灵活，擅长跟踪、取证、伪装和非正式调查。'
    },
    {
      id: 'professor',
      name: '教授',
      era: ['1920s', 'modern'],
      creditRating: { min: 20, max: 70 },
      pointFormula: 'EDU×4',
      characteristicPriority: ['EDU', 'INT', 'POW'],
      occupationalSkills: [
        fixedSkill('libraryUse', '图书馆使用'),
        fixedSkill('languageOther', '其他语言（任选）'),
        fixedSkill('languageOwn', '母语'),
        fixedSkill('psychology', '心理学'),
        choiceSkill('任意四项学术或个人专业技能', 4)
      ],
      weapons: [],
      summary: '高教育驱动的学术专家，可按研究领域定制四项专业技能。'
    },
    {
      id: 'antiquarian',
      name: '古文物学家/古董收藏家',
      era: ['1920s', 'modern'],
      creditRating: { min: 30, max: 70 },
      pointFormula: 'EDU×4',
      characteristicPriority: ['EDU', 'INT', 'APP'],
      occupationalSkills: [
        fixedSkill('appraise', '估价'),
        fixedSkill('artCraft', '艺术与手艺（任选）'),
        fixedSkill('history', '历史'),
        fixedSkill('libraryUse', '图书馆使用'),
        fixedSkill('languageOther', '其他语言（任选）'),
        choiceSkill('一种社交技能', 1, socialSkills),
        fixedSkill('spotHidden', '侦查'),
        choiceSkill('任意技能', 1)
      ],
      weapons: [],
      summary: '擅长鉴定、历史、文献与古物来源调查，经济条件通常较好。'
    },
    {
      id: 'author',
      name: '作家',
      era: ['1920s', 'modern'],
      creditRating: { min: 9, max: 30 },
      pointFormula: 'EDU×4',
      characteristicPriority: ['EDU', 'INT', 'POW'],
      occupationalSkills: [
        fixedSkill('artCraftLiterature', '艺术与手艺（文学）'),
        fixedSkill('history', '历史'),
        fixedSkill('libraryUse', '图书馆使用'),
        choiceSkill('博物学或神秘学', 1, ['naturalWorld', 'occult']),
        fixedSkill('languageOther', '其他语言（任选）'),
        fixedSkill('languageOwn', '母语'),
        fixedSkill('psychology', '心理学'),
        choiceSkill('任意技能', 1)
      ],
      weapons: [],
      summary: '以语言、文献和观察人物见长，适合线索整理与社会调查。'
    },
    {
      id: 'engineer',
      name: '工程师',
      era: ['1920s', 'modern'],
      creditRating: { min: 30, max: 60 },
      pointFormula: 'EDU×4',
      characteristicPriority: ['EDU', 'INT', 'DEX'],
      occupationalSkills: [
        fixedSkill('artCraftTechnicalDrawing', '艺术与手艺（技术制图）'),
        fixedSkill('electricalRepair', '电气维修'),
        fixedSkill('libraryUse', '图书馆使用'),
        fixedSkill('mechanicalRepair', '机械维修'),
        fixedSkill('operateHeavyMachinery', '操作重型机械'),
        fixedSkill('scienceEngineering', '科学（工程学）'),
        fixedSkill('sciencePhysics', '科学（物理学）'),
        choiceSkill('任意技能', 1)
      ],
      weapons: [],
      summary: '技术和维修能力突出，适合破解机械、电气与工程障碍。'
    },
    {
      id: 'custom',
      name: '自定义职业',
      era: ['1920s', 'modern'],
      creditRating: { min: 0, max: 99 },
      pointFormula: 'EDU×4（或由玩家与守秘人协商）',
      characteristicPriority: [],
      occupationalSkills: [],
      maxOccupationalSkills: 8,
      isCustom: true,
      weapons: [],
      source: { label: '自定义职业数据占位', officialCore: false },
      summary: '职业名、信用评级、职业点公式与至多八项职业技能均由玩家和守秘人协商。'
    },
    {
      id: 'dilettante',
      name: '业余艺术爱好者',
      era: ['1920s', 'modern'],
      creditRating: { min: 50, max: 99 },
      pointFormula: 'EDU×2 + APP×2',
      characteristicPriority: ['APP', 'EDU', 'INT'],
      occupationalSkills: [
        fixedSkill('artCraft', '艺术与手艺（任选）'),
        fixedSkill('firearms', '射击（任选专攻）'),
        fixedSkill('languageOther', '其他语言（任选）'),
        fixedSkill('ride', '骑术'),
        choiceSkill('一种社交技能', 1, socialSkills),
        choiceSkill('任意三项个人或时代技能', 3)
      ],
      weapons: [],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '依靠家产或其他收入生活，有充分时间发展社交、艺术与个人兴趣。'
    },
    {
      id: 'soldier',
      name: '士兵／海军陆战队士兵',
      era: ['1920s', 'modern'],
      creditRating: { min: 9, max: 30 },
      pointFormula: 'EDU×2 + DEX×2 或 STR×2',
      characteristicPriority: ['STR', 'DEX', 'EDU', 'CON'],
      occupationalSkills: [
        choiceSkill('攀爬或游泳', 1, ['climb', 'swim']),
        fixedSkill('dodge', '闪避'),
        fixedSkill('fighting', '格斗（任选专攻）'),
        fixedSkill('firearms', '射击（任选专攻）'),
        fixedSkill('stealth', '潜行'),
        fixedSkill('survival', '生存（任选专攻）'),
        choiceSkill('从急救、机械维修、其他语言中任选两项', 2, ['firstAid', 'mechanicalRepair', 'languageOther'])
      ],
      weapons: [
        { skillId: 'firearmsRifleShotgun', label: '步枪/霰弹枪', optional: false }
      ],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '受过基础军事训练，擅长野外行动、隐蔽、格斗与枪械。'
    },
    {
      id: 'militaryOfficer',
      name: '军官',
      era: ['1920s', 'modern'],
      creditRating: { min: 20, max: 70 },
      pointFormula: 'EDU×2 + DEX×2 或 STR×2',
      characteristicPriority: ['EDU', 'STR', 'DEX', 'POW'],
      occupationalSkills: [
        fixedSkill('accounting', '会计'),
        fixedSkill('firearms', '射击（任选专攻）'),
        fixedSkill('navigate', '导航'),
        fixedSkill('firstAid', '急救'),
        choiceSkill('两种社交技能', 2, socialSkills),
        fixedSkill('psychology', '心理学'),
        choiceSkill('任意一项个人或时代技能', 1)
      ],
      weapons: [
        { skillId: 'firearmsHandgun', label: '手枪', optional: false }
      ],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '兼具军事技能、指挥沟通和基础组织管理能力。'
    },
    {
      id: 'policePatrol',
      name: '巡警／警察',
      era: ['1920s', 'modern'],
      creditRating: { min: 9, max: 30 },
      pointFormula: 'EDU×2 + DEX×2 或 STR×2',
      characteristicPriority: ['EDU', 'STR', 'DEX', 'POW'],
      occupationalSkills: [
        fixedSkill('fightingBrawl', '格斗（斗殴）'),
        fixedSkill('firearms', '射击（任选专攻）'),
        fixedSkill('firstAid', '急救'),
        choiceSkill('一种社交技能', 1, socialSkills),
        fixedSkill('law', '法律'),
        fixedSkill('psychology', '心理学'),
        fixedSkill('spotHidden', '侦查'),
        choiceSkill('汽车驾驶或骑术', 1, ['driveAuto', 'ride'])
      ],
      weapons: [
        { skillId: 'firearmsHandgun', label: '手枪', optional: false }
      ],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '负责日常巡逻与现场处置，熟悉法律、询问、急救和基础战斗。'
    },
    {
      id: 'sheriff',
      name: '警长／西部治安官',
      era: ['1920s'],
      creditRating: { min: 20, max: 50 },
      pointFormula: 'EDU×2 + DEX×2 或 STR×2',
      characteristicPriority: ['EDU', 'STR', 'DEX', 'POW'],
      occupationalSkills: [
        fixedSkill('driveAuto', '汽车驾驶'),
        fixedSkill('firearms', '射击（任选专攻）'),
        choiceSkill('格斗（斗殴或鞭）', 1, ['fightingBrawl', 'fightingWhip']),
        fixedSkill('law', '法律'),
        choiceSkill('说服或心理学', 1, ['persuade', 'psychology']),
        fixedSkill('ride', '骑术'),
        fixedSkill('track', '追踪'),
        choiceSkill('任意一项相关个人或时代技能', 1)
      ],
      weapons: [
        { skillId: 'firearmsHandgun', label: '手枪', optional: false }
      ],
      source: { label: '本地职业表扩展选录', note: '本地表名称为“西部治安官”；具体出版物来源待核实，并补充一个相关技能槽以达到八项', officialCore: false },
      summary: '地方治安与追踪型职业；该模板来自扩展资料，使用前应征得守秘人同意。'
    },
    {
      id: 'federalAgent',
      name: '联邦探员',
      era: ['1920s', 'modern'],
      creditRating: { min: 20, max: 40 },
      pointFormula: 'EDU×4',
      characteristicPriority: ['EDU', 'DEX', 'INT', 'POW'],
      occupationalSkills: [
        fixedSkill('driveAuto', '汽车驾驶'),
        fixedSkill('fightingBrawl', '格斗（斗殴）'),
        fixedSkill('firearms', '射击（任选专攻）'),
        fixedSkill('law', '法律'),
        fixedSkill('persuade', '说服'),
        fixedSkill('stealth', '潜行'),
        fixedSkill('spotHidden', '侦查'),
        choiceSkill('任意一项个人或时代技能', 1)
      ],
      weapons: [
        { skillId: 'firearmsHandgun', label: '手枪', optional: false }
      ],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '面向跨地区案件与联邦执法工作的调查、追踪和行动人员。'
    },
    {
      id: 'archaeologist',
      name: '考古学家',
      era: ['1920s', 'modern'],
      creditRating: { min: 10, max: 40 },
      pointFormula: 'EDU×4',
      characteristicPriority: ['EDU', 'INT', 'DEX'],
      occupationalSkills: [
        fixedSkill('appraise', '估价'),
        fixedSkill('archaeology', '考古学'),
        fixedSkill('history', '历史'),
        fixedSkill('languageOther', '其他语言（任选）'),
        fixedSkill('libraryUse', '图书馆使用'),
        fixedSkill('spotHidden', '侦查'),
        fixedSkill('mechanicalRepair', '机械维修'),
        choiceSkill('导航或一项科学技能', 1, ['navigate', 'science'])
      ],
      weapons: [],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '研究和发掘历史遗迹，兼顾文献、鉴定与野外工作。'
    },
    {
      id: 'occultist',
      name: '神秘学家',
      era: ['1920s', 'modern'],
      creditRating: { min: 9, max: 65 },
      pointFormula: 'EDU×4',
      characteristicPriority: ['EDU', 'INT', 'POW'],
      occupationalSkills: [
        fixedSkill('anthropology', '人类学'),
        fixedSkill('history', '历史'),
        fixedSkill('libraryUse', '图书馆使用'),
        choiceSkill('一种社交技能', 1, socialSkills),
        fixedSkill('occult', '神秘学'),
        fixedSkill('languageOther', '其他语言（任选）'),
        fixedSkill('scienceAstronomy', '科学（天文学）'),
        choiceSkill('任意一项个人或时代技能', 1)
      ],
      weapons: [],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '研究民俗、秘仪与表层神秘传统；创建时不默认包含克苏鲁神话。'
    },
    {
      id: 'nurse',
      name: '护士',
      era: ['1920s', 'modern'],
      creditRating: { min: 9, max: 30 },
      pointFormula: 'EDU×4',
      characteristicPriority: ['EDU', 'POW', 'INT'],
      occupationalSkills: [
        fixedSkill('firstAid', '急救'),
        fixedSkill('listen', '聆听'),
        fixedSkill('medicine', '医学'),
        choiceSkill('一种社交技能', 1, socialSkills),
        fixedSkill('psychology', '心理学'),
        choiceSkill('科学（生物学或化学）', 1, ['scienceBiology', 'scienceChemistry']),
        fixedSkill('spotHidden', '侦查'),
        choiceSkill('任意一项个人或时代技能', 1)
      ],
      weapons: [],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '擅长急救、医学护理、观察和安抚病患。'
    },
    {
      id: 'lawyer',
      name: '律师',
      era: ['1920s', 'modern'],
      creditRating: { min: 30, max: 80 },
      pointFormula: 'EDU×4',
      characteristicPriority: ['EDU', 'APP', 'INT'],
      occupationalSkills: [
        fixedSkill('accounting', '会计'),
        fixedSkill('law', '法律'),
        fixedSkill('libraryUse', '图书馆使用'),
        choiceSkill('两种社交技能', 2, socialSkills),
        fixedSkill('psychology', '心理学'),
        choiceSkill('任意两项其他技能', 2)
      ],
      weapons: [],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '精通法律、查阅资料与谈判，可处理制度和社会关系类线索。'
    },
    {
      id: 'clergy',
      name: '神职人员',
      era: ['1920s', 'modern'],
      creditRating: { min: 9, max: 60 },
      pointFormula: 'EDU×4',
      characteristicPriority: ['EDU', 'POW', 'APP'],
      occupationalSkills: [
        fixedSkill('accounting', '会计'),
        fixedSkill('history', '历史'),
        fixedSkill('libraryUse', '图书馆使用'),
        fixedSkill('listen', '聆听'),
        fixedSkill('languageOther', '其他语言（任选）'),
        choiceSkill('一种社交技能', 1, socialSkills),
        fixedSkill('psychology', '心理学'),
        choiceSkill('任意一项其他技能', 1)
      ],
      weapons: [],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '熟悉宗教组织、历史与牧灵沟通，具体教派背景由玩家与守秘人确定。'
    },
    {
      id: 'student',
      name: '学生／实习生',
      era: ['1920s', 'modern'],
      creditRating: { min: 5, max: 10 },
      pointFormula: 'EDU×4',
      characteristicPriority: ['EDU', 'INT', 'POW'],
      occupationalSkills: [
        choiceSkill('母语或一种其他语言', 1, ['languageOwn', 'languageOther']),
        fixedSkill('libraryUse', '图书馆使用'),
        fixedSkill('listen', '聆听'),
        choiceSkill('三项所学专业技能', 3),
        choiceSkill('任意两项个人或时代技能', 2)
      ],
      weapons: [],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '正在学习或接受入职训练，专业技能可随学科或实习岗位定制。'
    },
    {
      id: 'librarian',
      name: '图书馆管理员',
      era: ['1920s', 'modern'],
      creditRating: { min: 9, max: 35 },
      pointFormula: 'EDU×4',
      characteristicPriority: ['EDU', 'INT', 'POW'],
      occupationalSkills: [
        fixedSkill('accounting', '会计'),
        fixedSkill('libraryUse', '图书馆使用'),
        fixedSkill('languageOther', '其他语言（任选）'),
        fixedSkill('languageOwn', '母语'),
        choiceSkill('任意四项个人特长或专业主题技能', 4)
      ],
      weapons: [],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '管理目录与馆藏，擅长文献检索、语言和专业主题研究。'
    },
    {
      id: 'artist',
      name: '艺术家',
      era: ['1920s', 'modern'],
      creditRating: { min: 9, max: 50 },
      pointFormula: 'EDU×2 + DEX×2 或 POW×2',
      characteristicPriority: ['DEX', 'POW', 'EDU', 'APP'],
      occupationalSkills: [
        fixedSkill('artCraft', '艺术与手艺（任选）'),
        choiceSkill('历史或博物学', 1, ['history', 'naturalWorld']),
        choiceSkill('一种社交技能', 1, socialSkills),
        fixedSkill('languageOther', '其他语言（任选）'),
        fixedSkill('psychology', '心理学'),
        fixedSkill('spotHidden', '侦查'),
        choiceSkill('任意两项个人或时代技能', 2)
      ],
      weapons: [],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '以创作、审美和观察见长，可按艺术门类定制专攻。'
    },
    {
      id: 'criminal',
      name: '罪犯',
      era: ['1920s', 'modern'],
      creditRating: { min: 5, max: 65 },
      pointFormula: 'EDU×2 + DEX×2 或 APP×2',
      characteristicPriority: ['DEX', 'APP', 'EDU', 'INT'],
      occupationalSkills: [
        choiceSkill('艺术与手艺（表演）或乔装', 1, ['artCraftActing', 'disguise']),
        fixedSkill('appraise', '估价'),
        choiceSkill('一种社交技能', 1, socialSkills),
        choiceSkill('格斗或射击', 1, ['fighting', 'firearms']),
        choiceSkill('锁匠或机械维修', 1, ['locksmith', 'mechanicalRepair']),
        fixedSkill('stealth', '潜行'),
        fixedSkill('psychology', '心理学'),
        fixedSkill('spotHidden', '侦查')
      ],
      weapons: [],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '通用罪犯模板；具体犯罪类型、组织关系和专长应与守秘人协商。'
    },
    {
      id: 'pilot',
      name: '飞行员',
      era: ['1920s', 'modern'],
      creditRating: { min: 20, max: 70 },
      pointFormula: 'EDU×2 + DEX×2',
      characteristicPriority: ['DEX', 'EDU', 'INT'],
      occupationalSkills: [
        fixedSkill('electricalRepair', '电气维修'),
        fixedSkill('mechanicalRepair', '机械维修'),
        fixedSkill('navigate', '导航'),
        fixedSkill('operateHeavyMachinery', '操作重型机械'),
        fixedSkill('pilotAircraft', '驾驶（飞行器）', '飞行器'),
        fixedSkill('scienceAstronomy', '科学（天文学）'),
        choiceSkill('任意两项个人或时代技能', 2)
      ],
      weapons: [],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '具备飞行、导航、维修与相关技术知识。'
    },
    {
      id: 'sailor',
      name: '海员（民船）',
      era: ['1920s', 'modern'],
      creditRating: { min: 20, max: 40 },
      pointFormula: 'EDU×2 + DEX×2 或 STR×2',
      characteristicPriority: ['DEX', 'STR', 'EDU', 'CON'],
      occupationalSkills: [
        fixedSkill('firstAid', '急救'),
        fixedSkill('mechanicalRepair', '机械维修'),
        fixedSkill('naturalWorld', '博物学'),
        fixedSkill('navigate', '导航'),
        choiceSkill('一种社交技能', 1, socialSkills),
        fixedSkill('pilotBoat', '驾驶（船）', '船'),
        fixedSkill('spotHidden', '侦查'),
        fixedSkill('swim', '游泳')
      ],
      weapons: [],
      source: { label: '本地职业表扩展选录', officialCore: false },
      summary: '民用船只上的通用海员，熟悉航海、维修、观察和水上求生。'
    }
  ];

  var quickRules = [
    {
      category: 'characterCreation',
      title: '自动车卡',
      rules: [
        {
          id: 'characteristicRolls',
          title: '八项属性',
          summary: 'STR、CON、DEX、APP、POW用3D6×5；SIZ、INT、EDU用(2D6+6)×5。年龄调整完成后再写入最终值。',
          pdfPages: [24, 25, 27],
          source: 'PDF 第24–27页'
        },
        {
          id: 'ageAdjustments',
          title: '年龄调整',
          summary: '15–19岁调整STR、SIZ、EDU和幸运；20岁起按年龄增加EDU增强次数，40岁起同时降低身体属性、APP与MOV。',
          pdfPages: [27, 38],
          source: 'PDF 第27、38页'
        },
        {
          id: 'derivedValues',
          title: '派生值',
          summary: 'SAN=POW，MP=floor(POW/5)，HP=floor((CON+SIZ)/10)，闪避基础值=floor(DEX/2)，幸运=3D6×5。',
          pdfPages: [27, 28, 38],
          source: 'PDF 第27–28、38页'
        },
        {
          id: 'damageBonusBuild',
          title: '伤害加值与体格',
          summary: 'DB与Build由STR+SIZ查表；达到205后为+2D6/Build 3，此后每增加80点再增加1D6与1级Build。',
          pdfPages: [27, 28, 38],
          source: 'PDF 第27–28、38页'
        },
        {
          id: 'skillPoints',
          title: '技能点',
          summary: '本职技能点按职业公式分配给本职技能与信用评级；兴趣技能点为INT×2，可分配给除克苏鲁神话外的技能。',
          pdfPages: [31, 38],
          source: 'PDF 第31、38页'
        }
      ]
    },
    {
      category: 'checks',
      title: '百分骰判定',
      rules: [
        {
          id: 'successLevels',
          title: '成功等级',
          summary: '结果不高于技能为常规成功，不高于半值为困难成功，不高于五分之一为极难成功；01为大成功。',
          pdfPages: [73, 77, 78],
          source: 'PDF 第73、77–78页'
        },
        {
          id: 'fumble',
          title: '大失败',
          summary: '目标值不低于50时只有100大失败；目标值低于50时96–100均为大失败。',
          pdfPages: [77],
          source: 'PDF 第77页'
        },
        {
          id: 'opposedRoll',
          title: '对抗检定',
          summary: '先比较成功等级；等级相同则技能或属性较高者胜，仍相同则僵持或重骰。对抗检定不能孤注一掷。',
          pdfPages: [78],
          source: 'PDF 第78页'
        },
        {
          id: 'pushedRoll',
          title: '孤注一掷',
          summary: '失败后可说明新的高风险尝试再掷一次；战斗、幸运、理智、伤害和理智损失不能孤注一掷。',
          pdfPages: [74, 75],
          source: 'PDF 第74–75页'
        }
      ]
    },
    {
      category: 'combat',
      title: '战斗',
      rules: [
        {
          id: 'initiative',
          title: '行动顺序',
          summary: '按DEX从高到低行动，同DEX比较战斗技能；已备好枪械并立即射击时按DEX+50排序。',
          pdfPages: [87, 96],
          source: 'PDF 第87、96页'
        },
        {
          id: 'fightBackDodge',
          title: '反击与闪避',
          summary: '反击对抗同等级时攻击方胜；闪避对抗同等级时闪避方胜。双方都失败时基础规则为无人受伤。',
          pdfPages: [87, 88],
          source: 'PDF 第87–88页'
        },
        {
          id: 'extremeDamage',
          title: '极难成功伤害',
          summary: '主动回合的非贯穿武器取武器骰和DB最大值；贯穿武器还额外掷一次武器伤害。反击不触发该效果。',
          pdfPages: [88],
          source: 'PDF 第88页'
        },
        {
          id: 'maneuver',
          title: '战技与体格',
          summary: '目标Build每高1级，战技增加1个惩罚骰，最多2个；高出3级或以上时无法完成该战技。',
          pdfPages: [90],
          source: 'PDF 第90页'
        },
        {
          id: 'outnumberedSurprise',
          title: '寡不敌众与突袭',
          summary: '一轮内已经防御过后，后续近战攻击者通常获得奖励骰；未察觉突袭者的目标可能无法正常反击或闪避。',
          pdfPages: [91, 92],
          source: 'PDF 第91–92页'
        },
        {
          id: 'firearms',
          title: '射击',
          summary: '射击不是对抗检定；基础、两倍、四倍射程分别要求常规、困难、极难成功，掩体、瞄准和连射再调整奖励或惩罚骰。',
          pdfPages: [96, 97, 98, 99],
          source: 'PDF 第96–99页'
        }
      ]
    },
    {
      category: 'damageHealing',
      title: '伤害与恢复',
      rules: [
        {
          id: 'damageThresholds',
          title: '轻伤、重伤与死亡',
          summary: '单次最终伤害达到最大HP一半为重伤，超过最大HP才当场死亡；重伤会倒地并做CON避免昏迷。',
          pdfPages: [101],
          source: 'PDF 第101页'
        },
        {
          id: 'zeroHp',
          title: 'HP归零',
          summary: 'HP最低记为0并陷入昏迷；没有重伤标记时不会因此死亡，有重伤标记时进入濒死。',
          pdfPages: [101, 102],
          source: 'PDF 第101–102页'
        },
        {
          id: 'dying',
          title: '濒死',
          summary: '从下一轮结束起每轮做CON，任一失败死亡；急救成功可暂时稳定，之后必须通过医学治疗清除濒死。',
          pdfPages: [102],
          source: 'PDF 第102页'
        },
        {
          id: 'firstAidMedicine',
          title: '急救与医学',
          summary: '普通急救须在一小时内进行并恢复1HP；医学至少耗时一小时并恢复1D3，濒死者必须先急救稳定。',
          pdfPages: [101, 102],
          source: 'PDF 第101–102页'
        },
        {
          id: 'recovery',
          title: '自然恢复',
          summary: '无重伤时每天恢复1HP；重伤每周做CON，成功恢复1D3、极难成功恢复2D3，恢复到半血或检定极难时清除重伤。',
          pdfPages: [102, 103],
          source: 'PDF 第102–103页'
        }
      ]
    },
    {
      category: 'sanity',
      title: '理智',
      rules: [
        {
          id: 'sanCheck',
          title: '理智检定',
          summary: 'D100不高于当前SAN即成功；按0/1D6这类表达式的左、右侧分别结算成功或失败损失，大失败取最大损失。',
          pdfPages: [130, 131],
          source: 'PDF 第130–131页'
        },
        {
          id: 'sanMaximum',
          title: '最大理智',
          summary: '最大SAN为99减去当前克苏鲁神话技能；技能提高时最大SAN立即同步下降。',
          pdfPages: [131],
          source: 'PDF 第131页'
        },
        {
          id: 'insanityThresholds',
          title: '疯狂阈值',
          summary: '单次实际损失5点或以上后做INT，成功才进入临时疯狂；一天累计损失达到阶段SAN的五分之一进入不定性疯狂，SAN归零为永久疯狂。',
          pdfPages: [132],
          source: 'PDF 第132页'
        },
        {
          id: 'boutOfMadness',
          title: '疯狂发作',
          summary: '即时发作通常持续1D10轮，独处时可使用1D10小时的总结症状；发作结束后进入潜在疯狂。',
          pdfPages: [133, 134, 135],
          source: 'PDF 第133–135页'
        },
        {
          id: 'sanRecovery',
          title: '理智恢复',
          summary: '临时疯狂通常持续1D10小时；不定性疯狂可经月度护理或幕间恢复，当前SAN始终不能超过最大SAN。',
          pdfPages: [140, 141, 142, 143],
          source: 'PDF 第140–143页'
        }
      ]
    },
    {
      category: 'luck',
      title: '幸运',
      rules: [
        {
          id: 'luckCreationCheck',
          title: '初始值与幸运检定',
          summary: '初始幸运为3D6×5，15–19岁掷两次取高；幸运检定以D100不高于当前幸运为成功，团体检定通常由最低者投掷。',
          pdfPages: [27, 77, 78],
          source: 'PDF 第27、77–78页'
        },
        {
          id: 'spendLuck',
          title: '花费幸运（可选）',
          summary: '技能或属性检定后可按1:1降低骰值；不能修改幸运、伤害、SAN、理智损失、孤注一掷、大成功、大失败或枪械故障。',
          pdfPages: [85],
          source: 'PDF 第85页',
          optional: true
        },
        {
          id: 'recoverLuck',
          title: '回复幸运（可选）',
          summary: '每次游戏结束掷D100，结果高于当前幸运时恢复1D10，幸运上限为99。',
          pdfPages: [85],
          source: 'PDF 第85页',
          optional: true
        },
        {
          id: 'stayConsciousLuck',
          title: '花幸运保持清醒（可选）',
          summary: '本轮先花1点维持清醒，之后每轮开始依次花2、4、8点；停止支付后立即昏迷。',
          pdfPages: [107],
          source: 'PDF 第107页',
          optional: true
        }
      ]
    }
  ];

  var skillById = {};
  skills.forEach(function (skill) { skillById[skill.id] = skill; });

  root.COC7_DATA = deepFreeze({
    id: 'coc7e-cn-core',
    version: '1.1.0',
    title: '克苏鲁的呼唤 第七版',
    source: {
      title: '克苏鲁的呼唤第七版守秘人规则书 Version2002',
      pageCount: 400,
      pageConvention: '本数据中的页码均为PDF绝对页',
      usageNotice: '仅提供结构化规则事实与短摘要；不要用本数据替代或长段复制规则书正文。'
    },
    characteristics: characteristics,
    skills: skills,
    skillById: skillById,
    socialSkillIds: socialSkills,
    occupations: occupations,
    quickRules: quickRules
  });
}(typeof window !== 'undefined' ? window : this));
