import { workspacePage } from "../../../server-data";
export default async function Page() { return workspacePage("notifications", "/admin/notifications", ["admin"]); }
