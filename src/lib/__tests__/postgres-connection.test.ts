import { afterEach, expect, it, vi } from "vitest";
import { Client } from "pg";
import { explicitPostgresTls } from "../postgres-connection";

afterEach(() => vi.restoreAllMocks());

it.each(["prefer", "require", "verify-ca"])("preserves full verification for the legacy %s alias without emitting a warning", mode => {
  const warning = vi.spyOn(process, "emitWarning");
  const original = `postgresql://synthetic:p%40ss%2B%2Fword@db.example.invalid:5433/test_db?sslmode=${mode}&channel_binding=require&application_name=TLS+check`;
  const normalized = explicitPostgresTls(original);
  const client = new Client({ connectionString: normalized });
  expect(new URL(normalized).searchParams.get("sslmode")).toBe("verify-full");
  expect(client.ssl).toEqual({}); // Node's default CA and hostname verification.
  expect(client.user).toBe("synthetic");
  expect(client.password).toBe("p@ss+/word");
  expect(client.host).toBe("db.example.invalid");
  expect(client.port).toBe(5433);
  expect(client.database).toBe("test_db");
  expect(new URL(normalized).searchParams.get("channel_binding")).toBe("require");
  expect(new URL(normalized).searchParams.get("application_name")).toBe("TLS check");
  expect(warning).not.toHaveBeenCalled();
});

it.each(["?sslmode=verify-full", "?sslmode=disable", "?sslmode=no-verify", "", "?ssl=true", "?sslmode=require&uselibpqcompat=true"])("preserves explicit or non-alias configuration %s", query => {
  const original = "postgres://synthetic:synthetic@127.0.0.1/test" + query;
  expect(explicitPostgresTls(original)).toBe(original);
});

it("keeps the disposable loopback database usable without TLS", () => {
  const client = new Client({ connectionString: explicitPostgresTls("postgresql://synthetic:synthetic@127.0.0.1:15432/test?sslmode=disable") });
  expect(client.ssl).toBe(false);
});

it("matches the driver's last-value semantics for duplicate modes and compatibility flags", () => {
  const url = new URL(explicitPostgresTls("postgresql://synthetic:synthetic@db.example.invalid/test?sslmode=disable&sslmode=require&uselibpqcompat=true&uselibpqcompat=false"));
  expect(url.searchParams.getAll("sslmode")).toEqual(["verify-full"]);
  const disabled = "postgresql://synthetic:synthetic@127.0.0.1/test?sslmode=require&sslmode=disable";
  expect(explicitPostgresTls(disabled)).toBe(disabled);
});

it.each(["postgresql://synthetic:private-password@[invalid/test", "https://synthetic:private-password@db.example.invalid/test"])("rejects invalid configuration without reflecting credentials", input => {
  try { explicitPostgresTls(input); throw new Error("Expected rejection"); }
  catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("DATABASE_URL must be a valid PostgreSQL URL.");
    expect((error as Error).stack).not.toContain("private-password");
  }
});
