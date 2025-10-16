import database from "../../db/connection"; // Импорт функции для работы с базой данных
import { configDotenv } from "dotenv";
import { Context, Markup, Telegraf } from "telegraf";
import type { ITelegramGameUsers } from "./types/user/type";
import { TelegramGameFunDonate } from "./fun/donate";
import { TelegramFunGame } from "./fun/game";
import { TelegramFunGameTops } from "./fun/top";

// Загрузка переменных окружения
configDotenv({ path: "../../.env" });

export const TelegramFormatNumber = (number: number): string => {
  if (number === 0) return "0";
  const units = [
    { value: 1e21, name: "♾️" }, // сексилион -> С
    { value: 1e18, name: "квинтил" }, // квинтиллион -> Кв
    { value: 1e15, name: "квад" }, // квадриллион -> Кд
    { value: 1e12, name: "трил" }, // триллион -> Т
    { value: 1e9, name: "млрд" }, // млрд -> Млрд (оставлено без изменения)
    { value: 1e6, name: "млн" }, // млн -> Млн (оставлено без изменения)
    { value: 1e3, name: "тыс" }, // тыс -> ккк
  ];

  for (const unit of units) {
    if (number >= unit.value) {
      return `${(number / unit.value).toFixed(1)} ${unit.name}`;
    }
  }

  return number.toString();
};

// Создание экземпляра бота
const bot = new Telegraf(process.env.BYTEMIND_GAME_BOT_TOKEN as string);


// FUNCTIONAL START
TelegramGameFunDonate(bot);
TelegramFunGame(bot);
TelegramFunGameTops(bot);
// FUNCTIONAL END

export const TelegramGameMenu = [Markup.button.callback("🎡 Меню", "game_menu")];

// Проверка на текстовое сообщение
function isTextMessage(message: any): message is { text: string } {
  return !!message && typeof message.text === "string";
}

// Главное меню
bot.command("start", async (ctx) => {
  await TelegramGameParseUserStateToDatabase(ctx);
  ctx.reply(
    `🎉 Добро пожаловать, ${ctx.from?.first_name}!\n\n🎮 Вы вошли в игровой чат-бот ${process.env.BYTEMIND_GAME_BOT_USERNAME}.\n
    🙃 Игровой бот в разработке, поэтому некоторые функции могут быть недоступны. Но мы работаем над этим! - Каждый день трудимся над ботом!`,
    Markup.inlineKeyboard([TelegramGameMenu])
  );
});
// Парсинг состояния пользователя из базы данных
export const TelegramGameParseUserStateToDatabase = async (ctx: Context): Promise<ITelegramGameUsers> => {
  const dbResult = await database("telegram_game", "SELECT * FROM users WHERE user_id = $1", [ctx?.from?.id]);

  if (dbResult.rows.length > 0) {
    let user = dbResult.rows[0] as ITelegramGameUsers;

    // Инициализация friends и pending_requests, если они пустые или некорректные
    try {
      user.friends = JSON.parse(user.friends as unknown as string);
    } catch (error) {
      user.friends = [];
    }

    try {
      user.pending_requests = JSON.parse(user.pending_requests as unknown as string);
    } catch (error) {
      user.pending_requests = [];
    }

    return user;
  } else {
    // Создаем нового пользователя с инициализированными значениями
    await database(
      "telegram_game",
      "INSERT INTO users (user_id, username, created_at, balance, games_played, rank, updated_at, friends, pending_requests) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [ctx?.from?.id, ctx?.from?.username, new Date(), 100, 0, 0, new Date(), '[]', '[]']
    );

    const newUser = await database("telegram_game", "SELECT * FROM users WHERE user_id = $1", [ctx?.from?.id]);
    return newUser.rows[0] as ITelegramGameUsers;
  }
};

