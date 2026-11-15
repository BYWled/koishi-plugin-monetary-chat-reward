/** 奖励流水：type=random 聊天随机奖励 / type=rank 排行结算奖励 */
export interface ChatRewardLog {
  id: number
  type: 'random' | 'rank'
  uid: number
  userId: string
  platform: string
  channelId: string
  amount: number
  currency: string
  createdAt: Date
}

/** 排行奖励结算记录（唯一约束防重发） */
export interface ChatRewardSettlement {
  id: number
  periodType: 'daily' | 'weekly' | 'monthly'
  /** 周期标识：daily=YYYY-MM-DD / weekly=YYYY-Wnn / monthly=YYYY-MM */
  periodKey: string
  channelId: string
  rank: number
  uid: number
  userId: string
  amount: number
  currency: string
  createdAt: Date
}

export interface RankPrize {
  period: 'daily' | 'weekly' | 'monthly'
  rank: number
  amount: number
}

export interface ResolvedConfig {
  currency: string
  // ---------- 聊天随机奖励 ----------
  enableRandom: boolean
  /** 每条消息触发奖励的概率（百分比） */
  chatProbability: number
  minAmount: number
  maxAmount: number
  /** 同一用户两次奖励的最小间隔（分钟），0 表示不冷却 */
  perUserCooldownMin: number
  /** 每人每日最多触发次数，0 表示不限 */
  dailyPerUserLimit: number
  /** 每频道每日奖励支出预算，0 表示不限 */
  dailyChannelBudget: number
  /** 全局每日奖励支出预算，0 表示不限 */
  dailyGlobalBudget: number
  /** 触发奖励所需的最短消息长度（剔除标记与空白后） */
  minMessageLength: number
  /** 触发后保持静默（只入账不回复）的概率（百分比） */
  silentChance: number
  /** 回复模板：{at} {amount} {currency} 可用 */
  replyTemplate: string
  channelWhitelist: string[]
  channelBlacklist: string[]
  userBlacklist: string[]
  // ---------- 聊天排行奖励 ----------
  enableRank: boolean
  /** 参与评奖的最低周期发言数 */
  minMessagesPerPeriod: number
  /** 排行评奖排除的用户（机器人、隐藏用户等） */
  excludeUserIds: string[]
  prizes: RankPrize[]
  /** 是否向频道公告结算结果 */
  announce: boolean
  /** 日榜结算 cron（须晚于 message-counter 的 00:00 日重置） */
  dailySettleCron: string
  /** 周榜结算 cron（须在 message-counter 周一 00:00 周重置前，默认周日 23:55） */
  weeklySettleCron: string
  /** 月榜结算检查 cron（每日检查，仅本月最后一天实际结算） */
  monthlySettleCron: string
}

export const defaultConfig: ResolvedConfig = {
  currency: 'coin',
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
  replyTemplate: '手气不错！{at} 获得 {amount} {currency}',
  channelWhitelist: [],
  channelBlacklist: [],
  userBlacklist: [],
  enableRank: true,
  minMessagesPerPeriod: 10,
  excludeUserIds: [],
  prizes: [
    { period: 'daily', rank: 1, amount: 200 },
    { period: 'daily', rank: 2, amount: 100 },
    { period: 'daily', rank: 3, amount: 50 },
  ],
  announce: true,
  dailySettleCron: '10 0 * * *',
  weeklySettleCron: '55 23 * * 0',
  monthlySettleCron: '55 23 * * *',
}

export function toLocalDateKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(value: Date, days: number): Date {
  const result = new Date(value)
  result.setDate(result.getDate() + days)
  return result
}

/** ISO 周数（周一为一周开始） */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
}

