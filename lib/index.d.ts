import { Context, Schema } from 'koishi';
import { type ChatRewardLog, type ChatRewardSettlement, type ResolvedConfig } from './core';
export declare const name = "monetary-chat-reward";
export declare const inject: {
    required: string[];
    optional: string[];
};
export declare const usage = "\n<div style=\"max-width: 720px; font-family: sans-serif; line-height: 1.6;\">\n  <h1>\uD83D\uDCAC monetary-chat-reward</h1>\n  <p>\u804A\u5929\u968F\u673A\u5956\u52B1 + \u804A\u5929\u6392\u884C\u5956\u52B1\u3002</p>\n  <h3>\u4F9D\u8D56</h3>\n  <ul>\n    <li><b>\u804A\u5929\u968F\u673A\u5956\u52B1</b>\uFF1A\u65E0\u989D\u5916\u4F9D\u8D56\u3002</li>\n    <li><b>\u804A\u5929\u6392\u884C\u5956\u52B1</b>\uFF1A\u53EF\u9009\u4F9D\u8D56\u804A\u5929\u7EDF\u8BA1\u63D2\u4EF6 <code>koishi-plugin-message-counter</code>\uFF08\u53D1\u8A00\u8BA1\u6570\u5668\uFF09\u3002\n      \u672A\u5B89\u88C5\u65F6\u6392\u884C\u5956\u52B1\u4E0D\u53EF\u7528\uFF08\u968F\u673A\u5956\u52B1\u4E0D\u53D7\u5F71\u54CD\uFF09\uFF1B\u5DF2\u5B89\u88C5\u65F6\u76F4\u63A5\u8BFB\u53D6\u5176\u65E5/\u5468/\u6708\u8BA1\u6570\uFF0C\u65E0\u9700\u989D\u5916\u7EDF\u8BA1\u8868\u3002</li>\n  </ul>\n  <h3>\u6392\u884C\u7ED3\u7B97\u65F6\u5E8F</h3>\n  <ul>\n    <li>\u65E5\u699C\uFF1A\u6BCF\u5929 00:10 \u7ED3\u7B97\u6628\u65E5\u699C\uFF08\u8BFB message-counter \u7684 yesterdayPostCount\uFF0C\u665A\u4E8E\u5176 00:00 \u65E5\u91CD\u7F6E\uFF09\u3002</li>\n    <li>\u5468\u699C\uFF1A\u6BCF\u5468\u65E5 23:55 \u7ED3\u7B97\u672C\u5468\u699C\uFF08\u8BFB thisWeekPostCount\uFF0C\u987B\u5728\u5176\u5468\u4E00 00:00 \u5468\u91CD\u7F6E\u4E4B\u524D\uFF1B\u82E5\u5F53\u65F6\u673A\u5668\u4EBA\u79BB\u7EBF\uFF0C\u8BE5\u5468\u6570\u636E\u65E0\u6CD5\u8865\u53D1\uFF09\u3002</li>\n    <li>\u6708\u699C\uFF1A\u6BCF\u65E5 23:55 \u68C0\u67E5\uFF0C\u4EC5\u672C\u6708\u6700\u540E\u4E00\u5929\u5B9E\u9645\u7ED3\u7B97\uFF08\u8BFB thisMonthPostCount\uFF09\u3002</li>\n  </ul>\n</div>\n";
/** message-counter 的记录表（可选联动，字段与其保持一致） */
interface MessageCounterRecords {
    channelId: string;
    channelName: string;
    userId: string;
    username: string;
    userAvatar: string;
    todayPostCount: number;
    thisWeekPostCount: number;
    thisMonthPostCount: number;
    thisYearPostCount: number;
    totalPostCount: number;
    yesterdayPostCount: number;
}
declare module 'koishi' {
    interface Tables {
        chat_reward_log: ChatRewardLog;
        chat_reward_settlement: ChatRewardSettlement;
        message_counter_records: MessageCounterRecords;
    }
}
export interface Config extends ResolvedConfig {
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
export {};
