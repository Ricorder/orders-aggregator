import type { OrdersRepository } from "../repositories/orders.js";
import { fromKop } from "../utils/money.js";
import { datesBetween, localDate } from "../utils/time.js";
import type { CustomersService } from "./customers.js";

export interface DailyTotal {
  date: string;
  /** Обратная совместимость: сумма оплаченных заказов до скидки, = gross. */
  total: number;
  /** Сумма оплаченных заказов до скидки. */
  gross: number;
  /** gross - net. */
  discount: number;
  /** Сколько клиенты фактически заплатили. */
  net: number;
}

const DAY = 86_400_000;

interface DayKop {
  gross: number;
  net: number;
}

export class TotalsService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly customers: CustomersService,
  ) {}

  /**
   * Суммы оплаченных заказов клиента по дням в его таймзоне, from..to включительно.
   * Дни без оплат — с нулём.
   */
  async daily(customerId: string, from: string, to: string): Promise<DailyTotal[]> {
    const timezone = await this.customers.timezone(customerId);

    // Смещения таймзон в пределах ±14 ч: берём с запасом в сутки с каждой стороны
    const rows = await this.orders.paidCreatedBetween(
      customerId,
      new Date(Date.parse(`${from}T00:00:00Z`) - DAY),
      new Date(Date.parse(`${to}T00:00:00Z`) + 2 * DAY),
    );

    const days = new Map<string, DayKop>(datesBetween(from, to).map((d) => [d, { gross: 0, net: 0 }]));
    for (const o of rows) {
      const day = days.get(localDate(o.createdAt, timezone));
      if (!day) continue;
      day.gross += o.amountKop;
      // amountPaid появился в внешнем API позже: без него считаем, что заплатили полную сумму.
      day.net += o.amountPaidKop ?? o.amountKop;
    }

    return [...days].map(([date, { gross, net }]) => ({
      date,
      total: fromKop(gross),
      gross: fromKop(gross),
      discount: fromKop(gross - net),
      net: fromKop(net),
    }));
  }
}
