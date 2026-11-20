import { describe, expect, it } from "vitest";
import { formatStudentNumberInput, isValidStudentNumber } from "@/lib/student-number-input";

describe("student number input", () => {
  it("inserts separators as digits are entered", () => {
    expect(formatStudentNumberInput("22")).toBe("22");
    expect(formatStudentNumberInput("22123")).toBe("22-123");
    expect(formatStudentNumberInput("2212345")).toBe("22-12345");
    expect(formatStudentNumberInput("2212345123")).toBe("22-12345-123");
  });

  it("normalizes pasted values and limits input to ten digits", () => {
    expect(formatStudentNumberInput("22-12345-123")).toBe("22-12345-123");
    expect(formatStudentNumberInput("22a12345b123999")).toBe("22-12345-123");
  });

  it("validates the complete school number format", () => {
    expect(isValidStudentNumber("22-12345-123")).toBe(true);
    expect(isValidStudentNumber("22-123-123")).toBe(false);
    expect(isValidStudentNumber("2212345123")).toBe(false);
  });
});
