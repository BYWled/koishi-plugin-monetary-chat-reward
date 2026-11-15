var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Config: () => Config,
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  usage: () => usage
});
module.exports = __toCommonJS(src_exports);
var import_koishi = require("koishi");

// src/core.ts
var defaultConfig = {
  currency: "coin",
  enableRandom: true,
  chatProbability: 1,
  minAmount: 5,
  maxAmount: 20,
  perUserCooldownMin: 30,
  dailyPerUserLimit: 3,
  dailyChannelBudget: 200,
  dailyGlobalBudget: 0,
  minMessageLength: 5,
  silentChance: 0,
  replyTemplate: "手气不错！{at} 获得 {amount} {currency}",
  channelWhitelist: [],
  channelBlacklist: [],
  userBlacklist: [],
  enableRank: true,
  minMessagesPerPeriod: 10,
  excludeUserIds: [],
  prizes: [
    { period: "daily", rank: 1, amount: 200 },
    { period: "daily", rank: 2, amount: 100 },
    { period: "daily", rank: 3, amount: 50 }
  ],
  announce: true,
  dailySettleCron: "10 0 * * *",
  weeklySettleCron: "55 23 * * 0",
  monthlySettleCron: "55 23 * * *"
};
function toLocalDateKey(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
__name(toLocalDateKey, "toLocalDateKey");
function addDays(value, days) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}
__name(addDays, "addDays");
function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 864e5));
}
__name(isoWeekNumber, "isoWeekNumber");

// src/commands.ts
function registerCommands(deps) {
  const { ctx, config } = deps;
  ctx.command("chatreward.help", "查看聊天奖励插件帮助").action(() => [
    "💬 聊天奖励插件（monetary-chat-reward）",
    "",
    "【功能一：聊天随机奖励】",
    "· 每条消息按配置概率随机奖励货币，受冷却/每日上限/频道预算/黑白名单约束",
    "· chatreward.stats — 查看个人奖励统计",
    "",
    "【功能二：聊天排行奖励】（可选，需安装聊天统计插件 koishi-plugin-message-counter）",
    "· 按日/周/月自动结算发言榜奖励，配置中可设置各周期名次金额与最低发言门槛",
    "· chatreward.settle <daily|weekly|monthly>（管理员）— 手动结算指定周期（幂等）",
    "· chatreward.budget（管理员）— 查看今日随机奖励支出与预算",
    "",
    "【提示】",
    "· 未安装聊天统计插件时排行奖励不可用（随机奖励不受影响）",
    "· 周榜在每周日 23:55 结算（须在统计插件周一 00:00 周重置前），月榜在每月最后一天 23:55 结算"
  ].join("\n"));
  ctx.command("chatreward.settle <period:string>", "手动结算排行奖励（管理员）", { authority: 3 }).action(async (_, period) => {
    if (period !== "daily" && period !== "weekly" && period !== "monthly") {
      return "请指定周期：daily / weekly / monthly";
    }
    return deps.runSettle(period);
  });
  ctx.command("chatreward.budget", "查看今日随机奖励支出（管理员）", { authority: 3 }).action(async () => {
    const start = /* @__PURE__ */ new Date();
    start.setHours(0, 0, 0, 0);
    const rows = await ctx.database.get("chat_reward_log", {
      type: "random",
      createdAt: { $gte: start }
    });
    if (rows.length === 0) return "今日暂无随机奖励支出。";
    const byChannel = /* @__PURE__ */ new Map();
    let total = 0;
    for (const row of rows) {
      byChannel.set(row.channelId, (byChannel.get(row.channelId) ?? 0) + Number(row.amount));
      total += Number(row.amount);
    }
    return [
      `今日随机奖励支出：${total} ${config.currency}（全局预算 ${config.dailyGlobalBudget || "不限"}）`,
      ...[...byChannel.entries()].map(([channelId, spent]) => `- 频道 ${channelId}：${spent} / ${config.dailyChannelBudget || "不限"}`)
    ].join("\n");
  });
  ctx.command("chatreward.stats", "查看个人聊天奖励统计").userFields(["id"]).action(async ({ session }) => {
    if (!session?.userId) return "无法获取会话信息。";
    const uid = Number(session.user?.id);
    if (!Number.isFinite(uid)) return "无法获取用户数字 ID。";
    const records = await ctx.database.get("chat_reward_log", { uid });
    if (records.length === 0) return "你还没有获得过聊天奖励。";
    const random = records.filter((r) => r.type === "random");
    const rank = records.filter((r) => r.type === "rank");
    const sum = /* @__PURE__ */ __name((rows) => rows.reduce((acc, r) => acc + Number(r.amount), 0), "sum");
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const todayRandom = random.filter((r) => new Date(r.createdAt) >= today);
    return [
      `聊天奖励统计：`,
      `随机奖励：今日 ${todayRandom.length} 次 / 累计 ${random.length} 次，共 ${sum(random)} ${config.currency}`,
      `排行奖励：累计 ${rank.length} 次，共 ${sum(rank)} ${config.currency}`
    ].join("\n");
  });
}
__name(registerCommands, "registerCommands");

