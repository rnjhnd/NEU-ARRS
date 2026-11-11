import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const loadDependency = createRequire(import.meta.url);
const requireFromParser = createRequire(loadDependency.resolve("@typescript-eslint/typescript-estree/package.json"));

describe("Scoped TypeScript parser glob dependency override", () => {
  it("preserves the named matcher API used for default-project allowlists", () => {
    const { minimatch } = requireFromParser("minimatch");
    expect(minimatch("scripts/.compatibility.js", "scripts/*.js", { dot: true })).toBe(true);
    expect(minimatch("src/private.ts", "scripts/*.js", { dot: true })).toBe(false);
  });

  it("allows the parser project service to analyze an explicitly allowed JavaScript file", () => {
    const { parseAndGenerateServices } = loadDependency("@typescript-eslint/typescript-estree");
    const result = parseAndGenerateServices("export const compatibility = 1;", {
      filePath: resolve("scripts/dependency-compatibility.fixture.js"),
      tsconfigRootDir: process.cwd(),
      projectService: { allowDefaultProject: ["scripts/*.fixture.js"] },
    });
    expect(result.ast.type).toBe("Program");
    expect(result.services.program).toBeTruthy();
  }, 20_000); // The integration check initializes TypeScript's real project service.
});
