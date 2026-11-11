/** Quote complete cells and neutralize spreadsheet formulas/control prefixes. */
export function csvCell(input: string | null) {
  const value = input ?? "";
  const safe = /^\s*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
