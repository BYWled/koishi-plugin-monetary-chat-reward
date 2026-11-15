import { Context, Logger } from 'koishi';
import type { ResolvedConfig } from './core';
export interface RewardDeps {
    ctx: Context;
    config: ResolvedConfig;
    logger: Logger;
    /** 手动结算指定周期，幂等（依赖聊天统计插件） */
    runSettle(period: 'daily' | 'weekly' | 'monthly'): Promise<string>;
}
export declare function registerCommands(deps: RewardDeps): void;
