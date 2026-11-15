import { Context, Logger, Schema, h } from 'koishi'
import {} from 'koishi-plugin-monetary'
import {} from 'koishi-plugin-cron'
import {
  addDays,
  defaultConfig,
  isoWeekNumber,
  toLocalDateKey,
  type ChatRewardLog,
  type ChatRewardSettlement,
  type RankPrize,
  type ResolvedConfig,
} from './core'
import { registerCommands } from './commands'

export const name = 'monetary-chat-reward'

export const inject = {
  required: ['database', 'monetary'],
  // 定时任务依赖 cron 插件（ctx.cron）
  optional: ['cron'],
}

const logger = new Logger('monetary-chat-reward')

export const usage = `
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
`

/** message-counter 的记录表（可选联动，字段与其保持一致） */
interface MessageCounterRecords {
  channelId: string
  channelName: string
  userId: string
  username: string
  userAvatar: string
  todayPostCount: number
  thisWeekPostCount: number
  thisMonthPostCount: number
  thisYearPostCount: number
  totalPostCount: number
  yesterdayPostCount: number
}

declare module 'koishi' {
  interface Tables {
    chat_reward_log: ChatRewardLog
    chat_reward_settlement: ChatRewardSettlement
    message_counter_records: MessageCounterRecords
  }
}

export interface Config extends ResolvedConfig {}

const RankPrizeSchema = Schema.object({
  period: Schema.union(['daily', 'weekly', 'monthly'] as const).required().description('结算周期'),
  rank: Schema.number().min(1).step(1).description('名次'),
  amount: Schema.number().min(0).description('奖励数额'),
})

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    currency: Schema.string().default(defaultConfig.currency).description('货币单位'),
  }).description('基础设置'),
  Schema.object({
    enableRandom: Schema.boolean().default(defaultConfig.enableRandom).description('启用聊天随机奖励'),
    chatProbability: Schema.number().min(0).max(100).default(defaultConfig.chatProbability)
      .description('每条消息触发奖励的概率（%）'),
    minAmount: Schema.number().min(0).default(defaultConfig.minAmount).description('单次奖励最小数额'),
    maxAmount: Schema.number().min(0).default(defaultConfig.maxAmount).description('单次奖励最大数额'),
    perUserCooldownMin: Schema.number().min(0).default(defaultConfig.perUserCooldownMin)
      .description('同一用户两次奖励的最小间隔（分钟，0 表示不冷却）'),
    dailyPerUserLimit: Schema.number().min(0).step(1).default(defaultConfig.dailyPerUserLimit)
      .description('每人每日最多触发次数（0 表示不限）'),
    dailyChannelBudget: Schema.number().min(0).default(defaultConfig.dailyChannelBudget)
      .description('每频道每日奖励支出预算（0 表示不限）'),
    dailyGlobalBudget: Schema.number().min(0).default(defaultConfig.dailyGlobalBudget)
      .description('全局每日奖励支出预算（0 表示不限）'),
    minMessageLength: Schema.number().min(1).step(1).default(defaultConfig.minMessageLength)
      .description('触发奖励所需的最短消息长度（剔除标记与空白后）'),
    silentChance: Schema.number().min(0).max(100).default(defaultConfig.silentChance)
      .description('触发后保持静默（只入账不回复）的概率（%）'),
    replyTemplate: Schema.string().default(defaultConfig.replyTemplate)
      .description('回复模板，可用 {at} {amount} {currency}'),
  }).description('聊天随机奖励'),
  Schema.intersect([
    Schema.object({
      channelWhitelist: Schema.array(String).role('table').default(defaultConfig.channelWhitelist)
        .description('频道白名单（非空时仅在这些频道触发随机奖励）'),
      channelBlacklist: Schema.array(String).role('table').default(defaultConfig.channelBlacklist)
        .description('频道黑名单'),
      userBlacklist: Schema.array(String).role('table').default(defaultConfig.userBlacklist)
        .description('用户黑名单（随机奖励不触发）'),
    }).description('黑白名单'),
  ]),
  Schema.object({
    enableRank: Schema.boolean().default(defaultConfig.enableRank).description('启用聊天排行奖励（需要聊天统计插件）'),
    minMessagesPerPeriod: Schema.number().min(0).step(1).default(defaultConfig.minMessagesPerPeriod)
      .description('参与评奖的最低周期发言数'),
    excludeUserIds: Schema.array(String).role('table').default(defaultConfig.excludeUserIds)
      .description('排行评奖排除的用户 ID'),
    prizes: Schema.array(RankPrizeSchema).role('table').default(defaultConfig.prizes)
      .description('名次奖励配置（rank 未配置的名次不发奖）'),
    announce: Schema.boolean().default(defaultConfig.announce).description('结算后向频道公告'),
    dailySettleCron: Schema.string().default(defaultConfig.dailySettleCron).description('日榜结算 cron（须晚于 message-counter 的 00:00 日重置）'),
    weeklySettleCron: Schema.string().default(defaultConfig.weeklySettleCron).description('周榜结算 cron（须在 message-counter 周一 00:00 周重置之前，默认周日 23:55）'),
    monthlySettleCron: Schema.string().default(defaultConfig.monthlySettleCron).description('月榜结算检查 cron（每日检查，仅本月最后一天实际结算）'),
  }).description('聊天排行奖励（可选，依赖 koishi-plugin-message-counter）'),
])

