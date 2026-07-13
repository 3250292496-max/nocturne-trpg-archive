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
