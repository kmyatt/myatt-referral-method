import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "prisma/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  schema: path.join(repoRoot, "prisma/schema.prisma"),
});

