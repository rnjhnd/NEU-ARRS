export const isClerkAPIResponseError = (value: unknown) => Boolean(value && typeof value === "object" && "errors" in value);
