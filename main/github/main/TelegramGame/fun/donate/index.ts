import { Markup, Telegraf } from "telegraf";
import { TelegramFormatNumber, TelegramGameMenu, TelegramGameParseUserStateToDatabase } from "../..";
import database from "../../../../db/connection";
import { createPayment } from "../../payment/tinkoff";
import type { IDonate } from "../../types/donate/type";
export const TelegramGameFunDonate = (bot: Telegraf) => {
  // Меню игр
  bot.action('donate_menu', async (ctx) => {
    const user = await TelegramGameParseUserStateToDatabase(ctx);
    let list = ''
    let keyboard = []
    const db = await database("telegram_game", "SELECT * FROM donate_menu")
    for (let i = 0; i < db.rows.length; i++) {
      list += `[${db.rows[i].id}] ${db.rows[i].item} ${db.rows[i].description}\n`
      keyboard.push(Markup.button.callback(`${db.rows[i].item}`, `donate_${i}`))
    }
    return ctx.reply(`${user.username}, вы в меню донатов, выберите донат:
      ${list}`, Markup.inlineKeyboard([
      keyboard,
      TelegramGameMenu
    ]));
  });
  bot.action('donate_\d+', async (ctx) => {
    const user = await TelegramGameParseUserStateToDatabase(ctx);
    const donateId = parseInt(ctx.match[0].split("_")[1]);
    if (donateId as IDonate) {
      const db = await database("telegram_game", "SELECT * FROM donate_menu WHERE action = $1", [donateId]);
      const donate = db.rows[0];
      const field = db.rows[0].field
      const operator = db.rows[0].operator
      const prev = db.rows[0].prev ? `${db.rows[0].field} ` : ''
      await database("telegram_game", `UPDATE ${db.rows[0].tables} SET ${field}${operator}${prev ? `${prev} ` : ''} donate = donate - $1 WHERE user_id = $2`, [donate.price, user.user_id]);
      return ctx.reply(`${user.username}, вы успешно купили ${donate.item} - ${donate.description} за ${donate.price}₽`);
    }
  })
}