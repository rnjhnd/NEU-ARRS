import { workspacePage } from "../../../server-data";
export default async function Page() { return workspacePage("documents", "/admin/documents", ["admin"]); }
