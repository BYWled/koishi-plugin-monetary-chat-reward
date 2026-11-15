import { Context, Logger } from 'koishi'
import type { ResolvedConfig } from './core'

export interface RewardDeps {
  ctx: Context
  config: ResolvedConfig
  logger: Logger
  /** 手动结算指定周期，幂等（依赖聊天统计插件） */
  runSettle(period: 'daily' | 'weekly' | 'monthly'): Promise<string>
}

export function registerCommands(deps: RewardDeps) {
  const { ctx, config } = deps

  ctx.command('chatreward.help', '查看聊天奖励插件帮助')
    .action(() => [
      '💬 聊天奖励插件（monetary-chat-reward）',
      '',
      '【功能一：聊天随机奖励】',
      '· 每条消息按配置概率随机奖励货币，受冷却/每日上限/频道预算/黑白名单约束',
      '· chatreward.stats — 查看个人奖励统计',
      '',
      '【功能二：聊天排行奖励】（可选，需安装聊天统计插件 koishi-plugin-message-counter）',
      '· 按日/周/月自动结算发言榜奖励，配置中可设置各周期名次金额与最低发言门槛',
      '· chatreward.settle <daily|weekly|monthly>（管理员）— 手动结算指定周期（幂等）',
      '· chatreward.budget（管理员）— 查看今日随机奖励支出与预算',
      '',
      '【提示】',
      '· 未安装聊天统计插件时排行奖励不可用（随机奖励不受影响）',
      '· 周榜在每周日 23:55 结算（须在统计插件周一 00:00 周重置前），月榜在每月最后一天 23:55 结算',
    ].join('\n'))

  ctx.command('chatreward.settle <period:string>', '手动结算排行奖励（管理员）', { authority: 3 })
    .action(async (_, period) => {
      if (period !== 'daily' && period !== 'weekly' && period !== 'monthly') {
        return '请指定周期：daily / weekly / monthly'
      }
      return deps.runSettle(period)
    })

  ctx.command('chatreward.budget', '查看今日随机奖励支出（管理员）', { authority: 3 })
    .action(async () => {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const rows = await ctx.database.get('chat_reward_log', {
        type: 'random',
        createdAt: { $gte: start },
      })
      if (rows.length === 0) return '今日暂无随机奖励支出。'
      const byChannel = new Map<string, number>()
      let total = 0
      for (const row of rows) {
        byChannel.set(row.channelId, (byChannel.get(row.channelId) ?? 0) + Number(row.amount))
        total += Number(row.amount)
      }
      return [
        `今日随机奖励支出：${total} ${config.currency}（全局预算 ${config.dailyGlobalBudget || '不限'}）`,
        ...[...byChannel.entries()].map(([channelId, spent]) =>
          `- 频道 ${channelId}：${spent} / ${config.dailyChannelBudget || '不限'}`),
      ].join('\n')
    })

  ctx.command('chatreward.stats', '查看个人聊天奖励统计')
    .userFields(['id'])
    .action(async ({ session }) => {
      if (!session?.userId) return '无法获取会话信息。'
      const uid = Number((session.user as { id?: number } | undefined)?.id)
      if (!Number.isFinite(uid)) return '无法获取用户数字 ID。'
      const records = await ctx.database.get('chat_reward_log', { uid })
      if (records.length === 0) return '你还没有获得过聊天奖励。'
      const random = records.filter((r) => r.type === 'random')
      const rank = records.filter((r) => r.type === 'rank')
      const sum = (rows: typeof records) => rows.reduce((acc, r) => acc + Number(r.amount), 0)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayRandom = random.filter((r) => new Date(r.createdAt) >= today)
      return [
        `聊天奖励统计：`,
        `随机奖励：今日 ${todayRandom.length} 次 / 累计 ${random.length} 次，共 ${sum(random)} ${config.currency}`,
        `排行奖励：累计 ${rank.length} 次，共 ${sum(rank)} ${config.currency}`,
      ].join('\n')
    })
}
