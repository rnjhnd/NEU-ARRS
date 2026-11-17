import { workspacePage } from "../../../../server-data";
export default async function Page() { return workspacePage("finance/movements", "/admin/finance/movements", ["admin"]); }
