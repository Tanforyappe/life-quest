/* ============================================================
   人生副本 · Life Quest
   一个纯前端、不需要服务器的游戏化任务管理应用。
   数据全部保存在你手机/电脑的浏览器里（localStorage），不会上传到任何地方。

   代码分成 8 块，从上往下读就行：
     1. 小工具        2. 常量配置      3. 数据结构与存档
     4. 派生数据      5. 动作（打卡/兑换等）  6. 界面渲染
     7. 弹窗          8. 事件绑定与启动
   ============================================================ */
(function () {
  'use strict';

  /* ==========================================================
     1. 小工具
     ========================================================== */
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const uid = () =>
    Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  // 把用户输入的文本安全地放进 HTML（防止破坏页面）
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const pad2 = (n) => String(n).padStart(2, '0');

  /** 把日期变成 "2025-06-01" 这样的字符串，用来标记“哪一天” */
  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** 这一周的编号（以周一为一周的开始） */
  function weekKey(d) {
    d = d || new Date();
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const offset = (t.getDay() + 6) % 7; // 周一 = 0
    t.setDate(t.getDate() - offset);
    return dayKey(t);
  }

  function addDays(d, n) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + n);
    return t;
  }

  function parseDayKey(k) {
    const p = String(k).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function clampInt(v, min, max, dflt) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return dflt;
    return Math.min(max, Math.max(min, n));
  }

  /* ==========================================================
     2. 常量配置（想调平衡，改这里）
     ========================================================== */

  // 难度 → 基础奖励
  const DIFFS = {
    easy:   { label: '轻松', xp: 15,  coins: 4  },
    normal: { label: '普通', xp: 30,  coins: 8  },
    hard:   { label: '困难', xp: 60,  coins: 18 },
    epic:   { label: '史诗', xp: 120, coins: 40 }
  };

  // 任务类型的奖励倍率：每周任务更值钱，BOSS 最值钱
  const TYPE_MUL = { daily: 1, weekly: 2, boss: 5 };

  const TYPE_LABEL = { daily: '每日', weekly: '每周', boss: 'BOSS' };

  /* 连击倍率：档位表在下面 DEFAULT_SETTINGS / STREAK_TIERS 里定义，可在「我的」页增删改 */

  /* 等级称号（新功能 ⑤） */
  const TITLES = [
    { min: 50, name: '神话',     color: '#ff7ad9' },
    { min: 30, name: '传说',     color: '#ffb454' },
    { min: 20, name: '英雄',     color: '#f6c453' },
    { min: 15, name: '精英猎人', color: '#b39dff' },
    { min: 10, name: '勇者',     color: '#8b9dff' },
    { min: 6,  name: '见习勇者', color: '#4fd1c5' },
    { min: 3,  name: '冒险者',   color: '#4fd1c5' },
    { min: 1,  name: '新手学徒', color: '#8b9ab5' }
  ];

  /* 专注（番茄钟）的默认奖励标准（可在「专注」页随时改，存在 settings 里） */
  const FOCUS_XP_PER_MIN = 1.5;
  const FOCUS_COIN_PER_MIN = 0.35;
  const FOCUS_PRESETS = [15, 25, 45, 60];

  /* 记账分类（流水页用它显示图标和名字） */
  const LEDGER_CAT = {
    task:   { icon: '⚔️', label: '完成任务' },
    focus:  { icon: '🍅', label: '专注' },
    punish: { icon: '⚠️', label: '惩罚' },
    reward: { icon: '🎁', label: '兑换奖励' },
    minute: { icon: '⏳', label: '兑换时长' },
    use:    { icon: '🎬', label: '用掉时长' },
    bonus:  { icon: '🎉', label: '每日达标' },
    level:  { icon: '⬆️', label: '升级奖励' },
    ach:    { icon: '🏅', label: '成就奖励' },
    undo:   { icon: '↩️', label: '撤销' }
  };

  /* 所有可调数值（存在 state.settings 里，「我的」页可改） */
  const DEFAULT_SETTINGS = {
    focusXpPerMin: FOCUS_XP_PER_MIN,
    focusCoinPerMin: FOCUS_COIN_PER_MIN,
    minuteCost: 2,          // 兑换比例：多少金币
    minuteGain: 1,          //           换多少分钟
    dailyBonusTasks: 5,     // 一天完成多少个任务算达标
    dailyBonusMinutes: 60,  // 达标送多少分钟
    importantMin: 4,        // 每天至少要完成几个「重要」任务，否则当天算失败
    streakTiers: []         // 连胜倍率档位，下面用默认值填
  };

  /** 连胜倍率默认档位（界面上可以随便增删改） */
  const STREAK_TIERS = [
    { min: 3,  mul: 1.2 },
    { min: 7,  mul: 1.5 },
    { min: 14, mul: 1.8 },
    { min: 30, mul: 2.0 }
  ];

  function defaultTiers() {
    return STREAK_TIERS.map((t) => ({ min: t.min, mul: t.mul }));
  }

  /** 整理档位表：按天数升序、去掉重复天数、数值夹在合理范围 */
  function normalizeTiers(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((t) => {
      const min = clampInt(t && t.min, 1, 365, 1);
      let mul = parseFloat(t && t.mul);
      if (!isFinite(mul)) mul = 1;
      mul = Math.min(10, Math.max(1, Math.round(mul * 10) / 10));
      out.push({ min: min, mul: mul });
    });
    out.sort((a, b) => a.min - b.min);
    const seen = {};
    return out.filter((t) => {
      if (seen[t.min]) return false;
      seen[t.min] = true;
      return true;
    });
  }

  function normalizeSettings(s) {
    const o = Object.assign({}, DEFAULT_SETTINGS, s || {});
    o.streakTiers = normalizeTiers(
      Array.isArray(o.streakTiers) && o.streakTiers.length ? o.streakTiers : defaultTiers()
    );
    const num = (k, dflt) => {
      const v = parseFloat(o[k]);
      return isFinite(v) ? v : dflt;
    };
    o.focusXpPerMin = num('focusXpPerMin', 1.5);
    o.focusCoinPerMin = num('focusCoinPerMin', 0.35);
    o.minuteCost = num('minuteCost', 2);
    o.minuteGain = num('minuteGain', 1);
    o.dailyBonusTasks = num('dailyBonusTasks', 5);
    o.dailyBonusMinutes = num('dailyBonusMinutes', 60);
    o.importantMin = num('importantMin', 4);
    return o;
  }

  /* 惩罚项模板 */
  const PUNISH_PRESETS = [
    { name: '熬夜超过 12 点',   icon: '🌙', xp: 20, coins: 10 },
    { name: '刷手机超过 1 小时', icon: '📱', xp: 15, coins: 8 },
    { name: '当天任务没做完',   icon: '😵', xp: 25, coins: 12 }
  ];

  /* 日记心情 */
  const MOODS = ['😄', '🙂', '😐', '😕', '😫'];

  // 升级所需经验：1 级 → 2 级需要 100，之后每级多 40
  const XP_BASE = 100, XP_STEP = 40;
  const xpNeed = (lv) => XP_BASE + (lv - 1) * XP_STEP;

  // 可选图标
  const EMOJIS = ['✅','🌅','🏃','💪','📖','✍️','💻','🧘','💧','🥗','🛏️','🎸','🧹','📞','🚶','🦷','🎯','🔥','⭐','👑','📝','🧠','🗣️','🎨','💰','🏆'];

  // 可选头像
  const AVATARS = ['🧙','🧝','🦸','🐉','🦊','🐱','🤖','👾','🥷','🧑‍🚀'];

  // 奖励商店的“上架模板”（用户也可以自己加）
  const REWARD_PRESETS = [
    { name: '看一集剧',     icon: '📺', cost: 40 },
    { name: '一杯奶茶',     icon: '🧋', cost: 60 },
    { name: '玩游戏 1 小时', icon: '🎮', cost: 80 },
    { name: '睡个懒觉',     icon: '😴', cost: 100 }
  ];

  // 成就定义：test(stats) 返回 true 就是解锁了；coin = 解锁时奖励多少金币
  const ACHIEVEMENTS = [
    { id: 'first',   icon: '🌱', name: '初次上路',   desc: '完成第 1 个任务',        coin: 50,  test: (s) => s.totalDone >= 1 },
    { id: 'd10',     icon: '📗', name: '小有起色',   desc: '累计完成 10 次',         coin: 60,  test: (s) => s.totalDone >= 10 },
    { id: 'd50',     icon: '📘', name: '渐入佳境',   desc: '累计完成 50 次',         coin: 150, test: (s) => s.totalDone >= 50 },
    { id: 'd200',    icon: '📚', name: '习惯成型',   desc: '累计完成 200 次',        coin: 400, test: (s) => s.totalDone >= 200 },
    { id: 's3',      icon: '✨', name: '三日不辍',   desc: '连续打卡 3 天',          coin: 50,  test: (s) => s.bestStreak >= 3 },
    { id: 's7',      icon: '🔥', name: '一周不断',   desc: '连续打卡 7 天',          coin: 100, test: (s) => s.bestStreak >= 7 },
    { id: 's30',     icon: '☄️', name: '钢铁意志',   desc: '连续打卡 30 天',         coin: 400, test: (s) => s.bestStreak >= 30 },
    { id: 'lv5',     icon: '⭐', name: '初露锋芒',   desc: '升到 5 级',              coin: 100, test: (s) => s.level >= 5 },
    { id: 'lv10',    icon: '🌟', name: '崭露头角',   desc: '升到 10 级',             coin: 250, test: (s) => s.level >= 10 },
    { id: 'lv20',    icon: '💫', name: '传说之路',   desc: '升到 20 级',             coin: 800, test: (s) => s.level >= 20 },
    { id: 'boss1',   icon: '👑', name: 'BOSS 终结者', coin: 200, test: (s) => s.bossDone >= 1, desc: '击败第 1 个 BOSS' },
    { id: 'boss5',   icon: '🏰', name: '副本通缉令', desc: '击败 5 个 BOSS',         coin: 600, test: (s) => s.bossDone >= 5 },
    { id: 'coin500', icon: '💰', name: '第一桶金',   desc: '累计赚到 500 金币',      coin: 100, test: (s) => s.coinsEarned >= 500 },
    { id: 'perfect', icon: '🎖️', name: '完美一天',   desc: '一天内完成全部每日任务', coin: 150, test: (s) => s.perfectDays >= 1 },
    { id: 'focus5',  icon: '🍅', name: '专注入定',   desc: '完成 5 次专注',          coin: 80,  test: (s) => s.focusCount >= 5 },
    { id: 'focus500', icon: '🧠', name: '心流大师',  desc: '累计专注 500 分钟',      coin: 300, test: (s) => s.focusMinutes >= 500 }
  ];

  /* ==========================================================
     3. 数据结构与存档
     ========================================================== */
  const STORE_KEY = 'lifequest.v1';

  function defaultState() {
    const today = dayKey();
    const wkey = weekKey();
    const mk = (o) => Object.assign({
      id: uid(), type: 'daily', name: '', icon: '✅', target: 1, unit: '次',
      diff: 'normal', xp: 30, coins: 8, progress: 0, done: false, level: 'basic',
      cycleKey: today, due: '', createdAt: Date.now()
    }, o);

    return {
      v: 3,
      player: { name: '冒险者', avatar: '🧙', totalXp: 0, coins: 0, minutes: 0, rewardedLevel: 1, bestStreak: 0 },
      tasks: [
        mk({ type: 'daily',  name: '早起（不赖床）',   icon: '🌅', target: 1,  unit: '次', diff: 'easy',   xp: 15,  coins: 4 }),
        mk({ type: 'daily',  name: '运动 30 分钟',     icon: '🏃', target: 1,  unit: '次', diff: 'normal', xp: 30,  coins: 8 }),
        mk({ type: 'daily',  name: '阅读 20 页',        icon: '📖', target: 20, unit: '页', diff: 'normal', xp: 30,  coins: 8 }),
        mk({ type: 'daily',  name: '专注学习 / 工作 3 小时', icon: '💻', target: 3, unit: '小时', diff: 'hard', xp: 60, coins: 18 }),
        mk({ type: 'weekly', name: '本周运动 4 次',     icon: '💪', target: 4,  unit: '次', diff: 'hard',   xp: 120, coins: 36, cycleKey: wkey }),
        mk({ type: 'weekly', name: '周末复盘本周',      icon: '📝', target: 1,  unit: '次', diff: 'normal', xp: 60,  coins: 16, cycleKey: wkey }),
        mk({ type: 'boss',   name: '写完那份大作业',   icon: '👑', target: 1,  unit: '个', diff: 'epic',   xp: 600, coins: 200, cycleKey: null, due: dayKey(addDays(new Date(), 14)) })
      ],
      rewards: REWARD_PRESETS.map((r) => Object.assign({ id: uid(), bought: 0, minutes: 0 }, r)),
      completions: [],
      purchases: [],
      focus: [],                 // 专注记录
      rewardedAchievements: [],  // 已经发过金币的成就 id
      // ---- v3 新增 ----
      punishments: PUNISH_PRESETS.map((p) => Object.assign({ id: uid() }, p)),
      punishLog: [],             // 每次「记一次惩罚」的记录
      ledger: [],                // 经验/金币/时长的增减流水
      diary: [],                 // 每日日记 { day, mood, text, ts }
      memos: [],                 // 备忘录
      bonusDays: {},             // 哪天已经领过「每日达标」奖励
      failedDays: {},            // 哪天被判定「重要任务不达标」而失败
      ruleActiveFrom: null,      // 「重要任务」规则从哪天开始生效（之前的旧日子不倒扣）
      settings: normalizeSettings({}),
      sound: true,
      createdAt: Date.now()
    };
  }

  let state = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      const obj = JSON.parse(raw);
      if (!obj || !obj.player || !Array.isArray(obj.tasks)) return defaultState();
      // 补全可能缺失的字段（方便以后升级版本）
      obj.rewards = Array.isArray(obj.rewards) ? obj.rewards : [];
      obj.completions = Array.isArray(obj.completions) ? obj.completions : [];
      obj.purchases = Array.isArray(obj.purchases) ? obj.purchases : [];
      obj.focus = Array.isArray(obj.focus) ? obj.focus : [];
      // ---- v3 ----
      obj.punishments = Array.isArray(obj.punishments) ? obj.punishments : [];
      obj.punishLog = Array.isArray(obj.punishLog) ? obj.punishLog : [];
      obj.diary = Array.isArray(obj.diary) ? obj.diary : [];
      obj.memos = Array.isArray(obj.memos) ? obj.memos : [];
      obj.bonusDays = obj.bonusDays && typeof obj.bonusDays === 'object' ? obj.bonusDays : {};
      obj.failedDays = obj.failedDays && typeof obj.failedDays === 'object' ? obj.failedDays : {};
      if (typeof obj.ruleActiveFrom !== 'string') obj.ruleActiveFrom = null;
      // 老任务没有「基本/重要」等级，默认按「基本」处理
      obj.tasks.forEach((t) => { if (t.level !== 'important') t.level = 'basic'; });
      obj.settings = normalizeSettings(obj.settings);
      // 老版本用的是「1 分钟 = N 金币」，升级成「N 金币 = 1 分钟」
      if (obj.settings.minuteRate != null) {
        if (obj.settings.minuteCost == null) obj.settings.minuteCost = obj.settings.minuteRate;
        delete obj.settings.minuteRate;
      }
      obj.ledger = Array.isArray(obj.ledger) ? obj.ledger : null;   // null = 老存档，需要补账
      if (typeof obj.player.minutes !== 'number') obj.player.minutes = 0;
      if (typeof obj.sound !== 'boolean') obj.sound = true;
      if (typeof obj.player.rewardedLevel !== 'number') obj.player.rewardedLevel = 1;
      if (typeof obj.player.bestStreak !== 'number') obj.player.bestStreak = 0;
      if (typeof obj.player.coins !== 'number') obj.player.coins = 0;
      if (typeof obj.player.totalXp !== 'number') obj.player.totalXp = 0;
      return obj;
    } catch (e) {
      console.warn('读取存档失败，使用默认数据', e);
      return defaultState();
    }
  }

  let saveFailed = false;
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      if (!saveFailed) {
        saveFailed = true;
        toast('保存失败：浏览器存储不可用（无痕模式？）', 'bad');
      }
      console.warn(e);
    }
  }

  /** 跨天后把“每日/每周”任务重置（打开应用、或从后台切回来时调用） */
  function rollCycles() {
    const today = dayKey();
    const wkey = weekKey();
    let changed = false;
    state.tasks.forEach((t) => {
      const key = t.type === 'daily' ? today : (t.type === 'weekly' ? wkey : null);
      if (key === null) return;                       // BOSS 任务不自动重置
      if (t.cycleKey !== key) {
        t.cycleKey = key;
        t.progress = 0;
        t.done = false;
        changed = true;
      }
    });
    if (changed) save();
    return changed;
  }

  /* ==========================================================
     4. 派生数据（全部由「打卡记录」算出来，不会算错）
     ========================================================== */

  function levelInfo(totalXp) {
    let lv = 1, rest = Math.max(0, totalXp | 0);
    while (rest >= xpNeed(lv) && lv < 999) { rest -= xpNeed(lv); lv++; }
    return { level: lv, xp: rest, need: xpNeed(lv) };
  }

  /** 连续打卡天数：从今天（或昨天）往前数（打卡和专注都算一天的活动） */
  function computeStreak() {
    if (todayFailed()) return 0;      // 今天被判失败 → 连胜当场中断
    const days = activityDays();
    if (!days.size) return 0;
    let cur = new Date();
    if (!days.has(dayKey(cur))) cur = addDays(cur, -1);   // 今天还没打卡，从昨天开始算
    let n = 0;
    while (days.has(dayKey(cur))) { n++; cur = addDays(cur, -1); }
    return n;
  }

  /** 历史最长连续天数 */
  function computeBestStreak() {
    const days = Array.from(activityDays()).sort();
    if (!days.length) return 0;
    let best = 1, run = 1;
    for (let i = 1; i < days.length; i++) {
      const diff = Math.round((parseDayKey(days[i]) - parseDayKey(days[i - 1])) / 86400000);
      run = diff === 1 ? run + 1 : 1;
      if (run > best) best = run;
    }
    return best;
  }

  /** 任务打卡 + 专注，合成一个“活动列表”（统计和热力图都基于它） */
  function allActivity() {
    return state.completions.concat(state.focus || []);
  }

  /** 被判失败的那天不算「有效活动日」（连胜会因此中断） */
  function isFailedDay(day) {
    return !!(state.failedDays && state.failedDays[day] === true);
  }

  function activityDays() {
    const set = new Set();
    allActivity().forEach((c) => { if (!isFailedDay(c.day)) set.add(c.day); });
    return set;
  }

  function todayFailed() {
    return isFailedDay(dayKey());
  }

  /** 每天至少要完成几个重要任务 */
  function importantMin() {
    const v = parseInt(state.settings.importantMin, 10);
    return isFinite(v) && v > 0 ? v : 4;
  }

  /** 所有「重要」的每日任务 */
  function importantTasks() {
    return state.tasks.filter((t) => t.type === 'daily' && t.level === 'important');
  }

  /** 今天已完成的重要任务数 */
  function importantDoneToday() {
    return importantTasks().filter((t) => t.done).length;
  }

  /** 「重要任务」规则有没有生效（重要任务数量本身要够，不然永远达不到） */
  function ruleActive() {
    return importantTasks().length >= importantMin();
  }

  /** 连击信息：今天是你连续第几天，奖励乘多少 */
  function streakInfo() {
    // 今天被判定失败 → 加成直接归零
    if (todayFailed()) return { day: 0, mul: 1, failed: true };

    // 用「截至昨天的连击数 + 1」来算，这样一整天里倍率不会变
    const days = activityDays();
    let cur = addDays(new Date(), -1);
    let prev = 0;
    while (days.has(dayKey(cur))) { prev++; cur = addDays(cur, -1); }
    const n = prev + 1;   // 今天算“第 n 天”，打没打卡都一样

    const tiers = state.settings.streakTiers || [];
    let mul = 1;
    for (let i = 0; i < tiers.length; i++) if (n >= tiers[i].min) mul = tiers[i].mul;
    return { day: n, mul: mul, failed: false };
  }

  /** 把基础奖励乘上连击倍率 */
  function applyBonus(xp, coins) {
    const m = streakInfo().mul;
    return {
      xp: Math.max(1, Math.round(xp * m)),
      coins: Math.max(1, Math.round(coins * m)),
      mul: m
    };
  }

  /** 等级称号 */
  function titleOf(level) {
    for (let i = 0; i < TITLES.length; i++) if (level >= TITLES[i].min) return TITLES[i];
    return TITLES[TITLES.length - 1];
  }

  /** 检查有没有新解锁的成就，有就发金币（新功能 ②） */
  function checkAchievements() {
    if (!Array.isArray(state.rewardedAchievements)) state.rewardedAchievements = [];
    const s = getStats();
    const got = [];
    ACHIEVEMENTS.forEach((a) => {
      if (state.rewardedAchievements.indexOf(a.id) >= 0) return;
      if (a.test(s)) {
        state.rewardedAchievements.push(a.id);
        if (a.coin) addCoins(a.coin, 'ach', a.name);
        got.push(a);
      }
    });
    return got;
  }

  function getStats() {
    const cs = state.completions;
    const fs = state.focus || [];
    const today = dayKey();
    const li = levelInfo(state.player.totalXp);
    const fresh = liveStreak();
    const sk = streakInfo();

    // 每日任务总数 / 今天完成数
    const dailyTasks = state.tasks.filter((t) => t.type === 'daily');
    const dailyDoneToday = dailyTasks.filter((t) => t.done).length;

    // 完美一天：某天完成了当天所有每日任务
    const perDayTotal = {};
    cs.forEach((c) => { perDayTotal[c.day] = (perDayTotal[c.day] || 0) + 1; });
    const perfectDays = Object.keys(perDayTotal).filter((d) => {
      const n = dailyTasks.length;
      return n > 0 && perDayTotal[d] >= n;
    }).length;

    // 本周（周一起）每天完成量，用于柱状图
    const monday = addDays(new Date(), -((new Date().getDay() + 6) % 7));
    const weekBars = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      const k = dayKey(d);
      const n = cs.filter((c) => c.day === k).length + fs.filter((c) => c.day === k).length;
      const xp = cs.filter((c) => c.day === k).reduce((s, c) => s + c.xp, 0) +
                 fs.filter((c) => c.day === k).reduce((s, c) => s + c.xp, 0);
      weekBars.push({ key: k, count: n, xp: xp, future: d > new Date(), isToday: k === today });
    }
    const weekDone = weekBars.reduce((s, b) => s + b.count, 0);
    const weekXp = weekBars.reduce((s, b) => s + b.xp, 0);

    return {
      level: li.level, xp: li.xp, need: li.need,
      title: titleOf(li.level),
      coins: state.player.coins,
      totalXp: state.player.totalXp,
      totalDone: cs.length,
      bossDone: cs.filter((c) => c.type === 'boss').length,
      activeDays: activityDays().size,
      streak: fresh,
      streakFailed: todayFailed(),
      streakDay: sk.day,
      mul: sk.mul,
      mulLabel: sk.label,
      bestStreak: Math.max(state.player.bestStreak || 0, computeBestStreak()),
      todayDone: cs.filter((c) => c.day === today).length,
      coinsEarned: cs.reduce((s, c) => s + (c.coins || 0), 0) + fs.reduce((s, c) => s + (c.coins || 0), 0),
      perfectDays: perfectDays,
      dailyTotal: dailyTasks.length,
      dailyDoneToday: dailyDoneToday,
      focusCount: fs.length,
      focusMinutes: fs.reduce((s, c) => s + (c.minutes || 0), 0),
      minutes: state.player.minutes || 0,
      punishCount: (state.punishLog || []).length,
      weekBars: weekBars,
      weekDone: weekDone,
      weekXp: weekXp
    };
  }

  function liveStreak() {
    const p = state.player;
    const s = computeStreak();
    return s;
  }

  /** 升级后发金币奖励（每个等级一次，不会重复发） */
  function grantLevelRewards() {
    const p = state.player;
    const lv = levelInfo(p.totalXp).level;
    if (p.rewardedLevel == null) { p.rewardedLevel = lv; return null; }
    if (lv > p.rewardedLevel) {
      let gain = 0;
      for (let l = p.rewardedLevel + 1; l <= lv; l++) gain += 20 + l * 5;
      addCoins(gain, 'level', '升到 Lv.' + lv);
      p.rewardedLevel = lv;
      return { level: lv, gain: gain };
    }
    return null;
  }

  /* ==========================================================
     4.5 记账 / 娱乐时长 / 每日达标 / 备忘录提醒（v3）
     ========================================================== */

  /** 所有经验、金币、时长的增减都必须走这里，流水页才有记录 */
  function pushLedger(kind, delta, cat, reason) {
    if (!Array.isArray(state.ledger)) state.ledger = [];
    state.ledger.push({
      id: uid(), kind: kind, delta: delta, cat: cat,
      reason: reason || '', ts: Date.now(), day: dayKey()
    });
    if (state.ledger.length > 1000) state.ledger = state.ledger.slice(-1000);
  }

  function addXp(n, cat, reason) {
    n = Math.round(n);
    if (!n) return 0;
    state.player.totalXp = Math.max(0, state.player.totalXp + n);
    pushLedger('xp', n, cat, reason);
    return n;
  }

  function addCoins(n, cat, reason) {
    n = Math.round(n);
    if (!n) return 0;
    state.player.coins = Math.max(0, state.player.coins + n);
    pushLedger('coin', n, cat, reason);
    return n;
  }

  /** 娱乐时长（分钟），累积制，不清零 */
  function addMinutes(n, cat, reason) {
    n = Math.round(n);
    if (!n) return 0;
    state.player.minutes = Math.max(0, (state.player.minutes || 0) + n);
    pushLedger('min', n, cat, reason);
    return n;
  }

  /** 老存档升级到 v3 时，用已有的打卡记录把流水补出来 */
  function backfillLedger() {
    state.ledger = [];
    allActivity().forEach((c) => {
      const cat = c.type === 'focus' ? 'focus' : 'task';
      state.ledger.push({ id: uid(), kind: 'xp', delta: c.xp, cat: cat, reason: c.name, ts: c.ts, day: c.day });
      state.ledger.push({ id: uid(), kind: 'coin', delta: c.coins, cat: cat, reason: c.name, ts: c.ts, day: c.day });
    });
    (state.purchases || []).forEach((p) => {
      state.ledger.push({
        id: uid(), kind: 'coin', delta: -p.cost, cat: 'reward',
        reason: '兑换：' + p.name, ts: p.ts, day: dayKey(new Date(p.ts))
      });
    });
    state.ledger.sort((a, b) => a.ts - b.ts);
    if (state.ledger.length > 1000) state.ledger = state.ledger.slice(-1000);
  }

  /** 今天完成了几个「任务」（不含专注） */
  function todayTaskCount() {
    const today = dayKey();
    return state.completions.filter((c) => c.day === today).length;
  }

  /** 每日达标：完成 N 个任务送 M 分钟（每天只发一次） */
  function checkDailyBonus() {
    if (!state.bonusDays) state.bonusDays = {};
    const today = dayKey();
    const need = state.settings.dailyBonusTasks;
    if (state.bonusDays[today]) return 0;
    if (todayTaskCount() < need) return 0;
    state.bonusDays[today] = true;
    const gain = state.settings.dailyBonusMinutes;
    addMinutes(gain, 'bonus', '今日完成 ' + need + ' 个任务');
    return gain;
  }

  /* ---------- 「重要任务」规则 ---------- */

  /** 规则从「第一次满足条件」的那天开始生效，之前的老日子不倒扣 */
  function syncRuleState() {
    if (!ruleActive()) return;
    if (typeof state.ruleActiveFrom !== 'string') state.ruleActiveFrom = dayKey();
  }

  /** 结算过去的日子：重要任务没做够 → 那天算失败 */
  function judgePastDays() {
    if (!state.failedDays) state.failedDays = {};
    if (!ruleActive()) return false;
    const today = dayKey();
    const from = state.ruleActiveFrom || today;
    const min = importantMin();
    let changed = false;
    const days = new Set(allActivity().map((c) => c.day));
    days.forEach((d) => {
      if (d >= today || d < from) return;                // 只判昨天及以前
      if (state.failedDays[d] !== undefined) return;     // 已经判过了
      const done = state.completions.filter((c) =>
        c.day === d && c.type === 'daily' && c.level === 'important').length;
      state.failedDays[d] = done < min;
      changed = true;
    });
    return changed;
  }

  /** 今天已经不可能达标了吗？（重要任务全做完了还是不够） */
  function checkTodayRule() {
    if (!ruleActive() || todayFailed()) return false;
    const min = importantMin();
    const imp = importantTasks();
    const done = imp.filter((t) => t.done).length;
    const left = imp.filter((t) => !t.done).length;
    if (done < min && left === 0) {
      state.failedDays[dayKey()] = true;
      return true;
    }
    return false;
  }

  /** 给界面看的状态 */
  function importantStatus() {
    const total = importantTasks().length;
    const min = importantMin();
    const done = importantDoneToday();
    return {
      total: total, min: min, done: done,
      active: total >= min,
      ok: done >= min,
      failed: todayFailed(),
      left: Math.max(0, min - done)
    };
  }

  /* ---------- 备忘录提醒 ---------- */
  function parseDateTime(s) {
    if (!s) return 0;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
    if (!m) return 0;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  }

  function notifyUser(title, body) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: body, icon: 'icons/icon-192.png', tag: 'lifequest-memo' });
      }
    } catch (e) { /* 静默失败 */ }
  }

  /** 检查有没有到点的备忘，到了就提醒（应用打开时生效） */
  function checkMemos() {
    if (!Array.isArray(state.memos) || !state.memos.length) return 0;
    const now = Date.now();
    let fired = 0;
    state.memos.forEach((m) => {
      if (m.done || m.notified || !m.remindAt) return;
      const t = parseDateTime(m.remindAt);
      if (t && t <= now) {
        m.notified = true;
        m.notifiedAt = now;
        fired++;
        notifyUser('📝 备忘录提醒', m.text);
        setTimeout(() => toast('⏰ ' + m.text, 'gold'), 300 * fired);
      }
    });
    if (fired) { save(); renderAll(); }
    return fired;
  }

  /** 有没有逾期未完成的备忘（给底部标签加红点） */
  function hasDueMemo() {
    if (!Array.isArray(state.memos)) return false;
    const now = Date.now();
    return state.memos.some((m) => !m.done && m.remindAt && parseDateTime(m.remindAt) <= now);
  }

  /* ==========================================================
     5. 动作
     ========================================================== */

  function toast(msg, kind) {
    const root = $('#toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .35s, transform .35s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-8px)';
      setTimeout(() => el.remove(), 380);
    }, 1500);
  }

  /* --- 音效：用浏览器自带的声音合成，不需要音频文件 --- */
  let actx = null;
  function beep(freq, dur, when, vol) {
    if (!state.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = actx || new AC();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime + (when || 0);
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.09));
      osc.connect(gain); gain.connect(actx.destination);
      osc.start(t0); osc.stop(t0 + (dur || 0.09) + 0.02);
    } catch (e) { /* 静默失败即可 */ }
  }
  function sfxComplete() { beep(720, 0.08, 0); beep(1080, 0.10, 0.07); }
  function sfxLevelUp() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.16, i * 0.11, 0.07)); }

  /** 点「打卡」：数量没满就 +1，满了就结算奖励 */
  function tapTask(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t || t.done) return;

    if (t.target > 1 && t.progress + 1 < t.target) {
      t.progress += 1;
      sfxTick();
      save();
      renderAll();
      toast(t.progress + ' / ' + t.target + ' ' + t.unit, '');
      return;
    }
    completeTask(t);
  }
  function sfxTick() { beep(480, 0.05, 0, 0.035); }

  /** 一次记满（数量型任务的快捷方式） */
  function fillTask(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t || t.done) return;
    completeTask(t);
  }

  function completeTask(t) {
    t.progress = t.target;
    t.done = true;

    // 连击加成：连续打卡越久，同样的任务赚得越多
    const bonus = applyBonus(t.xp, t.coins);
    addXp(bonus.xp, 'task', t.name);
    addCoins(bonus.coins, 'task', t.name);

    state.completions.push({
      id: uid(), taskId: t.id, name: t.name, icon: t.icon, type: t.type,
      level: t.level || 'basic',
      xp: bonus.xp, coins: bonus.coins, baseXp: t.xp, mul: bonus.mul,
      day: dayKey(), ts: Date.now()
    });

    const lvUp = grantLevelRewards();
    state.player.bestStreak = Math.max(state.player.bestStreak || 0, computeBestStreak());
    const bonusMin = checkDailyBonus();
    const dayFailed = checkTodayRule();
    const newAch = checkAchievements();

    save();
    sfxComplete();
    toast('+' + bonus.xp + ' XP   🪙+' + bonus.coins + (bonus.mul > 1 ? '   ×' + bonus.mul : ''), 'good');

    if (dayFailed) {
      setTimeout(() => toast('⚠️ 重要任务没做够 ' + importantMin() + ' 个，今天判定失败：连胜和加成已中断', 'bad'), 400);
    }

    if (lvUp) {
      setTimeout(() => {
        levelUpFx(lvUp.level, lvUp.gain);
        sfxLevelUp();
      }, 260);
    }

    // 每日达标送娱乐时长
    if (bonusMin) {
      setTimeout(() => toast('🎉 今日任务达标！+' + bonusMin + ' 分钟娱乐时长', 'gold'), 900);
    }

    // 复选：新解锁的成就（每个送金币）
    newAch.forEach((a, i) => {
      setTimeout(() => toast('成就解锁：' + a.name + '  🪙+' + a.coin, 'gold'), 500 + i * 700);
    });

    // 今日全部完成的小彩蛋
    const daily = state.tasks.filter((x) => x.type === 'daily');
    if (daily.length > 0 && daily.every((x) => x.done)) {
      setTimeout(() => toast('今日任务全部通关！🎉', 'gold'), 400 + newAch.length * 700);
    }

    renderAll();
  }

  /** 撤销今天对某个任务的一次打卡 */
  function undoTask(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    const today = dayKey();
    let idx = -1;
    for (let i = state.completions.length - 1; i >= 0; i--) {
      const c = state.completions[i];
      if (c.taskId === id && c.day === today) { idx = i; break; }
    }
    if (idx < 0) { toast('今天没有这个任务的记录', 'bad'); return; }

    const c = state.completions[idx];
    state.completions.splice(idx, 1);
    addXp(-c.xp, 'undo', '撤销：' + c.name);
    addCoins(-c.coins, 'undo', '撤销：' + c.name);
    t.progress = Math.max(0, t.progress - 1);
    if (t.progress < t.target) t.done = false;

    // 等级回退后，已发的升级金币不收回（当作纪念）
    const lv = levelInfo(state.player.totalXp).level;
    if (lv < state.player.rewardedLevel) state.player.rewardedLevel = lv;

    save();
    renderAll();
    toast('已撤销：' + c.name, '');
  }

  /** 兑换奖励 */
  function buyReward(id) {
    const r = state.rewards.find((x) => x.id === id);
    if (!r) return;
    if (state.player.coins < r.cost) {
      toast('金币不够，还差 ' + (r.cost - state.player.coins) + ' 🪙', 'bad');
      return;
    }
    addCoins(-r.cost, 'reward', '兑换：' + r.name);
    if (r.minutes) addMinutes(r.minutes, 'reward', '兑换：' + r.name);
    r.bought = (r.bought || 0) + 1;
    state.purchases.push({ id: uid(), rewardId: r.id, name: r.name, cost: r.cost, minutes: r.minutes || 0, ts: Date.now() });
    save();
    beep(880, 0.1, 0); beep(1320, 0.12, 0.08);
    toast('兑换成功：' + r.name + (r.minutes ? '（+' + r.minutes + ' 分钟）' : '') + '（记得真的去享受它）', 'gold');
    renderAll();
  }

  /* ---------- 惩罚系统（v3 ①） ---------- */
  /** 记一次惩罚：扣经验、扣金币，并写入流水 */
  function applyPunish(id) {
    const p = state.punishments.find((x) => x.id === id);
    if (!p) return;
    const realXp = Math.min(state.player.totalXp, Math.max(0, p.xp | 0));
    const realCoins = Math.min(state.player.coins, Math.max(0, p.coins | 0));
    if (!realXp && !realCoins) { toast('没有可以扣的了', 'bad'); return; }
    if (!confirm('记一次惩罚：' + p.name + '\n\n扣 ' + realXp + ' 经验、' + realCoins + ' 金币。确定吗？')) return;

    if (realXp) addXp(-realXp, 'punish', p.name);
    if (realCoins) addCoins(-realCoins, 'punish', p.name);
    if (!Array.isArray(state.punishLog)) state.punishLog = [];
    state.punishLog.push({
      id: uid(), punishId: p.id, name: p.name, icon: p.icon,
      xp: realXp, coins: realCoins, ts: Date.now(), day: dayKey()
    });

    // 等级往下掉时，已发的升级金币不收回
    const lv = levelInfo(state.player.totalXp).level;
    if (lv < state.player.rewardedLevel) state.player.rewardedLevel = lv;

    save();
    beep(300, 0.12, 0); beep(220, 0.16, 0.1);
    toast('⚠️ ' + p.name + '　-' + realXp + ' XP　-🪙' + realCoins, 'bad');
    renderAll();
  }

  /* ---------- 娱乐时长兑换（v3 ③） ---------- */
  /** 换 N 分钟要花多少金币（比例可以在「我的」里改成 几金币换几分钟） */
  function costForMinutes(mins) {
    const c = state.settings.minuteCost || 2;
    const g = state.settings.minuteGain || 1;
    return Math.max(1, Math.round(mins * c / g));
  }

  function exchangeMinutes(mins) {
    mins = Math.max(0, Math.round(mins));
    if (!mins) { toast('请输入要兑换的分钟数', 'bad'); return; }
    const cost = costForMinutes(mins);
    if (state.player.coins < cost) {
      toast('金币不够：需要 ' + cost + ' 🪙，你有 ' + state.player.coins, 'bad');
      return;
    }
    addCoins(-cost, 'minute', '兑换 ' + mins + ' 分钟');
    addMinutes(mins, 'minute', '用金币兑换');
    save();
    beep(880, 0.1, 0); beep(1180, 0.12, 0.08);
    toast('兑换成功：+' + mins + ' 分钟娱乐时长（-🪙' + cost + '）', 'gold');
    renderAll();
  }

  /** 用掉时长（看剧 / 打游戏前先扣掉，这样它才真的能管住你） */
  function spendMinutes(mins) {
    mins = Math.max(0, Math.round(mins));
    if (!mins) { toast('请输入要用掉多少分钟', 'bad'); return; }
    const left = state.player.minutes || 0;
    if (left <= 0) { toast('时长是 0，先去打卡或兑换吧', 'bad'); return; }
    if (mins > left) { toast('只剩 ' + left + ' 分钟，不够用', 'bad'); return; }
    addMinutes(-mins, 'use', '用掉 ' + mins + ' 分钟');
    save();
    beep(660, 0.09, 0); beep(440, 0.13, 0.09);
    toast('已用掉 ' + mins + ' 分钟，还剩 ' + (left - mins) + ' 分钟', 'gold');
    renderAll();
  }

  /** 今天已经用掉多少分钟 */
  function minutesUsedToday() {
    const today = dayKey();
    return (state.ledger || [])
      .filter((e) => e.kind === 'min' && e.cat === 'use' && e.day === today)
      .reduce((a, e) => a + Math.abs(e.delta), 0);
  }

  /* ==========================================================
     6. 界面渲染
     ========================================================== */
  const ui = {
    tab: 'tasks',
    filter: 'daily',
    shopSeg: 'reward',      // 奖励页：reward | punish
    logSeg: 'stats',        // 记录页：stats | diary | ledger
    diaryDay: dayKey(),
    ledgerFilter: 'all',    // all | xp | coin | min
    editMemoId: null
  };

  function renderAll() {
    renderPlayer();
    renderTasks();
    renderFocus();
    renderShop();
    renderLog();
    renderMemo();
    renderMe();
    const due = hasDueMemo();
    $$('.tab').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === ui.tab);
      if (b.dataset.tab === 'memo') b.classList.toggle('has-due', due);
    });
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + ui.tab));
  }

  function renderPlayer() {
    const s = getStats();
    const pct = Math.min(100, Math.round((s.xp / s.need) * 100));
    const tt = s.title;
    $('#player').innerHTML =
      '<div class="pc-row">' +
        '<div class="avatar">' + esc(state.player.avatar || '🧙') + '</div>' +
        '<div class="pc-main">' +
          '<div class="pc-top">' +
            '<span class="pc-lv">Lv.' + s.level + '</span>' +
            '<span class="pc-title" style="color:' + tt.color + '">' + esc(tt.name) + '</span>' +
            '<span class="pc-name">' + esc(state.player.name || '冒险者') + '</span>' +
          '</div>' +
          '<div class="xpbar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="pc-sub">' + s.xp + ' / ' + s.need + ' XP' +
            (s.streakFailed
              ? '　·　<span style="color:var(--danger);font-weight:700">🔥 连击已中断</span>'
              : (s.mul > 1 ? '　·　<span style="color:var(--gold);font-weight:700">🔥 连击 ×' + s.mul + '</span>' : '')) +
          '</div>' +
        '</div>' +
        '<div class="pc-side">' +
          '<span class="chip gold">🪙 ' + s.coins + '</span>' +
          '<span class="chip min">⏳ ' + s.minutes + '</span>' +
          '<span class="chip fire' + (s.streakFailed ? ' dead' : '') + '">🔥 ' +
            (s.streakFailed ? '中断' : s.streak + ' 天') + '</span>' +
        '</div>' +
      '</div>';
  }

  /* ---------- 任务页 ---------- */
  function renderTasks() {
    const s = getStats();
    const list = state.tasks.filter((t) => t.type === ui.filter);

    const segs = [['daily', '每日'], ['weekly', '每周'], ['boss', 'BOSS']]
      .map(([k, label]) => {
        const n = state.tasks.filter((t) => t.type === k && !t.done).length;
        return '<button data-action="filter" data-filter="' + k + '" class="' + (ui.filter === k ? 'on' : '') + '">' +
          label + (n ? ' ' + n : '') + '</button>';
      }).join('');

    const dailyPct = s.dailyTotal ? Math.round((s.dailyDoneToday / s.dailyTotal) * 100) : 0;

    let html = '';
    html += '<div class="today">' +
              '<span class="tl">今日</span>' +
              '<div class="tbar"><i style="width:' + dailyPct + '%"></i></div>' +
              '<span class="tv">' + s.dailyDoneToday + '/' + s.dailyTotal + '</span>' +
            '</div>';

    // 「重要任务」进度条：只有每日任务页才显示
    if (ui.filter === 'daily') {
      const imp = importantStatus();
      if (imp.failed) {
        html += '<div class="imp-bar dead">⛔ 今天已判定失败：重要任务只完成 ' + imp.done + '/' + imp.min +
                ' · 连胜和连击加成已中断</div>';
      } else if (!imp.active) {
        if (imp.total > 0) {
          html += '<div class="imp-bar off">⭐ 重要任务 ' + imp.total + ' 个 · 规则未生效（重要任务要有 ' +
                  imp.min + ' 个以上才启用「必须完成」）</div>';
        }
      } else if (imp.ok) {
        html += '<div class="imp-bar ok">⭐ 重要任务 ' + imp.done + '/' + imp.min + ' · 今日过关 ✓</div>';
      } else {
        html += '<div class="imp-bar warn">⭐ 重要任务 ' + imp.done + '/' + imp.min +
                ' · 还差 ' + imp.left + ' 个，做不到今天就算失败</div>';
      }
    }

    html += '<div class="seg">' + segs + '</div>';

    if (!list.length) {
      html += '<div class="empty" style="margin-top:12px">' +
        '<span class="big">📜</span>还没有' + TYPE_LABEL[ui.filter] + '任务<br>点下面的按钮创建第一个' +
        '</div>';
    } else {
      html += '<div style="margin-top:10px">' + list.map((t) => taskCard(t)).join('') + '</div>';
    }

    html += '<button class="add-btn" data-action="new-task">＋ 新建' + TYPE_LABEL[ui.filter] + '任务</button>';
    $('#view-tasks').innerHTML = html;
  }

  function taskCard(t) {
    const pct = Math.min(100, Math.round((t.progress / Math.max(1, t.target)) * 100));
    const bonus = applyBonus(t.xp, t.coins);          // 算上连击加成后的实际收益
    const meta = [];
    meta.push('<span class="g">+' + bonus.xp + ' XP</span>');
    meta.push('<span>🪙 +' + bonus.coins + '</span>');
    if (bonus.mul > 1) meta.push('<span class="tag-mul">×' + bonus.mul + '</span>');
    if (t.type === 'daily') {
      meta.push(t.level === 'important'
        ? '<span class="tag-imp">⭐ 重要</span>'
        : '<span class="tag-basic">基本</span>');
    }
    meta.push('<span>' + TYPE_LABEL[t.type] + ' · ' + (DIFFS[t.diff] || DIFFS.normal).label + '</span>');
    if (t.type === 'boss') {
      const dt = dueText(t);
      if (dt) meta.push('<span style="color:' + (dt.over ? 'var(--danger)' : 'var(--gold)') + '">' + dt.text + '</span>');
    }

    const mini = [];
    if (t.done) {
      mini.push('<button data-action="undo" data-id="' + t.id + '">撤销</button>');
    } else if (t.target > 1) {
      mini.push('<button data-action="fill" data-id="' + t.id + '">记满</button>');
    }
    mini.push('<button data-action="edit" data-id="' + t.id + '">改</button>');

    return '<div class="task ' + (t.done ? 'done' : '') + ' ' + (t.type === 'boss' ? 'boss' : '') + '">' +
      '<div class="t-icon">' + esc(t.icon) + '</div>' +
      '<div class="t-body">' +
        '<div class="t-name">' + esc(t.name) + '</div>' +
        '<div class="t-meta">' + meta.join('') + '</div>' +
        (t.target > 1
          ? '<div class="t-prog"><i style="width:' + pct + '%"></i></div>' +
            '<div class="t-meta" style="margin-top:5px"><span>' + t.progress + ' / ' + t.target + ' ' + esc(t.unit) + '</span></div>'
          : '') +
      '</div>' +
      '<div class="t-actions">' +
        '<button class="btn-check" data-action="tap" data-id="' + t.id + '"' + (t.done ? ' disabled' : '') + '>' +
          (t.done ? '已完成' : (t.target > 1 ? '+1' : '打卡')) +
        '</button>' +
        '<div class="mini">' + mini.join('') + '</div>' +
      '</div>' +
    '</div>';
  }

  function dueText(t) {
    if (!t.due) return null;
    const today = parseDayKey(dayKey());
    const due = parseDayKey(t.due);
    const left = Math.round((due - today) / 86400000);
    if (t.done) return { text: '已击败', over: false };
    if (left > 1) return { text: '剩余 ' + left + ' 天', over: false };
    if (left === 1) return { text: '明天截止', over: false };
    if (left === 0) return { text: '今天截止', over: false };
    return { text: '已逾期 ' + (-left) + ' 天', over: true };
  }

  /* ---------- 专注计时（番茄钟） ---------- */
  const focusTimer = { total: 0, endsAt: 0, remain: 0, running: false, active: false, iv: null, minutes: 25 };
  const RING_R = 92, RING_C = 2 * Math.PI * RING_R;

  function renderFocus() {
    const s = getStats();
    const ft = focusTimer;
    const total = ft.active ? ft.total : ft.minutes * 60000;
    const remain = ft.running ? Math.max(0, ft.endsAt - Date.now()) : (ft.active ? ft.remain : total);
    const pct = total ? Math.max(0, Math.min(1, 1 - remain / total)) : 0;
    const mm = Math.floor(remain / 60000), ss = Math.floor((remain % 60000) / 1000);
    const dash = (RING_C * pct).toFixed(1);

    const presets = FOCUS_PRESETS.map((m) =>
      '<button data-action="focus-set" data-v="' + m + '" class="' + (ft.minutes === m ? 'on' : '') + '"' +
        (ft.active ? ' disabled' : '') + '>' + m + ' 分</button>').join('');

    let actions = '';
    if (!ft.active) {
      actions = '<button class="btn primary" data-action="focus-start">开始专注 ' + ft.minutes + ' 分钟</button>';
    } else if (ft.running) {
      actions = '<button class="btn" data-action="focus-pause">暂停</button>' +
                '<button class="btn danger" data-action="focus-cancel">放弃</button>';
    } else {
      actions = '<button class="btn primary" data-action="focus-resume">继续</button>' +
                '<button class="btn danger" data-action="focus-cancel">放弃</button>';
    }

    const html =
      '<div class="sec-title"><span>专注计时</span><span class="hint">🍅 ' + s.focusCount + ' 次 · ' + s.focusMinutes + ' 分钟</span></div>' +
      '<div class="focus-card">' +
        '<div class="ring-wrap">' +
          '<svg viewBox="0 0 200 200" class="ring">' +
            '<circle cx="100" cy="100" r="' + RING_R + '" class="ring-bg"/>' +
            '<circle cx="100" cy="100" r="' + RING_R + '" class="ring-fg" id="focus-ring"' +
              ' stroke-dasharray="' + RING_C.toFixed(1) + '" stroke-dashoffset="' + (RING_C - dash) + '"/>' +
          '</svg>' +
          '<div class="ring-center">' +
            '<div class="focus-time" id="focus-time">' + pad2(mm) + ':' + pad2(ss) + '</div>' +
            '<div class="focus-sub" id="focus-sub">' + (ft.active ? (ft.running ? '专注中…' : '已暂停') : '准备开始') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="seg focus-presets">' + presets + '</div>' +
        '<div class="focus-actions">' + actions + '</div>' +
      '</div>' +
      '<div class="focus-cfg">每分钟奖励：' +
        '<input class="input tiny" type="number" min="0" step="0.1" data-field="set.focusXpPerMin" value="' + state.settings.focusXpPerMin + '"> XP' +
        ' ＋ <input class="input tiny" type="number" min="0" step="0.1" data-field="set.focusCoinPerMin" value="' + state.settings.focusCoinPerMin + '"> 金币' +
      '</div>' +
      '<p class="focus-tip">25 分钟 ≈ <b>' + Math.round(25 * state.settings.focusXpPerMin * s.mul) + ' XP</b> + <b>' +
        Math.round(25 * state.settings.focusCoinPerMin * s.mul) + ' 金币</b>' +
        (s.mul > 1 ? '（含连击 ×' + s.mul + '）' : '') + '<br>' +
      '手机上切到别的 App 也没关系，回来后按真实时间结算。</p>' +
      '<button class="add-btn" data-action="focus-demo">🍅 立即结算一次（测试用，25 分钟）</button>';

    $('#view-focus').innerHTML = html;
  }

  function paintFocus(left) {
    const timeEl = $('#focus-time');
    if (!timeEl) return;
    const ft = focusTimer;
    const total = ft.total || 1;
    const pct = Math.max(0, Math.min(1, 1 - left / total));
    const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
    timeEl.textContent = pad2(mm) + ':' + pad2(ss);
    const ring = $('#focus-ring');
    if (ring) ring.setAttribute('stroke-dashoffset', (RING_C - RING_C * pct).toFixed(1));
    const sub = $('#focus-sub');
    if (sub) sub.textContent = ft.running ? '专注中…' : '已暂停';
  }

  function tickFocus() {
    if (!focusTimer.running) return;
    const left = focusTimer.endsAt - Date.now();
    if (left <= 0) { finishFocus(); return; }
    paintFocus(left);
  }

  function startFocus(min) {
    if (min) focusTimer.minutes = min;
    focusTimer.total = focusTimer.minutes * 60000;
    focusTimer.endsAt = Date.now() + focusTimer.total;
    focusTimer.remain = focusTimer.total;
    focusTimer.running = true;
    focusTimer.active = true;
    if (focusTimer.iv) clearInterval(focusTimer.iv);
    focusTimer.iv = setInterval(tickFocus, 500);
    sfxTick();
    renderFocus();
  }

  function pauseFocus() {
    focusTimer.remain = Math.max(0, focusTimer.endsAt - Date.now());
    focusTimer.running = false;
    if (focusTimer.iv) { clearInterval(focusTimer.iv); focusTimer.iv = null; }
    renderFocus();
  }

  function resumeFocus() {
    focusTimer.endsAt = Date.now() + focusTimer.remain;
    focusTimer.running = true;
    if (focusTimer.iv) clearInterval(focusTimer.iv);
    focusTimer.iv = setInterval(tickFocus, 500);
    renderFocus();
  }

  function cancelFocus() {
    if (!confirm('放弃这次专注？本次不会有任何奖励。')) return;
    focusTimer.running = false;
    focusTimer.active = false;
    if (focusTimer.iv) { clearInterval(focusTimer.iv); focusTimer.iv = null; }
    focusTimer.total = 0; focusTimer.remain = 0;
    renderFocus();
    toast('已放弃', '');
  }

  /** 专注结束：结算经验金币 */
  function finishFocus() {
    const mins = Math.max(1, Math.round(focusTimer.total / 60000));
    focusTimer.running = false;
    focusTimer.active = false;
    if (focusTimer.iv) { clearInterval(focusTimer.iv); focusTimer.iv = null; }
    focusTimer.total = 0; focusTimer.remain = 0;

    // 每分钟奖励可以在「专注」页自定义（存在 settings 里）
    const bonus = applyBonus(mins * state.settings.focusXpPerMin, mins * state.settings.focusCoinPerMin);
    addXp(bonus.xp, 'focus', '专注 ' + mins + ' 分钟');
    addCoins(bonus.coins, 'focus', '专注 ' + mins + ' 分钟');
    state.focus.push({
      id: uid(), taskId: 'focus', name: '专注 ' + mins + ' 分钟', icon: '🍅', type: 'focus',
      minutes: mins, xp: bonus.xp, coins: bonus.coins, mul: bonus.mul, day: dayKey(), ts: Date.now()
    });

    const lvUp = grantLevelRewards();
    state.player.bestStreak = Math.max(state.player.bestStreak || 0, computeBestStreak());
    const newAch = checkAchievements();
    save();

    sfxFocusDone();
    toast('专注完成！+' + bonus.xp + ' XP   🪙+' + bonus.coins, 'good');
    if (lvUp) setTimeout(() => { levelUpFx(lvUp.level, lvUp.gain); sfxLevelUp(); }, 300);
    newAch.forEach((a, i) => setTimeout(() => toast('成就解锁：' + a.name + '  🪙+' + a.coin, 'gold'), 600 + i * 700));
    renderAll();
  }

  function sfxFocusDone() { [660, 880, 660, 880, 1320].forEach((f, i) => beep(f, 0.14, i * 0.13, 0.07)); }

  /* ---------- 奖励页（奖励 / 惩罚 / 娱乐时长） ---------- */
  function renderShop() {
    const coins = state.player.coins;
    const minutes = state.player.minutes || 0;
    const st = state.settings;
    const usedToday = minutesUsedToday();

    // ⏳ 娱乐时长卡片（v3 ③ + 用掉时长）
    let html = '<div class="dash-card">' +
      '<div class="dash-title">⏳ 娱乐时长（累积制，不清零）</div>' +
      '<div class="dash-num">' + minutes + '<span>分钟</span></div>' +
      '<div class="dash-sub">兑换比例：' + st.minuteCost + ' 金币 = ' + st.minuteGain + ' 分钟　·　今日已用 ' + usedToday + ' 分钟</div>' +
      '<div class="exchange-row">' +
        '<input class="input" id="min-input" type="number" min="1" max="1440" inputmode="numeric" value="30">' +
        '<button class="btn-min" data-action="exchange-min">兑换</button>' +
        '<button class="btn-use" data-action="spend-min">用掉</button>' +
      '</div>' +
      '<div class="dash-hint" id="min-hint">' + minHintText(30) + '</div>' +
      '<div class="quick-row">' + [15, 30, 60, 120].map((m) =>
        '<button data-action="min-quick" data-v="' + m + '">' + m + ' 分</button>').join('') + '</div>' +
    '</div>';

    // 奖励 / 惩罚 切换
    html += '<div class="seg">' +
      '<button data-action="shop-seg" data-v="reward" class="' + (ui.shopSeg === 'reward' ? 'on' : '') + '">奖励</button>' +
      '<button data-action="shop-seg" data-v="punish" class="' + (ui.shopSeg === 'punish' ? 'on' : '') + '">惩罚</button>' +
    '</div>';

    html += (ui.shopSeg === 'punish') ? renderPunishList() : renderRewardList();

    $('#view-shop').innerHTML = html;
  }

  /** 兑换行下面的实时提示 */
  function minHintText(mins) {
    const left = state.player.minutes || 0;
    if (!mins) return '当前剩余 <b>' + left + '</b> 分钟';
    const cost = costForMinutes(mins);
    return '兑换 ' + mins + ' 分钟需要 <b style="color:var(--gold)">' + cost + ' 🪙</b>　·　当前剩余 <b>' + left + '</b> 分钟';
  }

  function renderRewardList() {
    const coins = state.player.coins;
    let html = '<div class="sec-title"><span>可兑换奖励</span><span class="hint">🪙 我的金币：<b style="color:var(--gold)">' + coins + '</b></span></div>';
    html += '<p style="margin:-2px 0 12px;font-size:12.5px;color:var(--text-dim)">打卡赚金币，用金币兑换真实的快乐。奖励越贵，越值得期待。</p>';

    if (!state.rewards.length) {
      html += '<div class="empty"><span class="big">🎁</span>还没有上架任何奖励</div>';
    } else {
      const sorted = state.rewards.slice().sort((a, b) => a.cost - b.cost);
      html += sorted.map((r) => {
        const can = coins >= r.cost;
        return '<div class="reward" data-action="edit-reward" data-id="' + r.id + '">' +
          '<div class="t-icon">' + esc(r.icon) + '</div>' +
          '<div class="t-body">' +
            '<div class="t-name">' + esc(r.name) + '</div>' +
            '<div class="t-meta"><span>🪙 ' + r.cost + '</span>' +
              (r.minutes ? '<span>⏳ +' + r.minutes + ' 分</span>' : '') +
              (r.bought ? '<span>已兑换 ' + r.bought + ' 次</span>' : '') + '</div>' +
          '</div>' +
          '<button class="btn-buy" data-action="buy" data-id="' + r.id + '"' + (can ? '' : ' disabled') + '>' + (can ? '兑换' : '差 ' + (r.cost - coins)) + '</button>' +
        '</div>';
      }).join('');
    }
    html += '<button class="add-btn" data-action="new-reward">＋ 上架新奖励</button>';

    if (state.purchases.length) {
      const recent = state.purchases.slice(-5).reverse();
      html += '<div class="sec-title"><span>最近兑换</span></div><div class="loglist">' +
        recent.map((p) => '<div class="logrow"><span>' + esc(p.name) + '</span>' +
          '<span class="lt" style="margin-left:auto">' + fmtTime(p.ts) + '</span>' +
          '<span class="lx">-🪙' + p.cost + '</span></div>').join('') + '</div>';
    }
    return html;
  }

  /* 惩罚清单（v3 ①） */
  function renderPunishList() {
    const s = getStats();
    let html = '<div class="sec-title"><span>惩罚清单</span><span class="hint">累计记了 ' + s.punishCount + ' 次</span></div>';
    html += '<p style="margin:-2px 0 12px;font-size:12.5px;color:var(--text-dim)">破戒了点「记一次」，会扣经验和金币。数值自己定，改一次就生效。</p>';

    if (!state.punishments.length) {
      html += '<div class="empty"><span class="big">⚠️</span>还没有设置惩罚项</div>';
    } else {
      html += state.punishments.map((p) =>
        '<div class="reward punish-row" data-action="edit-punish" data-id="' + p.id + '">' +
          '<div class="t-icon">' + esc(p.icon) + '</div>' +
          '<div class="t-body">' +
            '<div class="t-name">' + esc(p.name) + '</div>' +
            '<div class="t-meta"><span style="color:#ff9c9c">-' + p.xp + ' XP</span>' +
              '<span style="color:#ff9c9c">-🪙' + p.coins + '</span></div>' +
          '</div>' +
          '<button class="btn-punish" data-action="punish" data-id="' + p.id + '">记一次</button>' +
        '</div>').join('');
    }
    html += '<button class="add-btn" data-action="new-punish">＋ 新建惩罚项</button>';

    // 最近惩罚记录
    const recent = (state.punishLog || []).slice(-6).reverse();
    if (recent.length) {
      html += '<div class="sec-title"><span>最近被罚</span></div><div class="loglist">' +
        recent.map((e) => '<div class="logrow">' +
          '<span>' + esc(e.icon || '⚠️') + '</span><span class="ln">' + esc(e.name) + '</span>' +
          '<span class="lt">' + e.day.slice(5) + ' ' + fmtTime(e.ts) + '</span>' +
          '<span class="lx" style="color:var(--danger)">-' + e.xp + ' XP / -' + e.coins + ' 🪙</span></div>').join('') + '</div>';
    }
    return html;
  }

  /* 惩罚弹窗 */
  function openPunishModal(id) {
    const p = id ? state.punishments.find((x) => x.id === id) : null;
    draftKind = 'punish';
    draft = p ? JSON.parse(JSON.stringify(p))
              : { id: null, name: '', icon: '⚠️', xp: 20, coins: 10 };
    renderPunishModal();
  }

  function renderPunishModal() {
    const d = draft;
    const emojis = ['⚠️', '🌙', '📱', '😵', '🍟', '🎮', '💸', '🕳️', '🚬', '🍺', '😤', '🐷']
      .map((e) => '<button data-action="draft-icon" data-v="' + e + '" class="' + (d.icon === e ? 'on' : '') + '">' + e + '</button>').join('');

    const html =
      '<div class="modal-mask" data-action="mask">' +
        '<div class="modal">' +
          '<h3>' + (d.id ? '编辑惩罚项' : '新建惩罚项') + '</h3>' +
          '<p class="sub">做错了什么，就扣多少 —— 数字自己定</p>' +
          '<div class="field"><label>惩罚事件（做错了什么）</label>' +
            '<input class="input" data-field="name" maxlength="30" placeholder="例如：熬夜超过 12 点" value="' + esc(d.name) + '"></div>' +
          '<div class="field"><label>图标</label><div class="emoji-row">' + emojis + '</div></div>' +
          '<div class="field-row">' +
            '<div class="field" style="flex:1"><label>扣多少经验</label>' +
              '<input class="input" type="number" min="0" max="99999" inputmode="numeric" data-field="xp" value="' + d.xp + '"></div>' +
            '<div class="field" style="flex:1"><label>扣多少金币</label>' +
              '<input class="input" type="number" min="0" max="99999" inputmode="numeric" data-field="coins" value="' + d.coins + '"></div>' +
          '</div>' +
          '<div class="modal-actions">' +
            (d.id ? '<button class="btn danger" data-action="delete-punish" data-id="' + d.id + '">删除</button>' : '') +
            '<button class="btn ghost" data-action="close-modal">取消</button>' +
            '<button class="btn primary" data-action="save-punish">保存</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    $('#modal-root').innerHTML = html;
  }

  function savePunish() {
    const d = draft;
    const name = (d.name || '').trim();
    if (!name) { toast('写一下是什么惩罚事件', 'bad'); return; }
    const xp = clampInt(d.xp, 0, 99999, 0);
    const coins = clampInt(d.coins, 0, 99999, 0);
    if (!xp && !coins) { toast('至少扣点经验或金币吧', 'bad'); return; }

    if (d.id) {
      const p = state.punishments.find((x) => x.id === d.id);
      p.name = name; p.icon = d.icon; p.xp = xp; p.coins = coins;
    } else {
      state.punishments.push({ id: uid(), name: name, icon: d.icon, xp: xp, coins: coins });
    }
    save(); closeModal(); renderAll();
    toast('已保存', 'good');
  }

  function deletePunish(id) {
    const p = state.punishments.find((x) => x.id === id);
    if (!p) return;
    if (!confirm('删除惩罚项「' + p.name + '」？')) return;
    state.punishments = state.punishments.filter((x) => x.id !== id);
    save(); closeModal(); renderAll();
    toast('已删除', '');
  }

  /* ---------- 记录页（战绩 / 日记 / 流水） ---------- */
  function renderLog() {
    let html = '<div class="seg">' +
      '<button data-action="log-seg" data-v="stats" class="' + (ui.logSeg === 'stats' ? 'on' : '') + '">战绩</button>' +
      '<button data-action="log-seg" data-v="diary" class="' + (ui.logSeg === 'diary' ? 'on' : '') + '">日记</button>' +
      '<button data-action="log-seg" data-v="ledger" class="' + (ui.logSeg === 'ledger' ? 'on' : '') + '">流水</button>' +
    '</div>';

    if (ui.logSeg === 'diary') html += logDiary();
    else if (ui.logSeg === 'ledger') html += logLedger();
    else html += logStats();

    $('#view-log').innerHTML = html;
  }

  function logStats() {
    const s = getStats();

    let html = '<div class="sec-title"><span>本周</span><span class="hint">完成 ' + s.weekDone + ' 次 · ' + s.weekXp + ' XP</span></div>';
    html += weekChart(s.weekBars);

    html += '<div class="sec-title"><span>我的战绩</span></div>';
    html += '<div class="stat-grid">' +
      statCard(s.totalDone, '累计完成') +
      statCard(s.streak, '连续天数') +
      statCard(s.bestStreak, '最长连续') +
      statCard(s.activeDays, '活跃天数') +
      statCard(s.totalXp, '累计经验') +
      statCard(s.bossDone, '击败 BOSS') +
      statCard(s.focusCount, '专注次数') +
      statCard(s.focusMinutes, '专注分钟') +
      statCard(s.perfectDays, '完美天') +
    '</div>';

    html += '<div class="sec-title"><span>最近 12 周</span><span class="hint">颜色越亮 = 那天完成得越多</span></div>';
    html += '<div class="heat-wrap">' + heatmap() + '</div>';

    const unlocked = ACHIEVEMENTS.filter((a) => a.test(s));
    html += '<div class="sec-title"><span>成就墙</span><span class="hint">' + unlocked.length + ' / ' + ACHIEVEMENTS.length +
            ' · 解锁送金币</span></div>';
    html += '<div class="badge-grid">' + ACHIEVEMENTS.map((a) => {
      const on = a.test(s);
      return '<div class="badge ' + (on ? 'on' : '') + '">' +
        '<div class="bi">' + a.icon + '</div>' +
        '<div><div class="bn">' + a.name + '</div>' +
        '<div class="bd">' + a.desc + ' · 🪙' + a.coin + '</div></div>' +
      '</div>';
    }).join('') + '</div>';

    const recent = allActivity().slice().sort((a, b) => b.ts - a.ts).slice(0, 20);
    html += '<div class="sec-title"><span>最近打卡</span></div>';
    if (!recent.length) {
      html += '<div class="empty"><span class="big">🗒️</span>还没有打卡记录，去任务页开始吧</div>';
    } else {
      html += '<div class="loglist">' + recent.map((c) =>
        '<div class="logrow">' +
          '<span>' + esc(c.icon || (c.minutes ? '🍅' : '✅')) + '</span>' +
          '<span class="ln">' + esc(c.name || ('专注 ' + c.minutes + ' 分钟')) + '</span>' +
          '<span class="lt">' + c.day.slice(5) + ' ' + fmtTime(c.ts) + '</span>' +
          '<span class="lx">+' + c.xp + '</span>' +
        '</div>').join('') + '</div>';
    }
    return html;
  }

  /* ---------- 每日记录 + 日记（v3 ②） ---------- */
  /** 某一天的收支汇总 */
  function daySummary(day) {
    const cs = state.completions.filter((c) => c.day === day);
    const fs = (state.focus || []).filter((c) => c.day === day);
    const led = (state.ledger || []).filter((e) => e.day === day);
    const sum = (kind, cat, positive) => led.filter((e) =>
      e.kind === kind && (!cat || e.cat === cat) && (positive ? e.delta > 0 : e.delta < 0)
    ).reduce((a, e) => a + Math.abs(e.delta), 0);

    return {
      tasks: cs.length,
      focusCount: fs.length,
      focusMin: fs.reduce((a, c) => a + (c.minutes || 0), 0),
      xpIn: sum('xp', null, true), xpOut: sum('xp', null, false),
      coinIn: sum('coin', null, true),
      coinOut: sum('coin', null, false),
      coinReward: sum('coin', 'reward', false),
      coinPunish: sum('coin', 'punish', false),
      coinMinute: sum('coin', 'minute', false),
      minIn: sum('min', null, true), minOut: sum('min', null, false)
    };
  }

  function daySummaryHtml(day, sum) {
    return '<div class="day-sum">' +
      '完成任务 <b>' + sum.tasks + '</b> 个　·　专注 <b>' + sum.focusCount + '</b> 次（' + sum.focusMin + ' 分钟）<br>' +
      '经验 <span class="in">+' + sum.xpIn + '</span>　<span class="out">-' + sum.xpOut + '</span><br>' +
      '金币收入 <span class="in">+' + sum.coinIn + '</span>　支出 <span class="out">-' + sum.coinOut + '</span>' +
        '（奖励 ' + sum.coinReward + ' / 惩罚 ' + sum.coinPunish + ' / 时长 ' + sum.coinMinute + '）<br>' +
      '娱乐时长 <span class="in">+' + sum.minIn + '</span>　<span class="out">-' + sum.minOut + '</span>' +
    '</div>';
  }

  function logDiary() {
    const day = ui.diaryDay;
    const d = state.diary.find((x) => x.day === day) || { mood: '', text: '' };
    const sum = daySummary(day);
    const today = dayKey();

    let html = '<div class="cal-nav">' +
      '<button data-action="diary-prev">‹ 前一天</button>' +
      '<span class="cal-date">' + (day === today ? '今天 ' : '') + day + '</span>' +
      '<button data-action="diary-next">后一天 ›</button>' +
    '</div>';

    html += daySummaryHtml(day, sum);

    html += '<div class="sec-title"><span>心情</span><span class="hint" id="diary-hint"></span></div>' +
      '<div class="mood-row">' + MOODS.map((m) =>
        '<button data-action="diary-mood" data-v="' + m + '" class="' + (d.mood === m ? 'on' : '') + '">' + m + '</button>').join('') +
      '</div>';

    html += '<div class="field"><label>今天怎么样？</label>' +
      '<textarea class="input" data-field="diary-text" maxlength="2000" placeholder="今天做了什么、有什么感受、明天想怎么调整…">' + esc(d.text || '') + '</textarea></div>';
    html += '<button class="btn primary" data-action="save-diary" style="width:100%">' + (d.text ? '保存日记' : '写下第一篇') + '</button>';

    // 最近写过的日记
    const list = state.diary.slice().sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 10);
    if (list.length) {
      html += '<div class="sec-title"><span>最近日记</span></div>' + list.map((x) =>
        '<div class="diary-item" data-action="diary-jump" data-v="' + x.day + '">' +
          '<div class="dh"><span class="dm">' + (x.mood || '📝') + '</span>' +
            '<span class="dt">' + x.day + ' · ' + x.text.length + ' 字</span></div>' +
          '<div class="dx">' + esc(x.text.slice(0, 80)) + (x.text.length > 80 ? '…' : '') + '</div>' +
        '</div>').join('');
    }
    return html;
  }

  /** 写/改某天的日记（空内容就删掉这条） */
  function upsertDiary(day, patch) {
    let d = state.diary.find((x) => x.day === day);
    if (!d) {
      d = { day: day, mood: '', text: '', ts: Date.now() };
      state.diary.push(d);
    }
    Object.assign(d, patch, { ts: Date.now() });
    const empty = !(d.text || '').trim() && !d.mood;
    if (empty) state.diary = state.diary.filter((x) => x.day !== day);
    save();
    return d;
  }

  /* ---------- 经验 / 金币 / 时长 流水（v3 ⑤） ---------- */
  function logLedger() {
    const f = ui.ledgerFilter;
    const list = (state.ledger || [])
      .filter((e) => f === 'all' || e.kind === f)
      .slice(-100).reverse();

    let html = '<div class="filter-row">' +
      [['all', '全部'], ['xp', '经验'], ['coin', '金币'], ['min', '时长']].map(([k, l]) =>
        '<button data-action="ledger-filter" data-v="' + k + '" class="' + (ui.ledgerFilter === k ? 'on' : '') + '">' + l + '</button>').join('') +
    '</div>';
    html += '<p style="margin:-2px 0 8px;font-size:11.5px;color:var(--text-dim)">显示最近 100 条增减记录（新的在上面）</p>';

    if (!list.length) {
      html += '<div class="empty"><span class="big">🧾</span>还没有记录，去打个卡吧</div>';
    } else {
      html += list.map(ledRow).join('');
    }
    return html;
  }

  function ledRow(e) {
    const cat = LEDGER_CAT[e.cat] || { icon: '•', label: '记录' };
    const up = e.delta > 0;
    const unit = e.kind === 'xp' ? ' XP' : e.kind === 'coin' ? ' 🪙' : ' 分钟';
    return '<div class="led-row">' +
      '<span class="led-ico">' + cat.icon + '</span>' +
      '<div class="led-main">' +
        '<div class="led-reason">' + esc(e.reason || cat.label) + '</div>' +
        '<div class="led-cat">' + cat.label + ' · ' + e.day.slice(5) + ' ' + fmtTime(e.ts) + '</div>' +
      '</div>' +
      '<div class="led-right"><div class="led-delta ' + (up ? 'up' : 'down') + '">' +
        (up ? '+' : '') + e.delta + unit + '</div></div>' +
    '</div>';
  }

  /** 一周 7 根柱子 */
  function weekChart(bars) {
    const max = Math.max(1, Math.max.apply(null, bars.map((b) => b.count)));
    const names = ['一', '二', '三', '四', '五', '六', '日'];
    return '<div class="chart">' + bars.map((b, i) => {
      const h = b.count ? Math.max(8, Math.round((b.count / max) * 100)) : 0;
      return '<div class="bar-col">' +
        '<div class="bar-num">' + (b.count || '') + '</div>' +
        '<div class="bar-track"><i class="' + (b.isToday ? 'today' : '') + '" style="height:' + h + '%"></i></div>' +
        '<div class="bar-day">' + names[i] + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function statCard(v, k) {
    return '<div class="stat-card"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>';
  }

  function heatmap() {
    const WEEKS = 12;
    const counts = {};
    allActivity().forEach((c) => { counts[c.day] = (counts[c.day] || 0) + 1; });

    const today = new Date();
    const thisMonday = addDays(today, -((today.getDay() + 6) % 7));
    const start = addDays(thisMonday, -7 * (WEEKS - 1));

    let cols = '';
    for (let w = 0; w < WEEKS; w++) {
      let col = '';
      for (let d = 0; d < 7; d++) {
        const day = addDays(start, w * 7 + d);
        const key = dayKey(day);
        const n = counts[key] || 0;
        const lv = n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4;
        const future = day > today;
        col += '<i data-l="' + (future ? 0 : lv) + '" title="' + key + '：' + n + ' 次"' +
               (future ? ' style="opacity:.25"' : '') + '></i>';
      }
      cols += '<div class="hcol">' + col + '</div>';
    }
    return '<div class="heat">' + cols + '</div>';
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* ---------- 我的 ---------- */
  function renderMe() {
    const s = getStats();
    const st = state.settings;
    let html = '<div class="sec-title"><span>角色</span></div>';

    html += '<div class="field"><label>名字</label>' +
      '<input class="input" data-field="player-name" maxlength="16" value="' + esc(state.player.name || '冒险者') + '" placeholder="给自己起个名字"></div>';

    html += '<div class="field"><label>形象</label><div class="emoji-row">' +
      AVATARS.map((a) => '<button data-action="set-avatar" data-v="' + a + '" class="' + (state.player.avatar === a ? 'on' : '') + '">' + a + '</button>').join('') +
      '</div></div>';

    // 称号进度（新功能 ⑤）
    html += '<div class="sec-title"><span>称号</span><span class="hint">升级自动解锁</span></div>';
    html += '<div class="title-list">' + TITLES.slice().reverse().map((t) => {
      const on = s.level >= t.min;
      const next = TITLES.slice().reverse().find((x) => x.min > s.level);
      const isNext = next && next.min === t.min;
      return '<div class="title-row ' + (on ? 'on' : '') + (isNext ? ' next' : '') + '">' +
        '<span class="tdot" style="background:' + (on ? t.color : '#253044') + '"></span>' +
        '<span class="tname" style="color:' + (on ? t.color : 'var(--text-dim)') + '">' + t.name + '</span>' +
        '<span class="tmin">Lv.' + t.min + '</span>' +
        '<span class="tstate">' + (on ? '已获得' : (isNext ? '还差 ' + (t.min - s.level) + ' 级' : '')) + '</span>' +
      '</div>';
    }).join('') + '</div>';

    html += '<div class="sec-title"><span>数值设置</span><span class="hint">改完立刻生效</span></div>';
    html += '<div class="field"><label>专注奖励（每分钟）</label><div class="field-row">' +
      '<div><input class="input" type="number" min="0" step="0.1" data-field="set.focusXpPerMin" value="' + st.focusXpPerMin + '">' +
        '<div class="set-hint" style="margin:4px 0 0">经验 / 分钟</div></div>' +
      '<div><input class="input" type="number" min="0" step="0.1" data-field="set.focusCoinPerMin" value="' + st.focusCoinPerMin + '">' +
        '<div class="set-hint" style="margin:4px 0 0">金币 / 分钟</div></div>' +
    '</div></div>';

    html += '<div class="field"><label>娱乐时长兑换比例</label>' +
      '<div class="exchange-row" style="margin-top:0">' +
        '<input class="input" type="number" min="1" max="999" inputmode="numeric" data-field="set.minuteCost" value="' + st.minuteCost + '">' +
        '<span class="ratio-txt">金币 ＝</span>' +
        '<input class="input" type="number" min="1" max="600" inputmode="numeric" data-field="set.minuteGain" value="' + st.minuteGain + '">' +
        '<span class="ratio-txt">分钟</span>' +
      '</div>' +
      '<div class="set-hint" style="margin:6px 0 0">现在是 <b>' + st.minuteCost + ' 金币换 ' + st.minuteGain + ' 分钟</b>（1 分钟 ≈ ' +
        (st.minuteCost / st.minuteGain).toFixed(2) + ' 金币）</div></div>';

    html += '<div class="field"><label>每日达标奖励</label><div class="field-row">' +
      '<div><input class="input" type="number" min="1" max="50" data-field="set.dailyBonusTasks" value="' + st.dailyBonusTasks + '">' +
        '<div class="set-hint" style="margin:4px 0 0">完成几个任务</div></div>' +
      '<div><input class="input" type="number" min="1" max="600" data-field="set.dailyBonusMinutes" value="' + st.dailyBonusMinutes + '">' +
        '<div class="set-hint" style="margin:4px 0 0">送多少分钟</div></div>' +
    '</div></div>';

    html += '<div class="field"><label>每天至少完成几个「重要」任务</label>' +
      '<input class="input" type="number" min="1" max="50" data-field="set.importantMin" value="' + st.importantMin + '">' +
      '<div class="set-hint" style="margin:6px 0 0">完成数少于这个数 → 当天判定失败、连胜中断（重要任务总数要 ≥ 这个数，规则才生效）</div></div>';

    html += '<div class="sec-title"><span>连胜倍率</span><span class="hint">连续满 N 天 → 奖励 ×M</span></div>';
    html += '<div class="tier-list">' +
      (st.streakTiers || []).map((t, i) =>
        '<div class="tier-row">' +
          '<span class="tier-lb">连续</span>' +
          '<input class="input tiny" type="number" min="1" max="365" inputmode="numeric" data-field="tier.' + i + '.min" value="' + t.min + '">' +
          '<span class="tier-lb">天 → ×</span>' +
          '<input class="input tiny" type="number" min="1" max="10" step="0.1" data-field="tier.' + i + '.mul" value="' + t.mul + '">' +
          '<button class="tier-del" data-action="del-tier" data-v="' + i + '">删</button>' +
        '</div>').join('') +
    '</div>';
    html += '<div class="set-hint" style="margin:8px 0 0">没达到最低一档 = ×1.0（等于没加成）。改完立刻生效。</div>';
    html += '<button class="add-btn" data-action="add-tier">＋ 添加一档</button>';

    html += '<button class="row-btn" data-action="reset-settings" style="margin-top:14px"><span>↺ 数值恢复默认</span><span class="arrow">›</span></button>';

    html += '<div class="sec-title"><span>设置</span></div>';
    html += '<button class="row-btn" data-action="toggle-sound"><span>🔊 打卡音效</span><span class="arrow">' + (state.sound ? '开' : '关') + '</span></button>';
    html += '<button class="row-btn" data-action="export"><span>💾 导出备份（.json）</span><span class="arrow">›</span></button>';
    html += '<button class="row-btn" data-action="import"><span>📥 导入备份</span><span class="arrow">›</span></button>';
    html += '<button class="row-btn" data-action="demo"><span>🎲 追加演示任务与奖励</span><span class="arrow">›</span></button>';
    html += '<button class="row-btn danger" data-action="reset"><span>🗑️ 清空所有数据</span><span class="arrow">›</span></button>';

    html += '<div class="sec-title"><span>关于</span></div>';
    html += '<div style="padding:14px;border-radius:14px;background:var(--bg-soft);border:1px solid var(--line);font-size:12.5px;color:var(--text-dim);line-height:1.7">' +
      '人生副本 v3.2 · 纯本地应用<br>' +
      '数据保存在这台设备的浏览器里，不上传服务器。<br>' +
      '换设备 / 清缓存前，请先「导出备份」。<br>' +
      'Lv.' + s.level + ' ' + s.title.name + ' · 累计经验 ' + s.totalXp + ' · 连续 ' + s.streak + ' 天' +
    '</div>';

    // 隐藏的导入文件选择框
    html += '<input type="file" id="import-file" accept="application/json,.json" style="display:none">';

    $('#view-me').innerHTML = html;
  }

  /* ---------- 升级动画 ---------- */
  function levelUpFx(level, gain) {
    const root = $('#fx-root');
    const el = document.createElement('div');
    el.className = 'fx-level';
    el.innerHTML = '<div class="txt">LEVEL UP<small>Lv.' + level + (gain ? '　🪙+' + gain : '') + '</small></div>';
    root.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  /* ---------- 备忘录（v3 ⑥） ---------- */
  function renderMemo() {
    const now = Date.now();
    const list = (state.memos || []).slice().sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      const ta = a.remindAt ? parseDateTime(a.remindAt) : 8.6e15;
      const tb = b.remindAt ? parseDateTime(b.remindAt) : 8.6e15;
      return ta - tb || b.createdAt - a.createdAt;
    });
    const edit = ui.editMemoId ? (state.memos || []).find((m) => m.id === ui.editMemoId) : null;

    let html = '<div class="sec-title"><span>备忘录</span><span class="hint">' +
      list.filter((m) => !m.done).length + ' 条未完成</span></div>';

    if ('Notification' in window && Notification.permission === 'default') {
      html += '<button class="row-btn" data-action="ask-notify"><span>🔔 开启系统通知</span><span class="arrow">›</span></button>';
    }
    html += '<p class="set-hint">⏰ 提醒只在你<b>打开应用</b>时弹出。iPhone 上彻底关掉后不会响（网页应用的限制），特别重要的事建议同时设到系统「提醒事项」。</p>';

    html += '<div class="memo-form">' +
      '<input class="input" id="memo-text" maxlength="100" placeholder="要记什么？例如：周五 10 点交报告" value="' + (edit ? esc(edit.text) : '') + '">' +
      '<input class="input" id="memo-time" type="datetime-local" value="' + (edit ? esc(edit.remindAt || '') : '') + '">' +
      '<div class="exchange-row">' +
        '<button class="btn primary" data-action="add-memo">' + (edit ? '保存修改' : '添加备忘') + '</button>' +
        (edit ? '<button class="btn ghost" style="flex:0 0 88px" data-action="cancel-memo-edit">取消</button>' : '') +
      '</div>' +
    '</div>';

    if (!list.length) {
      html += '<div class="empty"><span class="big">📝</span>还没有备忘，上面写一条试试</div>';
    } else {
      html += list.map((m) => memoCard(m, now)).join('');
    }

    $('#view-memo').innerHTML = html;
  }

  function memoCard(m, now) {
    const t = m.remindAt ? parseDateTime(m.remindAt) : 0;
    const over = t && t <= now && !m.done;
    const cls = 'memo' + (m.done ? ' done' : '') + (over ? ' due' : '');
    return '<div class="' + cls + '">' +
      '<div class="memo-text">' + esc(m.text) + '</div>' +
      (m.remindAt ? '<div class="memo-time ' + (over ? 'over' : '') + '">' +
        (over ? '⏰ 已到期 · ' : '⏰ ') + fmtDateTime(m.remindAt) + '</div>' : '') +
      '<div class="memo-actions">' +
        '<button data-action="memo-done" data-id="' + m.id + '" class="' + (m.done ? 'on' : '') + '">' +
          (m.done ? '✓ 已完成' : '标记完成') + '</button>' +
        '<button data-action="memo-edit" data-id="' + m.id + '">改</button>' +
        '<button data-action="memo-del" data-id="' + m.id + '" class="danger">删</button>' +
      '</div>' +
    '</div>';
  }

  function fmtDateTime(s) {
    const t = parseDateTime(s);
    if (!t) return s;
    const d = new Date(t);
    const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return (sameYear ? '' : d.getFullYear() + '-') + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' ' + w;
  }

  function addMemo() {
    const textEl = $('#memo-text');
    const timeEl = $('#memo-time');
    const text = (textEl ? textEl.value : '').trim();
    if (!text) { toast('先写点什么吧', 'bad'); return; }
    const remindAt = timeEl ? timeEl.value : '';

    if (ui.editMemoId) {
      const m = state.memos.find((x) => x.id === ui.editMemoId);
      if (m) {
        if (m.remindAt !== remindAt) m.notified = false;
        m.text = text;
        m.remindAt = remindAt;
      }
      ui.editMemoId = null;
    } else {
      state.memos.push({
        id: uid(), text: text, remindAt: remindAt, done: false,
        notified: false, createdAt: Date.now()
      });
    }
    save();
    renderAll();
    toast('已保存', 'good');
  }

  /* ==========================================================
     7. 弹窗（新建/编辑任务、奖励）
     ========================================================== */
  let draft = null;
  let draftKind = null;   // 'task' | 'reward'

  function closeModal() {
    $('#modal-root').innerHTML = '';
    draft = null; draftKind = null;
  }

  function openTaskModal(id, presetType) {
    const t = id ? state.tasks.find((x) => x.id === id) : null;
    draftKind = 'task';
    if (t) {
      draft = JSON.parse(JSON.stringify(t));
    } else {
      const type = presetType || ui.filter;
      const diff = type === 'boss' ? 'epic' : type === 'weekly' ? 'hard' : 'normal';
      const mul = TYPE_MUL[type];
      draft = {
        id: null, type: type, name: '', icon: type === 'boss' ? '👑' : '✅',
        target: 1, unit: '次', diff: diff, due: type === 'boss' ? dayKey(addDays(new Date(), 14)) : '',
        level: 'basic',
        xp: DIFFS[diff].xp * mul, coins: DIFFS[diff].coins * mul
      };
    }
    // 老任务可能没有 xp/coins/level 字段，兜底一下
    if (!draft.level) draft.level = 'basic';
    // 老任务可能没有 xp/coins 字段，兜底一下
    if (!draft.xp) draft.xp = DIFFS[draft.diff || 'normal'].xp * TYPE_MUL[draft.type];
    if (!draft.coins) draft.coins = DIFFS[draft.diff || 'normal'].coins * TYPE_MUL[draft.type];
    renderTaskModal();
  }

  /** 换了难度或类型后，把奖励重置成预设值（用户之后还能手动改） */
  function resetDraftReward() {
    const mul = TYPE_MUL[draft.type];
    const base = DIFFS[draft.diff] || DIFFS.normal;
    draft.xp = base.xp * mul;
    draft.coins = base.coins * mul;
  }

  function renderTaskModal() {
    const d = draft;
    const mul = TYPE_MUL[d.type];
    const xp = clampInt(d.xp, 1, 99999, 30);
    const coins = clampInt(d.coins, 1, 99999, 8);

    const types = [['daily', '每日'], ['weekly', '每周'], ['boss', 'BOSS']].map(([k, l]) =>
      '<button data-action="draft-type" data-v="' + k + '" class="' + (d.type === k ? 'on' : '') + '">' + l + '</button>').join('');

    const diffs = Object.keys(DIFFS).map((k) =>
      '<button data-action="draft-diff" data-v="' + k + '" class="' + (d.diff === k ? 'on' : '') + '">' +
        DIFFS[k].label + '<small>' + (DIFFS[k].xp * mul) + ' XP</small></button>').join('');

    const emojis = EMOJIS.map((e) =>
      '<button data-action="draft-icon" data-v="' + e + '" class="' + (d.icon === e ? 'on' : '') + '">' + e + '</button>').join('');

    const isNew = !d.id;
    const html =
      '<div class="modal-mask" data-action="mask">' +
        '<div class="modal" role="dialog">' +
          '<h3>' + (isNew ? '新建任务' : '编辑任务') + '</h3>' +
          '<p class="sub">完成后可获得 <b style="color:#b9a6ff">' + xp + ' XP</b> 和 <b style="color:var(--gold)">' + coins + ' 金币</b>' +
            (mul > 1 ? '（' + TYPE_LABEL[d.type] + '任务默认 ×' + mul + '）' : '') + '</p>' +

          '<div class="field"><label>任务类型</label><div class="diff-row" style="grid-template-columns:repeat(3,1fr)">' + types + '</div></div>' +

          (d.type === 'daily'
            ? '<div class="field"><label>任务等级</label>' +
              '<div class="diff-row" style="grid-template-columns:repeat(2,1fr)">' +
                '<button data-action="draft-level" data-v="basic" class="' + (d.level !== 'important' ? 'on' : '') + '">基本</button>' +
                '<button data-action="draft-level" data-v="important" class="' + (d.level === 'important' ? 'on' : '') + '">⭐ 重要</button>' +
              '</div>' +
              '<div class="set-hint" style="margin:6px 0 0">「重要」任务每天必须完成 ' + importantMin() +
                ' 个，做不到当天就判定失败（断连胜、断加成）。等级不影响经验和金币。</div></div>'
            : '') +

          '<div class="field"><label>任务名称</label>' +
            '<input class="input" data-field="name" maxlength="30" placeholder="例如：跑步 3 公里" value="' + esc(d.name) + '"></div>' +

          '<div class="field"><label>图标</label><div class="emoji-row">' + emojis + '</div></div>' +

          '<div class="field" style="display:flex;gap:10px">' +
            '<div style="flex:1"><label>目标数量</label>' +
              '<input class="input" type="number" min="1" max="999" inputmode="numeric" data-field="target" value="' + d.target + '"></div>' +
            '<div style="flex:1"><label>单位</label>' +
              '<input class="input" data-field="unit" maxlength="4" value="' + esc(d.unit) + '" placeholder="次/页/小时"></div>' +
          '</div>' +

          '<div class="field"><label>难度（点一下 = 套用预设奖励）</label><div class="diff-row">' + diffs + '</div></div>' +

          // ★ 自定义奖励（你可以随便填，不受难度限制）
          '<div class="field" style="display:flex;gap:10px">' +
            '<div style="flex:1"><label>经验奖励（XP）</label>' +
              '<input class="input" type="number" min="1" max="99999" inputmode="numeric" data-field="xp" value="' + xp + '"></div>' +
            '<div style="flex:1"><label>金币奖励</label>' +
              '<input class="input" type="number" min="1" max="99999" inputmode="numeric" data-field="coins" value="' + coins + '"></div>' +
          '</div>' +
          '<p style="margin:-6px 0 14px;font-size:11.5px;color:var(--text-dim)">提示：这两个数字可以直接改。改完之后难度标签只作参考，实际按你填的发。</p>' +

          (d.type === 'boss'
            ? '<div class="field"><label>截止日期</label>' +
              '<input class="input" type="date" data-field="due" value="' + esc(d.due) + '"></div>'
            : '') +

          '<div class="modal-actions">' +
            (isNew ? '' : '<button class="btn danger" data-action="delete-task" data-id="' + d.id + '">删除</button>') +
            '<button class="btn ghost" data-action="close-modal">取消</button>' +
            '<button class="btn primary" data-action="save-task">保存</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    $('#modal-root').innerHTML = html;
  }

  function saveTask() {
    const d = draft;
    const name = (d.name || '').trim();
    if (!name) { toast('给任务起个名字吧', 'bad'); return; }

    const mul = TYPE_MUL[d.type];
    const xp = clampInt(d.xp, 1, 99999, DIFFS[d.diff].xp * mul);
    const coins = clampInt(d.coins, 1, 99999, DIFFS[d.diff].coins * mul);
    const target = clampInt(d.target, 1, 999, 1);

    if (d.id) {
      const t = state.tasks.find((x) => x.id === d.id);
      if (!t) return;
      const typeChanged = t.type !== d.type;
      t.name = name;
      t.type = d.type;
      t.icon = d.icon;
      t.target = target;
      t.unit = (d.unit || '次').slice(0, 4);
      t.diff = d.diff;
      t.xp = xp;
      t.coins = coins;
      t.level = d.type === 'daily' ? (d.level || 'basic') : 'basic';
      t.due = d.type === 'boss' ? (d.due || '') : '';
      if (typeChanged) {
        t.cycleKey = d.type === 'daily' ? dayKey() : d.type === 'weekly' ? weekKey() : null;
        t.progress = 0; t.done = false;
      }
      if (t.progress > t.target) t.progress = t.target;
    } else {
      state.tasks.push({
        id: uid(), type: d.type, name: name, icon: d.icon,
        target: target, unit: (d.unit || '次').slice(0, 4),
        diff: d.diff, xp: xp, coins: coins,
        level: d.type === 'daily' ? (d.level || 'basic') : 'basic',
        progress: 0, done: false,
        cycleKey: d.type === 'daily' ? dayKey() : d.type === 'weekly' ? weekKey() : null,
        due: d.type === 'boss' ? (d.due || '') : '',
        createdAt: Date.now()
      });
    }
    save();
    closeModal();
    renderAll();
    toast(d.id ? '已保存' : '任务已加入副本', 'good');
  }

  function deleteTask(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    if (!confirm('删除任务「' + t.name + '」？\n（已有的打卡记录会保留）')) return;
    state.tasks = state.tasks.filter((x) => x.id !== id);
    save(); closeModal(); renderAll();
    toast('已删除', '');
  }

  /* --- 奖励弹窗 --- */
  function openRewardModal(id) {
    const r = id ? state.rewards.find((x) => x.id === id) : null;
    draftKind = 'reward';
    draft = r ? JSON.parse(JSON.stringify(r)) : { id: null, name: '', icon: '🎁', cost: 50 };
    renderRewardModal();
  }

  function renderRewardModal() {
    const d = draft;
    const emojis = ['🎁','📺','🧋','🎮','😴','🍰','🛍️','🎬','☕','🍜','🎧','🚲','✈️','🎫','💤','🍿']
      .map((e) => '<button data-action="draft-icon" data-v="' + e + '" class="' + (d.icon === e ? 'on' : '') + '">' + e + '</button>').join('');

    const html =
      '<div class="modal-mask" data-action="mask">' +
        '<div class="modal">' +
          '<h3>' + (d.id ? '编辑奖励' : '上架新奖励') + '</h3>' +
          '<p class="sub">奖励要真实可兑现，价格 = 你觉得它值多少金币</p>' +
          '<div class="field"><label>奖励名称</label>' +
            '<input class="input" data-field="name" maxlength="20" placeholder="例如：看一部电影" value="' + esc(d.name) + '"></div>' +
          '<div class="field"><label>图标</label><div class="emoji-row">' + emojis + '</div></div>' +
          '<div class="field"><label>需要多少金币</label>' +
            '<input class="input" type="number" min="1" max="99999" inputmode="numeric" data-field="cost" value="' + d.cost + '"></div>' +
          '<div class="field"><label>额外送多少娱乐时长（分钟）</label>' +
            '<input class="input" type="number" min="0" max="1440" inputmode="numeric" data-field="minutes" value="' + (d.minutes || 0) + '">' +
            '<div class="set-hint" style="margin:6px 0 0">比如「玩游戏 1 小时」可以额外送 60 分钟时长，填 0 就是不送</div></div>' +
          '<div class="modal-actions">' +
            (d.id ? '<button class="btn danger" data-action="delete-reward" data-id="' + d.id + '">删除</button>' : '') +
            '<button class="btn ghost" data-action="close-modal">取消</button>' +
            '<button class="btn primary" data-action="save-reward">保存</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    $('#modal-root').innerHTML = html;
  }

  function saveReward() {
    const d = draft;
    const name = (d.name || '').trim();
    if (!name) { toast('给奖励起个名字吧', 'bad'); return; }
    const cost = clampInt(d.cost, 1, 99999, 50);
    const minutes = clampInt(d.minutes, 0, 1440, 0);

    if (d.id) {
      const r = state.rewards.find((x) => x.id === d.id);
      r.name = name; r.icon = d.icon; r.cost = cost; r.minutes = minutes;
    } else {
      state.rewards.push({ id: uid(), name: name, icon: d.icon, cost: cost, bought: 0, minutes: minutes });
    }
    save(); closeModal(); renderAll();
    toast('已保存', 'good');
  }

  function deleteReward(id) {
    const r = state.rewards.find((x) => x.id === id);
    if (!r) return;
    if (!confirm('删除奖励「' + r.name + '」？')) return;
    state.rewards = state.rewards.filter((x) => x.id !== id);
    save(); closeModal(); renderAll();
    toast('已删除', '');
  }

  /* ==========================================================
     8. 备份 / 恢复
     ========================================================== */
  function exportBackup() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '人生副本-备份-' + dayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('备份已导出', 'good');
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj || !obj.player || !Array.isArray(obj.tasks)) throw new Error('格式不对');
        if (!confirm('导入会覆盖当前所有数据，确定吗？')) return;
        state = obj;
        state.rewards = Array.isArray(state.rewards) ? state.rewards : [];
        state.completions = Array.isArray(state.completions) ? state.completions : [];
        state.purchases = Array.isArray(state.purchases) ? state.purchases : [];
        rollCycles();
        save(); renderAll();
        toast('导入成功', 'good');
      } catch (e) {
        toast('导入失败：文件格式不正确', 'bad');
      }
    };
    reader.readAsText(file);
  }

  /* ==========================================================
     9. 事件绑定
     ========================================================== */

  // 统一的点击处理：所有按钮都靠 data-action 找到对应的动作
  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const id = el.dataset.id;

    switch (a) {
      case 'tab':
        ui.tab = el.dataset.tab;
        renderAll();
        window.scrollTo({ top: 0 });
        break;

      case 'filter':
        ui.filter = el.dataset.filter;
        renderTasks();
        break;

      case 'tap':   tapTask(id); break;
      case 'fill':  fillTask(id); break;
      case 'undo':  undoTask(id); break;
      case 'edit':  openTaskModal(id); break;

      case 'new-task':   openTaskModal(null); break;
      case 'new-reward': openRewardModal(null); break;
      case 'edit-reward': openRewardModal(id); break;
      case 'buy':        buyReward(id); break;

      case 'save-task':   saveTask(); break;
      case 'save-reward': saveReward(); break;
      case 'delete-task':   deleteTask(id); break;
      case 'delete-reward': deleteReward(id); break;
      case 'close-modal':   closeModal(); break;

      // 弹窗里的选择按钮
      case 'draft-type':
        if (draft) {
          draft.type = el.dataset.v;
          if (draft.type !== 'boss') draft.due = '';
          resetDraftReward();
          renderTaskModal();
        }
        break;
      case 'draft-diff':
        if (draft) { draft.diff = el.dataset.v; resetDraftReward(); renderTaskModal(); }
        break;
      case 'draft-level':
        if (draft) { draft.level = el.dataset.v; renderTaskModal(); }
        break;
      case 'draft-icon':
        if (draft) { draft.icon = el.dataset.v; draftKind === 'task' ? renderTaskModal() : renderRewardModal(); }
        break;

      // 专注计时
      case 'focus-set':
        if (!focusTimer.active) { focusTimer.minutes = parseInt(el.dataset.v, 10) || 25; renderFocus(); }
        break;
      case 'focus-start':  startFocus(); break;
      case 'focus-pause':  pauseFocus(); break;
      case 'focus-resume': resumeFocus(); break;
      case 'focus-cancel': cancelFocus(); break;
      case 'focus-demo':
        if (focusTimer.active) { toast('先结束当前这一次专注', 'bad'); break; }
        focusTimer.minutes = 25;
        focusTimer.total = 25 * 60000;
        finishFocus();
        break;

      // 点遮罩关闭弹窗
      case 'mask':
        if (e.target === el) closeModal();
        break;

      case 'set-avatar':
        state.player.avatar = el.dataset.v;
        save(); renderAll();
        break;

      case 'toggle-sound':
        state.sound = !state.sound;
        save(); renderMe();
        if (state.sound) sfxTick();
        break;

      case 'export': exportBackup(); break;
      case 'import':
        { const f = $('#import-file'); if (f) f.click(); }
        break;

      case 'demo':
        addDemoData();
        break;

      /* ---------- v3：奖励 / 惩罚 / 时长 ---------- */
      case 'shop-seg':
        ui.shopSeg = el.dataset.v;
        renderShop();
        break;
      case 'new-punish':  openPunishModal(null); break;
      case 'edit-punish': openPunishModal(id); break;
      case 'save-punish': savePunish(); break;
      case 'delete-punish': deletePunish(id); break;
      case 'punish': applyPunish(id); break;

      case 'exchange-min': {
        const inp = $('#min-input');
        exchangeMinutes(inp ? parseInt(inp.value, 10) : 0);
        break;
      }
      case 'spend-min': {
        const inp2 = $('#min-input');
        spendMinutes(inp2 ? parseInt(inp2.value, 10) : 0);
        break;
      }
      case 'min-quick': {
        const v = parseInt(el.dataset.v, 10);
        const inp3 = $('#min-input');
        if (inp3) inp3.value = v;
        const hint = $('#min-hint');
        if (hint) hint.innerHTML = minHintText(v);
        break;
      }

      /* ---------- v3：记录页 ---------- */
      case 'log-seg':
        ui.logSeg = el.dataset.v;
        renderLog();
        break;
      case 'ledger-filter':
        ui.ledgerFilter = el.dataset.v;
        renderLog();
        break;
      case 'diary-prev':
        ui.diaryDay = dayKey(addDays(parseDayKey(ui.diaryDay), -1));
        renderLog();
        break;
      case 'diary-next':
        ui.diaryDay = dayKey(addDays(parseDayKey(ui.diaryDay), 1));
        renderLog();
        break;
      case 'diary-jump':
        ui.diaryDay = el.dataset.v;
        renderLog();
        break;
      case 'diary-mood':
        upsertDiary(ui.diaryDay, { mood: (el.classList.contains('on') ? '' : el.dataset.v) });
        renderLog();
        break;
      case 'save-diary': {
        const ta = $('[data-field="diary-text"]');
        upsertDiary(ui.diaryDay, { text: ta ? ta.value : '' });
        renderLog();
        toast('日记已保存', 'good');
        break;
      }

      /* ---------- v3：备忘录 ---------- */
      case 'add-memo': addMemo(); break;
      case 'cancel-memo-edit':
        ui.editMemoId = null;
        renderMemo();
        break;
      case 'memo-done': {
        const m = state.memos.find((x) => x.id === id);
        if (m) { m.done = !m.done; save(); renderAll(); }
        break;
      }
      case 'memo-edit':
        ui.editMemoId = id;
        renderMemo();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'memo-del': {
        const m = state.memos.find((x) => x.id === id);
        if (m && confirm('删除这条备忘？\n' + m.text)) {
          state.memos = state.memos.filter((x) => x.id !== id);
          save(); renderAll();
          toast('已删除', '');
        }
        break;
      }
      case 'ask-notify':
        if ('Notification' in window) {
          Notification.requestPermission().then((p) => {
            toast(p === 'granted' ? '已开启系统通知' : '没有开启通知权限', p === 'granted' ? 'good' : 'bad');
            renderMemo();
          });
        } else {
          toast('这个浏览器不支持系统通知', 'bad');
        }
        break;

      case 'reset-settings':
        if (confirm('把所有数值恢复成默认值？（任务、记录不会丢）')) {
          state.settings = normalizeSettings({});
          save(); renderAll();
          toast('已恢复默认数值', '');
        }
        break;

      case 'add-tier': {
        const arr = (state.settings.streakTiers || []).slice();
        const last = arr.length ? arr[arr.length - 1] : { min: 0, mul: 1 };
        arr.push({
          min: Math.min(365, last.min + 7),
          mul: Math.min(10, Math.round((last.mul + 0.2) * 10) / 10)
        });
        state.settings.streakTiers = normalizeTiers(arr);
        save(); renderAll();
        break;
      }
      case 'del-tier': {
        const arr = (state.settings.streakTiers || []).slice();
        if (arr.length <= 1) { toast('至少留一档', 'bad'); break; }
        arr.splice(parseInt(el.dataset.v, 10), 1);
        state.settings.streakTiers = normalizeTiers(arr);
        save(); renderAll();
        break;
      }

      case 'reset':
        if (confirm('确定清空所有任务、记录和金币吗？\n这个操作不可撤销，建议先导出备份。')) {
          if (confirm('真的确定？最后一次确认。')) {
            state = defaultState();
            save(); renderAll();
            toast('已重置为初始状态', '');
          }
        }
        break;
    }
  });

  // 表单输入：同步到 draft
  document.addEventListener('input', function (e) {
    const el = e.target;

    // 娱乐时长输入框：实时算给你看要花多少金币
    if (el.id === 'min-input') {
      const hint = $('#min-hint');
      if (hint) hint.innerHTML = minHintText(Math.max(0, parseInt(el.value, 10) || 0));
      return;
    }

    const f = el.dataset.field;
    if (!f) return;

    // 日记：边写边存，切页面也不会丢
    if (f === 'diary-text') {
      upsertDiary(ui.diaryDay, { text: el.value });
      const hint = $('#diary-hint');
      if (hint) hint.textContent = '已自动保存';
      return;
    }

    if (draft && draftKind === 'task') {
      if (f === 'target') draft.target = el.value;
      else draft[f] = el.value;
    } else if (draft && draftKind === 'reward') {
      if (f === 'cost') draft.cost = el.value;
      else draft[f] = el.value;
    } else if (draft && draftKind === 'punish') {
      draft[f] = el.value;
    }
  });

  // 昵称：失焦时保存
  document.addEventListener('change', function (e) {
    const el = e.target;
    const f = el.dataset.field || '';

    // 数值设置（专注奖励、兑换比例、每日达标、重要任务、连胜倍率）
    const tm = /^tier\.(\d+)\.(min|mul)$/.exec(f);
    if (tm) {
      const i = parseInt(tm[1], 10);
      const arr = (state.settings.streakTiers || []).slice();
      if (arr[i]) {
        if (tm[2] === 'min') {
          arr[i] = { min: clampInt(el.value, 1, 365, arr[i].min), mul: arr[i].mul };
        } else {
          let m = parseFloat(el.value);
          if (!isFinite(m)) m = arr[i].mul;
          arr[i] = { min: arr[i].min, mul: Math.min(10, Math.max(1, Math.round(m * 10) / 10)) };
        }
        state.settings.streakTiers = normalizeTiers(arr);
        save(); renderAll();
      }
      return;
    }

    if (f.indexOf('set.') === 0) {
      const key = f.slice(4);
      let v = parseFloat(el.value);
      if (!isFinite(v) || v < 0) v = DEFAULT_SETTINGS[key];
      if (key === 'dailyBonusTasks') v = clampInt(v, 1, 50, DEFAULT_SETTINGS.dailyBonusTasks);
      if (key === 'dailyBonusMinutes') v = clampInt(v, 1, 600, DEFAULT_SETTINGS.dailyBonusMinutes);
      if (key === 'minuteCost') v = clampInt(v, 1, 999, DEFAULT_SETTINGS.minuteCost);
      if (key === 'minuteGain') v = clampInt(v, 1, 600, DEFAULT_SETTINGS.minuteGain);
      if (key === 'importantMin') v = clampInt(v, 1, 50, DEFAULT_SETTINGS.importantMin);
      state.settings[key] = v;
      save();
      renderAll();
      return;
    }

    if (f === 'player-name') {
      state.player.name = (el.value || '').trim().slice(0, 16) || '冒险者';
      save(); renderPlayer();
    }
    if (el.id === 'import-file' && el.files && el.files[0]) {
      importBackup(el.files[0]);
      el.value = '';
    }
  });

  // 回车保存
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && $('#modal-root').children.length) {
      if (draftKind === 'task') { e.preventDefault(); saveTask(); }
      if (draftKind === 'reward') { e.preventDefault(); saveReward(); }
      if (draftKind === 'punish') { e.preventDefault(); savePunish(); }
    }
    if (e.key === 'Escape') closeModal();
  });

  // 从后台切回前台：检查是否跨天，需要重置每日/每周任务；顺便结算专注、检查备忘
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      if (rollCycles()) renderAll();
      syncRuleState();
      if (judgePastDays()) renderAll();
      tickFocus();
      checkMemos();
    }
  });

  function addDemoData() {
    const today = dayKey();
    const wkey = weekKey();
    const demo = [
      { type: 'daily',  name: '喝 8 杯水',     icon: '💧', target: 8, unit: '杯', diff: 'easy',   xp: 15, coins: 4 },
      { type: 'daily',  name: '冥想 10 分钟', icon: '🧘', target: 1, unit: '次', diff: 'easy',   xp: 15, coins: 4 },
      { type: 'weekly', name: '整理房间一次', icon: '🧹', target: 1, unit: '次', diff: 'normal', xp: 60, coins: 16 },
      { type: 'boss',   name: '考过驾照科目二', icon: '🚗', target: 1, unit: '个', diff: 'epic', xp: 600, coins: 200, due: dayKey(addDays(new Date(), 30)) }
    ];
    demo.forEach((d) => {
      state.tasks.push(Object.assign({
        id: uid(), diff: 'normal', progress: 0, done: false,
        cycleKey: d.type === 'daily' ? today : d.type === 'weekly' ? wkey : null,
        due: '', createdAt: Date.now()
      }, d));
    });
    state.rewards.push({ id: uid(), name: '出去玩一整天', icon: '🚲', cost: 300, bought: 0 });
    save(); renderAll();
    toast('已追加 4 个演示任务 + 1 个奖励', 'good');
  }

  /* ==========================================================
     10. 启动
     ========================================================== */
  function boot() {
    state = load();
    rollCycles();
    // 首次打开：如果历史最长连续为空，初始化一下
    if (!state.player.bestStreak) state.player.bestStreak = computeBestStreak();
    if (state.player.rewardedLevel == null) state.player.rewardedLevel = levelInfo(state.player.totalXp).level;
    if (!Array.isArray(state.focus)) state.focus = [];
    // 老存档升级上来时：把「已经解锁的成就」标记为已发放，避免一次性发一大堆金币
    if (!Array.isArray(state.rewardedAchievements)) {
      const s0 = getStats();
      state.rewardedAchievements = ACHIEVEMENTS.filter((a) => a.test(s0)).map((a) => a.id);
    }
    // v3：老存档没有流水，用旧记录补一份
    if (state.ledger === null) backfillLedger();
    // 「重要任务」规则：记录生效起始日，并把过去没判过的日子结算掉
    syncRuleState();
    judgePastDays();

    save();
    renderAll();

    // 进来看一眼：有没有到点的备忘、今天是否已经达标
    checkMemos();
    checkDailyBonus();
    // 每秒看一眼表（备忘到点就提醒）
    setInterval(checkMemos, 30000);

    // 注册 Service Worker（离线可用 + 可安装到桌面），file:// 打开时跳过
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      // 检测到有新版本上线 → 自动刷新一次，用户不用手动清缓存
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloading) return;
        reloading = true;
        toast('发现新版本，正在更新…', 'good');
        setTimeout(() => location.reload(), 600);
      });
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
