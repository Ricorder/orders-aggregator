import { describe, expect, it } from "vitest";
import { fromKop, parseRub, toKop } from "../src/utils/money.js";

describe("parseRub", () => {
  it("принимает число и строку с числом", () => {
    expect(parseRub(2500)).toBe(2500);
    expect(parseRub("2500.00")).toBe(2500);
    expect(parseRub(" 99 ")).toBe(99);
  });

  it("отклоняет мусор и отрицательные суммы", () => {
    expect(() => parseRub("abc")).toThrow();
    expect(() => parseRub(null)).toThrow();
    expect(() => parseRub(-1)).toThrow();
  });
});

describe("toKop / fromKop", () => {
  it("рубли в копейки", () => {
    expect(toKop(2500)).toBe(250000);
    expect(toKop(99)).toBe(9900);
  });

  it("отбрасывает доли копейки", () => {
    expect(toKop(10.999)).toBe(1099);
  });

  it("не теряет копейку на двоичной погрешности", () => {
    // 4549.23 * 100 = 454922.99999999994: floor от прежней реализации съедал копейку
    expect(toKop(4549.23)).toBe(454923);
    expect(toKop(1276.1)).toBe(127610);
    expect(toKop(2284.99)).toBe(228499);
    expect(toKop(0.29)).toBe(29);
    expect(toKop(8.2)).toBe(820);
    expect(toKop(1.15)).toBe(115);
    expect(toKop(133.7)).toBe(13370);
  });

  it("суммы со скидкой ровно в копейках", () => {
    expect(toKop(2087.5)).toBe(208750);
    expect(toKop(412.5)).toBe(41250);
  });

  it("копейки в рубли", () => {
    expect(fromKop(250000)).toBe(2500);
    expect(fromKop(1099)).toBe(10.99);
  });
});
