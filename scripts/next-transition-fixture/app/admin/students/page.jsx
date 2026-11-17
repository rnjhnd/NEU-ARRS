import { workspacePage } from "../../../server-data";
export default async function Page() { return workspacePage("students", "/admin/students", ["admin","employee"]); }
