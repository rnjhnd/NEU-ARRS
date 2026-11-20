const STUDENT_NUMBER_PATTERN = /^\d{2}-\d{5}-\d{3}$/;

export function formatStudentNumberInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return digits.slice(0, 2) + "-" + digits.slice(2);
  return digits.slice(0, 2) + "-" + digits.slice(2, 7) + "-" + digits.slice(7);
}

export function isValidStudentNumber(value: string) {
  return STUDENT_NUMBER_PATTERN.test(value);
}
