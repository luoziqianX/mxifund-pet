// ============ mxifund-pet 全局配置 ============
// 所有时长单位：毫秒。想调节奏改这里就行。

export const CONFIG = {
  // 干翻凯读的概率（每次查询）
  winRate: 0.01,

  // 各阶段时长
  wakeStretchMs: 2600,      // 起床伸懒腰
  coffeeSipMs: 4200,        // 喝咖啡
  grindMinMs: 34000,        // 一轮开卷最短
  grindMaxMs: 50000,        // 一轮开卷最长
  queryMs: 5200,            // 查询卫星扫描时长
  resultHoldMs: 3600,       // 查询结果展示
  sleepMs: 20000,           // 躺（睡舱过夜）
  celebrateMs: 9000,        // 干翻庆祝

  // 体力系统：每轮开卷+查询消耗体力，低于阈值 => 必须躺了
  energyMax: 100,
  energyCostMin: 26,
  energyCostMax: 42,
  mustLieBelow: 30,

  // 移动
  walkSpeed: 1.05,          // m/s
  runSpeed: 1.9,

  // 场景锚点（世界坐标 x）
  spots: {
    pod: -4.9,
    coffee: -2.55,
    deskChair: -0.12,
    query: 1.75,
    lounge: 4.35,
  },

  bubble: {
    minGapMs: 5200,
    maxGapMs: 9800,
    holdMs: 3000,
  },
};

// ============ 台词库 ============
export const LINES = {
  wake: ['唔…新的一天', '今天能干翻凯读吗', '先续一杯咖啡', '起床！开卷！', '梦里都在跑回测'],
  coffee: ['咖啡因充能中…', '双倍浓缩，双倍alpha', '咖啡不停，模型不停'],
  grind: [
    'loss 还在降，稳住',
    'epoch 47/∞',
    '这个 factor 有点东西',
    '夏普 0.3 也是夏普！',
    'GPU 在燃烧，我也在燃烧',
    '回测天下第一，实盘再说',
    '把凯读的 alpha 全挖走',
    '特征重要性第一名：玄学',
    'nan 了？重跑！',
    '再调一个超参就睡觉（骗人）',
    '数据在手，天下我有',
    '凯读今天也要被卷哭',
  ],
  queryStart: ['连接凯读监控卫星…', '查询今日战况…', '让我康康凯读还活着吗'],
  fail: ['又没干掉…', '凯读命真硬', '差一点点（并没有）', '明天一定！', '气死了，继续卷'],
  mustGrind: ['还有体力，继续卷！', '不用躺，接着干！', '这点疲劳不算什么'],
  mustLie: ['不行了…必须躺了', '体力见底，回舱充电', '躺是为了更好地卷'],
  night: ['明天再战…', '梦里干翻凯读', 'Zzz…'],
  win: ['干翻凯读了！！！', 'PnL 起飞！！', '历史性的一天！！'],
  slack: ['摆～', '无事发生，真好', '椰子水真好喝', '这就是干翻凯读的感觉吗', '永久开摆中'],
  poke: [
    '别戳我，在跑模型',
    '我的 alpha 呢？',
    '你也想干翻凯读吗？',
    '工学椅真香',
    '喵？',
    '摸鱼被抓包了…',
    '给我康康凯读的持仓',
  ],
};

// 终端滚动日志（第四块屏幕）
export const TERM_LINES = [
  '[bt] sharpe=0.31 dd=-12.4%',
  '[gpu] 7/8 busy, temp 81C',
  '[data] tick stream ok (32ms)',
  '[risk] var ok, exposure 0.98',
  '[opt] trial 4213: sharpe 0.29',
  '[alpha] ic=0.041 icir=0.62',
  '[train] loss 0.4471 -> 0.4468',
  '[kaidu] target status: ALIVE',
  '[sig] factor_207 corr ok',
  '[exec] slippage 1.2bps',
  '[warn] loss=nan, retrying...',
  '[bt] sharpe=0.33 (best!)',
];
