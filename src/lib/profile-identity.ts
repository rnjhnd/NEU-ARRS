export type DisplayRole = "admin" | "employee" | "student";

export type ServerUser = {
  id: string;
  name: string;
  email: string;
  imageUrl: string;
  role: string;
} | null;

type ClientUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  imageUrl: string;
  publicMetadata: { role?: unknown };
};

export function displayRole(role: unknown): DisplayRole {
  return role === "admin" || role === "employee" ? role : "student";
}

export function roleLabel(role: DisplayRole) {
  return role === "admin" ? "Administrator" : role === "employee" ? "Employee" : "Student";
}

/** Server data bootstraps loading only; a resolved sign-out must clear it. */
export function resolveProfileIdentity(
  isLoaded: boolean,
  user: ClientUser | null | undefined,
  serverUser?: ServerUser,
) {
  if (!isLoaded) return serverUser ? { ...serverUser, role: displayRole(serverUser.role) } : null;
  if (!user) return null;
  return {
    id: user.id,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "User",
    email: user.primaryEmailAddress?.emailAddress ?? "",
    imageUrl: user.imageUrl,
    // A previous account's server role must never be applied to a new identity.
    role: displayRole(serverUser?.id === user.id ? serverUser.role : user.publicMetadata.role),
  };
}
