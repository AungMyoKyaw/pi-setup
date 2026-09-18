import { isAbsolute, relative, resolve, sep } from "node:path";

const AUTO_RETRIEVE_RE =
  /\b(?:second brain|memory|memories|my notes?|personal notes?|my preferences?|about me|what did i|what was i|previously|remember|preference|decision|lesson|insight)\b/i;

export function shouldAutoRetrieve(prompt: string): boolean {
  return AUTO_RETRIEVE_RE.test(prompt);
}

export function resolveVaultPath(root: string, requestedPath: string): string {
  const rootPath = resolve(root);
  const candidate = resolve(rootPath, requestedPath);
  const relativePath = relative(rootPath, candidate);

  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error("Path must stay inside the Second Brain vault");
  }

  return candidate;
}
