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

  // 成就定义：unlocked(stats) 返回 true 就是解锁了
  const ACHIEVEMENTS = [
    { id: 'first',   icon: '🌱', name: '初次上路',   desc: '完成第 1 个任务',     test: (s) => s.totalDone >= 1 },
    { id: 'd10',     icon: '📗', name: '小有起色',   desc: '累计完成 10 次',      test: (s) => s.totalDone >= 10 },
    { id: 'd50',     icon: '📘', name: '渐入佳境',   desc: '累计完成 50 次',      test: (s) => s.totalDone >= 50 },
    { id: 'd200',    icon: '📚', name: '习惯成型',   desc: '累计完成 200 次',     test: (s) => s.totalDone >= 200 },
    { id: 's3',      icon: '✨', name: '三日不辍',   desc: '连续打卡 3 天',       test: (s) => s.bestStreak >= 3 },
    { id: 's7',      icon: '🔥', name: '一周不断',   desc: '连续打卡 7 天',       test: (s) => s.bestStreak >= 7 },
    { id: 's30',     icon: '☄️', name: '钢铁意志',   desc: '连续打卡 30 天',      test: (s) => s.bestStreak >= 30 },
    { id: 'lv5',     icon: '⭐', name: '初露锋芒',   desc: '升到 5 级',           test: (s) => s.level >= 5 },
    { id: 'lv10',    icon: '🌟', name: '崭露头角',   desc: '升到 10 级',          test: (s) => s.level >= 10 },
    { id: 'lv20',    icon: '💫', name: '传说之路',   desc: '升到 20 级',          test: (s) => s.level >= 20 },
    { id: 'boss1',   icon: '👑', name: 'BOSS 终结者', desc: '击败第 1 个 BOSS',   test: (s) => s.bossDone >= 1 },
    { id: 'boss5',   icon: '🏰', name: '副本通缉令', desc: '击败 5 个 BOSS',      test: (s) => s.bossDone >= 5 },
    { id: 'coin500', icon: '💰', name: '第一桶金',   desc: '累计赚到 500 金币',   test: (s) => s.coinsEarned >= 500 },
    { id: 'perfect', icon: '🎖️', name: '完美一天',   desc: '一天内完成全部每日任务', test: (s) => s.perfectDays >= 1 }
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
      diff: 'normal', xp: 30, coins: 8, progress: 0, done: false,
      cycleKey: today, due: '', createdAt: Date.now()
    }, o);

    return {
      v: 1,
      player: { name: '冒险者', avatar: '🧙', totalXp: 0, coins: 0, rewardedLevel: 1, bestStreak: 0 },
      tasks: [
        mk({ type: 'daily',  name: '早起（不赖床）',   icon: '🌅', target: 1,  unit: '次', diff: 'easy',   xp: 15,  coins: 4 }),
        mk({ type: 'daily',  name: '运动 30 分钟',     icon: '🏃', target: 1,  unit: '次', diff: 'normal', xp: 30,  coins: 8 }),
        mk({ type: 'daily',  name: '阅读 20 页',        icon: '📖', target: 20, unit: '页', diff: 'normal', xp: 30,  coins: 8 }),
        mk({ type: 'daily',  name: '专注学习 / 工作 3 小时', icon: '💻', target: 3, unit: '小时', diff: 'hard', xp: 60, coins: 18 }),
        mk({ type: 'weekly', name: '本周运动 4 次',     icon: '💪', target: 4,  unit: '次', diff: 'hard',   xp: 120, coins: 36, cycleKey: wkey }),
        mk({ type: 'weekly', name: '周末复盘本周',      icon: '📝', target: 1,  unit: '次', diff: 'normal', xp: 60,  coins: 16, cycleKey: wkey }),
        mk({ type: 'boss',   name: '写完那份大作业',   icon: '👑', target: 1,  unit: '个', diff: 'epic',   xp: 600, coins: 200, cycleKey: null, due: dayKey(addDays(new Date(), 14)) })
      ],
      rewards: REWARD_PRESETS.map((r) => Object.assign({ id: uid(), bought: 0 }, r)),
      completions: [],
      purchases: [],
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

  /** 连续打卡天数：从今天（或昨天）往前数 */
  function computeStreak() {
    const days = new Set(state.completions.map((c) => c.day));
    if (!days.size) return 0;
    let cur = new Date();
    if (!days.has(dayKey(cur))) cur = addDays(cur, -1);   // 今天还没打卡，从昨天开始算
    let n = 0;
    while (days.has(dayKey(cur))) { n++; cur = addDays(cur, -1); }
    return n;
  }

  /** 历史最长连续天数 */
  function computeBestStreak() {
    const days = Array.from(new Set(state.completions.map((c) => c.day))).sort();
    if (!days.length) return 0;
    let best = 1, run = 1;
    for (let i = 1; i < days.length; i++) {
      const diff = Math.round((parseDayKey(days[i]) - parseDayKey(days[i - 1])) / 86400000);
      run = diff === 1 ? run + 1 : 1;
      if (run > best) best = run;
    }
    return best;
  }

  function getStats() {
    const cs = state.completions;
    const today = dayKey();
    const li = levelInfo(state.player.totalXp);
    const fresh = liveStreak();

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

    return {
      level: li.level, xp: li.xp, need: li.need,
      coins: state.player.coins,
      totalXp: state.player.totalXp,
      totalDone: cs.length,
      bossDone: cs.filter((c) => c.type === 'boss').length,
      activeDays: new Set(cs.map((c) => c.day)).size,
      streak: fresh,
      bestStreak: Math.max(state.player.bestStreak || 0, computeBestStreak()),
      todayDone: cs.filter((c) => c.day === today).length,
      coinsEarned: cs.reduce((s, c) => s + (c.coins || 0), 0),
      perfectDays: perfectDays,
      dailyTotal: dailyTasks.length,
      dailyDoneToday: dailyDoneToday
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
      p.coins += gain;
      p.rewardedLevel = lv;
      return { level: lv, gain: gain };
    }
    return null;
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

    state.player.totalXp += t.xp;
    state.player.coins += t.coins;

    state.completions.push({
      id: uid(), taskId: t.id, name: t.name, icon: t.icon, type: t.type,
      xp: t.xp, coins: t.coins, day: dayKey(), ts: Date.now()
    });

    const lvUp = grantLevelRewards();
    const best = Math.max(state.player.bestStreak || 0, computeBestStreak());
    state.player.bestStreak = best;

    save();
    sfxComplete();
    toast('+' + t.xp + ' XP   🪙+' + t.coins, 'good');

    if (lvUp) {
      setTimeout(() => {
        levelUpFx(lvUp.level, lvUp.gain);
        sfxLevelUp();
      }, 260);
    }

    // 今日全部完成的小彩蛋
    const daily = state.tasks.filter((x) => x.type === 'daily');
    if (daily.length > 0 && daily.every((x) => x.done)) {
      setTimeout(() => toast('今日任务全部通关！🎉', 'gold'), 700);
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
    state.player.totalXp = Math.max(0, state.player.totalXp - c.xp);
    state.player.coins = Math.max(0, state.player.coins - c.coins);
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
    state.player.coins -= r.cost;
    r.bought = (r.bought || 0) + 1;
    state.purchases.push({ id: uid(), rewardId: r.id, name: r.name, cost: r.cost, ts: Date.now() });
    save();
    beep(880, 0.1, 0); beep(1320, 0.12, 0.08);
    toast('兑换成功：' + r.name + '（记得真的去享受它）', 'gold');
    renderAll();
  }

  /* ==========================================================
     6. 界面渲染
     ========================================================== */
  const ui = { tab: 'tasks', filter: 'daily' };

  function renderAll() {
    renderPlayer();
    renderTasks();
    renderShop();
    renderLog();
    renderMe();
    $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + ui.tab));
  }

  function renderPlayer() {
    const s = getStats();
    const pct = Math.min(100, Math.round((s.xp / s.need) * 100));
    $('#player').innerHTML =
      '<div class="pc-row">' +
        '<div class="avatar">' + esc(state.player.avatar || '🧙') + '</div>' +
        '<div class="pc-main">' +
          '<div class="pc-top">' +
            '<span class="pc-lv">Lv.' + s.level + '</span>' +
            '<span class="pc-name">' + esc(state.player.name || '冒险者') + '</span>' +
          '</div>' +
          '<div class="xpbar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="pc-sub">' + s.xp + ' / ' + s.need + ' XP　·　累计 ' + s.totalXp + '</div>' +
        '</div>' +
        '<div class="pc-side">' +
          '<span class="chip gold">🪙 ' + s.coins + '</span>' +
          '<span class="chip fire">🔥 ' + s.streak + ' 天</span>' +
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
    const meta = [];
    meta.push('<span class="g">+' + t.xp + ' XP</span>');
    meta.push('<span>🪙 +' + t.coins + '</span>');
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

  /* ---------- 奖励页 ---------- */
  function renderShop() {
    const coins = state.player.coins;
    let html = '<div class="sec-title"><span>奖励商店</span><span class="hint">🪙 我的金币：<b style="color:var(--gold)">' + coins + '</b></span></div>';
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
            '<div class="t-meta"><span>🪙 ' + r.cost + '</span>' + (r.bought ? '<span>已兑换 ' + r.bought + ' 次</span>' : '') + '</div>' +
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
    $('#view-shop').innerHTML = html;
  }

  /* ---------- 记录页 ---------- */
  function renderLog() {
    const s = getStats();

    let html = '<div class="sec-title"><span>我的战绩</span></div>';
    html += '<div class="stat-grid">' +
      statCard(s.totalDone, '累计完成') +
      statCard(s.streak, '连续天数') +
      statCard(s.bestStreak, '最长连续') +
      statCard(s.activeDays, '活跃天数') +
      statCard(s.totalXp, '累计经验') +
      statCard(s.bossDone, '击败 BOSS') +
    '</div>';

    // 最近 12 周热力图
    html += '<div class="sec-title"><span>最近 12 周</span><span class="hint">颜色越亮 = 那天完成得越多</span></div>';
    html += '<div class="heat-wrap">' + heatmap() + '</div>';

    // 成就
    const unlocked = ACHIEVEMENTS.filter((a) => a.test(s));
    html += '<div class="sec-title"><span>成就墙</span><span class="hint">' + unlocked.length + ' / ' + ACHIEVEMENTS.length + '</span></div>';
    html += '<div class="badge-grid">' + ACHIEVEMENTS.map((a) => {
      const on = a.test(s);
      return '<div class="badge ' + (on ? 'on' : '') + '">' +
        '<div class="bi">' + a.icon + '</div>' +
        '<div><div class="bn">' + a.name + '</div><div class="bd">' + a.desc + '</div></div>' +
      '</div>';
    }).join('') + '</div>';

    // 最近打卡流水
    const recent = state.completions.slice(-20).reverse();
    html += '<div class="sec-title"><span>最近打卡</span></div>';
    if (!recent.length) {
      html += '<div class="empty"><span class="big">🗒️</span>还没有打卡记录，去任务页开始吧</div>';
    } else {
      html += '<div class="loglist">' + recent.map((c) =>
        '<div class="logrow">' +
          '<span>' + esc(c.icon) + '</span>' +
          '<span class="ln">' + esc(c.name) + '</span>' +
          '<span class="lt">' + c.day.slice(5) + ' ' + fmtTime(c.ts) + '</span>' +
          '<span class="lx">+' + c.xp + '</span>' +
        '</div>').join('') + '</div>';
    }

    $('#view-log').innerHTML = html;
  }

  function statCard(v, k) {
    return '<div class="stat-card"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>';
  }

  function heatmap() {
    const WEEKS = 12;
    const counts = {};
    state.completions.forEach((c) => { counts[c.day] = (counts[c.day] || 0) + 1; });

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
    let html = '<div class="sec-title"><span>角色</span></div>';

    html += '<div class="field"><label>名字</label>' +
      '<input class="input" data-field="player-name" maxlength="16" value="' + esc(state.player.name || '冒险者') + '" placeholder="给自己起个名字"></div>';

    html += '<div class="field"><label>形象</label><div class="emoji-row">' +
      AVATARS.map((a) => '<button data-action="set-avatar" data-v="' + a + '" class="' + (state.player.avatar === a ? 'on' : '') + '">' + a + '</button>').join('') +
      '</div></div>';

    html += '<div class="sec-title"><span>设置</span></div>';
    html += '<button class="row-btn" data-action="toggle-sound"><span>🔊 打卡音效</span><span class="arrow">' + (state.sound ? '开' : '关') + '</span></button>';
    html += '<button class="row-btn" data-action="export"><span>💾 导出备份（.json）</span><span class="arrow">›</span></button>';
    html += '<button class="row-btn" data-action="import"><span>📥 导入备份</span><span class="arrow">›</span></button>';
    html += '<button class="row-btn" data-action="demo"><span>🎲 追加演示任务与奖励</span><span class="arrow">›</span></button>';
    html += '<button class="row-btn danger" data-action="reset"><span>🗑️ 清空所有数据</span><span class="arrow">›</span></button>';

    html += '<div class="sec-title"><span>关于</span></div>';
    html += '<div style="padding:14px;border-radius:14px;background:var(--bg-soft);border:1px solid var(--line);font-size:12.5px;color:var(--text-dim);line-height:1.7">' +
      '人生副本 v1.0 · 纯本地应用<br>' +
      '数据保存在这台设备的浏览器里，不上传服务器。<br>' +
      '换设备 / 清缓存前，请先「导出备份」。<br>' +
      '等级 ' + s.level + ' · 累计经验 ' + s.totalXp + ' · 连续 ' + s.streak + ' 天' +
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
      draft = {
        id: null, type: type, name: '', icon: type === 'boss' ? '👑' : '✅',
        target: 1, unit: '次', diff: diff, due: type === 'boss' ? dayKey(addDays(new Date(), 14)) : ''
      };
    }
    renderTaskModal();
  }

  function renderTaskModal() {
    const d = draft;
    const mul = TYPE_MUL[d.type];
    const base = DIFFS[d.diff];
    const xp = base.xp * mul, coins = base.coins * mul;

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
            (mul > 1 ? '（' + TYPE_LABEL[d.type] + '任务 ×' + mul + '）' : '') + '</p>' +

          '<div class="field"><label>任务类型</label><div class="diff-row" style="grid-template-columns:repeat(3,1fr)">' + types + '</div></div>' +

          '<div class="field"><label>任务名称</label>' +
            '<input class="input" data-field="name" maxlength="30" placeholder="例如：跑步 3 公里" value="' + esc(d.name) + '"></div>' +

          '<div class="field"><label>图标</label><div class="emoji-row">' + emojis + '</div></div>' +

          '<div class="field" style="display:flex;gap:10px">' +
            '<div style="flex:1"><label>目标数量</label>' +
              '<input class="input" type="number" min="1" max="999" inputmode="numeric" data-field="target" value="' + d.target + '"></div>' +
            '<div style="flex:1"><label>单位</label>' +
              '<input class="input" data-field="unit" maxlength="4" value="' + esc(d.unit) + '" placeholder="次/页/小时"></div>' +
          '</div>' +

          '<div class="field"><label>难度（决定奖励多少）</label><div class="diff-row">' + diffs + '</div></div>' +

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
    const base = DIFFS[d.diff];
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
      t.xp = base.xp * mul;
      t.coins = base.coins * mul;
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
        diff: d.diff, xp: base.xp * mul, coins: base.coins * mul,
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

    if (d.id) {
      const r = state.rewards.find((x) => x.id === d.id);
      r.name = name; r.icon = d.icon; r.cost = cost;
    } else {
      state.rewards.push({ id: uid(), name: name, icon: d.icon, cost: cost, bought: 0 });
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
        if (draft) { draft.type = el.dataset.v; if (draft.type !== 'boss') draft.due = ''; renderTaskModal(); }
        break;
      case 'draft-diff':
        if (draft) { draft.diff = el.dataset.v; renderTaskModal(); }
        break;
      case 'draft-icon':
        if (draft) { draft.icon = el.dataset.v; draftKind === 'task' ? renderTaskModal() : renderRewardModal(); }
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
    const f = el.dataset.field;
    if (!f) return;

    if (draft && draftKind === 'task') {
      if (f === 'target') draft.target = el.value;
      else draft[f] = el.value;
    } else if (draft && draftKind === 'reward') {
      if (f === 'cost') draft.cost = el.value;
      else draft[f] = el.value;
    }
  });

  // 昵称：失焦时保存
  document.addEventListener('change', function (e) {
    const el = e.target;
    if (el.dataset.field === 'player-name') {
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
    }
    if (e.key === 'Escape') closeModal();
  });

  // 从后台切回前台：检查是否跨天，需要重置每日/每周任务
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      if (rollCycles()) renderAll();
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
    save();
    renderAll();

    // 注册 Service Worker（离线可用 + 可安装到桌面），file:// 打开时跳过
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
