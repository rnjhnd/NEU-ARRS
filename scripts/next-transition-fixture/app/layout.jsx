import { FixtureAuth } from "../clerk";
import { fixtureActor } from "../server-data";
import { SessionGuard } from "@/components/session-guard";
import "./fixture.css";
export default async function Layout({ children }) {
  const access = await fixtureActor();
  return <html lang="en"><body><FixtureAuth initialAccess={access}><SessionGuard initialAccess={access}>{children}</SessionGuard></FixtureAuth></body></html>;
}
