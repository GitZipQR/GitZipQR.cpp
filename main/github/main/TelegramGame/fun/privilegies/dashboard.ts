import { Markup, type Context, type Telegraf } from "telegraf";
import { ParseUserStateToDatabase, TelegramGameMenu } from "../..";
import database from "../../../../db/connection";
import type { ITelegramGameUsers } from "../../types/user/type";
import type { ITelegramGamePrivilegiesCommand, ITelegramGamePrivilegiesList } from "../../types/list_privilegies/type";
export const ParsePrivilegiesListToDatabase = async (ctx: Context) => {
  const user = await ParseUserStateToDatabase(ctx);
  const rank = await database("telegram_game", "SELECT * FROM list_privileges WHERE level = $1", [user.previlege]) as ITelegramGamePrivilegiesList;
  return { rank: rank.rows[0] as ITelegramGamePrivilegiesList, user: user };
}
export const ParsePrivilegiesCommand = async (ctx: Context) => {
  const user = await ParseUserStateToDatabase(ctx);
  const rank = await ParsePrivilegiesListToDatabase(ctx);
  const command = await database("telegram_game", "SELECT * FROM privileges_command WHERE level = $1", [user.previlege]) as ITelegramGamePrivilegiesCommand;
  return { rank: rank, user: user as ITelegramGameUsers, command: command.rows };
}
export const TelegramFunGamePrivilegiesDashboard = (bot: Telegraf) => {
  bot.action("privilegies_dashboard", async (ctx) => {
    const user = await ParseUserStateToDatabase(ctx);
    const rank = await ParsePrivilegiesListToDatabase(ctx);
    const command = await ParsePrivilegiesCommand(ctx);
    const keyboard = [];
    for (let i in command.command) {
      if (command.command[i].level == command.rank.rank.level) {
        keyboard.push(Markup.button.callback(command.command[i].command, `p_${command.command[i].action}`));
      }
    }
    if (rank) {
      return ctx.reply(`${user.username}, вы в панели привилегии '${rank.rank.prefix}', выберите что вы хотите сделать`, Markup.inlineKeyboard(keyboard));
    }
  });
};
