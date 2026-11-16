import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "../..");
const config = {
  devIndicators: false,
  outputFileTracingRoot: root,
  webpack(config) {
    config.resolve.alias["@clerk/nextjs$"] = resolve(directory, "clerk.jsx");
    config.resolve.alias["@clerk/nextjs/errors$"] = resolve(directory, "clerk-errors.js");
    return config;
  },
};
export default config;
