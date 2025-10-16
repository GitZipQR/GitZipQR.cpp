import { Context, Markup, Telegraf } from "telegraf";
import { ParseUserStateToDatabase, TelegramGameMenu } from "../..";
import { ParsePrivilegiesCommand } from "./dashboard";
export const TelegramFunCommandPrivilegies = (bot: Telegraf) => {
  bot.action("p_givebalance", async (ctx) => {
    const user = await ParseUserStateToDatabase(ctx);
    return ctx.reply(`${user.username}, какую сумму вы хотите дать? Просто нажмите на кнопку ниже`,
      Markup.inlineKeyboard([
        [Markup.button.callback("100 💰", "p_givebalance_100"),
        Markup.button.callback("1.000 💰", "p_givebalance_1000"),
        Markup.button.callback("10.000 💰", "p_givebalance_10000"),
        Markup.button.callback("100.000 💰", "p_givebalance_100000"),],
        TelegramGameMenu
      ])
    );
  });
}
export const TelegramGiveBalance = (bot: Telegraf) => {
  bot.action("p_givebalance_\d+", async (ctx) => {
    const user = await ParseUserStateToDatabase(ctx);
    const balance = ctx.match[1];
    const keyboard = []
    return ctx.reply(`${user.username}, вы хотите дать ${balance} 💰? Теперь нажмите на кнопку ниже`,
      Markup.inlineKeyboard([
        Markup.button.callback("Да, дать", "p_givebalance_yes"),
        Markup.button.callback("Нет, не дать", "p_givebalance_no"),
      ])
    );
  });
}