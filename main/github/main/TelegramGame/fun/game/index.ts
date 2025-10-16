import database from "../../../../db/connection";
import { Context, Markup, Telegraf } from "telegraf";
import { TelegramFormatNumber, TelegramGameParseUserStateToDatabase } from "../../index";
import { TelegramGameMenu } from "../../index";

// Общая функция для обработки ставок
export const handleBet = async (
  ctx: any,
  betAmount: number,
  winMultiplier: number,
  gameName: string,
  action: string
) => {
  const user = await TelegramGameParseUserStateToDatabase(ctx);

  // Проверка баланса
  if (user.balance < betAmount) {
    return ctx.reply(
      `❌ У вас недостаточно средств для игры "${gameName}". Минимальная ставка — ${betAmount} 💰.`,
      Markup.inlineKeyboard([[Markup.button.callback("← Назад", action)]])
    );
  }

  // Списание ставки
  await database(
    "telegram_game",
    "UPDATE users SET balance = balance - $1, games_played = games_played + 1 WHERE user_id = $2",
    [betAmount, ctx.from.id]
  );

  return user;
};
export const TelegramGameKeyboardsBalance = async (ctx: Context, action: string) => {
  const user = await TelegramGameParseUserStateToDatabase(ctx)

  const keyboard0 = [];
  const keyboard1 = []
  for (let i = 5; i < user.balance; i += 5) {
    keyboard0.push(Markup.button.callback(`${TelegramFormatNumber(i / 100 * 30)} 💰`, `${action}_${i}`))
  }
  for (let i = 5; i < user.balance; i += 10) {
    keyboard1.push(Markup.button.callback(`${TelegramFormatNumber(i / 100 * 30)} 💰`, `${action}_${i}`))
  }
  return Markup.inlineKeyboard([
    keyboard0,
    keyboard1,
    TelegramGameMenu
  ])

};
// Главное меню игр
export const TelegramFunGame = (bot: Telegraf) => {
  bot.action("games", async (ctx) => {
    let keyboard0 = []
    const db = await database("telegram_game", 'SELECT * FROM fun_games')
    const user = await TelegramGameParseUserStateToDatabase(ctx)
    let list = ''
    for (let i = 0; i < db.length; i++) {
      list += `[${db.rows[i].id}] ${db.rows[i].title} ${db.rows[i].description}\n`
      keyboard0.push(Markup.button.callback(`${db.rows[i].title}`, `${db.rows[i].action}`))

    }
    ctx.reply(`${user.username}, вы в игровом меню, выберите игру:
      ${list}`, Markup.inlineKeyboard([
      keyboard0,
      TelegramGameMenu
    ]));
  });
  bot.action("wheel", async (ctx) => {
    const user = await TelegramGameParseUserStateToDatabase(ctx);
    let x = 0
    let y = 0
    for (let i = 0; i < 500; i++) { x += Math.floor(Math.random() * i) }
    for (let i = 0; i < 2000; i++) { y += Math.floor(Math.random() * i) }
    let win = x > y && x + y > 100 ? x + y : x > y && x + y <= 100 ? x + y / 2 : x < y && x + y > 100 ? x + y / 2 : x < y && x + y <= 100 ? x + y / 4 : 0 * (user.level as number) * user.balance
    let smile = win * 100 > 100000 ? "🟢" : win <= 0 ? "🔴" : ""
    type what = '-' | '+'
    let what: what = win > Math.random() ? '+' : '-'
    await database("telegram_game", `UPDATE users SET balance = balance ${what}${win} WHERE user_id = ${ctx.from.id}`)
    return ctx.reply(`${user.username}, колесо удачи: 
    ${smile} Вам выпал коеффициент ${TelegramFormatNumber(x)} и ${TelegramFormatNumber(y)} = ${what}${TelegramFormatNumber(win * 100)} 💰`, Markup.inlineKeyboard([
      [Markup.button.callback("🔄 Попробовать снова", "game_wheel")],
      TelegramGameMenu
    ]))
  })
}