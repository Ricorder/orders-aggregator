import { describe, expect, it } from "vitest";
import { apiOrder, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("POST /webhooks/order", () => {
  it("создаёт заказ", async () => {
    const res = await postWebhook(ctx.app, apiOrder());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: "created" });
  });

  it("повтор того же события ничего не меняет", async () => {
    const o = apiOrder();
    await postWebhook(ctx.app, o);
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
  });

  it("устаревшее событие после нового игнорируется", async () => {
    const o = apiOrder({ status: "paid", updatedAt: "2026-02-10T12:00:00Z" });
    await postWebhook(ctx.app, { ...o, status: "refunded", updatedAt: "2026-02-11T12:00:00Z" });
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
    const { rows } = await ctx.db.query(`SELECT status FROM orders WHERE id = $1`, [o.id]);
    expect(rows[0].status).toBe("refunded");
  });

  it("новое событие обновляет заказ", async () => {
    const o = apiOrder({ status: "pending" });
    await postWebhook(ctx.app, o);
    const res = await postWebhook(ctx.app, { ...o, status: "paid", updatedAt: "2026-02-11T00:00:00Z" });
    expect(res.json()).toEqual({ result: "updated" });
  });

  it("обновление привносит amountPaid", async () => {
    const o = apiOrder({ status: "pending", amount: 2500 });
    await postWebhook(ctx.app, o);
    const res = await postWebhook(ctx.app, { ...o, status: "paid", amountPaid: 2087.5, updatedAt: "2026-02-11T00:00:00Z" });
    expect(res.json()).toEqual({ result: "updated" });
    const { rows } = await ctx.db.query(`SELECT amount_paid_kop FROM orders WHERE id = $1`, [o.id]);
    expect(Number(rows[0].amount_paid_kop)).toBe(208750);
  });

  it("невалидное тело — 400", async () => {
    const res = await postWebhook(ctx.app, { id: "x" });
    expect(res.statusCode).toBe(400);
  });

  it("параллельная доставка версий одного заказа оставляет самую свежую", async () => {
    // Внешняя система раздаёт вебхуки параллельно и не по порядку. Если
    // решать «сохранять или нет» в памяти (прочитал → сравнил → записал), две
    // доставки видят одно и то же состояние, и более старая версия записывается
    // последней. Проверка должна быть атомарной.
    for (let round = 0; round < 20; round++) {
      const id = `race_${round}`;
      const base = { id, customerId: "c_1", amount: 100, status: "paid", createdAt: "2026-02-10T12:00:00Z" };
      const older = { ...base, amountPaid: 10, updatedAt: "2026-02-10T12:00:00Z" };
      const newer = { ...base, amountPaid: 20, updatedAt: "2026-02-11T12:00:00Z" };

      await Promise.all([postWebhook(ctx.app, newer), postWebhook(ctx.app, older)]);

      const { rows } = await ctx.db.query(`SELECT amount_paid_kop, updated_at FROM orders WHERE id = $1`, [id]);
      expect(Number(rows[0].amount_paid_kop), `раунд ${round}: осталась устаревшая версия`).toBe(2000);
      expect(rows[0].updated_at.toISOString()).toBe("2026-02-11T12:00:00.000Z");
    }
  });
});