// src/index.ts
var name = "monetary-chat-reward";
var inject = {
  required: ["database", "monetary"],
  // 定时任务依赖 cron 插件（ctx.cron）
  optional: ["cron"]
};
var logger = new import_koishi.Logger("monetary-chat-reward");
var usage = `
<div style="max-width: 720px; font-family: sans-serif; line-height: 1.6;">
  <h1>💬 monetary-chat-reward</h1>
  <p>聊天随机奖励 + 聊天排行奖励。</p>
  <h3>依赖</h3>
  <ul>
    <li><b>聊天随机奖励</b>：无额外依赖。</li>
    <li><b>聊天排行奖励</b>：可选依赖聊天统计插件 <code>koishi-plugin-message-counter</code>（发言计数器）。
      未安装时排行奖励不可用（随机奖励不受影响）；已安装时直接读取其日/周/月计数，无需额外统计表。</li>
  </ul>
  <h3>排行结算时序</h3>
  <ul>
    <li>日榜：每天 00:10 结算昨日榜（读 message-counter 的 yesterdayPostCount，晚于其 00:00 日重置）。</li>
    <li>周榜：每周日 23:55 结算本周榜（读 thisWeekPostCount，须在其周一 00:00 周重置之前；若当时机器人离线，该周数据无法补发）。</li>
    <li>月榜：每日 23:55 检查，仅本月最后一天实际结算（读 thisMonthPostCount）。</li>
  </ul>
</div>
`;
var RankPrizeSchema = import_koishi.Schema.object({
  period: import_koishi.Schema.union(["daily", "weekly", "monthly"]).required().description("结算周期"),
  rank: import_koishi.Schema.number().min(1).step(1).description("名次"),
  amount: import_koishi.Schema.number().min(0).description("奖励数额")
});
var Config = import_koishi.Schema.intersect([
  import_koishi.Schema.object({
    currency: import_koishi.Schema.string().default(defaultConfig.currency).description("货币单位")
  }).description("基础设置"),
  import_koishi.Schema.object({
    enableRandom: import_koishi.Schema.boolean().default(defaultConfig.enableRandom).description("启用聊天随机奖励"),
    chatProbability: import_koishi.Schema.number().min(0).max(100).default(defaultConfig.chatProbability).description("每条消息触发奖励的概率（%）"),
    minAmount: import_koishi.Schema.number().min(0).default(defaultConfig.minAmount).description("单次奖励最小数额"),
    maxAmount: import_koishi.Schema.number().min(0).default(defaultConfig.maxAmount).description("单次奖励最大数额"),
    perUserCooldownMin: import_koishi.Schema.number().min(0).default(defaultConfig.perUserCooldownMin).description("同一用户两次奖励的最小间隔（分钟，0 表示不冷却）"),
    dailyPerUserLimit: import_koishi.Schema.number().min(0).step(1).default(defaultConfig.dailyPerUserLimit).description("每人每日最多触发次数（0 表示不限）"),
    dailyChannelBudget: import_koishi.Schema.number().min(0).default(defaultConfig.dailyChannelBudget).description("每频道每日奖励支出预算（0 表示不限）"),
    dailyGlobalBudget: import_koishi.Schema.number().min(0).default(defaultConfig.dailyGlobalBudget).description("全局每日奖励支出预算（0 表示不限）"),
    minMessageLength: import_koishi.Schema.number().min(1).step(1).default(defaultConfig.minMessageLength).description("触发奖励所需的最短消息长度（剔除标记与空白后）"),
    silentChance: import_koishi.Schema.number().min(0).max(100).default(defaultConfig.silentChance).description("触发后保持静默（只入账不回复）的概率（%）"),
    replyTemplate: import_koishi.Schema.string().default(defaultConfig.replyTemplate).description("回复模板，可用 {at} {amount} {currency}")
  }).description("聊天随机奖励"),
  import_koishi.Schema.intersect([
    import_koishi.Schema.object({
      channelWhitelist: import_koishi.Schema.array(String).role("table").default(defaultConfig.channelWhitelist).description("频道白名单（非空时仅在这些频道触发随机奖励）"),
      channelBlacklist: import_koishi.Schema.array(String).role("table").default(defaultConfig.channelBlacklist).description("频道黑名单"),
      userBlacklist: import_koishi.Schema.array(String).role("table").default(defaultConfig.userBlacklist).description("用户黑名单（随机奖励不触发）")
    }).description("黑白名单")
  ]),
  import_koishi.Schema.object({
    enableRank: import_koishi.Schema.boolean().default(defaultConfig.enableRank).description("启用聊天排行奖励（需要聊天统计插件）"),
    minMessagesPerPeriod: import_koishi.Schema.number().min(0).step(1).default(defaultConfig.minMessagesPerPeriod).description("参与评奖的最低周期发言数"),
    excludeUserIds: import_koishi.Schema.array(String).role("table").default(defaultConfig.excludeUserIds).description("排行评奖排除的用户 ID"),
    prizes: import_koishi.Schema.array(RankPrizeSchema).role("table").default(defaultConfig.prizes).description("名次奖励配置（rank 未配置的名次不发奖）"),
    announce: import_koishi.Schema.boolean().default(defaultConfig.announce).description("结算后向频道公告"),
    dailySettleCron: import_koishi.Schema.string().default(defaultConfig.dailySettleCron).description("日榜结算 cron（须晚于 message-counter 的 00:00 日重置）"),
    weeklySettleCron: import_koishi.Schema.string().default(defaultConfig.weeklySettleCron).description("周榜结算 cron（须在 message-counter 周一 00:00 周重置之前，默认周日 23:55）"),
    monthlySettleCron: import_koishi.Schema.string().default(defaultConfig.monthlySettleCron).description("月榜结算检查 cron（每日检查，仅本月最后一天实际结算）")
  }).description("聊天排行奖励（可选，依赖 koishi-plugin-message-counter）")
]);
function apply(ctx, config) {
  ctx.model.extend("chat_reward_log", {
    id: "unsigned",
    type: "string",
    uid: "unsigned",
    userId: "string",
    platform: "string",
    channelId: "string",
    amount: "double",
    currency: "string",
    createdAt: "timestamp"
  }, { autoInc: true, primary: "id" });
  ctx.model.extend("chat_reward_settlement", {
    id: "unsigned",
    periodType: "string",
    periodKey: "string",
    channelId: "string",
    rank: "unsigned",
    uid: "unsigned",
    userId: "string",
    amount: "double",
    currency: "string",
    createdAt: "timestamp"
  }, {
    autoInc: true,
    primary: "id",
    unique: [["periodType", "periodKey", "channelId", "rank"]]
  });
  function hasTable(tableName) {
    return Boolean(ctx.database.tables?.[tableName]);
  }
  __name(hasTable, "hasTable");
  function hasMsgCount() {
    return hasTable("message_counter_records");
  }
  __name(hasMsgCount, "hasMsgCount");
  async function resolveUid(session) {
    const direct = Number(session.user?.id);
    if (Number.isFinite(direct) && direct > 0) return direct;
    if (!session.userId || !session.platform) return null;
    try {
      const [binding] = await ctx.database.get("binding", {
        platform: session.platform,
        pid: session.userId
      });
      return binding ? Number(binding.aid) : null;
    } catch {
      return null;
    }
  }
  __name(resolveUid, "resolveUid");
  async function seedDailySpend(dateKey) {
    if (spendDate === dateKey) return;
    try {
      const start = /* @__PURE__ */ new Date();
      start.setHours(0, 0, 0, 0);
      const rows = await ctx.database.get("chat_reward_log", {
        type: "random",
        createdAt: { $gte: start }
      });
      channelSpend = /* @__PURE__ */ new Map();
      globalSpend = 0;
      dailyUserCounts.clear();
      for (const row of rows) {
        channelSpend.set(row.channelId, (channelSpend.get(row.channelId) ?? 0) + Number(row.amount));
        globalSpend += Number(row.amount);
        const key = userCountKey(row.platform, row.userId);
        const counter = dailyUserCounts.get(key);
        dailyUserCounts.set(key, { date: dateKey, count: (counter?.date === dateKey ? counter.count : 0) + 1 });
      }
      spendDate = dateKey;
    } catch (error) {
      logger.warn("读取今日奖励支出失败：%o", error);
    }
  }
  __name(seedDailySpend, "seedDailySpend");
  const cooldowns = /* @__PURE__ */ new Map();
  const dailyUserCounts = /* @__PURE__ */ new Map();
  let channelSpend = /* @__PURE__ */ new Map();
  let globalSpend = 0;
  let spendDate = "";
  const userCountKey = /* @__PURE__ */ __name((platform, userId) => `${platform}:${userId}`, "userCountKey");
  ctx.on("message", async (session) => {
    if (!config.enableRandom) return;
    try {
      if (!session.userId || session.userId === session.selfId) return;
      const channelId = session.channelId;
      if (!channelId) return;
      if (config.channelWhitelist.length && !config.channelWhitelist.includes(channelId)) return;
      if (config.channelBlacklist.includes(channelId)) return;
      if (config.userBlacklist.includes(session.userId)) return;
      const textLength = (session.content ?? "").replace(/<[^>]+>/g, "").replace(/\s/g, "").length;
      if (textLength < config.minMessageLength) return;
      const today = toLocalDateKey(/* @__PURE__ */ new Date());
      await seedDailySpend(today);
      const userKey = userCountKey(session.platform, session.userId);
      if (config.dailyPerUserLimit > 0) {
        const counter2 = dailyUserCounts.get(userKey);
        const count = counter2?.date === today ? counter2.count : 0;
        if (count >= config.dailyPerUserLimit) return;
      }
      if (config.perUserCooldownMin > 0) {
        const last = cooldowns.get(userKey) ?? 0;
        if (Date.now() - last < config.perUserCooldownMin * 6e4) return;
      }
      if (Math.random() * 100 >= config.chatProbability) return;
      const amount = config.minAmount + Math.floor(Math.random() * (Math.max(config.maxAmount, config.minAmount) - config.minAmount + 1));
      if (amount <= 0) return;
      const channelSpent = channelSpend.get(channelId) ?? 0;
      if (config.dailyChannelBudget > 0 && channelSpent + amount > config.dailyChannelBudget) return;
      if (config.dailyGlobalBudget > 0 && globalSpend + amount > config.dailyGlobalBudget) return;
      const uid = await resolveUid(session);
      if (uid == null) return;
      const now = /* @__PURE__ */ new Date();
      await ctx.monetary.gain(uid, amount, config.currency);
      await ctx.database.create("chat_reward_log", {
        type: "random",
        uid,
        userId: session.userId,
        platform: session.platform,
        channelId,
        amount,
        currency: config.currency,
        createdAt: now
      });
      cooldowns.set(userKey, Date.now());
      const counter = dailyUserCounts.get(userKey);
      dailyUserCounts.set(userKey, { date: today, count: (counter?.date === today ? counter.count : 0) + 1 });
      channelSpend.set(channelId, (channelSpend.get(channelId) ?? 0) + amount);
      globalSpend += amount;
      if (Math.random() * 100 >= config.silentChance) {
        const mention = import_koishi.h.at(session.userId, { name: session.username || session.userId });
        const reply = config.replyTemplate.replaceAll("{at}", mention.toString()).replaceAll("{amount}", String(amount)).replaceAll("{currency}", config.currency);
        await session.send(reply);
      }
    } catch (error) {
      logger.warn("随机奖励处理失败：%o", error);
    }
  });
  const RANK_FIELD = {
    daily: "yesterdayPostCount",
    weekly: "thisWeekPostCount",
    monthly: "thisMonthPostCount"
  };
  async function announce(channelId, content) {
    if (!config.announce) return;
    for (const bot of ctx.bots) {
      if (!bot.user) continue;
      try {
        await bot.sendMessage(channelId, content);
        return;
      } catch (error) {
        logger.debug("公告发送失败（bot %s）：%-o", bot.selfId, error);
      }
    }
    logger.warn("公告发送失败：频道 %s 无可用 bot。", channelId);
  }
  __name(announce, "announce");
  async function buildUidMap() {
    const map = /* @__PURE__ */ new Map();
    if (!hasTable("binding")) return map;
    const bindings = await ctx.database.get("binding", {});
    for (const row of bindings) {
      const platformUserId = String(row.pid);
      if (!map.has(platformUserId)) map.set(platformUserId, Number(row.aid));
    }
    return map;
  }
  __name(buildUidMap, "buildUidMap");
  async function settlePeriod(period) {
    if (!hasMsgCount()) {
      return "缺少聊天统计插件（koishi-plugin-message-counter），排行奖励不可用；请安装后重启。";
    }
    const prizeMap = /* @__PURE__ */ new Map();
    for (const prize of config.prizes) {
      if (prize.period === period && prize.amount > 0) prizeMap.set(prize.rank, prize.amount);
    }
    if (prizeMap.size === 0) return `${period} 周期未配置奖励。`;
    const field = RANK_FIELD[period];
    const rows = await ctx.database.get("message_counter_records", { [field]: { $gt: 0 } });
    if (rows.length === 0) {
      return period === "daily" ? "昨日没有发言数据可结算。" : `${period === "weekly" ? "本周" : "本月"}没有发言数据可结算。`;
    }
    const now = /* @__PURE__ */ new Date();
    const periodKey = period === "daily" ? toLocalDateKey(addDays(now, -1)) : period === "weekly" ? `${now.getFullYear()}-W${String(isoWeekNumber(now)).padStart(2, "0")}` : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const label = period === "daily" ? toLocalDateKey(addDays(now, -1)) : period === "weekly" ? `本周（${periodKey}）` : `本月（${periodKey}）`;
    const channels = /* @__PURE__ */ new Map();
    for (const row of rows) {
      if (config.excludeUserIds.includes(row.userId)) continue;
      const users = channels.get(row.channelId) ?? /* @__PURE__ */ new Map();
      users.set(row.userId, (users.get(row.userId) ?? 0) + Number(row[field]));
      channels.set(row.channelId, users);
    }
    const uidMap = await buildUidMap();
    const payouts = [];
    for (const [channelId, users] of channels) {
      const ranked = [...users.entries()].filter(([, count]) => count >= config.minMessagesPerPeriod).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const lines = [];
      for (let index = 0; index < ranked.length; index++) {
        const rank = index + 1;
        if (!prizeMap.has(rank)) break;
        const [userId, count] = ranked[index];
        const amount = prizeMap.get(rank);
        const uid = uidMap.get(userId);
        if (uid == null) {
          logger.warn("用户 %s 无绑定 uid，跳过 %s %s 第 %s 名发奖。", userId, period, periodKey, rank);
          continue;
        }
        const existing = await ctx.database.get("chat_reward_settlement", {
          periodType: period,
          periodKey,
          channelId,
          rank
        });
        if (existing.length > 0) continue;
        await ctx.monetary.gain(uid, amount, config.currency);
        await ctx.database.create("chat_reward_settlement", {
          periodType: period,
          periodKey,
          channelId,
          rank,
          uid,
          userId,
          amount,
          currency: config.currency,
          createdAt: /* @__PURE__ */ new Date()
        });
        await ctx.database.create("chat_reward_log", {
          type: "rank",
          uid,
          userId,
          platform: "",
          channelId,
          amount,
          currency: config.currency,
          createdAt: /* @__PURE__ */ new Date()
        });
        lines.push(`#${rank} ${userId}（${count} 条）+${amount} ${config.currency}`);
      }
      if (lines.length > 0) {
        payouts.push(`【${channelId}】`, ...lines);
        await announce(
          channelId,
          `📊 ${period === "daily" ? "昨日" : period === "weekly" ? "本周" : "本月"}发言榜奖励已发放（${label}）：
${lines.join("\n")}`
        );
      }
    }
    return payouts.length ? ["结算完成：", ...payouts].join("\n") : `${label} 没有可发放的奖励（不足门槛或已结算）。`;
  }
  __name(settlePeriod, "settlePeriod");
  ctx.on("ready", () => {
    if (!config.enableRank) return;
    const timer = setTimeout(() => {
      if (!hasMsgCount()) {
        logger.warn("未检测到聊天统计插件（koishi-plugin-message-counter）：聊天排行奖励不可用；聊天随机奖励不受影响。");
      }
    }, 3e3);
    ctx.on("dispose", () => clearTimeout(timer));
  });
  if (config.enableRank) {
    ctx.cron(config.dailySettleCron, () => {
      settlePeriod("daily").then((msg) => logger.info(msg)).catch((e) => logger.warn("日榜结算失败：%o", e));
    });
    ctx.cron(config.weeklySettleCron, () => {
      settlePeriod("weekly").then((msg) => logger.info(msg)).catch((e) => logger.warn("周榜结算失败：%o", e));
    });
    ctx.cron(config.monthlySettleCron, () => {
      const now = /* @__PURE__ */ new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      if (tomorrow.getDate() !== 1) return;
      settlePeriod("monthly").then((msg) => logger.info(msg)).catch((e) => logger.warn("月榜结算失败：%o", e));
    });
  }
  registerCommands({
    ctx,
    config,
    logger,
    // 手动结算时附加周期警告：周榜非周日 / 月榜非月末，手动结算会按“至今”数据发放并占用该周期结算名额
    runSettle: /* @__PURE__ */ __name(async (period) => {
      const now = /* @__PURE__ */ new Date();
      let warning = "";
      if (period === "weekly" && now.getDay() !== 0) {
        warning = `⚠️ 今天不是周日，本次结算将按本周至今数据发放，并占用 ${periodKeyOf("weekly", now)} 周期的结算名额（周日 23:55 例行结算将跳过已发名次）。
`;
      }
      if (period === "monthly" && new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() !== now.getDate()) {
        warning = `⚠️ 今天不是本月最后一天，本次结算将按本月至今数据发放，并占用 ${periodKeyOf("monthly", now)} 周期的结算名额（月末例行结算将跳过已发名次）。
`;
      }
      return warning + await settlePeriod(period);
    }, "runSettle")
  });
}
__name(apply, "apply");
function periodKeyOf(period, now) {
  if (period === "weekly") {
    return `${now.getFullYear()}-W${String(isoWeekNumber(now)).padStart(2, "0")}`;
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
__name(periodKeyOf, "periodKeyOf");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  inject,
  name,
  usage
});
