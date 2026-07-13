(function () {
  'use strict';

  var entries = [
    {
      id: 'null-grail',
      number: '001',
      title: '零之圣杯',
      english: 'NULL GRAIL',
      systems: ['fate'],
      systemLabel: 'Fate/FGO 同人 · 轻量 d20',
      type: 'campaign',
      typeLabel: '长篇战役模组',
      tone: 'gold',
      accent: '#d1ad6c',
      icon: 'grail',
      status: '已归档',
      updated: '2026.07.13',
      summary: '七日轮回的圣杯战争里，你们是系统无法命名的空白变量。',
      description: '东湖市跨年夜，天空像玻璃一样裂开。圣杯试图为每个人分配御主、从者、祭品或观测者的身份，却无法容纳一群保留轮回记忆的来客。你们能锚定改变，却不能命令任何人爱、原谅或牺牲。',
      players: '3–6 人',
      duration: '6–10 次团',
      era: '架空现代',
      difficulty: '进阶',
      tags: ['轮回', '都市异闻', '角色抉择', '群像'],
      warning: '人体实验、未成年人受害、家庭控制、创伤反应、精神操纵、血腥暴力、自毁倾向与身份剥夺。请在开团前确认安全工具与内容边界。',
      forWho: '适合喜欢人物关系、开放式调查、道德抉择与循环结构的团队。无需了解 Fate 系列，也能从“故障圣杯”切入。',
      highlights: ['完整七日节点与两次重置上限', '失败会改变代价与信息，不会封死核心路线', '角色同意与决定权会实际影响终局', '包含长短团结构、循环变异与结局组合裁定'],
      spoiler: '完整世界真相、终局条件与坏结局只在通过密钥验证后的守秘人控制台中提供。',
      resources: [
        { name: '第一册 · 主模组 v3.2', meta: 'DOCX · 守秘人专用 · 完整战役', format: 'DOCX', secureId: 'main-module', href: 'NullGrail《零之圣杯》v3.2 最终版/四册正文/《零之圣杯》第一册·主模组（v3.2）.docx', secret: true },
        { name: '玩家公开资料包 v3.2', meta: 'DOCX · PLAYER SAFE · 可直接发放', format: 'DOCX', href: 'NullGrail《零之圣杯》v3.2 最终版/配套资料/《零之圣杯》玩家公开资料包（v3.2）.docx' },
        { name: '玩家手卡打印包 v3.2', meta: 'DOCX · 守秘人按进度发放 · 含后期线索', format: 'DOCX', secureId: 'player-handouts', href: 'NullGrail《零之圣杯》v3.2 最终版/配套资料/《零之圣杯》玩家手卡打印包（v3.2）.docx', secret: true }
      ]
    },
    {
      id: 'rules-index',
      number: '002',
      title: '统一规则与跨册索引',
      english: 'CORE RULES & INDEX',
      systems: ['fate', 'agnostic'],
      systemLabel: '系统无关 · 轻量 d20',
      type: 'guide',
      typeLabel: '核心规则手册',
      tone: 'cyan',
      accent: '#79b9bd',
      icon: 'rules',
      status: '已归档',
      updated: '2026.07.13',
      summary: '四册共同遵循的唯一规则口径，也是整套作品的导航星图。',
      description: '集中说明六步行动流程、d20 结果档位、决意与压力、伤势、冲突钟、空白令印、回流、锚定与完整重置，并用任务型索引明确四册的职责边界。',
      players: '全团共用',
      duration: '随查随用',
      era: '规则资料',
      difficulty: '入门',
      tags: ['轻量 d20', '速查', '索引', '可转换'],
      warning: '规则文本无核心剧情剧透，但守秘人与玩家仍应按信息边界选择阅读范围。',
      forWho: '适合第一次接触本作的主持人与玩家，也可作为将节点转换到其他规则系统时的统一参照。',
      highlights: ['六步行动流程', '四档 d20 结果表', '压力、创伤与伤势闭环', '完整重置与混合身份模式'],
      spoiler: '本册主要是规则与索引，不包含需要额外解封的世界真相。',
      resources: [
        { name: 'v3.2 统一规则与跨册索引', meta: 'DOCX · 当前唯一规则口径', format: 'DOCX', href: 'NullGrail《零之圣杯》v3.2 最终版/配套资料/《零之圣杯》统一规则与跨册索引（v3.2）.docx' }
      ]
    },
    {
      id: 'npc-guide',
      number: '003',
      title: 'NPC 与英灵手册',
      english: 'CHARACTERS & SERVANTS',
      systems: ['fate'],
      systemLabel: 'Fate/FGO 同人',
      type: 'guide',
      typeLabel: '人物设定集',
      tone: 'red',
      accent: '#b75c54',
      icon: 'characters',
      status: '已归档',
      updated: '2026.07.13',
      summary: '人物不是线索容器；每一次选择，都必须先问谁有权替谁决定。',
      description: '完整收录人物史、关系弧、英灵权限、主动行动与轮回变化。主持人可以快速确认人物知道什么、下一步做什么，以及选择会留下怎样的可见余波。',
      players: '主持人',
      duration: '备团资料',
      era: '完全剧透',
      difficulty: '进阶',
      tags: ['NPC', '英灵', '关系弧', '导演法'],
      warning: '整册为守秘人资料，涉及实验体虐待、家庭暴力、人格控制、死亡与自我毁灭。只有明确标记 PLAYER SAFE 的区块可向玩家发放。',
      forWho: '适合需要运行复杂群像、追踪人物信息权限与循环变化的主持人。',
      highlights: ['人物动机与主动行动', '关系阶段与可见余波', '英灵最小机械卡', 'PLAYER SAFE 公开块'],
      spoiler: '本册含人物隐瞒、终局与坏结局。高关系不产生控制权，创伤不免除责任，英灵也拥有独立意志。',
      resources: [
        { name: '第二册 · NPC 与英灵手册 v3.2', meta: 'DOCX · 守秘人专用 · 完全剧透', format: 'DOCX', secureId: 'npc-guide', href: 'NullGrail《零之圣杯》v3.2 最终版/四册正文/《零之圣杯》第二册·NPC与英灵手册（v3.2）.docx', secret: true }
      ]
    },
    {
      id: 'player-guide',
      number: '004',
      title: '玩家手册',
      english: 'PLAYER HANDBOOK',
      systems: ['fate', 'agnostic'],
      systemLabel: 'PLAYER SAFE · 轻量 d20',
      type: 'guide',
      typeLabel: '玩家规则手册',
      tone: 'purple',
      accent: '#a08abc',
      icon: 'player',
      status: '已归档',
      updated: '2026.07.13',
      summary: '你们不是被选中的英雄，而是一个错误系统无法命名的人。',
      description: '面向第一次接触 TRPG、本作或 Fate 系列的玩家，包含无剧透导读、角色创建、轻量规则、混合身份模式、打印清单与分阶段发放边界。',
      players: '所有玩家',
      duration: '开团前阅读',
      era: '无剧透',
      difficulty: '入门',
      tags: ['玩家规则', '角色创建', '安全工具', '无剧透'],
      warning: '人物资料必须按“开团即可见 / 遇见后发放”标识使用，第一次完整重置后的内容不要提前阅读。',
      forWho: '适合所有准备进入东湖市的玩家；不需要从头背到尾，可按阅读路径选取章节。',
      highlights: ['四类玩家阅读路径', '从零创建 NULL 角色', '团队约定与安全边界', '空白令印与循环记录'],
      spoiler: '玩家手册本身遵循无剧透原则。被封缄的只是分阶段阅读提醒，没有额外世界真相。',
      resources: [
        { name: '第三册 · 玩家手册 v3.2', meta: 'DOCX · 玩家规则与角色创建', format: 'DOCX', href: 'NullGrail《零之圣杯》v3.2 最终版/四册正文/《零之圣杯》第三册·玩家手册（v3.2）.docx' },
        { name: '玩家公开资料包 v3.2', meta: 'DOCX · 开团前可直接交付', format: 'DOCX', href: 'NullGrail《零之圣杯》v3.2 最终版/配套资料/《零之圣杯》玩家公开资料包（v3.2）.docx' }
      ]
    },
    {
      id: 'gm-toolkit',
      number: '005',
      title: '主持人工具书',
      english: 'KEEPER CONSOLE',
      systems: ['fate', 'agnostic'],
      systemLabel: '主持工具 · 系统无关',
      type: 'toolkit',
      typeLabel: '桌边工具书',
      tone: 'gold',
      accent: '#d1ad6c',
      icon: 'keeper',
      status: '已归档',
      updated: '2026.07.13',
      summary: '把完整战役压缩成桌边可以立刻取用的控制台、卡片与索引。',
      description: '将规则、节点、人物深度与玩家记录压缩成每日控制台、地图、流程、事件卡、人物卡与手卡。支持拆分打印、黑白输出与混合身份模式。',
      players: '主持人',
      duration: '桌边随查',
      era: '完全剧透',
      difficulty: '适中',
      tags: ['控制台', '事件卡', '打印', '备团'],
      warning: '守秘人专用且完全剧透。带守秘提示的预览页不可直接交给玩家。',
      forWho: '适合希望减少临场翻书、按天拆分备团材料的主持人。',
      highlights: ['七张每日控制台', '事件卡与人物卡', '地图和终局权限网络', '2 联 / 4 联裁切页'],
      spoiler: '终局材料、权限网络、当日事件与人物卡均会暴露核心真相；建议按实际进度单独装袋。',
      resources: [
        { name: '第四册 · 主持人工具书 v3.2', meta: 'DOCX · 守秘人专用 · 可拆分打印', format: 'DOCX', secureId: 'keeper-toolkit', href: 'NullGrail《零之圣杯》v3.2 最终版/四册正文/《零之圣杯》第四册·主持人工具书（v3.2）.docx', secret: true }
      ]
    },
    {
      id: 'public-pack',
      number: '006',
      title: '玩家公开资料包',
      english: 'PLAYER SAFE PACK',
      systems: ['fate', 'agnostic'],
      systemLabel: 'PLAYER SAFE · 系统无关',
      type: 'handout',
      typeLabel: '开团资料包',
      tone: 'cyan',
      accent: '#79b9bd',
      icon: 'safe-pack',
      status: '已归档',
      updated: '2026.07.13',
      summary: '无剧透规则、建卡、城市概览与玩家表单，一份文件完成开团准备。',
      description: '不解释圣杯故障真相，不公开 NPC 隐藏动机或结局条件。包含安全约定、六步行动流程、轻量 d20、决意与压力、角色创建、东湖市概览和玩家表单。',
      players: '所有玩家',
      duration: '开团前 20 分钟',
      era: '无剧透',
      difficulty: '入门',
      tags: ['PLAYER SAFE', '建卡', '安全约定', '城市概览'],
      warning: '包含人体实验、未成年人受害、人格控制等主题的内容预警，但不包含剧情真相。',
      forWho: '这是最适合直接分享给新玩家的单一入口。',
      highlights: ['无剧透承诺', '开团前安全约定', '六步行动流程', '完整玩家表单'],
      spoiler: '此资料包刻意不包含守秘信息，可以放心交给玩家。',
      resources: [
        { name: '玩家公开资料包 v3.2', meta: 'DOCX · PLAYER SAFE · 推荐首先下载', format: 'DOCX', href: 'NullGrail《零之圣杯》v3.2 最终版/配套资料/《零之圣杯》玩家公开资料包（v3.2）.docx' }
      ]
    },
    {
      id: 'player-cards',
      number: '007',
      title: '玩家手卡打印包',
      english: 'PRINTABLE HANDOUTS',
      systems: ['fate', 'agnostic'],
      systemLabel: 'PLAYER SAFE · 可打印',
      type: 'handout',
      typeLabel: '场景手卡',
      tone: 'red',
      accent: '#b75c54',
      icon: 'handouts',
      status: '已归档',
      updated: '2026.07.13',
      summary: '二十张可裁切的 PLAYER 面手卡，让线索真正落到玩家手中。',
      description: '收录东湖市游客折页、NULL 空白地图、跨年公告、新闻剪报、日记摘录等二十张玩家手卡，采用二联排版，可按剧情发放时机领取。',
      players: '全团共用',
      duration: '按场景发放',
      era: '分阶段可见',
      difficulty: '入门',
      tags: ['手卡', '线索', '打印', 'PLAYER 面'],
      warning: '虽然全部是 PLAYER 面，仍应按照主持人工具书中的发放时机逐张交付，避免提前暴露调查顺序。',
      forWho: '适合线下桌面团，也可导出单页后在网团中逐张发送。',
      highlights: ['20 张玩家手卡', '二联裁切排版', '独立 PLAYER 面', '含地图、公告与剪报'],
      spoiler: '手卡没有守秘提示，但提前查看整包仍可能削弱探索体验。',
      resources: [
        { name: '玩家手卡打印包 v3.2', meta: 'DOCX · 守秘人按进度发放 · 含后期线索', format: 'DOCX', secureId: 'player-handouts', href: 'NullGrail《零之圣杯》v3.2 最终版/配套资料/《零之圣杯》玩家手卡打印包（v3.2）.docx', secret: true }
      ]
    },
    {
      id: 'staged-clues',
      number: '008',
      title: '分阶段线索发放包',
      english: 'STAGED CLUE PACK',
      systems: ['fate'],
      systemLabel: '守秘工具 · 分阶段发放',
      type: 'toolkit',
      typeLabel: '线索控制包',
      tone: 'purple',
      accent: '#a08abc',
      icon: 'clues',
      status: '已归档',
      updated: '2026.07.13',
      summary: '用编号、条件与独立玩家卡精确控制每一条线索何时抵达。',
      description: '包含守秘人发放索引与独立 PLAYER SAFE 线索卡。主持人只需核对触发条件，裁下对应单卡发放，不必向玩家补充卡片之外的解释。',
      players: '主持人',
      duration: '按进度发放',
      era: '部分剧透',
      difficulty: '适中',
      tags: ['线索卡', '发放索引', '打印', '信息边界'],
      warning: '索引页不可交给玩家；只发放对应编号的 PLAYER SAFE 卡片。',
      forWho: '适合希望严格维护信息边界、避免一次失败永久丢失核心线索的主持人。',
      highlights: ['守秘人发放条件索引', '独立 PLAYER SAFE 单卡', '规则记录与提前解释提醒', '附空白线索卡模板'],
      spoiler: '整包会列出线索触发条件与编号关系。请勿让玩家浏览索引页。',
      resources: [
        { name: '分阶段线索发放包 v3.2', meta: 'DOCX · 守秘索引 + PLAYER SAFE 单卡', format: 'DOCX', secureId: 'staged-clues', href: 'NullGrail《零之圣杯》v3.2 最终版/配套资料/《零之圣杯》分阶段线索发放包（v3.2）.docx', secret: true }
      ]
    }
  ];

  var state = {
    system: 'all',
    type: 'all',
    query: '',
    view: localStorage.getItem('archive-view') || 'grid'
  };

  var grid = document.getElementById('archive-grid');
  var resultCount = document.getElementById('result-count');
  var emptyState = document.getElementById('empty-state');
  var searchInput = document.getElementById('archive-search');
  var typeFilter = document.getElementById('type-filter');
  var dialog = document.getElementById('entry-dialog');
  var dialogContent = document.getElementById('dialog-content');
  var toast = document.getElementById('toast');
  var access = window.NG_ACCESS;
  var accessDialog = document.getElementById('access-dialog');
  var pendingEntryId = null;
  var toastTimer;

  function currentRole() { return access ? access.getRole() : 'player'; }
  function isKeeper() { return access && access.hasKeeperAccess(); }

  function updateAudienceUi() {
    var role = currentRole();
    var button = document.getElementById('audience-button');
    var label = document.getElementById('audience-label');
    button.classList.toggle('player', role === 'player');
    button.classList.toggle('keeper', role === 'keeper' && isKeeper());
    label.textContent = role === 'player' ? '玩家安全模式' : role === 'keeper' && isKeeper() ? '守秘人完整模式' : '选择访问身份';
  }

  function showAccessDialog(entryId) {
    pendingEntryId = entryId || null;
    document.getElementById('role-grid').hidden = false;
    document.getElementById('access-key-form').hidden = true;
    document.getElementById('access-error').hidden = true;
    document.getElementById('access-key-input').value = '';
    if (!accessDialog.open) accessDialog.showModal();
  }

  function finishRoleSelection() {
    var entryId = pendingEntryId;
    pendingEntryId = null;
    if (accessDialog.open) accessDialog.close();
    updateAudienceUi();
    renderEntries();
    if (entryId) openEntry(entryId);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function archiveIconTemplate(icon) {
    var icons = {
      grail: [
        '<path d="M17 14h30l-2.4 11.8C43.1 33.2 38.3 38 32 38s-11.1-4.8-12.6-12.2L17 14Z"></path>',
        '<path d="M23.5 14c2 3.1 4.8 4.7 8.5 4.7s6.5-1.6 8.5-4.7M32 38v9M25 52h14M27.5 47h9"></path>',
        '<path class="archive-icon-detail" d="M26 26.5c1.8-2.1 3.8-3.2 6-3.2s4.2 1.1 6 3.2M29 30.5l6-6"></path>',
        '<circle class="archive-icon-node" cx="32" cy="27.5" r="1.7"></circle>'
      ],
      rules: [
        '<path d="M10 16.5c8.5-2.1 15.8-.6 22 4.5v31c-6.2-5.1-13.5-6.6-22-4.5v-31ZM54 16.5c-8.5-2.1-15.8-.6-22 4.5v31c6.2-5.1 13.5-6.6 22-4.5v-31Z"></path>',
        '<path class="archive-icon-detail" d="M16 24c4.1-.4 7.5.2 10.5 1.8M16 31c4.1-.4 7.5.2 10.5 1.8M16 38c4.1-.4 7.5.2 10.5 1.8"></path>',
        '<circle cx="43" cy="29" r="6"></circle>',
        '<path d="m43 24 1.6 3.4L48 29l-3.4 1.6L43 34l-1.6-3.4L38 29l3.4-1.6L43 24Z"></path>'
      ],
      characters: [
        '<path d="M12 17.5c5.2-3.4 11.4-4.8 18.5-4.1v20.1c-3.5 6.8-7.6 10.2-12.2 10.2-4.2 0-6.3-5.4-6.3-12.1V17.5Z"></path>',
        '<path d="M52 17.5c-5.2-3.4-11.4-4.8-18.5-4.1v20.1c3.5 6.8 7.6 10.2 12.2 10.2 4.2 0 6.3-5.4 6.3-12.1V17.5Z"></path>',
        '<path d="M18 24.5c2-1.3 4-1.3 6 0M40 24.5c2-1.3 4-1.3 6 0M18.5 35c2.5 1.6 5 1.6 7.5 0M38 35c2.5-1.6 5-1.6 7.5 0"></path>',
        '<path class="archive-icon-detail" d="M32 13v35M23 49c6-2.7 12-2.7 18 0"></path>',
        '<circle class="archive-icon-node" cx="32" cy="52" r="1.7"></circle>'
      ],
      player: [
        '<circle cx="32" cy="32" r="21"></circle>',
        '<circle class="archive-icon-detail" cx="32" cy="32" r="14"></circle>',
        '<path d="m38.5 20.5-3.2 12.8-12.8 3.2 6.2-7.8 9.8-8.2Z"></path>',
        '<path class="archive-icon-detail" d="M32 7v4M32 53v4M7 32h4M53 32h4"></path>',
        '<circle class="archive-icon-node" cx="32" cy="32" r="2"></circle>'
      ],
      keeper: [
        '<path d="M23 19h18l5 9-5 23H23l-5-23 5-9Z"></path>',
        '<path d="M26 19v-3.5c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5V19M18 28h28M24.5 51 21 56M39.5 51l3.5 5"></path>',
        '<path class="archive-icon-detail" d="M27 39c0-3.4 2.2-7.2 5-10 2.8 2.8 5 6.6 5 10 0 3.1-2.2 5.5-5 5.5S27 42.1 27 39Z"></path>',
        '<circle class="archive-icon-node" cx="32" cy="39" r="1.8"></circle>'
      ],
      'safe-pack': [
        '<path d="M32 9 49 16v13.5c0 10.9-6.7 19.2-17 25.5-10.3-6.3-17-14.6-17-25.5V16l17-7Z"></path>',
        '<path d="M22 27h20v14H22V27Z"></path>',
        '<path class="archive-icon-detail" d="m22 28 10 8 10-8"></path>',
        '<path d="m27.5 42.5 3 3 6.5-7"></path>'
      ],
      handouts: [
        '<path class="archive-icon-detail" d="M17 15h25l6 6v32H17V15Z"></path>',
        '<path d="M12 20h25l6 6v32H12V20Z"></path>',
        '<path d="M37 20v7h6M19 35h17M19 42h17M19 49h10"></path>',
        '<circle class="archive-icon-node" cx="19" cy="29" r="1.8"></circle>'
      ],
      clues: [
        '<circle cx="23" cy="25" r="11"></circle>',
        '<circle class="archive-icon-detail" cx="23" cy="25" r="4"></circle>',
        '<path d="m31 33 18 18M40 42l5-5M45 47l5-5"></path>',
        '<path class="archive-icon-detail" d="M13 48c6-4.2 12.3-5.3 19-3.2"></path>',
        '<circle class="archive-icon-node" cx="11" cy="50" r="1.8"></circle>',
        '<circle class="archive-icon-node" cx="36" cy="45.5" r="1.8"></circle>'
      ]
    };
    var paths = icons[icon] || icons.grail;
    return '<svg class="archive-icon-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' + paths.join('') + '</svg>';
  }

  function cardTemplate(entry) {
    var meta = [entry.players, entry.duration, entry.era].map(function (item) {
      return '<span><i></i>' + escapeHtml(item) + '</span>';
    }).join('');
    var tags = entry.tags.slice(0, 2).map(function (tag) {
      return '<span>' + escapeHtml(tag) + '</span>';
    }).join('');

    return [
      '<article class="archive-card" data-id="', escapeHtml(entry.id), '" data-tone="', escapeHtml(entry.tone), '" tabindex="0" aria-label="打开', escapeHtml(entry.title), '档案">',
        '<div class="card-cover">',
          '<div class="cover-grid" aria-hidden="true"></div>',
          '<div class="cover-orbit" aria-hidden="true"></div>',
          '<div class="cover-icon" aria-hidden="true">', archiveIconTemplate(entry.icon), '</div>',
          '<span class="card-number">ARCHIVE · ', escapeHtml(entry.number), '</span>',
          '<span class="card-stamp">', escapeHtml(entry.status), '</span>',
        '</div>',
        '<div class="card-body">',
          '<p class="card-type">', escapeHtml(entry.english), ' · ', escapeHtml(entry.typeLabel), '</p>',
          '<h3>', escapeHtml(entry.title), '</h3>',
          '<p class="card-summary">', escapeHtml(entry.summary), '</p>',
          '<div class="card-meta">', meta, '</div>',
          '<div class="card-bottom"><div class="card-tags">', tags, '</div><button class="card-open" type="button" tabindex="-1">查看档案 <span>↗</span></button></div>',
        '</div>',
      '</article>'
    ].join('');
  }

  function getFilteredEntries() {
    var query = state.query.trim().toLocaleLowerCase('zh-CN');
    return entries.filter(function (entry) {
      var audienceMatch = isKeeper() || entry.resources.some(function (resource) { return !resource.secret; });
      var systemMatch = state.system === 'all' || entry.systems.indexOf(state.system) !== -1;
      var typeMatch = state.type === 'all' || entry.type === state.type;
      var searchable = [entry.title, entry.english, entry.systemLabel, entry.typeLabel, entry.summary, entry.description, entry.era].concat(entry.tags).join(' ').toLocaleLowerCase('zh-CN');
      return audienceMatch && systemMatch && typeMatch && (!query || searchable.indexOf(query) !== -1);
    });
  }

  function renderEntries() {
    var filtered = getFilteredEntries();
    grid.innerHTML = filtered.map(cardTemplate).join('');
    resultCount.textContent = String(filtered.length);
    emptyState.hidden = filtered.length !== 0;
    grid.hidden = filtered.length === 0;
    grid.classList.toggle('list-mode', state.view === 'list');

    Array.prototype.forEach.call(grid.querySelectorAll('.archive-card'), function (card) {
      card.addEventListener('click', function () { openEntry(card.getAttribute('data-id')); });
      card.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openEntry(card.getAttribute('data-id'));
        }
      });
    });
  }

  function setSystemFilter(system, shouldScroll) {
    state.system = system;
    Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), function (button) {
      var active = button.getAttribute('data-filter') === system;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-system-jump]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-system-jump') === system);
    });
    renderEntries();
    if (shouldScroll) document.getElementById('archive').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resourceTemplate(resource, keeperMode) {
    if (resource.secret && !keeperMode) return '';
    if (resource.secret && resource.secureId && access.getMode && access.getMode() !== 'server') {
      return [
        '<button class="resource-link secret-resource" type="button" data-secure-resource="', escapeHtml(resource.secureId), '">',
          '<span class="resource-icon">', escapeHtml(resource.format), '</span>',
          '<span><strong>', escapeHtml(resource.name), '</strong><small>', escapeHtml(resource.meta + ' · 加密资料'), '</small></span>',
          '<span aria-hidden="true">↓</span>',
        '</button>'
      ].join('');
    }
    var safeHref = encodeURI(resource.href).replace(/'/g, '%27');
    var secretLabel = resource.secret ? ' · 封缄资料' : '';
    var target = resource.format === 'PDF' ? ' target="_blank" rel="noreferrer"' : ' download';
    return [
      '<a class="resource-link', resource.secret ? ' secret-resource' : '', '" href="', safeHref, '"', target, '>',
        '<span class="resource-icon">', escapeHtml(resource.format), '</span>',
        '<span><strong>', escapeHtml(resource.name), '</strong><small>', escapeHtml(resource.meta + secretLabel), '</small></span>',
        '<span aria-hidden="true">↗</span>',
      '</a>'
    ].join('');
  }

  function dialogTemplate(entry) {
    var keeperMode = isKeeper();
    var tags = entry.tags.map(function (tag) { return '<span>' + escapeHtml(tag) + '</span>'; }).join('');
    var highlights = entry.highlights.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('');
    var resources = entry.resources.map(function (resource) { return resourceTemplate(resource, keeperMode); }).join('');
    var hasSecretResource = entry.resources.some(function (resource) { return resource.secret; });
    var primaryResource = entry.resources.find(function (resource) { return !resource.secret; });
    var sealedResourceNote = hasSecretResource && !keeperMode ? '<div class="sealed-resource-note"><span>◇</span><p>守秘人附件未载入<br><small>玩家模式无法请求剧透文件</small></p></div>' : '';
    var primaryAction = primaryResource
      ? '<a class="button button-primary" href="' + encodeURI(primaryResource.href).replace(/'/g, '%27') + '" download>获取玩家安全资料 <span>↓</span></a>'
      : '';
    var consoleAction = keeperMode && entry.id === 'null-grail'
      ? '<a class="button button-console" href="gm.html">进入守秘人控制台 <span>↗</span></a>'
      : '';
    var boundaryNote = keeperMode
      ? '<div class="audience-boundary" style="border-left-color:var(--red)"><strong>守秘人完整模式</strong><br>访问密钥已验证；下方会显示守秘人附件与封缄摘要。</div>'
      : '<div class="audience-boundary"><strong>PLAYER SAFE · 玩家安全模式</strong><br>本页只显示无剧透介绍与公开附件，人物秘密、事件答案和结局条件不会发送到浏览器。</div>';
    var spoilerSection = keeperMode
      ? '<section class="spoiler-seal"><div class="spoiler-head"><div>KEEPER ONLY · 已验证封缄区</div></div><div class="spoiler-content">' + escapeHtml(entry.spoiler) + '</div></section>'
      : '';
    var meta = [
      ['适合人数', entry.players],
      ['预计时长', entry.duration],
      ['时代 / 类型', entry.era],
      ['主持难度', entry.difficulty],
      ['最近更新', entry.updated]
    ].map(function (item) {
      return '<div><span>' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(item[1]) + '</strong></div>';
    }).join('');

    return [
      '<div style="--entry-accent:', escapeHtml(entry.accent), '">',
        '<section class="dialog-hero">',
          '<div class="dialog-heading">',
            '<p class="eyebrow"><span></span>ARCHIVE · ', escapeHtml(entry.number), ' · ', escapeHtml(entry.english), '</p>',
            '<h2 id="dialog-title">', escapeHtml(entry.title), '</h2>',
            '<p>', escapeHtml(entry.summary), '</p>',
          '</div>',
          '<div class="dialog-emblem" aria-hidden="true">', archiveIconTemplate(entry.icon), '</div>',
        '</section>',
        '<div class="dialog-content-body">',
          boundaryNote,
          '<div class="dialog-meta">', meta, '</div>',
          '<div class="dialog-columns">',
            '<div>',
              '<section class="dialog-section"><h3>无剧透简介</h3><p>', escapeHtml(entry.description), '</p></section>',
              '<section class="dialog-section"><h3>适合怎样的团</h3><p>', escapeHtml(entry.forWho), '</p></section>',
              '<section class="dialog-section"><h3>这份档案包含</h3><ul class="dialog-list">', highlights, '</ul></section>',
              '<section class="dialog-section warning-box"><span>CONTENT NOTE · 内容提示</span><p>', escapeHtml(entry.warning), '</p></section>',
              spoilerSection,
            '</div>',
            '<aside>',
              '<section class="dialog-section"><h3>规则与标签</h3><p style="margin-bottom:12px">', escapeHtml(entry.systemLabel), '</p><div class="dialog-tags">', tags, '</div></section>',
              '<section class="dialog-section"><h3>附件与正文</h3><div class="resource-list">', resources, sealedResourceNote, '</div></section>',
            '</aside>',
          '</div>',
          '<div class="dialog-actions">',
            consoleAction,
            primaryAction,
            '<button class="button button-ghost" id="copy-entry-link" type="button">复制分享链接 <span>↗</span></button>',
            '<button class="button button-ghost" id="favorite-entry" type="button">', isFavorite(entry.id) ? '已点亮 ★' : '收藏航标 ☆', '</button>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function openEntry(id, updateUrl) {
    var entry = entries.find(function (item) { return item.id === id; });
    if (!entry) return;
    if (!currentRole() || (currentRole() === 'keeper' && !isKeeper())) {
      showAccessDialog(id);
      return;
    }
    dialogContent.innerHTML = dialogTemplate(entry);
    dialog.showModal();
    document.body.style.overflow = 'hidden';

    Array.prototype.forEach.call(dialogContent.querySelectorAll('[data-secure-resource]'), function (button) {
      button.addEventListener('click', function () {
        button.disabled = true;
        var oldText = button.querySelector('small').textContent;
        button.querySelector('small').textContent = '正在解密并准备下载…';
        access.downloadSecureResource(button.getAttribute('data-secure-resource')).then(function () {
          button.disabled = false;
          button.querySelector('small').textContent = oldText;
          showToast('加密守秘资料已解密到本机');
        }).catch(function () {
          button.disabled = false;
          button.querySelector('small').textContent = oldText;
          showToast('无法解密资料，请重新验证访问密钥');
        });
      });
    });

    document.getElementById('copy-entry-link').addEventListener('click', function () {
      var url = new URL(window.location.href);
      url.searchParams.set('entry', entry.id);
      copyText(url.toString(), '档案链接已复制');
    });

    document.getElementById('favorite-entry').addEventListener('click', function (event) {
      var active = toggleFavorite(entry.id);
      event.currentTarget.textContent = active ? '已点亮 ★' : '收藏航标 ☆';
      showToast(active ? '已加入你的本地航标' : '已移除本地航标');
    });

    if (updateUrl !== false) {
      var current = new URL(window.location.href);
      current.searchParams.set('entry', entry.id);
      history.replaceState({}, '', current);
    }
  }

  function closeEntry() {
    if (dialog.open) dialog.close();
  }

  function isFavorite(id) {
    try {
      var favorites = JSON.parse(localStorage.getItem('archive-favorites') || '[]');
      return favorites.indexOf(id) !== -1;
    } catch (error) {
      return false;
    }
  }

  function toggleFavorite(id) {
    var favorites;
    try { favorites = JSON.parse(localStorage.getItem('archive-favorites') || '[]'); }
    catch (error) { favorites = []; }
    var index = favorites.indexOf(id);
    if (index === -1) favorites.push(id);
    else favorites.splice(index, 1);
    localStorage.setItem('archive-favorites', JSON.stringify(favorites));
    return index === -1;
  }

  function copyText(text, successMessage) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { showToast(successMessage); });
      return;
    }
    var input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    showToast(successMessage);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = window.setTimeout(function () { toast.classList.remove('show'); }, 2200);
  }

  function clearFilters() {
    state.query = '';
    state.type = 'all';
    searchInput.value = '';
    typeFilter.value = 'all';
    setSystemFilter('all', false);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), function (button) {
    button.addEventListener('click', function () { setSystemFilter(button.getAttribute('data-filter'), false); });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-system-jump]'), function (button) {
    button.addEventListener('click', function () { setSystemFilter(button.getAttribute('data-system-jump'), true); });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-open-entry]'), function (button) {
    button.addEventListener('click', function () { openEntry(button.getAttribute('data-open-entry')); });
  });

  searchInput.addEventListener('input', function () { state.query = searchInput.value; renderEntries(); });
  typeFilter.addEventListener('change', function () { state.type = typeFilter.value; renderEntries(); });
  document.getElementById('clear-filters').addEventListener('click', clearFilters);
  document.getElementById('player-entry-button').addEventListener('click', function () {
    access.setRole('player');
    updateAudienceUi();
    renderEntries();
    document.getElementById('archive').scrollIntoView({ behavior:'smooth', block:'start' });
    showToast('已进入 PLAYER SAFE 玩家安全模式');
  });

  document.getElementById('audience-button').addEventListener('click', function () { showAccessDialog(null); });
  document.getElementById('access-close').addEventListener('click', function () { pendingEntryId = null; accessDialog.close(); });
  document.getElementById('choose-player').addEventListener('click', function () {
    access.setRole('player');
    finishRoleSelection();
    showToast('已进入 PLAYER SAFE 玩家安全模式');
  });
  document.getElementById('choose-keeper').addEventListener('click', function () {
    if (isKeeper()) { finishRoleSelection(); return; }
    document.getElementById('role-grid').hidden = true;
    document.getElementById('access-key-form').hidden = false;
    document.getElementById('access-key-input').focus();
  });
  document.getElementById('access-back').addEventListener('click', function () {
    document.getElementById('role-grid').hidden = false;
    document.getElementById('access-key-form').hidden = true;
    document.getElementById('access-error').hidden = true;
  });
  document.getElementById('access-key-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var input = document.getElementById('access-key-input');
    var submit = event.currentTarget.querySelector('[type="submit"]');
    var error = document.getElementById('access-error');
    error.hidden = true;
    submit.disabled = true;
    access.verifyKey(input.value).then(function (valid) {
      submit.disabled = false;
      if (!valid) { error.hidden = false; input.select(); return; }
      finishRoleSelection();
      showToast('访问密钥已验证，完整档案已解锁');
    });
  });
  accessDialog.addEventListener('click', function (event) { if (event.target === accessDialog) { pendingEntryId = null; accessDialog.close(); } });

  document.getElementById('random-entry').addEventListener('click', function () {
    var pool = getFilteredEntries();
    if (!pool.length) pool = entries;
    openEntry(pool[Math.floor(Math.random() * pool.length)].id);
  });

  function setView(view) {
    state.view = view;
    localStorage.setItem('archive-view', view);
    document.getElementById('grid-view').classList.toggle('active', view === 'grid');
    document.getElementById('grid-view').setAttribute('aria-pressed', String(view === 'grid'));
    document.getElementById('list-view').classList.toggle('active', view === 'list');
    document.getElementById('list-view').setAttribute('aria-pressed', String(view === 'list'));
    renderEntries();
  }
  document.getElementById('grid-view').addEventListener('click', function () { setView('grid'); });
  document.getElementById('list-view').addEventListener('click', function () { setView('list'); });

  document.getElementById('dialog-close').addEventListener('click', closeEntry);
  dialog.addEventListener('click', function (event) { if (event.target === dialog) closeEntry(); });
  dialog.addEventListener('close', function () {
    document.body.style.overflow = '';
    var current = new URL(window.location.href);
    current.searchParams.delete('entry');
    history.replaceState({}, '', current);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === '/' && document.activeElement !== searchInput && !dialog.open) {
      event.preventDefault();
      searchInput.focus();
    }
  });

  var themeToggle = document.getElementById('theme-toggle');
  var savedTheme = localStorage.getItem('archive-theme');
  if (savedTheme === 'dawn' || savedTheme === 'night') document.documentElement.setAttribute('data-theme', savedTheme);
  themeToggle.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'night' ? 'dawn' : 'night';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('archive-theme', next);
    showToast(next === 'dawn' ? '已切换到晨曦阅读' : '已切换到夜航阅读');
  });

  var navToggle = document.getElementById('nav-toggle');
  var siteNav = document.getElementById('site-nav');
  navToggle.addEventListener('click', function () {
    var expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    navToggle.setAttribute('aria-label', expanded ? '打开导航' : '关闭导航');
    siteNav.classList.toggle('open', !expanded);
  });
  Array.prototype.forEach.call(siteNav.querySelectorAll('a'), function (link) {
    link.addEventListener('click', function () {
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', '打开导航');
      siteNav.classList.remove('open');
    });
  });

  var revealObserver = new IntersectionObserver(function (items) {
    items.forEach(function (item) {
      if (item.isIntersecting) {
        item.target.classList.add('visible');
        revealObserver.unobserve(item.target);
      }
    });
  }, { threshold: 0.12 });
  Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (item) { revealObserver.observe(item); });

  var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
  var navLinks = Array.prototype.slice.call(siteNav.querySelectorAll('a'));
  var sectionObserver = new IntersectionObserver(function (items) {
    items.forEach(function (item) {
      if (!item.isIntersecting) return;
      navLinks.forEach(function (link) { link.classList.toggle('active', link.getAttribute('href') === '#' + item.target.id); });
    });
  }, { rootMargin: '-40% 0px -52% 0px' });
  sections.forEach(function (section) { sectionObserver.observe(section); });

  window.addEventListener('scroll', function () {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var value = max > 0 ? window.scrollY / max * 100 : 0;
    document.getElementById('page-progress-bar').style.width = value + '%';
    document.querySelector('.site-header').classList.toggle('scrolled', window.scrollY > 12);
  }, { passive: true });

  updateAudienceUi();
  document.getElementById('published-count').textContent = String(entries.length).padStart(2, '0');
  setView(state.view === 'list' ? 'list' : 'grid');

  var entryParam = new URL(window.location.href).searchParams.get('entry');
  if (entryParam) window.setTimeout(function () { openEntry(entryParam, false); }, 120);
})();
