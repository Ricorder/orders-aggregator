/**
 * Деньги внутри сервиса — целые копейки. Рубли — только на входе (внешний API) и в ответах.
 */

/** Сумма из внешнего API: число или строка с числом ("250.10"). */
export function parseRub(raw: unknown): number {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`invalid amount: ${JSON.stringify(raw)}`);
  }
  return value;
}

// Десятичных знаков достаточно, чтобы скрыть погрешность двоичного float (~1e-13
// от порядка числа) и при этом сохранить настоящие доли копейки во входе.
const DECIMAL_PLACES = 10;

/**
 * Рубли → копейки. Доли копейки отбрасываются: деньги клиенту не досчитываем.
 *
 * Умножать float на 100 нельзя: 4549.23 * 100 = 454922.99999999994, и floor
 * съедал ровно копейку на каждой такой сумме. Копейки снимаем с десятичной записи.
 */
export function toKop(rub: number): number {
  const [units, fraction = ""] = rub.toFixed(DECIMAL_PLACES).split(".");
  return Number(units) * 100 + Number(fraction.slice(0, 2).padEnd(2, "0"));
}

/** Копейки → рубли для ответа API. */
export function fromKop(kop: number): number {
  return kop / 100;
}
