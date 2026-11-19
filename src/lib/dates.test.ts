import { expect, test } from "vitest";
import { addDays, addMonths, diffDays, isDayKey, isMonthKey, keysBetween, monthDays } from "./dates.ts";

test("contas com dias", () => {
  expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(diffDays("2026-11-06", "2026-11-19")).toBe(13);
  expect(keysBetween("2026-11-18", "2026-11-20")).toEqual(["2026-11-18", "2026-11-19", "2026-11-20"]);
  expect(isDayKey("2026-11-19")).toBe(true);
  expect(isDayKey("2026-13-40")).toBe(false);
  expect(isDayKey("ontem")).toBe(false);
  expect(isDayKey(["2026-11-19"])).toBe(false);
});

test("contas com meses", () => {
  expect(addMonths("2026-01", -1)).toBe("2025-12");
  expect(addMonths("2026-12", 1)).toBe("2027-01");
  expect(monthDays("2028-02").length).toBe(29);
  expect(monthDays("2026-11")[29]).toBe("2026-11-30");
  expect(isMonthKey("2026-11")).toBe(true);
  expect(isMonthKey("2026-13")).toBe(false);
});
