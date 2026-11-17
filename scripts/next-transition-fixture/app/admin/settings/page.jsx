import { workspacePage } from "../../../server-data";
export default async function Page() { return workspacePage("settings", "/admin/settings", ["admin"]); }
