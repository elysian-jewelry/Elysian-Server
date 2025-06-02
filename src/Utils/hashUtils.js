import crypto from "crypto";

export const generateKashierOrderHash = (order) => {
  const { mid, merchantOrderId, amount, currency, secret } = order;
  const path = `/?payment=${mid}.${merchantOrderId}.${amount}.${currency}`;
  return crypto.createHmac("sha256", secret).update(path).digest("hex");
};

export const validateSignature = (query, secret) => {
  const queryString =
    `&paymentStatus=${query.paymentStatus}` +
    `&cardDataToken=${query.cardDataToken}` +
    `&maskedCard=${query.maskedCard}` +
    `&merchantOrderId=${query.merchantOrderId}` +
    `&orderId=${query.orderId}` +
    `&cardBrand=${query.cardBrand}` +
    `&orderReference=${query.orderReference}` +
    `&transactionId=${query.transactionId}` +
    `&amount=${query.amount}` +
    `&currency=${query.currency}`;

  const signature = crypto.createHmac("sha256", secret)
    .update(queryString.slice(1))
    .digest("hex");

  return signature === query.signature;
};
