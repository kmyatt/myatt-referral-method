import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveCandidates(basePath) {
  return [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
}

function resolveExistingFile(basePath) {
  return resolveCandidates(basePath).find((candidate) => fs.existsSync(candidate)) ?? null;
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("@/")) {
    const resolvedFile = resolveExistingFile(
      path.join(projectRoot, "src", specifier.slice(2)),
    );

    if (!resolvedFile) {
      throw new Error(`Unable to resolve alias import: ${specifier}`);
    }

    return defaultResolve(pathToFileURL(resolvedFile).href, context, defaultResolve);
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const parentDirectory = path.dirname(fileURLToPath(context.parentURL));
    const directPath = path.resolve(parentDirectory, specifier);

    if (!fs.existsSync(directPath)) {
      const resolvedFile = resolveExistingFile(directPath);

      if (resolvedFile) {
        return defaultResolve(pathToFileURL(resolvedFile).href, context, defaultResolve);
      }
    }
  }

  return defaultResolve(specifier, context, defaultResolve);
}