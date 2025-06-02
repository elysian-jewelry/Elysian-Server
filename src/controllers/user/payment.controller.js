// Initialize express router
import { config } from "../../config/config.js";
import { generateKashierOrderHash } from "../../Utils/hashUtils.js";



export const createPayment = (req, res) => {
  const cfg = config[config.mode];

  const order = {
    amount: "150.00",
    currency: "EGP",
    merchantOrderId: Date.now(),
    mid: cfg.mid,
    secret: cfg.PaymentApiKey,
    baseUrl: cfg.baseUrl,
    metaData: JSON.stringify({
      "Customer Name": "User",
      Email: "user@example.com",
    }),
    merchantRedirect: "http://localhost:8000/payment/callback",
    display: "en",
    failureRedirect: "true",
    redirectMethod: "get",
    allowedMethods: "card",
    brandColor: "#2980b9",
  };

  order.hash = generateKashierOrderHash(order);

  const hppUrl = `${cfg.baseUrl}?merchantId=${order.mid}&orderId=${order.merchantOrderId}&amount=${order.amount}&currency=${order.currency}&hash=${order.hash}&merchantRedirect=${order.merchantRedirect}&metaData=${order.metaData}&allowedMethods=${order.allowedMethods}&failureRedirect=${order.failureRedirect}&redirectMethod=${order.redirectMethod}&display=${order.display}&brandColor=${encodeURIComponent(order.brandColor)}&mode=${cfg.mode}`;

  res.json({
    order,
    hppUrl,
    baseUrl: cfg.baseUrl,
    mode: cfg.mode,
  });
};
