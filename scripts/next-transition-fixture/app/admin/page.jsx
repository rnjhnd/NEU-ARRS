import { workspacePage } from "../../server-data";
export default async function Page() { return workspacePage("Command center", "/admin", ["admin", "employee"]); }
