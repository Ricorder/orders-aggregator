import { describe, expect, it } from "vitest";
import { datesBetween, isCalendarDate, localDate, parseUtc } from "../src/utils/time.js";

describe("parseUtc", () => {
  it("строка с Z", () => {
    expect(parseUtc("2026-03-01T00:40:39.000Z").toISOString()).toBe("2026-03-01T00:40:39.000Z");
  });

  it("строка без зоны — тоже UTC", () => {
    expect(parseUtc("2026-03-01T00:40:39").toISOString()).toBe("2026-03-01T00:40:39.000Z");
  });

  it("мусор — ошибка", () => {
    expect(() => parseUtc("вчера")).toThrow();
    expect(() => parseUtc(42)).toThrow();
  });
});

describe("localDate", () => {
  it("день в таймзоне клиента", () => {
    expect(localDate(new Date("2026-02-10T21:30:00Z"), "Europe/Moscow")).toBe("2026-02-11");
    expect(localDate(new Date("2026-02-10T20:30:00Z"), "Europe/Moscow")).toBe("2026-02-10");
    expect(localDate(new Date("2026-02-10T23:30:00Z"), "UTC")).toBe("2026-02-10");
    expect(localDate(new Date("2026-02-10T21:30:00Z"), "America/New_York")).toBe("2026-02-10");
  });

  it("смещение берётся по самому моменту, а не по «сейчас»", () => {
    // Europe/Berlin переходит на летнее время 29.03.2026 в 01:00 UTC: +1 → +2
    expect(localDate(new Date("2026-03-28T22:40:00Z"), "Europe/Berlin")).toBe("2026-03-28");
    expect(localDate(new Date("2026-03-29T22:40:00Z"), "Europe/Berlin")).toBe("2026-03-30");
    expect(localDate(new Date("2026-03-29T00:30:00Z"), "Europe/Berlin")).toBe("2026-03-29");
    expect(localDate(new Date("2026-03-29T01:30:00Z"), "Europe/Berlin")).toBe("2026-03-29");
  });

  it("короткие сутки перехода: 23 часа покрываются одним днём", () => {
    const days = new Set<string>();
    for (let t = Date.parse("2026-03-29T00:00:00Z"); t < Date.parse("2026-03-29T23:00:00Z"); t += 3_600_000) {
      days.add(localDate(new Date(t), "Europe/Berlin"));
    }
    expect([...days].sort()).toEqual(["2026-03-29", "2026-03-30"]);
  });
});

describe("даты", () => {
  it("isCalendarDate", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("26-02-01")).toBe(false);
  });

  it("datesBetween включает границы", () => {
    expect(datesBetween("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });
});
