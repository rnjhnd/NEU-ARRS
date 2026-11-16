import { redirect } from "next/navigation";
import { fixtureActor } from "../server-data";
export default async function Page() { redirect(await fixtureActor() ? "/dashboard" : "/sign-in"); }
