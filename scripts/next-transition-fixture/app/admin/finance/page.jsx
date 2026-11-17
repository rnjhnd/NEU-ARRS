import { workspacePage } from "../../../server-data";
export default async function Page() { return workspacePage("finance", "/admin/finance", ["admin"]); }
