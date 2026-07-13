(function () {
  'use strict';

  window.NG_STATIC_MODULES = [{
    id: 'null-grail',
    number: '001',
    title: '零之圣杯',
    english: 'NULL GRAIL',
    summary: '七日轮回的圣杯战争里，你们是系统无法命名的空白变量。',
    description: '东湖市跨年夜，天空像玻璃一样裂开。规则书、零门槛站内车卡、进阶 Excel 车卡、玩家手册、公开资料与地图共同组成这份可直接开团的完整作品档案。',
    systems: ['fate', 'agnostic'],
    rulesetId: 'null-grail-core-d20-v2.0',
    systemLabel: '《零之圣杯》通用圣杯战争规则 v2.0 · 轻量 d20',
    type: 'campaign',
    typeLabel: '完整长篇战役模组',
    players: '3–5 人（4 人最佳）',
    duration: '标准 8 次 × 3–4 小时',
    era: '2018 年末 · 架空现代东湖市',
    difficulty: '进阶',
    tone: 'gold',
    accent: '#d1ad6c',
    icon: 'grail',
    tags: ['轮回', '都市异闻', '角色抉择', '完整工具链'],
    highlights: ['零门槛站内车卡', '玩家公开资料', '守秘人加密控制台'],
    warning: '开团前请共同确认角色死亡、身份覆盖与时间循环等内容边界。',
    forWho: '适合喜欢 Fate 氛围、都市悬疑、关系抉择与多周目结构的团队。',
    status: 'published',
    ownerId: 'site-owner-3250292496',
    edition: '战役 v3.2 · 规则 v2.0',
    author: { displayName: '夜航模组馆馆主', name: '夜航模组馆馆主', label: '站长 · 已认证作者', avatar: '' },
    updatedAt: '2026-07-13T00:00:00.000Z',
    resources: [
      {
        id: 'web-builder-foolproof',
        title: '零之圣杯 · 零门槛傻瓜车卡（推荐）',
        category: 'builder', audience: 'player', fileName: '零门槛傻瓜车卡.html',
        mime: 'text/html', size: 0, href: 'player.html?mode=builder'
      },
      {
        id: 'rules-v2-0-character-library',
        title: '《零之圣杯》通用圣杯战争规则书 v2.0 · 车卡与资源库增订版（现行）',
        category: 'rules', audience: 'player',
        fileName: '《零之圣杯》通用圣杯战争规则书_v2.0_车卡与资源库增订版.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 337530,
        href: '《零之圣杯》通用圣杯战争规则书_v2.0_车卡与资源库增订版.docx'
      },
      {
        id: 'builder-v1-1',
        title: 'Core d20 进阶自动车卡表 v1.1（Excel）',
        category: 'builder', audience: 'player', fileName: '《零之圣杯》完整自动车卡表_v1.1.xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 69803,
        href: '圣杯/零之圣杯_完整套件/自动车卡/《零之圣杯》完整自动车卡表_v1.1.xlsx'
      },
      {
        id: 'player-guide-v3-2',
        title: '第三册 · 玩家手册 v3.2',
        category: 'info', audience: 'player', fileName: '《零之圣杯》第三册·玩家手册（v3.2）.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 106807,
        href: 'NullGrail《零之圣杯》v3.2 最终版/四册正文/《零之圣杯》第三册·玩家手册（v3.2）.docx'
      },
      {
        id: 'cross-index-v3-2',
        title: '四册统一编排与跨册索引 v3.2（非规则版本）',
        category: 'info', audience: 'player', fileName: '《零之圣杯》统一规则与跨册索引（v3.2）.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 45549,
        href: 'NullGrail《零之圣杯》v3.2 最终版/配套资料/《零之圣杯》统一规则与跨册索引（v3.2）.docx'
      },
      {
        id: 'player-pack-v3-2',
        title: '玩家公开资料包 v3.2',
        category: 'handouts', audience: 'player', fileName: '《零之圣杯》玩家公开资料包（v3.2）.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 46372,
        href: 'NullGrail《零之圣杯》v3.2 最终版/配套资料/《零之圣杯》玩家公开资料包（v3.2）.docx'
      },
      {
        id: 'eastlake-map',
        title: '东湖市完整地图',
        category: 'map', audience: 'player', fileName: 'eastlake-map.webp',
        mime: 'image/webp', size: 435302, href: 'assets/art/eastlake-map.webp'
      }
    ]
  }];

  // Rulesets are selectable dependencies for modules. They are not module
  // records and must never inherit a module owner's authorship or badge.
  window.NG_RULESETS = [{
    id: 'null-grail-core-d20-v2.0',
    title: '《零之圣杯》通用圣杯战争规则 v2.0',
    shortTitle: '零之圣杯 · 通用规则 v2.0',
    systemLabel: '《零之圣杯》通用圣杯战争规则 v2.0 · 轻量 d20',
    description: '《零之圣杯》主模组采用的可选轻量 d20 规则系统，含站内车卡与配套资源。',
    href: 'module.html?id=null-grail',
    builderHref: 'player.html?mode=builder'
  }, {
    id: 'coc7-7e',
    title: '克苏鲁的呼唤 第七版',
    shortTitle: 'COC 7th',
    systemLabel: 'Call of Cthulhu · 第七版 · 百分骰',
    description: '独立可选规则与站内工具，不是本站模组；规则作者与权利信息以 Chaosium 官方资料及所持版本版权页为准。',
    href: 'coc7.html?tab=rules',
    builderHref: 'coc7.html?tab=builder',
    combatHref: 'combat.html'
  }];

  window.NG_SITE_TOOLS = [{
    id: 'coc7',
    title: '克苏鲁的呼唤 第七版 · 站内工具',
    kind: 'rules-toolkit',
    ruleCredits: '原作：Sandy Petersen；后续修订：Lynn Willis；第七版合作设计：Paul Fricker、Mike Mason；出版：Chaosium。本站不是规则书或模组作者。',
    sheetCredits: '随附角色卡元数据：丛雨；最后修订：梦语FFF；原卡署名：秋叶EXODUS。',
    href: 'coc7.html?tab=builder',
    combatHref: 'combat.html'
  }];
}());
