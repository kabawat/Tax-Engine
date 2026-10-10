import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const distDirectory = fileURLToPath(new URL('../dist/', import.meta.url));

async function obfuscateDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await obfuscateDirectory(entryPath);
    } else if (/\.(?:c?js)$/.test(entry.name)) {
      const source = await readFile(entryPath, 'utf8');
      const obfuscated = JavaScriptObfuscator.obfuscate(source, {
        compact: true,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,
        sourceMap: false,
        stringArray: true,
        stringArrayThreshold: 0.5,
        target: 'node',
      });
      await writeFile(entryPath, obfuscated.getObfuscatedCode());
    }
  }
}

await obfuscateDirectory(distDirectory);