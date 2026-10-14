import { mkdirSync, writeFileSync } from "node:fs";
import type { Engine } from "@plinth/engine";
import { buildOpenApi } from "./openapi";
import { buildRoutes } from "./routes";

// Route definitions only need the engine inside handlers, so a stub is enough to generate the document.
const doc = buildOpenApi(buildRoutes({} as Engine), process.env.PUBLIC_API_URL ?? "https://api.example.com");
mkdirSync("../../docs", { recursive: true });
writeFileSync("../../docs/openapi.json", JSON.stringify(doc, null, 2) + "\n");
console.log(`wrote docs/openapi.json (${Object.keys(doc.paths).length} paths)`);
