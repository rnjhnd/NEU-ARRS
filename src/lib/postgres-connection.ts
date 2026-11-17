/** Preserve pg 8's certificate/hostname verification when legacy aliases change. */
export function explicitPostgresTls(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  } catch {
    // URL parsing errors can include the input, which contains credentials.
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  // pg uses the last value for duplicate query parameters. Explicit libpq
  // compatibility is an operator decision, not one of the deprecated aliases.
  const mode = url.searchParams.getAll("sslmode").at(-1);
  const libpqCompat = url.searchParams.getAll("uselibpqcompat").at(-1) === "true";
  if (!libpqCompat && mode && ["prefer", "require", "verify-ca"].includes(mode)) {
    url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  }
  return connectionString;
}
