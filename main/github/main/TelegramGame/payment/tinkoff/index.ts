export const createPayment = async (userId: number, amount: number): Promise<string> => {
    const url = 'https://secured-openapi.tbank.ru/api/v1/payment/ruble-transfer/pay'
    const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
            amount: amount,
            currency: 'RUB',
            merchant_id: process.env.TINKOFF_MERCHANT_ID,
            merchant_order_id: userId.toString(),
            return_url: process.env.TINKOFF_RETURN_URL,
        }),
    });
    const data = await response.json();
    return data.payment_url;
};