import { Markup, Telegraf } from "telegraf";
import { TelegramFormatNumber } from "../..";
import database from "../../../../db/connection";
export const TelegramFunGameTops = (bot: Telegraf) => {
  bot.action("game_leaderboard", async (ctx) => {
    showLeaderboard(ctx, 1); // Показываем первую страницу по умолчанию
  });
  const getLeaderboardPage = async (page: number = 1, pageSize: number = 10): Promise<{ users: any[]; totalPages: number }> => {
    const offset = (page - 1) * pageSize;

    // Получаем общее количество пользователей
    const totalUsersResult = await database("telegram_game", "SELECT COUNT(*) as count FROM users");
    const totalUsers = parseInt(totalUsersResult.rows[0].count);

    // Получаем пользователей для текущей страницы
    const usersResult = await database("telegram_game", "SELECT * FROM users ORDER BY balance DESC LIMIT $1 OFFSET $2", [pageSize, offset]);
    const users = usersResult.rows;

    // Рассчитываем общее количество страниц
    const totalPages = Math.ceil(totalUsers / pageSize);

    return { users, totalPages };
  };
  // Функция для отображения страницы leaderboard
  const showLeaderboard = async (ctx: any, page: number) => {
    const pageSize = 10; // Количество игроков на странице
    const { users, totalPages } = await getLeaderboardPage(page, pageSize);

    // Если страница не существует, возвращаемся на последнюю страницу
    if (page < 1 || page > totalPages) {
      return showLeaderboard(ctx, totalPages);
    }

    // Формируем сообщение с рейтингом
    let message = "🏆 ТОП игроков:\n\n";
    let rank = (page - 1) * pageSize + 1; // Начальный ранг на странице
    users.forEach((user: any) => {
      const formattedBalance = TelegramFormatNumber(user.balance);
      message += `${rank}. ${user.username || "Аноним"} - ${formattedBalance} 💰\n`;
      rank++;
    });

    // Определяем кнопки для навигации
    const keyboard = [];
    if (page > 1) {
      keyboard.push(Markup.button.callback("◀️ Предыдущая страница", `leaderboard_page_${page - 1}`));
    }
    if (page < totalPages) {
      keyboard.push(Markup.button.callback("Следующая страница ▶️", `leaderboard_page_${page + 1}`));
    }

    // Добавляем кнопку "Назад"
    keyboard.push(Markup.button.callback("← Назад", "game_menu"));

    // Отправляем сообщение с рейтингом
    ctx.reply(message, Markup.inlineKeyboard([keyboard]));
  };

  // Обработка перехода между страницами leaderboard
  bot.action(/leaderboard_page_\d+/, async (ctx) => {
    const targetPage = parseInt(ctx.match[0].split("_")[2]); // Извлекаем номер страницы из callback_data
    showLeaderboard(ctx, targetPage);
  });
}