// Главное игровое меню
bot.action("game_menu", async (ctx) => {
  ctx.reply("🎮 Главное меню:", Markup.inlineKeyboard([
    [Markup.button.callback("🫠 Профиль", "profile")],
    [Markup.button.callback("🎮 Играть", "games")],
    [Markup.button.callback("💸 Донат меню", "donate_menu")],
    [Markup.button.callback("🏆 Рейтинг", "game_leaderboard")],
    [Markup.button.callback("🎁 Ежедневный бонус", "game_daily_bonus")],
    [Markup.button.callback("🛍️ Магазин", "game_shop")],
    [Markup.button.callback("💬 Поддержка", "game_support")],
    [Markup.button.callback("👥 Друзья", "friends_menu")],
  ]));
});
bot.action("profile", async (ctx) => {
  const user = await TelegramGameParseUserStateToDatabase(ctx);
  const rank = await database("telegram_game", "SELECT * FROM privilegies WHERE user_id = $1", [ctx.from.id]);
  ctx.reply(`🫠 Ваш профиль:\n\n🆔 ID: ${ctx.from.id}\n🧩 Уровень: ${TelegramFormatNumber(user.level as number)}\n💳 Баланс: ${TelegramFormatNumber(user.balance)} 💰\n💸 Игровой донат: ${TelegramFormatNumber(user.donate)} ₽\n🏆 Место в рейтинге: #${user.rank}\n👑 Превилегия: ${rank.rows[0] ? rank.rows[0].prefix : "👤 Игрок"}\n🎮 Всего игр сыграно: ${TelegramFormatNumber(user.games_played)}`,
    Markup.inlineKeyboard([

      [Markup.button.callback("💰 Пополнить баланс", "game_topup")],
      [Markup.button.callback("➕ Добавить в друзья", `add_friend_${ctx.from.id}`)],
      [Markup.button.callback("👥 Друзья", "friends_menu")],
      TelegramGameMenu

    ]));
});

// Ежедневный бонус
bot.action("game_daily_bonus", async (ctx) => {
  const user = await TelegramGameParseUserStateToDatabase(ctx);
  const lastBonusTime = new Date(user.updated_at).setDate(new Date(user.updated_at).getDate());
  const currentTime = new Date().setDate(new Date().getDate());

  if (currentTime - lastBonusTime > 86400000) {
    await database("telegram_game", "UPDATE users SET balance = balance + 50, updated_at = $1 WHERE user_id = $2", [new Date(), ctx.from.id]);
    ctx.reply("🎁 Вы получили ежедневный бонус: +50 ₽!", Markup.inlineKeyboard([[Markup.button.callback("← Назад", "game_menu")]]));
  } else {
    ctx.reply("⏳ Вы уже получили свой ежедневный бонус. Приходите завтра!", Markup.inlineKeyboard([[Markup.button.callback("← Назад", "game_menu")]]));
  }
});

// Поддержка
bot.action("game_support", (ctx) => {
  ctx.reply("💬 Если у вас есть вопросы или проблемы, напишите нам:\n📱 Telegram: @ByteMindSupportBot", Markup.inlineKeyboard([[Markup.button.callback("← Назад", "game_menu")]]));
});

// Меню друзей
bot.action("friends_menu", async (ctx) => {
  const user = await TelegramGameParseUserStateToDatabase(ctx);
  const friends = Array.isArray(user.friends) ? user.friends : [];

  const friendList = friends.map((friendId: number) => `@${friendId}`).join(", ");

  ctx.reply(`👥 Список друзей:\n${friendList || "У вас пока нет друзей."}`, Markup.inlineKeyboard([
    [Markup.button.callback("➕ Добавить друга", "add_friend")],
    [Markup.button.callback("📝 Входящие запросы", "incoming_requests")],
    [Markup.button.callback("💰 Перевести баланс", "transfer_balance")],
    [Markup.button.callback("← Назад", "game_menu")],
  ]));
});

// Добавление друга


