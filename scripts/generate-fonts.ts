import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compress } from 'wawoff2';
import manifest from '../vendor/fonts/manifest.json';

export async function generateFonts() {
  await mkdir('src/generated/fonts', { recursive: true });
  for (const font of manifest.files) {
    const source = await readFile(`vendor/fonts/${font.file}`);
    const digest = createHash('sha256').update(source).digest('hex');
    if (digest !== font.sha256) throw new Error(`Font integrity mismatch: ${font.file}`);
    const output = `src/generated/fonts/${font.file.replace(/\.ttf$/, '.woff2')}`;
    // Include converter version so a tool upgrade regenerates its output.
    const stamp = `${digest}:wawoff2-2.0.1`;
    const previous = await readFile(output + '.stamp', 'utf8').catch(() => '');
    if (
      previous === stamp &&
      (await readFile(output).then(
        () => true,
        () => false,
      ))
    )
      continue;
    const bytes = await compress(source);
    await writeFile(output, bytes);
    await writeFile(output + '.stamp', stamp);
    console.log(`${font.file}: ${(bytes.length / 1024).toFixed(0)} KiB WOFF2`);
  }
}
