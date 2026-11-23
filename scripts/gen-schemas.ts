// Regenerate schemas/*.json from the zod schemas in src/. Run: npm run schemas
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { ConfigSchema } from "../src/config.ts";
import { findingsJsonSchema } from "../src/findings.ts";

export function configJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ConfigSchema, { io: "input" }) as Record<string, unknown>;
}

const write = (file: string, schema: unknown) =>
  writeFileSync(
    new URL(`../schemas/${file}`, import.meta.url),
    `${JSON.stringify(schema, null, 2)}\n`,
  );

if (import.meta.url === `file://${process.argv[1]}`) {
  write("config.schema.json", configJsonSchema());
  write("findings.schema.json", findingsJsonSchema());
  console.log("schemas/ updated");
}
