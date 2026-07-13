(function () {
  'use strict';

  // Public, spoiler-free protocol shared by the keeper and player pages.
  window.NG_PLAYER_DATA = Object.freeze({
    protocol: 'null-grail-player-v3',
    characterProtocol: 'null-grail-character-v2',
    characterCollectionProtocol: 'null-grail-character-collection-v2',
    checkProtocol: 'null-grail-check-v1',
    contentVersion: '3.2.1-console',
    rulesetId: 'null-grail-v3.2-light-d20',
    channelName: 'null-grail-player',
    approaches: Object.freeze([
      Object.freeze({ id: 'physique', label: '体魄', help: '奔跑、格挡、攀爬与近身行动' }),
      Object.freeze({ id: 'insight', label: '洞察', help: '观察、追踪、直觉与感知魔力' }),
      Object.freeze({ id: 'lore', label: '学识', help: '魔术、历史、医学、技术与档案' }),
      Object.freeze({ id: 'rapport', label: '交涉', help: '说服、安抚、威慑、谈判与信任' }),
      Object.freeze({ id: 'will', label: '意志', help: '抵抗污染、保持专注与维护自我' })
    ]),
    archetypes: Object.freeze({
      present: Object.freeze({
        label: '现世者／NULL', short: '现世者',
        origins: Object.freeze(['东湖市本地遗漏者', '外地来访的普通人', '调查异常的专业人士']),
        identities: Object.freeze(['总能看见错误记忆的普通人', '不愿再失去任何同伴的调查者', '被圣杯系统漏掉名字的人'])
      }),
      master: Object.freeze({
        label: 'NULL 御主', short: '御主',
        origins: Object.freeze(['偶然获得令咒的普通人', '离开家族的年轻魔术师', '主动追查圣杯异常的御主']),
        identities: Object.freeze(['把契约当成承诺而不是命令的御主', '不愿继承家族答案的魔术师', '擅长让所有人活着回来的指挥者'])
      }),
      servant: Object.freeze({
        label: 'NULL 英灵', short: '英灵',
        origins: Object.freeze(['被错误召唤的无名英灵', '来自失落传说的从者', '忘记真名却记得约定的英灵']),
        identities: Object.freeze(['拒绝重复原有结局的无名英灵', '以守护而非胜利回应召唤的从者', '正在寻找自己真正传说的人'])
      })
    }),
    approachPresets: Object.freeze([
      Object.freeze({ id:'guardian', label:'守护型', icon:'盾', help:'扛住危险、保护同伴', ranking:Object.freeze(['will','physique','rapport','insight','lore']) }),
      Object.freeze({ id:'investigator', label:'调查型', icon:'镜', help:'发现异常、追踪真相', ranking:Object.freeze(['insight','lore','will','rapport','physique']) }),
      Object.freeze({ id:'strategist', label:'谋略型', icon:'棋', help:'准备方案、破解规则', ranking:Object.freeze(['lore','insight','rapport','will','physique']) }),
      Object.freeze({ id:'mediator', label:'交涉型', icon:'言', help:'说服他人、维系关系', ranking:Object.freeze(['rapport','will','insight','lore','physique']) }),
      Object.freeze({ id:'vanguard', label:'行动型', icon:'刃', help:'抢先行动、突破阻碍', ranking:Object.freeze(['physique','will','insight','rapport','lore']) })
    ]),
    specialtyOptions: Object.freeze([
      Object.freeze({ label:'危险直觉', help:'察觉埋伏与即将到来的威胁' }),
      Object.freeze({ label:'现场急救', help:'稳定伤势与判断身体状况' }),
      Object.freeze({ label:'识破谎言', help:'捕捉回避、矛盾与情绪变化' }),
      Object.freeze({ label:'追踪调查', help:'从痕迹还原人物与事件动向' }),
      Object.freeze({ label:'档案检索', help:'快速找到历史、记录与关联资料' }),
      Object.freeze({ label:'魔术理论', help:'分析术式、仪式与魔力现象' }),
      Object.freeze({ label:'机械维修', help:'修理车辆、设备与简易装置' }),
      Object.freeze({ label:'潜行隐匿', help:'避开注意、安静接近目标' }),
      Object.freeze({ label:'近身格斗', help:'徒手或短兵器控制冲突' }),
      Object.freeze({ label:'远程射击', help:'使用枪械、弓弩或投射武器' }),
      Object.freeze({ label:'谈判安抚', help:'让紧张的人愿意继续沟通' }),
      Object.freeze({ label:'威慑施压', help:'在冲突中迫使对方让步' }),
      Object.freeze({ label:'城市人脉', help:'在东湖市找到消息与帮助' }),
      Object.freeze({ label:'灵体感知', help:'感知从者、魔力与异常残留' }),
      Object.freeze({ label:'战术指挥', help:'组织协助、撤离与战场分工' })
    ]),
    storySuggestions: Object.freeze({
      wish: Object.freeze(['让所有人活着迎来循环之外的清晨', '找回一个被世界忘记的人', '亲手结束不断重演的错误', '证明我的选择不由圣杯决定']),
      fear: Object.freeze(['只会服从命令、再也无法拒绝的人', '为了胜利主动牺牲同伴的人', '忘记所有重要约定的空壳', '被别人定义成必须扮演的角色']),
      anchor: Object.freeze(['同伴真正的名字与声音', '一件从循环前保留下来的旧物', '绝不替别人决定人生的承诺', '只有我记得的一段共同回忆'])
    }),
    quickBuilds: Object.freeze({
      present: Object.freeze({ name:'未命名夜航者', origin:'东湖市本地遗漏者', identity:'总能看见错误记忆、仍坚持保护同伴的普通人', wish:'让所有人活着迎来循环之外的清晨', fearedIdentity:'为了胜利主动牺牲同伴的人', anchor:'同伴真正的名字与声音', ranking:Object.freeze(['insight','will','rapport','lore','physique']), specialties:Object.freeze(['危险直觉','现场急救','识破谎言']) }),
      master: Object.freeze({ name:'未命名御主', origin:'偶然获得令咒的普通人', identity:'把契约当成承诺而不是命令的 NULL 御主', wish:'找回一个被世界忘记的人', fearedIdentity:'只会服从家族与圣杯命令的人', anchor:'绝不替别人决定人生的承诺', ranking:Object.freeze(['rapport','lore','will','insight','physique']), specialties:Object.freeze(['谈判安抚','魔术理论','战术指挥']) }),
      servant: Object.freeze({ name:'无名英灵', origin:'被错误召唤的无名英灵', identity:'忘记真名却仍记得一份约定的 NULL 英灵', wish:'亲手结束不断重演的错误', fearedIdentity:'只剩力量、忘记为何战斗的兵器', anchor:'只有我记得的一段共同回忆', ranking:Object.freeze(['physique','will','insight','rapport','lore']), specialties:Object.freeze(['近身格斗','灵体感知','危险直觉']) })
    }),
    difficulties: Object.freeze([
      Object.freeze({ value: 10, label: 'DC 10 · 有压力但常规' }),
      Object.freeze({ value: 13, label: 'DC 13 · 标准挑战' }),
      Object.freeze({ value: 16, label: 'DC 16 · 困难' }),
      Object.freeze({ value: 19, label: 'DC 19 · 英雄级' })
    ]),
    resultBands: Object.freeze([
      Object.freeze({ id: 'exceptional', label: '超额成功', help: '目标达成，并获得一项额外改善。' }),
      Object.freeze({ id: 'success', label: '成功', help: '目标按声明达成。' }),
      Object.freeze({ id: 'costly', label: '带代价推进', help: '玩家可接受已公开的代价以继续推进。' }),
      Object.freeze({ id: 'severe', label: '严重失败', help: '目标未达成，但核心线索不会因此消失。' })
    ]),
    blankCharacter: Object.freeze({
      protocol: 'null-grail-character-v2',
      rulesetId: 'null-grail-v3.2-light-d20',
      id: '',
      name: '',
      playerName: '',
      pronouns: '',
      origin: '',
      identity: '',
      wish: '',
      fearedIdentity: '',
      anchor: '',
      existenceType: 'present',
      approaches: Object.freeze({ physique: 3, insight: 2, lore: 2, rapport: 1, will: 0 }),
      specialties: Object.freeze([]),
      resolve: 3,
      stress: 0,
      injury: 'none',
      trauma: Object.freeze([]),
      coreLoad: 0,
      noblePhantasmReady: true,
      notes: ''
    }),
    handouts: Object.freeze([])
  });
}());
