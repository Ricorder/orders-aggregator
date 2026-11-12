import { describe, expect, it } from "vitest";
import { apiOrder, dailyTotals, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("GET /customers/:id/daily-totals", () => {
  it("суммирует оплаченные заказы по дням в таймзоне клиента", async () => {
    // c_1 — Europe/Moscow (UTC+3): 20:30Z ещё 10-е, 21:30Z уже 11-е
    await postWebhook(ctx.app, apiOrder({ amount: 1000, createdAt: "2026-02-10T20:30:00Z" }));
    await postWebhook(ctx.app, apiOrder({ amount: 250, createdAt: "2026-02-10T21:30:00Z" }));
    await postWebhook(ctx.app, apiOrder({ amount: "99", createdAt: "2026-02-11T10:00:00Z" }));

    const res = await dailyTotals(ctx.app, "c_1", "2026-02-09", "2026-02-11");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { date: "2026-02-09", total: 0, gross: 0, discount: 0, net: 0 },
      { date: "2026-02-10", total: 1000, gross: 1000, discount: 0, net: 1000 },
      { date: "2026-02-11", total: 349, gross: 349, discount: 0, net: 349 },
    ]);
  });

  it("не учитывает pending и refunded", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 500 }));
    await postWebhook(ctx.app, apiOrder({ amount: 700, status: "pending" }));
    await postWebhook(ctx.app, apiOrder({ amount: 900, status: "refunded" }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 500, gross: 500, discount: 0, net: 500 }]);
  });

  it("учитывает только заказы этого клиента", async () => {
    ctx.api.customers.set("c_2", "Asia/Novosibirsk");
    await postWebhook(ctx.app, apiOrder({ amount: 500 }));
    await postWebhook(ctx.app, apiOrder({ amount: 800, customerId: "c_2" }));
    const res = await dailyTotals(ctx.app, "c_2", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 800, gross: 800, discount: 0, net: 800 }]);
  });

  it("таймзона клиента берётся из API один раз", async () => {
    await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    ctx.api.customers.set("c_1", "UTC");
    await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    const { rows } = await ctx.db.query(`SELECT timezone FROM customers WHERE id = 'c_1'`);
    expect(rows[0].timezone).toBe("Europe/Moscow");
  });

  it("валидирует даты", async () => {
    expect((await dailyTotals(ctx.app, "c_1", "2026-02-30", "2026-03-01")).statusCode).toBe(400);
    expect((await dailyTotals(ctx.app, "c_1", "2026-03-02", "2026-03-01")).statusCode).toBe(400);
  });

  it("неизвестный клиент — 404", async () => {
    const res = await dailyTotals(ctx.app, "nobody", "2026-02-10", "2026-02-10");
    expect(res.statusCode).toBe(404);
  });
});

describe("скидки", () => {
  it("gross до скидки, net по amountPaid, discount = gross - net", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 2500, amountPaid: 2087.5, createdAt: "2026-02-10T10:00:00Z" }));
    await postWebhook(ctx.app, apiOrder({ amount: 100, createdAt: "2026-02-10T11:00:00Z" }));

    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([
      { date: "2026-02-10", total: 2600, gross: 2600, discount: 412.5, net: 2187.5 },
    ]);
  });

  it("net и discount — строки из внешнего API, копейка в копейку", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 5481, amountPaid: "4549.23", createdAt: "2026-02-10T10:00:00Z" }));
    await postWebhook(ctx.app, apiOrder({ amount: 1823, amountPaid: "1276.1", createdAt: "2026-02-10T11:00:00Z" }));

    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([
      { date: "2026-02-10", total: 7304, gross: 7304, discount: 1478.67, net: 5825.33 },
    ]);
  });

  it("без amountPaid скидка нулевая, net = gross", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 1000, createdAt: "2026-02-10T10:00:00Z" }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 1000, gross: 1000, discount: 0, net: 1000 }]);
  });

  it("битый amountPaid — заказ не применяется, а не портит отчёт", async () => {
    const res = await postWebhook(ctx.app, apiOrder({ amount: 100, amountPaid: "abc" }));
    expect(res.statusCode).toBe(400);
    const { rows } = await ctx.db.query(`SELECT count(*)::int AS n FROM orders`);
    expect(rows[0].n).toBe(0);
  });
});

describe("сутки через переход летнего времени", () => {
  it("заказ после перехода не уезжает в предыдущий день (Europe/Berlin, 29.03.2026)", async () => {
    // 28.03 Berlin +1, с 29.03 01:00 UTC +2. Один и тот же «час суток» по UTC
    // попадает в разные локальные дни, поэтому фиксированное смещение обязательно
    // собьёт один из двух заказов, каким бы «сейчас» ни посчитали его сегодня.
    ctx.api.customers.set("c_7", "Europe/Berlin");
    await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 100, createdAt: "2026-03-28T22:40:00Z" }));
    await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 200, createdAt: "2026-03-29T22:40:00Z" }));

    const res = await dailyTotals(ctx.app, "c_7", "2026-03-28", "2026-03-30");
    expect(res.json()).toEqual([
      { date: "2026-03-28", total: 100, gross: 100, discount: 0, net: 100 },
      { date: "2026-03-29", total: 0, gross: 0, discount: 0, net: 0 },
      { date: "2026-03-30", total: 200, gross: 200, discount: 0, net: 200 },
    ]);
  });

  it("заказ локального утра последнего дня не прибавляется к отчёту", async () => {
    // 31.03 22:40Z = 01.04 00:40 в Берлине: этого дня в запрошенном окне нет
    ctx.api.customers.set("c_7", "Europe/Berlin");
    await postWebhook(ctx.app, apiOrder({ customerId: "c_7", amount: 300, createdAt: "2026-03-31T22:40:00Z" }));

    const res = await dailyTotals(ctx.app, "c_7", "2026-03-31", "2026-03-31");
    expect(res.json()).toEqual([{ date: "2026-03-31", total: 0, gross: 0, discount: 0, net: 0 }]);
  });
});