export function apply(ctx: Context, config: Config) {
  ctx.model.extend('chat_reward_log', {
    id: 'unsigned',
    type: 'string',
    uid: 'unsigned',
    userId: 'string',
    platform: 'string',
    channelId: 'string',
    amount: 'double',
    currency: 'string',
    createdAt: 'timestamp',
  }, { autoInc: true, primary: 'id' })

  ctx.model.extend('chat_reward_settlement', {
    id: 'unsigned',
    periodType: 'string',
    periodKey: 'string',
    channelId: 'string',
    rank: 'unsigned',
    uid: 'unsigned',
    userId: 'string',
    amount: 'double',
    currency: 'string',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
    primary: 'id',
    unique: [['periodType', 'periodKey', 'channelId', 'rank']],
  })

  function hasTable(tableName: string): boolean {
    return Boolean((ctx.database as any).tables?.[tableName])
  }

  function hasMsgCount(): boolean {
    return hasTable('message_counter_records')
  }

  async function resolveUid(session: { user?: unknown; userId?: string; platform?: string }): Promise<number | null> {
    const direct = Number((session.user as { id?: number } | undefined)?.id)
    if (Number.isFinite(direct) && direct > 0) return direct
    if (!session.userId || !session.platform) return null
    try {
      // binding 表以 platform / pid 两列分别存储平台与平台用户 ID
      const [binding] = await ctx.database.get('binding', {
        platform: session.platform,
        pid: session.userId,
      })
      return binding ? Number(binding.aid) : null
    } catch {
      return null
    }
  }

  async function seedDailySpend(dateKey: string) {
    if (spendDate === dateKey) return
    try {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const rows = await ctx.database.get('chat_reward_log', {
        type: 'random',
        createdAt: { $gte: start },
      })
      channelSpend = new Map()
      globalSpend = 0
      dailyUserCounts.clear()
      for (const row of rows) {
        channelSpend.set(row.channelId, (channelSpend.get(row.channelId) ?? 0) + Number(row.amount))
        globalSpend += Number(row.amount)
        // 每人每日次数同样从流水播种，保证重启后限额仍然生效
        const key = userCountKey(row.platform, row.userId)
        const counter = dailyUserCounts.get(key)
        dailyUserCounts.set(key, { date: dateKey, count: (counter?.date === dateKey ? counter.count : 0) + 1 })
      }
      spendDate = dateKey
    } catch (error) {
      logger.warn('读取今日奖励支出失败：%o', error)
    }
  }

  // ---------- 随机奖励的内存态跟踪（重启自动重建，日切自恢复） ----------
  const cooldowns = new Map<string, number>()
  const dailyUserCounts = new Map<string, { date: string; count: number }>()
  let channelSpend = new Map<string, number>()
  let globalSpend = 0
  let spendDate = ''
  const userCountKey = (platform: string, userId: string) => `${platform}:${userId}`

  // ---------- 随机奖励监听 ----------
  ctx.on('message', async (session) => {
    if (!config.enableRandom) return
    try {
      if (!session.userId || session.userId === session.selfId) return
      const channelId = session.channelId
      if (!channelId) return
      if (config.channelWhitelist.length && !config.channelWhitelist.includes(channelId)) return
      if (config.channelBlacklist.includes(channelId)) return
      if (config.userBlacklist.includes(session.userId)) return

      const textLength = (session.content ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s/g, '')
        .length
      if (textLength < config.minMessageLength) return

      const today = toLocalDateKey(new Date())
      await seedDailySpend(today)

      const userKey = userCountKey(session.platform, session.userId)
      // 每人每日次数
      if (config.dailyPerUserLimit > 0) {
        const counter = dailyUserCounts.get(userKey)
        const count = counter?.date === today ? counter.count : 0
        if (count >= config.dailyPerUserLimit) return
      }
      // 用户冷却
      if (config.perUserCooldownMin > 0) {
        const last = cooldowns.get(userKey) ?? 0
        if (Date.now() - last < config.perUserCooldownMin * 60_000) return
      }
      // 概率
      if (Math.random() * 100 >= config.chatProbability) return

      const amount = config.minAmount +
        Math.floor(Math.random() * (Math.max(config.maxAmount, config.minAmount) - config.minAmount + 1))
      if (amount <= 0) return

      // 预算（超出则静默放弃）
      const channelSpent = channelSpend.get(channelId) ?? 0
      if (config.dailyChannelBudget > 0 && channelSpent + amount > config.dailyChannelBudget) return
      if (config.dailyGlobalBudget > 0 && globalSpend + amount > config.dailyGlobalBudget) return

      const uid = await resolveUid(session)
      if (uid == null) return

      const now = new Date()
      await ctx.monetary.gain(uid, amount, config.currency)
      await ctx.database.create('chat_reward_log', {
        type: 'random',
        uid,
        userId: session.userId,
        platform: session.platform,
        channelId,
        amount,
        currency: config.currency,
        createdAt: now,
      })

      // 更新内存态
      cooldowns.set(userKey, Date.now())
      const counter = dailyUserCounts.get(userKey)
      dailyUserCounts.set(userKey, { date: today, count: (counter?.date === today ? counter.count : 0) + 1 })
      channelSpend.set(channelId, (channelSpend.get(channelId) ?? 0) + amount)
      globalSpend += amount

      if (Math.random() * 100 >= config.silentChance) {
        // at 元素附带 name，兼容按 name 渲染提及的客户端（如 koishi 沙箱）
        const mention = h.at(session.userId, { name: session.username || session.userId })
        const reply = config.replyTemplate
          .replaceAll('{at}', mention.toString())
          .replaceAll('{amount}', String(amount))
          .replaceAll('{currency}', config.currency)
        await session.send(reply)
      }
    } catch (error) {
      logger.warn('随机奖励处理失败：%o', error)
    }
  })

  // ---------- 排行奖励：直读聊天统计插件计数（可选依赖） ----------
  const RANK_FIELD: Record<'daily' | 'weekly' | 'monthly', 'yesterdayPostCount' | 'thisWeekPostCount' | 'thisMonthPostCount'> = {
    daily: 'yesterdayPostCount',
    weekly: 'thisWeekPostCount',
    monthly: 'thisMonthPostCount',
  }

  async function announce(channelId: string, content: string) {
    if (!config.announce) return
    for (const bot of ctx.bots) {
      if (!bot.user) continue
      try {
        await bot.sendMessage(channelId, content)
        return
      } catch (error) {
        logger.debug('公告发送失败（bot %s）：%-o', bot.selfId, error)
      }
    }
    logger.warn('公告发送失败：频道 %s 无可用 bot。', channelId)
  }

  async function buildUidMap(): Promise<Map<string, number>> {
    const map = new Map<string, number>()
    if (!hasTable('binding')) return map
    const bindings = await ctx.database.get('binding', {})
    for (const row of bindings) {
      // pid 列即平台用户 ID（binding 以 platform / pid 两列分别存储）
      const platformUserId = String(row.pid)
      if (!map.has(platformUserId)) map.set(platformUserId, Number(row.aid))
    }
    return map
  }

  async function settlePeriod(period: 'daily' | 'weekly' | 'monthly'): Promise<string> {
    if (!hasMsgCount()) {
      return '缺少聊天统计插件（koishi-plugin-message-counter），排行奖励不可用；请安装后重启。'
    }
    const prizeMap = new Map<number, number>()
    for (const prize of config.prizes) {
      if (prize.period === period && prize.amount > 0) prizeMap.set(prize.rank, prize.amount)
    }
    if (prizeMap.size === 0) return `${period} 周期未配置奖励。`

    const field = RANK_FIELD[period]
    const rows = await ctx.database.get('message_counter_records', { [field]: { $gt: 0 } } as any)
    if (rows.length === 0) {
      return period === 'daily'
        ? '昨日没有发言数据可结算。'
        : `${period === 'weekly' ? '本周' : '本月'}没有发言数据可结算。`
    }

    // 结算周期标识：daily 取昨日；weekly 取当前 ISO 周；monthly 取当前月
    const now = new Date()
    const periodKey = period === 'daily'
      ? toLocalDateKey(addDays(now, -1))
      : period === 'weekly'
        ? `${now.getFullYear()}-W${String(isoWeekNumber(now)).padStart(2, '0')}`
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const label = period === 'daily'
      ? toLocalDateKey(addDays(now, -1))
      : period === 'weekly'
        ? `本周（${periodKey}）`
        : `本月（${periodKey}）`

    // 按频道聚合
    const channels = new Map<string, Map<string, number>>()
    for (const row of rows) {
      if (config.excludeUserIds.includes(row.userId)) continue
      const users = channels.get(row.channelId) ?? new Map()
      users.set(row.userId, (users.get(row.userId) ?? 0) + Number(row[field]))
      channels.set(row.channelId, users)
    }

    const uidMap = await buildUidMap()
    const payouts: string[] = []
    for (const [channelId, users] of channels) {
      const ranked = [...users.entries()]
        .filter(([, count]) => count >= config.minMessagesPerPeriod)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      const lines: string[] = []
      for (let index = 0; index < ranked.length; index++) {
        const rank = index + 1
        if (!prizeMap.has(rank)) break
        const [userId, count] = ranked[index]
        const amount = prizeMap.get(rank)!
        const uid = uidMap.get(userId)
        if (uid == null) {
          logger.warn('用户 %s 无绑定 uid，跳过 %s %s 第 %s 名发奖。', userId, period, periodKey, rank)
          continue
        }
        // 幂等：唯一索引 (periodType, periodKey, channelId, rank) 兜底
        const existing = await ctx.database.get('chat_reward_settlement', {
          periodType: period,
          periodKey,
          channelId,
          rank,
        })
        if (existing.length > 0) continue

        await ctx.monetary.gain(uid, amount, config.currency)
        await ctx.database.create('chat_reward_settlement', {
          periodType: period,
          periodKey,
          channelId,
          rank,
          uid,
          userId,
          amount,
          currency: config.currency,
          createdAt: new Date(),
        })
        // 排行流水同样入日志表（platform 未知时留空，uid 已可用于信用分统计）
        await ctx.database.create('chat_reward_log', {
          type: 'rank',
          uid,
          userId,
          platform: '',
          channelId,
          amount,
          currency: config.currency,
          createdAt: new Date(),
        })
        lines.push(`#${rank} ${userId}（${count} 条）+${amount} ${config.currency}`)
      }
      if (lines.length > 0) {
        payouts.push(`【${channelId}】`, ...lines)
        await announce(channelId,
          `📊 ${period === 'daily' ? '昨日' : period === 'weekly' ? '本周' : '本月'}发言榜奖励已发放（${label}）：\n${lines.join('\n')}`)
      }
    }
    return payouts.length ? ['结算完成：', ...payouts].join('\n') : `${label} 没有可发放的奖励（不足门槛或已结算）。`
  }

  // 依赖提示（延迟检测：等待所有插件完成表注册后再判断）
  ctx.on('ready', () => {
    if (!config.enableRank) return
    const timer = setTimeout(() => {
      if (!hasMsgCount()) {
        logger.warn('未检测到聊天统计插件（koishi-plugin-message-counter）：聊天排行奖励不可用；聊天随机奖励不受影响。')
      }
    }, 3_000)
    ctx.on('dispose', () => clearTimeout(timer))
  })

  // 定时任务（依赖 cron 插件提供 ctx.cron）
  if (config.enableRank) {
    ctx.cron(config.dailySettleCron, () => {
      settlePeriod('daily').then((msg) => logger.info(msg)).catch((e) => logger.warn('日榜结算失败：%o', e))
    })
    ctx.cron(config.weeklySettleCron, () => {
      // 周日在 23:55 结算，须在 message-counter 周一 00:00 周重置之前
      settlePeriod('weekly').then((msg) => logger.info(msg)).catch((e) => logger.warn('周榜结算失败：%o', e))
    })
    ctx.cron(config.monthlySettleCron, () => {
      // 每日检查，仅本月最后一天实际结算（在 message-counter 月初 00:00 月重置之前）
      const now = new Date()
      const tomorrow = new Date(now)
      tomorrow.setDate(now.getDate() + 1)
      if (tomorrow.getDate() !== 1) return
      settlePeriod('monthly').then((msg) => logger.info(msg)).catch((e) => logger.warn('月榜结算失败：%o', e))
    })
  }

  registerCommands({
    ctx,
    config,
    logger,
    // 手动结算时附加周期警告：周榜非周日 / 月榜非月末，手动结算会按“至今”数据发放并占用该周期结算名额
    runSettle: async (period) => {
      const now = new Date()
      let warning = ''
      if (period === 'weekly' && now.getDay() !== 0) {
        warning = `⚠️ 今天不是周日，本次结算将按本周至今数据发放，并占用 ${periodKeyOf('weekly', now)} 周期的结算名额（周日 23:55 例行结算将跳过已发名次）。\n`
      }
      if (period === 'monthly' && new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() !== now.getDate()) {
        warning = `⚠️ 今天不是本月最后一天，本次结算将按本月至今数据发放，并占用 ${periodKeyOf('monthly', now)} 周期的结算名额（月末例行结算将跳过已发名次）。\n`
      }
      return warning + (await settlePeriod(period))
    },
  })
}

function periodKeyOf(period: 'weekly' | 'monthly', now: Date): string {
  if (period === 'weekly') {
    return `${now.getFullYear()}-W${String(isoWeekNumber(now)).padStart(2, '0')}`
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
