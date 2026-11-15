<h1 align="center">koishi-plugin-monetary-chat-reward</h1>

<p align="center">
	为 Koishi 提供基于 <code>monetary</code> 通用货币系统的聊天随机奖励与聊天排行奖励。
</p>

<p align="center">
	<a href="https://www.npmjs.com/package/koishi-plugin-monetary-chat-reward"><img src="https://img.shields.io/npm/v/koishi-plugin-monetary-chat-reward?style=for-the-badge&logo=npm" alt="npm" /></a>
	<a href="https://github.com/BYWled/koishi-plugin-monetary-chat-reward"><img src="https://img.shields.io/github/stars/BYWled/koishi-plugin-monetary-chat-reward?style=for-the-badge&logo=github" alt="GitHub Stars" /></a>
	<a href="https://github.com/BYWled/koishi-plugin-monetary-chat-reward/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" /></a>
</p>

<p align="center">
	<a href="https://gitee.com/BYWled/koishi-plugin-monetary-chat-reward"><img src="https://img.shields.io/badge/Gitee-代码镜像-C71D23?style=for-the-badge&logo=gitee&logoColor=white" alt="Gitee Mirror" /></a>
	<a href="https://gitcode.com/BYWled/koishi-plugin-monetary-chat-reward"><img src="https://img.shields.io/badge/GitCode-代码镜像-2962FF?style=for-the-badge" alt="GitCode Mirror" /></a>
</p>

<p align="center">
	<a href="https://github.com/BYWled/koishi-plugin-monetary-chat-reward">GitHub</a> ·
	<a href="https://gitee.com/BYWled/koishi-plugin-monetary-chat-reward">Gitee</a> ·
	<a href="https://gitcode.com/BYWled/koishi-plugin-monetary-chat-reward">GitCode</a>
</p>

两个互补的活跃度激励业务：**聊天随机奖励**让每条消息都有小概率掉落货币（带完整的防刷约束）；**聊天排行奖励**按日/周/月自动给发言榜前列发放奖励（可选联动 [koishi-plugin-message-counter](https://github.com/araea/koishi-plugin-message-counter) 聊天统计插件）。

> 版本：**Alpha.1**

## ✨ 特性

- **💬 聊天随机奖励**：
  - 每条消息按配置概率触发，金额在最小/最大区间内随机。
  - **防刷四件套**：用户冷却、每人每日上限、每频道/全局每日预算、最短消息长度，预算与限额跨重启从流水播种。
  - 频道白/黑名单、用户黑名单、静默入账概率、自定义回复模板（`{at}` `{amount}` `{currency}`）。
- **🏆 聊天排行奖励（可选）**：
  - 可选依赖聊天统计插件 `koishi-plugin-message-counter`：已安装时**直接读取其日/周/月计数**，无需额外统计表；未安装时排行奖励不可用（随机奖励不受影响）。
  - 日/周/月三周期独立配置名次金额，支持最低发言门槛、排除用户（机器人/隐藏账号）。
  - 结算幂等（唯一约束防重发），结算后向频道公告榜单。
- **🧾 完整流水**：`chat_reward_log` 记录每次发放，可直接被信用分等上层体系引用。

## 📦 依赖

| 服务/插件 | 必需 | 说明 |
| --- | --- | --- |
| `database` | ✅ | 存储奖励流水与结算记录 |
| `monetary` | ✅ | 货币发放 |
| `cron` | 可选 | 提供定时结算（`ctx.cron`） |
| `koishi-plugin-message-counter` | 可选 | 聊天排行奖励的数据源（聊天统计） |

## 🎮 指令说明

### 用户指令

- **`chatreward.stats`** — 查看个人聊天奖励统计（随机/排行分别汇总）。
- **`chatreward.help`** — 查看指令帮助。

### 管理指令（authority ≥ 3）

- **`chatreward.settle <daily|weekly|monthly>`** — 手动结算指定周期（幂等；非周期末手动结算会提示占用该周期名额）。
- **`chatreward.budget`** — 查看今日随机奖励支出与各频道预算余量。

## ⚙️ 配置项

### 基础设置

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `currency` | string | `coin` | 货币单位 |

### 聊天随机奖励

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `enableRandom` | boolean | `true` | 启用聊天随机奖励 |
| `chatProbability` | number | `1` | 每条消息触发概率（%） |
| `minAmount` / `maxAmount` | number | `5` / `20` | 单次奖励数额区间 |
| `perUserCooldownMin` | number | `30` | 同一用户两次奖励最小间隔（分钟） |
| `dailyPerUserLimit` | number | `3` | 每人每日最多触发次数 |
| `dailyChannelBudget` | number | `200` | 每频道每日支出预算 |
| `dailyGlobalBudget` | number | `0` | 全局每日支出预算（0 不限） |
| `minMessageLength` | number | `5` | 触发所需最短消息长度 |
| `silentChance` | number | `0` | 静默入账概率（%） |
| `replyTemplate` | string | `手气不错！{at} 获得 {amount} {currency}` | 回复模板，可用 `{at}` `{amount}` `{currency}` |

### 黑白名单

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `channelWhitelist` | string[] | `[]` | 频道白名单（非空时仅在这些频道触发） |
| `channelBlacklist` | string[] | `[]` | 频道黑名单 |
| `userBlacklist` | string[] | `[]` | 用户黑名单 |

### 聊天排行奖励（可选，依赖聊天统计插件）

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `enableRank` | boolean | `true` | 启用排行奖励 |
| `minMessagesPerPeriod` | number | `10` | 参与评奖的最低周期发言数 |
| `excludeUserIds` | string[] | `[]` | 评奖排除的用户 ID |
| `prizes` | table[] | 日榜 1-3 名 200/100/50 | 各周期名次金额（period/rank/amount） |
| `announce` | boolean | `true` | 结算后向频道公告 |
| `dailySettleCron` | string | `10 0 * * *` | 日榜结算（须晚于统计插件 00:00 日重置） |
| `weeklySettleCron` | string | `55 23 * * 0` | 周榜结算（须在其周一 00:00 周重置前） |
| `monthlySettleCron` | string | `55 23 * * *` | 月榜检查（仅本月最后一天实际结算） |

## 🗃️ 数据库表

- `chat_reward_log`：奖励流水（随机/排行）。
- `chat_reward_settlement`：排行结算记录（唯一约束防重发）。

## ⏰ 结算时序说明

- 日榜每天 00:10 结算（读统计插件 `yesterdayPostCount`，晚于其 00:00 日重置）。
- 周榜每周日 23:55 结算（读 `thisWeekPostCount`，须在其周一 00:00 周重置前；若届时机器人离线，该周数据无法补发，可事后评估手动补偿）。
- 月榜每日 23:55 检查，仅本月最后一天实际结算。

## 📄 License

[MIT](https://github.com/BYWled/koishi-plugin-monetary-chat-reward/blob/main/LICENSE)