// Входящие запросы
bot.action("incoming_requests", async (ctx) => {
  const user = await TelegramGameParseUserStateToDatabase(ctx);
  const pendingRequests = Array.isArray(user.pending_requests) ? user.pending_requests : [];

  if (pendingRequests.length > 0) {
    const requestList = pendingRequests.map((requestId: number) => `@${requestId}`).join(", ");

    ctx.reply(`Входящие запросы:\n${requestList}`, Markup.inlineKeyboard([
      [Markup.button.callback("Принять все", "accept_all_requests")],
      [Markup.button.callback("Отклонить все", "decline_all_requests")],
      [Markup.button.callback("← Назад", "friends_menu")],
    ]));
  } else {
    ctx.reply("У вас нет входящих запросов.", Markup.inlineKeyboard([[Markup.button.callback("← Назад", "friends_menu")]]));
  }
});

// Принять все запросы
bot.action("accept_all_requests", async (ctx) => {
  const user = await TelegramGameParseUserStateToDatabase(ctx);
  const pendingRequests = Array.isArray(user.pending_requests) ? user.pending_requests : [];

  if (pendingRequests.length > 0) {
    const updatedFriends = Array.isArray(user.friends) ? user.friends : [];
    updatedFriends.push(...pendingRequests);

    await database(
      "telegram_game",
      "UPDATE users SET friends = $1, pending_requests = '[]' WHERE user_id = $2",
      [JSON.stringify(updatedFriends), user.user_id]
    );

    ctx.reply("Все запросы приняты!", Markup.inlineKeyboard([[Markup.button.callback("← Назад", "friends_menu")]]));
  } else {
    ctx.reply("У вас нет входящих запросов.", Markup.inlineKeyboard([[Markup.button.callback("← Назад", "friends_menu")]]));
  }
});

// Перевод баланса
bot.action("transfer_balance", async (ctx) => {
  const user = await TelegramGameParseUserStateToDatabase(ctx);
  const keyboard: any[] = [];
  for (const friendId of user.friends || []) {
    keyboard.push([Markup.button.callback(`🆔 ${friendId}`, `transfer_balance_friend_${friendId}`)])
  }
  ctx.reply(`${user.username}, выберите игрока, которому хотите перевести баланс:`, Markup.inlineKeyboard(keyboard));
})
bot.action("transfer_balance_friend_", async (ctx) => {
  const user = await TelegramGameParseUserStateToDatabase(ctx);
  const friendId = ctx.match[1];
  ctx.reply(`Выберите сумму для перевода:`, Markup.inlineKeyboard([
    [Markup.button.callback(`${TelegramFormatNumber(user.balance / 1)}💰`, `transfer_balance_friend_${friendId}_${user.balance / 1}`), Markup.button.callback("← Назад", `transfer_balance_friend_${friendId}`)],
    [Markup.button.callback(`${TelegramFormatNumber(user.balance / 2)}💰`, `transfer_balance_friend_${friendId}_${user.balance / 2}`), Markup.button.callback("← Назад", `transfer_balance_friend_${friendId}`)],
    [Markup.button.callback(`${TelegramFormatNumber(user.balance / 3)}💰`, `transfer_balance_friend_${friendId}_${user.balance / 3}`), Markup.button.callback("← Назад", `transfer_balance_friend_${friendId}`)],
    TelegramGameMenu
  ])
  );
});
bot.action("transfer_balance_friend_", async (ctx) => {
  const user = await TelegramGameParseUserStateToDatabase(ctx);
  const friendId = ctx.match[1];
  const amount = ctx.match[2];
  ctx.reply(`Вы уверены, что хотите перевести ${amount} ₽ пользователю с ID ${friendId}?`, Markup.inlineKeyboard([[Markup.button.callback("Да", `transfer_balance_confirm_${friendId}_${amount}`), Markup.button.callback("Нет", `transfer_balance_friend_${friendId}`)],
  ])
  );
});
bot.action("transfer_balance_confirm_", async (ctx) => {
  const user = await TelegramGameParseUserStateToDatabase(ctx);
  const friendId = ctx.match[1];
  const amount = ctx.match[2];
  ctx.reply(`Вы успешно перевели ${TelegramFormatNumber(parseInt(amount))} 💰 пользователю с ID ${friendId}.`, Markup.inlineKeyboard([[Markup.button.callback("← Назад", "friends_menu")]]));
});

// Запуск бота
bot.launch();
console.log("Telegram game bot started!");