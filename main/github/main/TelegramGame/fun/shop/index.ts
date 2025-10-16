import database from '../../../db/connection';
import { Context, Markup } from 'telegraf';
import type { ITelegramGameUsers } from '../../types/user/type';
import { ParseUserStateToDatabase } from '../..';

export const TelegramFunGameShop = (bot: any) => {
    // Категории магазина
    const categories = ['Оружие', 'Броня', 'Потребляемые'];

    // Меню магазина
    bot.action('game_shop', async (ctx: Context) => {
        const keyboard = categories.map(cat => [Markup.button.callback(cat,)])
        const user = await ParseUserStateToDatabase(ctx);
        ctx.reply('🏪 Магазин:', Markup.inlineKeyboard(
            [Markup.button.callback('← Назад', 'game_menu')]
        ));
    });

    // Просмотр категории
    bot.action(/shop_category_/, async (ctx: Context) => {
        const category = ctx.match[0].split('_').pop();
        const items = await database('telegram_game', 'SELECT * FROM items WHERE category = ', [category]);
        ctx.reply(, Markup.inlineKeyboard(
            items.rows.map(item => [Markup.button.callback(item.name,)]),
            [Markup.button.callback('← Назад', 'game_shop')]
        ));
    });

    // Просмотр товара
    bot.action(/shop_item_/, async (ctx: Context) => {
        const itemId = ctx.match[0].split('_').pop();
        const item = await database('telegram_game', 'SELECT * FROM items WHERE id = ', [itemId]);
        ctx.reply(,
            Markup.inlineKeyboard([
                [Markup.button.callback('Купить',)],
                [Markup.button.callback('← Назад', 'game_shop')]
            ])
        );
    });

    // Покупка товара
    bot.action(/buy_item_/, async (ctx: Context) => {
        const itemId = ctx.match[0].split('_').pop();
        const user = await ParseUserStateToDatabase(ctx);
        const item = await database('telegram_game', 'SELECT * FROM items WHERE id = ', [itemId]);

        if (user.balance >= item.rows[0].price) {
            await database('telegram_game', 'UPDATE users SET balance = balance -  WHERE user_id = ', [item.rows[0].price, user.user_id]);
            await database('telegram_game', 'INSERT INTO items_player (user_id, item_id) VALUES (, )', [user.user_id, itemId]);
            ctx.reply('Покупка успешно завершена!', Markup.inlineKeyboard([[Markup.button.callback('← Назад', 'game_shop')]]));
        } else {
            ctx.reply('Недостаточно средств!', Markup.inlineKeyboard([[Markup.button.callback('← Назад', 'game_shop')]]));
        }
    });

    // Продажа предмета государству
    bot.action('sell_to_state', async (ctx: Context) => {
        const user = await ParseUserStateToDatabase(ctx);
        const userItems = await database('telegram_game', 'SELECT * FROM items_player WHERE user_id = ', [user.user_id]);
        ctx.reply('Выберите предмет для продажи:', Markup.inlineKeyboard(
            userItems.rows.map(item => [Markup.button.callback(item.name,)]),
            [Markup.button.callback('← Назад', 'game_profile')]
        ));
    });

    // Подтверждение продажи
    bot.action(/sell_item_/, async (ctx: Context) => {
        const itemId = ctx.match[0].split('_').pop();
        const user = await ParseUserStateToDatabase(ctx);
        const item = await database('telegram_game', 'SELECT * FROM items WHERE id = ', [itemId]);

        await database('telegram_game', 'UPDATE users SET balance = balance +  WHERE user_id = ', [item.rows[0].price * 0.8, user.user_id]);
        await database('telegram_game', 'DELETE FROM items_player WHERE user_id =  AND item_id = ', [user.user_id, itemId]);
        ctx.reply(, Markup.inlineKeyboard([[Markup.button.callback('← Назад', 'game_profile')]]));
    });
};

