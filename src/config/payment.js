// How a customer pays for an order. Cash on delivery is the default, so
// orders placed before checkout offered a choice read as cash on delivery.
export const PAYMENT_METHODS = {
  CASH_ON_DELIVERY: "cash_on_delivery",
  INSTAPAY: "instapay",
};

/** How each method is written to customers and in the operations sheet. */
export const PAYMENT_METHOD_LABELS = {
  [PAYMENT_METHODS.CASH_ON_DELIVERY]: "Cash on Delivery",
  [PAYMENT_METHODS.INSTAPAY]: "InstaPay",
};

export const paymentMethodLabel = (method) =>
  PAYMENT_METHOD_LABELS[method] || PAYMENT_METHOD_LABELS[PAYMENT_METHODS.CASH_ON_DELIVERY];

// Where InstaPay customers send the money. Sent only in the order email.
export const INSTAPAY = {
  link: "https://ipn.eg/S/loujinetaha/instapay/5HiQey",
  address: "loujinetaha@instapay",
};

// Where InstaPay customers send their transfer screenshot.
export const INSTAGRAM = {
  handle: "@elysian.jewelry.eg",
  url: "https://www.instagram.com/elysian.jewelry.eg",
};
