(function () {
  'use strict';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  var attributes = [
    { id: 'physique', label: '体魄', help: '力量、搬运、近身爆发、压制与破坏。' },
    { id: 'endurance', label: '耐久', help: '生命值、抗毒、抗痛、长时间行动与承受冲击。' },
    { id: 'agility', label: '灵巧', help: '速度、平衡、精确、潜行、射击与回避。' },
    { id: 'perception', label: '感知', help: '观察、直觉、追踪、识破埋伏与读懂细节。' },
    { id: 'knowledge', label: '学识', help: '历史、科技、医学、战术、术式理论与资料分析。' },
    { id: 'will', label: '意志', help: '精神抵抗、专注、威慑、说服与维持自我。' },
    { id: 'mana', label: '魔力', help: '魔术输出、回路容量、从者供能、抗魔与神秘承载。' }
  ];

  var skills = [
    { id: 'athletics', label: '运动', help: '奔跑、攀爬、游泳、跳跃与挣脱。' },
    { id: 'melee', label: '近战', help: '徒手、刀剑、长兵器与格挡。' },
    { id: 'ranged', label: '射击', help: '枪械、弓弩、投掷与远程宝具瞄准。' },
    { id: 'stealth', label: '潜行', help: '隐藏、尾随、无声移动与藏匿物品。' },
    { id: 'awareness', label: '侦查', help: '警戒、搜寻、追踪、读唇与察觉魔力波动。' },
    { id: 'investigation', label: '调查', help: '现场还原、查档、讯问与比对证据。' },
    { id: 'academics', label: '学术', help: '历史、宗教、神话、语言、法律与理论。' },
    { id: 'technology', label: '技术', help: '电子、机械、爆破、驾驶、工事与黑客。' },
    { id: 'medicine', label: '医疗', help: '急救、诊断、稳定伤势与药理。' },
    { id: 'magecraft', label: '魔术', help: '施术、识别神秘、反制与灵脉操作。' },
    { id: 'negotiation', label: '交涉', help: '说服、安抚、欺骗、威慑与谈判。' },
    { id: 'command', label: '指挥', help: '战术调度、团队协同、御主支援与军势控制。' }
  ];

  var backgrounds = [
    { id: 'care', label: '医疗与照护', recommendedSkills: ['medicine', 'awareness', 'negotiation'], signatureTalent: { name: '黄金十分钟', summary: '恢复 3 生命并止血。' } },
    { id: 'investigation-media', label: '调查与媒体', recommendedSkills: ['investigation', 'awareness', 'negotiation'], signatureTalent: { name: '公开记录', summary: '让证据无法被轻易抹去。' } },
    { id: 'engineering', label: '工程与技术', recommendedSkills: ['technology', 'academics', 'athletics'], signatureTalent: { name: '旁路施工', summary: '临时切断供能或打开安全通道。' } },
    { id: 'security', label: '护卫与军警', recommendedSkills: ['melee', 'ranged', 'command'], signatureTalent: { name: '交叉掩护', summary: '让一名盟友移动而不触发反应。' } },
    { id: 'community', label: '社区与制度', recommendedSkills: ['negotiation', 'investigation', 'command'], signatureTalent: { name: '合法入口', summary: '调动避难点、社工、学校或医院资源。' } },
    { id: 'student-unregistered', label: '学生／无籍者', recommendedSkills: ['stealth', 'awareness', 'technology'], signatureTalent: { name: '被忽略的路线', summary: '进入成年人或系统忽视的空间。' } }
  ];

  var realAdvantages = [
    { id: 'institutional-access', label: '机构权限', help: '以现实身份调用明确机构的合法权限；具体边界在开团时写明。' },
    { id: 'wealth', label: '财富', help: '以可说明来源的资金、资产或采购能力解决现实问题。' },
    { id: 'media', label: '媒体', help: '使用公开记录、采访、传播与舆论渠道。' },
    { id: 'medical-access', label: '医疗', help: '调用现实医疗知识、设施、药品或转运渠道。' },
    { id: 'engineering-access', label: '工程', help: '调用工具、施工、维修、基础设施或技术资源。' },
    { id: 'intelligence-network', label: '情报', help: '通过合法或既定关系取得现实世界的信息与线索。' },
    { id: 'military-police-training', label: '军警训练', help: '具备纪律、现场控制、战术或安全处置方面的现实训练。' },
    { id: 'community-trust', label: '社区信任', help: '依靠长期关系取得社区协助、庇护或可信证言。' }
  ];

  var classTemplates = {
    saber: {
      id: 'saber', label: 'Saber',
      trait: '对魔力：对术式的防御 +2；每场一次把魔术伤害再减 2。',
      recommendedAttributes: { physique: 4, endurance: 3, agility: 2, perception: 2, knowledge: 1, will: 3, mana: 1 },
      adjustmentHelp: '正面作战与持续对抗；若传说更偏技巧，可交换体魄与灵巧。',
      tacticalAffinity: { strongAgainst: 'lancer', weakAgainst: 'archer' }
    },
    archer: {
      id: 'archer', label: 'Archer',
      trait: '单独行动：契约中断时每场只失去 1 MP；远距射击不受距离惩罚。',
      recommendedAttributes: { physique: 2, endurance: 1, agility: 4, perception: 3, knowledge: 3, will: 2, mana: 1 },
      adjustmentHelp: '远距、观察与准备；近战型 Archer 可交换体魄与学识。',
      tacticalAffinity: { strongAgainst: 'saber', weakAgainst: 'lancer' }
    },
    lancer: {
      id: 'lancer', label: 'Lancer',
      trait: '高速突进：每轮一次，在近战攻击前免费移动 1 个距离带。',
      recommendedAttributes: { physique: 3, endurance: 3, agility: 4, perception: 2, knowledge: 1, will: 2, mana: 1 },
      adjustmentHelp: '速度、突入与续战；推荐把最高值放在灵巧。',
      tacticalAffinity: { strongAgainst: 'archer', weakAgainst: 'saber' }
    },
    rider: {
      id: 'rider', label: 'Rider',
      trait: '骑乘／领域移动：载具或坐骑移动时可带一名愿意同行者；驾驶检定优势。',
      recommendedAttributes: { physique: 2, endurance: 2, agility: 4, perception: 3, knowledge: 1, will: 3, mana: 1 },
      adjustmentHelp: '机动、驾驭与战场转移；坐骑型可交换体魄与感知。',
      tacticalAffinity: { strongAgainst: 'caster', weakAgainst: 'assassin' }
    },
    caster: {
      id: 'caster', label: 'Caster',
      trait: '阵地作成：10 分钟建立工房；其中施术 +2，短休额外恢复 2 MP。',
      recommendedAttributes: { physique: 1, endurance: 1, agility: 2, perception: 2, knowledge: 3, will: 3, mana: 4 },
      adjustmentHelp: '术式、阵地与资源；低体魄、低耐久是典型而非强制。',
      tacticalAffinity: { strongAgainst: 'assassin', weakAgainst: 'rider' }
    },
    assassin: {
      id: 'assassin', label: 'Assassin',
      trait: '气息遮断：场景开始可处于隐匿；第一次暴露前潜行检定优势。',
      recommendedAttributes: { physique: 1, endurance: 1, agility: 4, perception: 3, knowledge: 3, will: 2, mana: 2 },
      adjustmentHelp: '隐匿、刺杀与情报；这是灵巧 A、正面承伤较低的典型开局。',
      tacticalAffinity: { strongAgainst: 'rider', weakAgainst: 'caster' }
    },
    berserker: {
      id: 'berserker', label: 'Berserker',
      trait: '狂化：普通与重型攻击 +2 伤害；复杂学识与交涉检定 -2，除非消耗 1 决意。',
      recommendedAttributes: { physique: 4, endurance: 3, agility: 3, perception: 2, knowledge: 1, will: 2, mana: 1 },
      adjustmentHelp: '爆发与承伤；狂化不等于角色没有判断或人格。',
      tacticalAffinity: { strongAgainst: 'all-base-classes', weakAgainst: 'all-base-classes' }
    }
  };

  var retainedSkillRanks = [
    { rank: 'E', points: 0, openingLimit: '仍占一个保有技能栏；适合极窄或有明显缺陷的能力。', commonCost: '0—1 MP；无或 1 轮冷却', effectScale: '+2、短移动、识别信息或 2—3 伤害。' },
    { rank: 'D', points: 1, openingLimit: '可在起始创建时选择。', commonCost: '0—1 MP；无或 1 轮冷却', effectScale: '+2、短移动、识别信息或 2—3 伤害。' },
    { rank: 'C', points: 2, openingLimit: '可在起始创建时选择。', commonCost: '1—2 MP；2 轮冷却', effectScale: '优势、4 伤害、单体状态或局部防护。' },
    { rank: 'B', points: 3, openingLimit: '可在起始创建时选择。', commonCost: '2 MP；每场 2 次', effectScale: '6 伤害、范围控制、强位移或明显规则优势。' },
    { rank: 'A', points: 4, openingLimit: '起始最多一项。', commonCost: '3 MP；每场 1 次', effectScale: '改变一轮战局、抵挡重击或强制反制窗口。' },
    { rank: 'EX', points: null, openingLimit: '不可购买；由传说、容器或战役授权，并必须写条件与反制。', commonCost: '特殊触发与代价', effectScale: '不按单纯强弱理解；必须写明条件与反制。' }
  ];

  var noblePhantasmRanks = [
    { rank: 'E', rankBonus: 0, cost: '3 MP', damage: 6, equivalent: '护盾 6；短暂条件优势。', retainedSkillBudgetCap: 7 },
    { rank: 'D', rankBonus: 1, cost: '4 MP', damage: 7, equivalent: '护盾 7；单体强状态。', retainedSkillBudgetCap: 7 },
    { rank: 'C', rankBonus: 2, cost: '5 MP', damage: 8, equivalent: '护盾 8；小范围或持续 2 轮。', retainedSkillBudgetCap: 7, default: true },
    { rank: 'B', rankBonus: 3, cost: '6 MP', damage: 10, equivalent: '护盾 10；一个距离带强效果。', retainedSkillBudgetCap: 6 },
    { rank: 'A', rankBonus: 4, cost: '8 MP', damage: 12, equivalent: '护盾 12；改变战场一项规则。', retainedSkillBudgetCap: 5, extraRequirement: '增加一个触发条件或代价。' },
    { rank: 'EX', rankBonus: 5, cost: '10+ MP／特殊', damage: '14+ 或不以伤害衡量', equivalent: '必须写明独特条件、代价与可执行反制。', retainedSkillBudgetCap: null, requiresCampaignPermission: true }
  ];

  var spellLineages = [
    {
      id: 'barrier', label: '结界', spells: [
        { id: 'mana-alarm', name: '魔力警戒', rank: 0, lineage: 'barrier', action: '仪式 1 分钟', cost: '0 MP', summary: '一个房间或近距区域；不掷骰。放置一枚警戒印，神秘进入时向施术者示警。印记可被侦查发现并物理破坏。', tags: ['警戒', '侦测', '仪式'] },
        { id: 'deflection-shield', name: '偏转盾', rank: 1, lineage: 'barrier', action: '反应', cost: '1 MP', summary: '自己或接触盟友被命中时使用；伤害 -2。大成功无额外收益；每轮一次，破甲效果仍会生效。', tags: ['防御', '减伤', '反应'] },
        { id: 'warding-line', name: '封锁线', rank: 2, lineage: 'barrier', action: '主要', cost: '2 MP', summary: '魔力＋魔术对坚韧；在近距画出一道线。首次越线者成功则被束缚 1 轮；主要动作、体魄＋运动 DC13 可破坏锚点。', tags: ['控制', '束缚', '锚点'] },
        { id: 'concealment-veil', name: '隐匿幕', rank: 2, lineage: 'barrier', action: '仪式 10 分钟', cost: '2 MP', summary: '一个房间；外界侦测需以感知＋侦查对施术总值。攻击、宝具或破坏锚点会使幕布失效。', tags: ['隐匿', '防侦测', '仪式'] },
        { id: 'workshop-field', name: '工房界', rank: 3, lineage: 'barrier', action: '仪式 10 分钟', cost: '4 MP', summary: '固定房间；选择一个魔术领域，其中施术 +2，且每场一次短休多恢复 2 MP。离开、锚点被毁或反制成功即失效。', tags: ['工房', '强化', '恢复'] },
        { id: 'severance-barrier', name: '断绝结界', rank: 4, lineage: 'barrier', action: '仪式', cost: '6+ MP', summary: '三个锚点围成一个距离带；选定一种尺度，阻止其出入 3 轮。破坏任一锚点、同阶反制或概念通行权可突破。', tags: ['封锁', '区域', '仪式'] }
      ]
    },
    {
      id: 'reinforcement', label: '强化', spells: [
        { id: 'strength-reinforcement', name: '筋力强化', rank: 1, lineage: 'reinforcement', action: '次要', cost: '1 MP', summary: '自己持续 2 轮；体魄相关检定 +2。它不额外增加固定伤害，且不与同名礼装加值叠加。', tags: ['强化', '体魄', '增益'] },
        { id: 'swift-step', name: '疾步', rank: 1, lineage: 'reinforcement', action: '次要', cost: '1 MP', summary: '自己立刻移动 1 个距离带，不触发借机攻击；本回合不能再用冲刺增加移动。', tags: ['移动', '撤退', '机动'] },
        { id: 'sensory-boost', name: '感官增幅', rank: 1, lineage: 'reinforcement', action: '主要', cost: '1 MP', summary: '自己持续 10 分钟；感知＋侦查 +2，并能察觉近距魔力波动。强光、噪声或感官攻击使该检定劣势。', tags: ['感知', '侦查', '强化'] },
        { id: 'mystic-weaponization', name: '神秘武装化', rank: 2, lineage: 'reinforcement', action: '主要', cost: '2 MP', summary: '接触一件武器；本场景获得神秘尺度，但不增加基础伤害。武器离手一轮、被反制或媒介破坏即结束。', tags: ['神秘尺度', '武器', '强化'] },
        { id: 'hardened-circuits', name: '强韧回路', rank: 2, lineage: 'reinforcement', action: '反应', cost: '2 MP', summary: '自己受到身体或魔术伤害时减 4；随后直到下回合结束，施术检定 -1。', tags: ['防御', '减伤', '反应'] },
        { id: 'limit-drive', name: '极限驱动', rank: 3, lineage: 'reinforcement', action: '次要', cost: '4 MP', summary: '选择体魄、耐久或灵巧，相关检定 +2 且减伤 2，持续 2 轮。结束时失去 2 生命并获得回路灼伤；每场一次。', tags: ['强化', '减伤', '自损'] }
      ]
    },
    {
      id: 'alchemy', label: '炼金', spells: [
        { id: 'material-analysis', name: '物质鉴定', rank: 0, lineage: 'alchemy', action: '主要', cost: '0 MP', summary: '接触样本；辨认主要材质、毒性与显著魔术加工。复杂配方仍需学识＋魔术或技术。', tags: ['鉴定', '调查', '工具'] },
        { id: 'coagulant', name: '凝血剂', rank: 1, lineage: 'alchemy', action: '主要', cost: '1 MP', summary: '学识＋医疗 DC10；接触目标恢复 2 生命并移除流血。每名目标每场一次；失败仍可稳定倒地者。', tags: ['治疗', '稳定', '医疗'] },
        { id: 'flame-arrow', name: '火焰矢', rank: 2, lineage: 'alchemy', action: '主要', cost: '2 MP', summary: '魔力＋魔术对回避，近距单体；成功 4 伤害，大成功 6 或暴露。可由闪避、耐火与反制应对。', tags: ['攻击', '火焰', '单体'] },
        { id: 'frost-wedge', name: '冰封楔', rank: 2, lineage: 'alchemy', action: '主要', cost: '2 MP', summary: '魔力＋魔术对坚韧，近距单体；2 伤害并失衡，差 5+ 时改为束缚 1 轮。热源或主要动作可解除。', tags: ['攻击', '控制', '束缚'] },
        { id: 'temporary-construct', name: '临时构装', rank: 2, lineage: 'alchemy', action: '仪式 1 分钟', cost: '2 MP', summary: '塑造一件工具、轻型掩体或护甲 1，持续本场景。承受 6 点伤害、离开施术者一带或被反制后崩解。', tags: ['构装', '工具', '防护'] },
        { id: 'flesh-restoration', name: '血肉修复', rank: 3, lineage: 'alchemy', action: '主要', cost: '4 MP', summary: '魔力＋医疗 DC16；接触目标恢复 6 生命并移除一种身体状态。每目标每完整休整一次；失败时施术者失去 2 生命。', tags: ['治疗', '状态移除', '自损'] }
      ]
    },
    {
      id: 'summoning', label: '召唤', spells: [
        { id: 'paper-bird-familiar', name: '纸鸟使魔', rank: 1, lineage: 'summoning', action: '仪式 1 分钟', cost: '1 MP', summary: '召出微型侦察使魔 10 分钟；可传回图像，防御 10、生命 1。攻击、结界或失去联系会消灭它。', tags: ['召唤', '侦查', '使魔'] },
        { id: 'tracking-hound-spirit', name: '追迹犬灵', rank: 1, lineage: 'summoning', action: '主要', cost: '1 MP', summary: '给定气味、物品或魔力残留；本场景追踪检定获得优势。跨越结界、流水或传送会中断。', tags: ['追踪', '召唤', '调查'] },
        { id: 'messenger-raven', name: '传讯鸦', rank: 2, lineage: 'summoning', action: '仪式 1 分钟', cost: '2 MP', summary: '向同城、已知且有媒介的目标传递不超过一分钟的信息，并带回一句回复。拦截使魔可读取信息。', tags: ['通信', '召唤', '使魔'] },
        { id: 'guardian-doll', name: '守护偶', rank: 2, lineage: 'summoning', action: '主要', cost: '2 MP', summary: '近距召出生命 6、防御 12 的构装体；它每轮可用反应保护一名相邻目标，不能独立攻击。持续本场景。', tags: ['召唤', '保护', '构装'] },
        { id: 'familiar-swarm', name: '群使魔', rank: 3, lineage: 'summoning', action: '主要', cost: '4 MP', summary: '覆盖一个距离带 2 轮；区域内敌人视为暴露，移动需精神 DC16，否则停止。范围攻击可提前清除。', tags: ['区域', '控制', '召唤'] },
        { id: 'grand-summoning-gate', name: '大召唤门', rank: 4, lineage: 'summoning', action: '仪式', cost: '6+ MP', summary: '召来一名与契约、真名或供物相符的高位存在，执行一项场景任务。必须预先写明代价、拒绝条件与解除方法。', tags: ['高位召唤', '仪式', '场景任务'] }
      ]
    },
    {
      id: 'runes', label: '符文', spells: [
        { id: 'warning-rune', name: '警示符', rank: 0, lineage: 'runes', action: '主要', cost: '0 MP', summary: '在物体上留下可见或隐蔽标记；被触碰时发出声音、光或短讯。侦查可发现，擦除即可解除。', tags: ['警戒', '符文', '标记'] },
        { id: 'burst-mark', name: '爆裂刻印', rank: 1, lineage: 'runes', action: '主要', cost: '1 MP', summary: '预先刻在物体；触发时对接触目标造成 2 伤害，灵巧＋运动 DC10 可减为 0。一次性。', tags: ['陷阱', '攻击', '符文'] },
        { id: 'binding-mark', name: '缚足刻印', rank: 2, lineage: 'runes', action: '主要', cost: '2 MP', summary: '魔力＋魔术对坚韧；成功束缚 1 轮。目标可用主要动作破坏刻印或挣脱。', tags: ['束缚', '控制', '符文'] },
        { id: 'weakening-script', name: '衰弱文', rank: 2, lineage: 'runes', action: '主要', cost: '2 MP', summary: '魔力＋魔术对精神；成功后目标下一次相关检定 -2，或下一次受伤忽略 2 护甲，二选一。清除标记可终止。', tags: ['减益', '破甲', '符文'] },
        { id: 'backlash-mark', name: '反噬印', rank: 3, lineage: 'runes', action: '反应', cost: '4 MP', summary: '被术式指定时，以魔力＋魔术对抗施术总值；成功令其效果降低一阶，大成功再使对方受到 4 伤害。印记用后消失。', tags: ['反制', '反应', '反击'] },
        { id: 'termination-script', name: '终止文', rank: 4, lineage: 'runes', action: '仪式', cost: '6+ MP', summary: '封印一个已知能力、门户或契约条款，直到写明的解除条件成立。真名、同阶反制或破坏承载物可解除。', tags: ['封印', '仪式', '契约'] }
      ]
    },
    {
      id: 'astrology', label: '占星', spells: [
        { id: 'momentary-omen', name: '片刻预兆', rank: 0, lineage: 'astrology', action: '主要', cost: '0 MP', summary: '询问未来十分钟内最明显的危险方向；主持人给出诚实但简短的征兆。每场一次。', tags: ['预知', '危险', '情报'] },
        { id: 'crisis-prophecy', name: '危机先知', rank: 1, lineage: 'astrology', action: '反应', cost: '1 MP', summary: '自己或近距盟友的一次回避、坚韧或精神 +2；必须在掷骰前宣布。', tags: ['防御', '支援', '反应'] },
        { id: 'seeking-astrolabe', name: '寻物星盘', rank: 2, lineage: 'astrology', action: '仪式 10 分钟', cost: '2 MP', summary: '学识＋魔术 DC13；持有媒介时得知同城目标的大致方向与距离。结界、假媒介或跨界会误导。', tags: ['定位', '追踪', '仪式'] },
        { id: 'stellar-lock', name: '星位锁定', rank: 2, lineage: 'astrology', action: '主要', cost: '2 MP', summary: '选择可见目标；一名盟友对其下一次检定获得优势。遮蔽、离开视界或本轮结束会使锁定失效。', tags: ['支援', '锁定', '优势'] },
        { id: 'deflect-ill-omen', name: '偏转凶兆', rank: 3, lineage: 'astrology', action: '反应', cost: '4 MP', summary: '当盟友失败或被大成功命中时，将结果降低一档；随后主持人获得一个可在本场景使用的凶兆推进。每场一次。', tags: ['救场', '反应', '代价'] },
        { id: 'grand-divination', name: '大占仪', rank: 4, lineage: 'astrology', action: '仪式 1 小时', cost: '6+ MP', summary: '提出三个关于既定事件链的问题；回答真实但可象征化。仪式会留下强烈签名，并让被观测者知道有人窥视。', tags: ['预知', '仪式', '情报'] }
      ]
    },
    {
      id: 'leyline', label: '灵脉', spells: [
        { id: 'leyline-sense', name: '探脉', rank: 0, lineage: 'leyline', action: '主要', cost: '0 MP', summary: '感知近距内灵脉方向、活跃度与最近一次明显抽取；不提供精确身份。', tags: ['侦测', '灵脉', '调查'] },
        { id: 'mana-channel', name: '魔力导流', rank: 1, lineage: 'leyline', action: '次要', cost: '1 MP', summary: '近距愿意目标恢复 1 MP；同一目标每场一次。无法越过断绝结界或中断的契约。', tags: ['供魔', '恢复', '支援'] },
        { id: 'short-range-jump', name: '短距跃迁', rank: 2, lineage: 'leyline', action: '次要', cost: '2 MP', summary: '移动到视线内近距位置并忽略借机攻击；携带另一人需其愿意且再付 1 MP。空间封锁可阻止。', tags: ['传送', '移动', '撤退'] },
        { id: 'leyline-bypass', name: '灵脉旁路', rank: 2, lineage: 'leyline', action: '仪式 10 分钟', cost: '2 MP', summary: '学识＋魔术 DC13；让一个房间获得临时供能，短休额外恢复 2 MP。失败会暴露位置或污染节点。', tags: ['供能', '恢复', '仪式'] },
        { id: 'anchor-gate', name: '锚点之门', rank: 3, lineage: 'leyline', action: '仪式 10 分钟', cost: '4 MP', summary: '连接同城两个预先刻印锚点，一次运送至多四人；每多维持一轮再付 2 MP。破坏任一锚点即关闭。', tags: ['传送', '团队移动', '锚点'] },
        { id: 'passage-lock', name: '封锁通路', rank: 4, lineage: 'leyline', action: '仪式', cost: '6+ MP', summary: '一个距离带内的传送、灵体化与跨界移动需通过精神或魔术 DC19。摧毁核心、同阶反制或概念通行权可绕过。', tags: ['封锁', '反传送', '区域'] }
      ]
    },
    {
      id: 'memory', label: '记忆', spells: [
        { id: 'memory-trace', name: '记忆触痕', rank: 0, lineage: 'memory', action: '主要', cost: '0 MP', summary: '接触物品，判断它是否承载强烈记忆或被记忆术处理；不直接读取内容。', tags: ['侦测', '记忆', '调查'] },
        { id: 'echo-reading', name: '残响读取', rank: 1, lineage: 'memory', action: '主要', cost: '1 MP', summary: '学识＋调查 DC10／13；读取地点最近一次强烈情绪或短暂画面。大成功可追问一个细节。', tags: ['调查', '记忆', '情报'] },
        { id: 'blurred-face', name: '模糊面孔', rank: 1, lineage: 'memory', action: '主要', cost: '1 MP', summary: '魔力＋魔术对精神；成功使目标十分钟内难以准确回忆你的面貌。照片、记录和真名不受影响。', tags: ['隐匿', '精神', '记忆'] },
        { id: 'memory-casket', name: '记忆封匣', rank: 2, lineage: 'memory', action: '仪式 1 分钟', cost: '2 MP', summary: '把不超过五分钟的自愿记忆存入物件；持有者可回放。破坏封匣会释放碎片并令读取者失衡。', tags: ['存储', '记忆', '仪式'] },
        { id: 'false-scene-implant', name: '伪景植入', rank: 3, lineage: 'memory', action: '主要', cost: '4 MP', summary: '魔力＋魔术对精神；植入一个不超过一分钟、与现场大体相容的假记忆。矛盾证据、真名或治疗可触发复检。', tags: ['精神', '记忆改写', '控制'] },
        { id: 'archive-restoration', name: '档案复原', rank: 4, lineage: 'memory', action: '仪式', cost: '6+ MP', summary: '从多人、记录与残留中重建被删去的一段关键记忆。每位参与者承受一项公开代价；概念性抹除需对应弱点。', tags: ['复原', '记忆', '仪式'] }
      ]
    },
    {
      id: 'spiritual-evocation', label: '降灵', spells: [
        { id: 'spirit-sight', name: '灵视', rank: 0, lineage: 'spiritual-evocation', action: '主要', cost: '0 MP', summary: '持续十分钟看见普通灵体、附身痕迹与近距灵核轮廓；强光与高位神秘仍可遮蔽。', tags: ['灵体', '侦测', '感知'] },
        { id: 'repose', name: '安魂', rank: 1, lineage: 'spiritual-evocation', action: '主要', cost: '1 MP', summary: '意志＋魔术对精神或 DC10；移除恐惧，或令普通怨灵平静一轮。敌对高位灵体只会短暂停顿。', tags: ['安抚', '状态移除', '灵体'] },
        { id: 'spirit-questioning', name: '问灵', rank: 2, lineage: 'spiritual-evocation', action: '仪式 10 分钟', cost: '2 MP', summary: '以遗物召来残响并问三个问题；回答受死者认知限制。伪造遗物、污染或拒绝会产生误导。', tags: ['问灵', '情报', '仪式'] },
        { id: 'spirit-rejection-seal', name: '拒灵护印', rank: 2, lineage: 'spiritual-evocation', action: '主要', cost: '2 MP', summary: '目标持续本场景，对附身、魅惑和灵魂干涉的精神 +2；护印被破坏或目标主动邀请时结束。', tags: ['附身防护', '精神', '防御'] },
        { id: 'soul-anchor', name: '灵魂锚', rank: 3, lineage: 'spiritual-evocation', action: '反应', cost: '4 MP', summary: '接触目标将归零或消散时，使其稳定并保留 1 生命；施术者失去 2 生命。每场一次，概念即死需对应权限。', tags: ['稳定', '救援', '自损'] },
        { id: 'heroic-projection', name: '英雄投影', rank: 4, lineage: 'spiritual-evocation', action: '仪式', cost: '6+ MP', summary: '借由遗物投影一段英雄传说，赋予一个场景级规则或一次神秘尺度行动。必须写明真名线索、反制和仪式代价。', tags: ['神秘尺度', '场景规则', '仪式'] }
      ]
    }
  ];

  var mysticCodes = [
    { id: 'mana-casket', name: '魔力储匣', category: '储能与供魔', level: '常规', summary: '储存 2 MP，次要动作取用；完整休整或灵脉充满，匣体破损会泄露签名。' },
    { id: 'gem-battery', name: '宝石电池', category: '储能与供魔', level: '精良', summary: '储存 4 MP，一次最多取 2；用尽后宝石粉碎，被击碎时持有者受 2 伤害。' },
    { id: 'leyline-sample-vial', name: '灵脉采样瓶', category: '储能与供魔', level: '精良', summary: '在灵脉处收集 3 MP，供一次仪式使用；离开当前章节后失效，采样会留下可追踪痕迹。' },
    { id: 'supply-amplification-ring', name: '供魔增幅环', category: '储能与供魔', level: '传承', summary: '契约从者最大 MP +2，供魔检定 +2；契约中断时佩戴者失去 2 生命，不能同时佩戴第二枚。' },
    { id: 'spell-focus-staff', name: '术式焦点杖', category: '增幅与施术焦点', level: '常规', summary: '选择一个领域，该领域施术 +2；失败时礼装受损，短休修复，同名加值不叠加。' },
    { id: 'seven-section-chant-beads', name: '七节咏唱珠', category: '增幅与施术焦点', level: '精良', summary: '每场一次，把二阶以下术式由主要动作改为次要动作；必须完整发声，封术、失声或珠串断裂时不能使用。' },
    { id: 'circuit-calibration-needle', name: '回路校准针', category: '增幅与施术焦点', level: '精良', summary: '超载前使用，使本次少承受 2 生命损失；使用后仍获得回路灼伤，每场一次。' },
    { id: 'family-crest-fragment', name: '家系刻印片', category: '增幅与施术焦点', level: '传承', summary: '获得一个固定的一阶术式，不计入起始四项；术式不可替换，首次失败触发家系代价或可追踪签名。' },
    { id: 'protective-garment', name: '防护衣', category: '防护与代偿', level: '常规', summary: '提供护甲 1；与普通轻甲取高不叠加，被破甲后需在安全地点修复。' },
    { id: 'substitute-paper-doll', name: '替身纸偶', category: '防护与代偿', level: '常规', summary: '每场一次，受到伤害时减 3；用后烧毁，不能抵消状态、媒介破坏或概念效果。' },
    { id: 'anti-magic-mirror', name: '反魔镜', category: '防护与代偿', level: '精良', summary: '反应、每场一次，把来袭术式效果降低一阶；对宝具只减 2 伤害，镜面破裂后失效。' },
    { id: 'mobile-workshop-coat', name: '移动工房外套', category: '防护与代偿', level: '传承', summary: '对魔术伤害护甲 2，短休多恢复 1 MP；显眼且沉重，潜行劣势，失去外套即失去效果。' },
    { id: 'mystic-magazine', name: '神秘弹匣', category: '神秘武装与概念媒介', level: '常规', summary: '三发弹药获得神秘尺度，使用射击正常攻击；不增加基础伤害，补充需完整休整与材料。' },
    { id: 'engraved-dagger', name: '刻印短刃', category: '神秘武装与概念媒介', level: '精良', summary: '基础伤害 2，可直接伤害从者；每场一次命中已确认概念弱点时忽略 2 护甲。' },
    { id: 'spell-breaking-nail', name: '破术钉', category: '神秘武装与概念媒介', level: '精良', summary: '命中结界、使魔或礼装时造成 4 点结构伤害；对生物仍仅 1 伤害，每场三枚。' },
    { id: 'inherited-armament', name: '传承武装', category: '神秘武装与概念媒介', level: '传承', summary: '基础伤害 3，具有一个窄而明确的概念触发；触发时检定优势，必须同时写一项禁忌，违反时武装沉默。' },
    { id: 'folding-ritual-board', name: '折叠式阵盘', category: '仪式与工房', level: '常规', summary: '展开 10 分钟后，四阶仪式少一种准备需求；展开后不能移动，破坏四角之一即可中断。' },
    { id: 'rune-imprinter', name: '符文压印器', category: '仪式与工房', level: '常规', summary: '符文类仪式准备时间减半；只能保存三种预刻符，更换需完整休整。' },
    { id: 'starless-astrolabe', name: '无天星盘', category: '仪式与工房', level: '精良', summary: '占星术在室内或无星环境不受限制；错误校准会让失败额外暴露施术位置。' },
    { id: 'ancestral-altar-core', name: '家传祭坛核', category: '仪式与工房', level: '传承', summary: '固定工房内四阶仪式 MP 成本 -1；不可移动，失窃或破坏会造成家系级后果。' },
    { id: 'spirit-sight-lens', name: '灵视镜片', category: '侦查与通信', level: '常规', summary: '识别魔力、结界与灵体的侦查 +2；连续佩戴一场后感知检定 -1，直到短休。' },
    { id: 'tracking-pointer', name: '追迹指针', category: '侦查与通信', level: '常规', summary: '记录一个接触过的魔力签名，本场景指出大致方向；跨界、净化或更换容器会使指针失准。' },
    { id: 'silent-veil', name: '静默帷幕', category: '侦查与通信', level: '精良', summary: '一个近距小队对普通监控与听觉潜行优势；攻击、明显施术或离开近距队形后结束。' },
    { id: 'spell-recording-crystal', name: '术式记录晶体', category: '侦查与通信', level: '精良', summary: '记录一次看见的术式，之后对其一次反制获得优势；用后清空，无法记录宝具或 EX 能力。' },
    { id: 'folding-case', name: '折叠箱', category: '移动与收纳', level: '常规', summary: '收纳不超过一人可搬运的器材，次要动作取放；活物不能进入，箱体损坏会把内容散出。' },
    { id: 'return-nail', name: '归途钉', category: '移动与收纳', level: '精良', summary: '预先钉入安全地点，每场一次撤离检定 +2；只能指向同城地点，锚点被发现即可破坏。' },
    { id: 'shadow-walking-cloak', name: '影行斗篷', category: '移动与收纳', level: '精良', summary: '从明处进入阴影时，可用次要动作移动一带；强光、无影区域与空间封锁使其失效。' },
    { id: 'boundary-gate-key', name: '界门钥匙', category: '移动与收纳', level: '传承', summary: '每章一次打开一个已有权限的封闭门户或结界通道；不能创造权限，使用会向原主人发出明显信号。' },
    { id: 'emergency-alchemical-dose', name: '应急炼金剂', category: '消耗品与禁忌礼装', level: '常规', summary: '主要动作恢复 3 生命；每目标每场一次，随后耐久相关检定 -1，持续一场。' },
    { id: 'disposable-command-mark-ink', name: '一次性令纹墨', category: '消耗品与禁忌礼装', level: '精良', summary: '为一次御主支援或供魔检定提供优势；不是令咒，不能强制命令，使用后留下可识别痕迹。' },
    { id: 'cursed-blood-capacitor', name: '咒血蓄能器', category: '消耗品与禁忌礼装', level: '传承', summary: '储存 6 MP；每取用 2 MP，持有者失去 1 生命，生命代价不能被减伤。' },
    { id: 'broken-grail-fragment', name: '破碎圣杯残片', category: '消耗品与禁忌礼装', level: '禁忌', summary: '提供神秘尺度，并可替代最多 8 MP 的仪式成本；每次使用推进污染钟，默认不能作为起始礼装。' }
  ];

  var masterSupplyLevels = [
    { id: 'insufficient', label: '不足', mpModifier: -2, summary: '从者最大 MP -2；每场第一次宝具解放后，御主失去 2 生命或从者再失去 2 MP。' },
    { id: 'stable', label: '稳定', mpModifier: 0, summary: '从者 MP 无修正；默认供魔等级。', default: true },
    { id: 'ample', label: '充足', mpModifier: 2, summary: '从者最大 MP +2；每场一次，回合开始恢复 2 MP。' },
    { id: 'system', label: '系统供给', mpModifier: null, summary: '由战役决定；可提供特殊恢复、距离与召唤规则。' }
  ];

  var quickBuilds = {
    mortal: {
      name: '未命名急救员', identityType: 'mortal', backgroundId: 'care', realAdvantageId: 'medical-access',
      realIdentity: '在高压现场维持秩序、优先救人的急救员。', wishMotivation: '让卷入战争的人尽可能活着回家。', boundaryFear: '不会为了赢而主动放弃仍能救下的人。',
      contacts: ['医院急诊值班主管', '熟悉城市道路的救护车司机'], equipment: ['急救包', '手电与备用电源'], safePlace: '有完整医疗物资的夜间诊所',
      attributes: { physique: 0, endurance: 1, agility: 1, perception: 3, knowledge: 2, will: 2, mana: 0 },
      skills: { athletics: 'trained', awareness: 'trained', investigation: 'trained', medicine: 'expert', negotiation: 'trained' },
      signatureTalent: { name: '黄金十分钟', action: '主要', cost: '每场一次或 1 决意', check: '学识＋医疗，对当前治疗 DC', target: '接触的一名目标', effect: '恢复 3 生命并止血。', failure: '仍可稳定生命归零的目标，但不恢复生命。', duration: '立即', cooldown: '每场一次', counter: '需要接触目标与可用医疗工具。' }
    },
    magus: {
      name: '未命名结界师', identityType: 'magus', lineages: ['barrier', 'leyline'], mediumRestriction: '必须使用刻有当地灵脉坐标的阵盘作为媒介。',
      realIdentity: '研究结界与城市灵脉、重视撤离路线的年轻魔术师。', wishMotivation: '证明魔术可以保护现实中的人，而不只是延续家系。', boundaryFear: '不会把无关者当成仪式耗材。',
      attributes: { physique: 0, endurance: 1, agility: 1, perception: 1, knowledge: 2, will: 2, mana: 3 },
      skills: { awareness: 'trained', investigation: 'trained', academics: 'trained', technology: 'trained', magecraft: 'expert' },
      spellIds: ['deflection-shield', 'concealment-veil', 'leyline-bypass', 'anchor-gate'], mysticCodeId: 'spell-focus-staff'
    },
    servant: {
      name: '无名守誓骑士', publicName: 'Saber', identityType: 'servant', classId: 'saber', legendCore: '在城门失守前仍保护撤离者的无名骑士。', wishMotivation: '确认守护是否也能成为值得铭记的传说。',
      conceptWeaknesses: ['主动立下的守护誓约被对象拒绝', '象征城门陷落的破城武器'], neverAccepts: '以平民为诱饵换取胜利的命令。', spiritualizationMethod: '卸下武装后化为微光灵体。', trueNameExposureIntel: '守护对象与城门意象会暴露其传说弱点。',
      attributes: { physique: 4, endurance: 3, agility: 2, perception: 2, knowledge: 1, will: 3, mana: 1 },
      skills: { athletics: 'expert', melee: 'expert', awareness: 'trained', academics: 'trained', negotiation: 'trained', command: 'trained' },
      retainedSkills: [
        { name: '战斗续行', rank: 'B', action: '反应', cost: '每场一次', check: '无需检定', target: '自己', effect: '生命值将降至 0 时改为保留 1 生命并获得“受伤”。', failure: '不适用。', duration: '直到下回合结束不能解放宝具。', cooldown: '每场一次', counter: '阻止触发的概念即死仍需对应权限。' },
        { name: '直感', rank: 'C', action: '次要', cost: '1 MP', check: '感知＋侦查，对隐藏威胁的察觉', target: '当前场景', effect: '成功可询问“最危险的立即行动是什么”；大成功时本轮回避 +2。', failure: '不能得到可靠答案。', duration: '立即／本轮', cooldown: '2 轮', counter: '被完全隔绝的情报仍不可感知。' },
        { name: '骑士武艺', rank: 'C', action: '次要', cost: '1 MP', check: '无需检定', target: '自己', effect: '下一次近战检定获得 +2。', failure: '攻击未发生则效果在本轮结束时消失。', duration: '本轮', cooldown: '1 轮', counter: '同名加值不叠加。' }
      ],
      noblePhantasm: { name: '守誓之庭', trueNameRelease: '真名解放·守誓之庭', rank: 'C', type: '结界／支援', action: '主要', cost: '5 MP', check: '无人直接阻止时自动成立', target: '近距区域内的盟友', effect: '建立护盾 8，持续 2 轮。', failure: '若释放被反制，MP 仍消耗。', duration: '2 轮', cooldown: '按战役的宝具再次使用条件', counter: '同级宝具对冲、破坏释放媒介或迫使使用者离开中心。' }
    }
  };

  window.NG_PLAYER_DATA = deepFreeze({
    protocol: 'null-grail-player-v4',
    characterProtocol: 'null-grail-character-v3',
    characterCollectionProtocol: 'null-grail-character-collection-v3',
    checkProtocol: 'null-grail-check-v2',
    contentVersion: '2.0.0-character-library',
    rulesetId: 'null-grail-core-d20-v2.0',
    rulesVersion: 'v2.0 · 车卡与资源库增订版',
    rulesDate: '2026-07-13',
    channelName: 'null-grail-player',
    attributes: attributes,
    skills: skills,
    skillRanks: [
      { id: 'untrained', label: '未受训', bonus: 0, cost: 0, help: '普通常识；复杂专业任务可能不能尝试。' },
      { id: 'trained', label: '受训', bonus: 2, cost: 1, help: '受过系统训练，可以在压力下可靠执行。' },
      { id: 'expert', label: '专家', bonus: 4, cost: 2, help: '职业级或传奇级专精；每次检定仍只加一个技能。' }
    ],
    identities: {
      mortal: { id: 'mortal', label: '普通人', attributeBudget: 14, attributeCap: 3, skillBudget: 6, maxExperts: 1, resources: '1 项标志才能、1 项现实优势、两名联系人、两件装备与一个安全地点。' },
      magus: { id: 'magus', label: '魔术师', attributeBudget: 15, attributeCap: 3, manaMinimum: 1, skillBudget: 6, maxExperts: 1, magecraftMinimum: 'trained', resources: '2 个系谱、4 项术式（调整后阶位和不超过 9）、1 件起始礼装与 1 项明确限制。' },
      servant: { id: 'servant', label: '从者', attributeBudget: 30, attributeCap: 4, skillBudget: 8, maxExperts: 2, requiresCombatSkill: true, resources: '1 项职阶特性、3 项保有技能、1 项宝具与 2 项概念弱点。' }
    },
    attributePointCosts: { 0: 0, 1: 1, 2: 3, 3: 6, 4: 10 },
    attributeRankDisplay: { 0: 'E', 1: 'D', 2: 'C', 3: 'B', 4: 'A', 5: 'EX' },
    attributePresets: {
      mortal: { id: 'mortal', label: '普通人固定数组', budget: 14, cap: 3, fixedArray: [3, 2, 2, 1, 1, 0, 0], manaDefault: 0 },
      magus: { id: 'magus', label: '魔术师固定数组', budget: 15, cap: 3, fixedArray: [3, 2, 2, 1, 1, 1, 0], manaMinimum: 1 },
      servant: { id: 'servant', label: '从者固定数组', budget: 30, cap: 4, fixedArray: [4, 3, 3, 2, 2, 1, 1] }
    },
    derivedFormulas: {
      evasion: '10＋灵巧', fortitude: '10＋耐久', mind: '10＋意志', perception: '10＋感知',
      humanHp: '8＋耐久×2', servantHp: '18＋耐久×3', magusMp: '4＋魔力×2', servantMp: '6＋魔力×2＋供魔修正', resolve: 3
    },
    backgrounds: backgrounds,
    realAdvantages: realAdvantages,
    classTemplates: classTemplates,
    retainedSkillRanks: retainedSkillRanks,
    noblePhantasmRanks: noblePhantasmRanks,
    spellLineages: spellLineages,
    spellBuildRules: { knownCount: 4, rankBudget: 9, maxRankFour: 1, selectedLineages: 2, crossLineageSurcharge: 1, requiresNonCombat: true, requiresDefenseOrRetreat: true },
    mysticCodeLevels: [
      { id: 'common', label: '常规', startingPermission: '可直接选择', strength: '单一工具、2—3 次充能、护甲 1、窄 +2 或轻型神秘尺度。' },
      { id: 'fine', label: '精良', startingPermission: '可直接选择', strength: '每场一次强反应、4 MP 储能、稳定移动／侦查或条件式优势。' },
      { id: 'inherited', label: '传承', startingPermission: '主持人同意，并增加一项限制', strength: '改变资源上限、提供额外术式或明确概念触发。' },
      { id: 'forbidden', label: '禁忌', startingPermission: '不能默认开局', strength: '以污染、自损、追踪或剧情后果换取高位权限。' }
    ],
    mysticCodes: mysticCodes,
    masterSupplyLevels: masterSupplyLevels,
    masterRules: { baseIdentityTypes: ['mortal', 'magus'], grantsAttributePoints: false, commandSeals: 3, note: '御主不是第四种角色类型，而是普通人或魔术师与从者建立契约后的附加模块。' },
    storySuggestions: {
      wish: ['让卷入战争的人尽可能活着回家', '证明自己的选择不由血统或圣杯决定', '完成一项未竟的现实责任', '让一段被误解的传说得到正确结局'],
      fear: ['为了胜利主动牺牲无辜者', '把契约对象当成没有意志的工具', '用神秘力量抹去自己造成的后果', '只剩下职阶、家系或机构要求的身份'],
      anchor: ['一项绝不越过的底线', '两名可以求助的现实联系人', '一处能安全休整的地点', '一个提醒自己为何参战的具体物件'],
      restrictions: ['需要明确媒介', '需要完整咒文', '受血统或回路限制', '只能在特定地点或时间使用', '必须支付现实代价', '受自愿誓约约束'],
      conceptWeaknesses: ['传说中曾击败自己的武器或方法', '主动立下且可被触发的誓约', '特定地形、仪式或身份条件', '与自身核心价值直接冲突的选择']
    },
    quickBuilds: quickBuilds,
    difficulties: [
      { value: 10, label: 'DC 10 · 有压力但常规' },
      { value: 13, label: 'DC 13 · 标准挑战' },
      { value: 16, label: 'DC 16 · 困难' },
      { value: 19, label: 'DC 19 · 英雄级' },
      { value: 22, label: 'DC 22 · 奇迹级' }
    ],
    resultBands: [
      { id: 'exceptional', label: '大成功', help: '总值达到 DC+5；目标达成，并选择 +2 伤害、提高范围、节省成本 1、额外情报或抢先位置之一。' },
      { id: 'success', label: '成功', help: '总值达到 DC；按声明达成。' },
      { id: 'costly', label: '带代价成功', help: '总值为 DC-1 至 DC-4；接受一个已公开代价以达成，或拒绝代价并失败。' },
      { id: 'severe', label: '失败', help: '总值不高于 DC-5；目标未达成并产生明确后果，但关键线索不会凭空消失。' }
    ],
    blankCharacter: {
      protocol: 'null-grail-character-v3', rulesetId: 'null-grail-core-d20-v2.0', id: '', name: '', alias: '', playerName: '', pronouns: '',
      identityType: 'mortal', buildMode: 'fixed-array', realIdentity: '', wishMotivation: '', boundaryFear: '', backgroundId: '', realAdvantageId: '', contacts: ['', ''], equipment: ['', ''], safePlace: '',
      attributes: { physique: 3, endurance: 2, agility: 2, perception: 1, knowledge: 1, will: 0, mana: 0 },
      skills: { athletics: 'untrained', melee: 'untrained', ranged: 'untrained', stealth: 'untrained', awareness: 'untrained', investigation: 'untrained', academics: 'untrained', technology: 'untrained', medicine: 'untrained', magecraft: 'untrained', negotiation: 'untrained', command: 'untrained' },
      derived: { hp: 12, mp: 0, evasion: 12, fortitude: 12, mind: 10, perception: 11, resolve: 3, armor: 0 },
      signatureTalent: { name: '', action: '', cost: '', check: '', target: '', effect: '', failure: '', duration: '', cooldown: '', counter: '' },
      lineages: [], mediumRestriction: '', spellIds: [], mysticCodeId: '', mysticCodeRestriction: '',
      masterContract: { enabled: false, servantPublicName: '', supplyLevel: 'stable', communicationDistance: '', contractSource: '', terminationConditions: '', masterNeverCommands: '', servantNeverAccepts: '', commandSeals: 3, campaignSpecialRules: '' },
      servant: { publicName: '', trueName: '', classId: '', legendCore: '', conceptWeaknesses: ['', ''], classFeature: '', retainedSkills: [], noblePhantasm: null, neverAccepts: '', spiritualizationMethod: '', trueNameExposureIntel: '', luckRank: 'C' },
      notes: ''
    },
    handouts: []
  });
}());
