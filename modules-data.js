(function () {
  'use strict';

  window.NG_STATIC_MODULES = [{
    id: 'null-grail',
    number: '001',
    title: '零之圣杯',
    english: 'NULL GRAIL',
    summary: '七日轮回的圣杯战争里，你们是系统无法命名的空白变量。',
    description: '东湖市跨年夜，天空像玻璃一样裂开。规则书、零门槛站内车卡、进阶 Excel 车卡、玩家手册、公开资料与地图共同组成这份可直接开团的完整作品档案。',
    systemLabel: 'Fate/FGO 同人 · 通用圣杯战争规则 · 轻量 d20',
    type: 'campaign',
    typeLabel: '完整长篇战役模组',
    players: '3–5 人',
    duration: '6–10 次团',
    era: '架空现代',
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
        title: '统一规则与跨册索引 v3.2',
        category: 'rules', audience: 'player', fileName: '《零之圣杯》统一规则与跨册索引（v3.2）.docx',
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
  }, {
    id: 'coc7',
    number: '002',
    title: '克苏鲁的呼唤 第七版',
    english: 'CALL OF CTHULHU 7E',
    summary: '从一键调查员车卡，到守秘人自动伤害、重伤、理智与回合结算。',
    description: '面向克苏鲁的呼唤第七版的本地工具箱：职业底稿自动生成调查员，支持本站 JSON 与 COC7 Excel 角色卡导入，并把 HP、SAN、MP、幸运、护甲、闪避、武器与派生值直接交给守秘人战斗台。规则区提供可搜索的桌边速查；完整规则书由用户从本机选择后查看，不会上传。',
    systemLabel: 'Call of Cthulhu · 第七版 · 百分骰',
    type: 'toolkit',
    typeLabel: '规则与车卡工具箱',
    players: '1 名守秘人 + 2–6 名调查员',
    duration: '短团至长篇',
    era: '1920s / 现代',
    difficulty: '零门槛',
    tone: 'green',
    accent: '#7db79b',
    icon: 'rules',
    tags: ['COC7', '自动车卡', '自动战斗', '规则速查'],
    highlights: ['职业底稿一键车卡', 'Excel / JSON 角色导入', 'HP 与重伤自动结算', '本地 PDF 规则查看'],
    warning: '恐怖、精神创伤、角色死亡与永久疯狂。请在开团前确认安全工具和内容边界。',
    forWho: '适合希望减少抄数值、把桌面时间留给调查与扮演的 COC7 团队。',
    status: 'published',
    ownerId: 'site-owner-3250292496',
    edition: '7E toolkit v1.0',
    author: { displayName: '夜航模组馆馆主', name: '夜航模组馆馆主', label: '站长 · 已认证作者', avatar: '' },
    updatedAt: '2026-07-13T00:00:00.000Z',
    resources: [
      {
        id: 'coc7-web-builder', title: 'COC7 · 傻瓜自动车卡', category: 'builder', audience: 'player',
        fileName: 'coc7.html', mime: 'text/html', size: 0, href: 'coc7.html?tab=builder'
      },
      {
        id: 'coc7-rule-viewer', title: 'COC7 · 七版规则速查与本地查看器', category: 'rules', audience: 'player',
        fileName: 'coc7.html', mime: 'text/html', size: 0, href: 'coc7.html?tab=rules'
      },
      {
        id: 'coc7-blank-sheet', title: 'COC 七版规则空白卡', category: 'builder', audience: 'player',
        fileName: 'COC七版规则空白卡.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 838805,
        href: 'assets/rules/COC七版规则空白卡.xlsx'
      }
    ]
  }];
}());
