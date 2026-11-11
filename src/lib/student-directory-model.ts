import { z } from "zod";

export const DIRECTORY_URL = "/api/admin/students?format=directory-v1";
export const DIRECTORY_ACCOUNT_LIMIT = 5000;
export const DIRECTORY_PAGE_SIZE = 10;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const directoryStudentSchema = z.object({
  id: z.string().min(1).max(255), name: z.string().min(1).max(512),
  email: z.string().max(320).nullable(),
  imageUrl: z.url({ protocol: /^https$/ }).max(2048).nullable(),
  requestCount: count, collectedCentavos: count, unverifiedCount: count,
}).strict();
export type DirectoryStudent = z.infer<typeof directoryStudentSchema>;
export function directoryTotals(items: DirectoryStudent[]) {
  return items.reduce((total, item) => ({ students: total.students + 1,
    requests: total.requests + item.requestCount, collectedCentavos: total.collectedCentavos + item.collectedCentavos,
    unverified: total.unverified + item.unverifiedCount }), { students: 0, requests: 0, collectedCentavos: 0, unverified: 0 });
}
export const directorySchema = z.object({
  actorId: z.string().min(1), role: z.enum(["admin", "employee"]), asOf: z.iso.datetime(),
  items: z.array(directoryStudentSchema).max(DIRECTORY_ACCOUNT_LIMIT),
  totals: z.object({ students: count, requests: count, collectedCentavos: count, unverified: count }).strict(),
}).strict().superRefine((data, ctx) => {
  if (new Set(data.items.map(item => item.id)).size !== data.items.length) ctx.addIssue({ code: "custom", message: "Duplicate directory students" });
  const totals = directoryTotals(data.items);
  if ((Object.keys(totals) as (keyof typeof totals)[]).some(key => !Number.isSafeInteger(totals[key]) || totals[key] !== data.totals[key])) ctx.addIssue({ code: "custom", message: "Directory totals do not match its complete snapshot" });
  if (data.items.some(item => item.unverifiedCount > item.requestCount)) ctx.addIssue({ code: "custom", message: "Invalid request counts" });
});
export type StudentDirectory = z.infer<typeof directorySchema>;
export type DirectoryActor = Pick<StudentDirectory, "actorId" | "role">;
export type DirectorySort = { key: "name" | "email" | "requestCount" | "collectedCentavos"; direction: "asc" | "desc" };
export const DEFAULT_DIRECTORY_SORT: DirectorySort = { key: "name", direction: "asc" };
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
export function directoryView(items: DirectoryStudent[], search: string, sort: DirectorySort, requestedPage: number) {
  const query = search.trim().toLocaleLowerCase("en");
  const matches = items.filter(item => !query || item.name.toLocaleLowerCase("en").includes(query) || item.email?.toLocaleLowerCase("en").includes(query));
  matches.sort((a, b) => {
    const left = a[sort.key], right = b[sort.key];
    const compared = typeof left === "number" && typeof right === "number" ? left - right : collator.compare(String(left ?? ""), String(right ?? ""));
    return (sort.direction === "asc" ? compared : -compared) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const totalPages = Math.max(1, Math.ceil(matches.length / DIRECTORY_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  return { page, totalPages, matched: matches.length,
    start: matches.length ? (page - 1) * DIRECTORY_PAGE_SIZE + 1 : 0,
    end: Math.min(page * DIRECTORY_PAGE_SIZE, matches.length),
    items: matches.slice((page - 1) * DIRECTORY_PAGE_SIZE, page * DIRECTORY_PAGE_SIZE) };
}
