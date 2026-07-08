import { auth } from "@clerk/nextjs/server";

/**
 * Ensures the user is authenticated. 
 * If not, it throws an error or returns unauthorized, which can be caught in Server Actions.
 * Returns the Clerk userId.
 */
export async function requireAuth() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized: You must be logged in to perform this action.");
  }

  return userId;
}

/**
 * Ensures the user is authenticated AND has the "admin" role.
 * Returns the Clerk userId.
 */
export async function requireAdmin() {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    throw new Error("Unauthorized: You must be logged in to perform this action.");
  }

  const role = sessionClaims?.metadata?.role;

  if (role !== "admin") {
    throw new Error("Forbidden: You do not have the required admin permissions.");
  }

  return userId;
}

/**
 * Ensures the user is authenticated AND has either the "admin" or "employee" role.
 * Returns the Clerk userId.
 */
export async function requireEmployeeOrAdmin() {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    throw new Error("Unauthorized: You must be logged in to perform this action.");
  }

  const role = sessionClaims?.metadata?.role;

  if (role !== "admin" && role !== "employee") {
    throw new Error("Forbidden: You do not have the required staff permissions.");
  }

  return userId;
}
