import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const readmePath = resolve(root, 'README.md');
const readmeContent = readFileSync(readmePath, 'utf8');

const snippets = [
  {
    name: 'workflow',
    sourcePath: resolve(root, 'examples/readme-profile/src/workflow.ts'),
  },
  {
    name: 'react',
    sourcePath: resolve(root, 'examples/readme-profile/src/ProfileScreen.tsx'),
  },
  {
    name: 'test',
    sourcePath: resolve(root, 'examples/readme-profile/test/readme-snippet.test.ts'),
  },
];

function normalize(content) {
  return content.replace(/\r\n/g, '\n').trimEnd();
}

function extractBetween(content, startMarker, endMarker, fileLabel) {
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error(`Missing start marker in ${fileLabel}: ${startMarker}`);
  }

  const endIndex = content.indexOf(endMarker, startIndex + startMarker.length);
  if (endIndex === -1) {
    throw new Error(`Missing end marker in ${fileLabel}: ${endMarker}`);
  }

  return content.slice(startIndex + startMarker.length, endIndex);
}

function extractReadmeSnippet(readme, name) {
  const startMarker = `<!-- README_SNIPPET:${name}:start -->`;
  const endMarker = `<!-- README_SNIPPET:${name}:end -->`;
  const region = extractBetween(readme, startMarker, endMarker, 'README.md').trim();

  const fencedMatch = region.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
  if (!fencedMatch) {
    throw new Error(`README snippet '${name}' must contain exactly one fenced code block between markers`);
  }

  return normalize(fencedMatch[1]);
}

function extractSourceSnippet(source, name, sourcePath) {
  const startMarker = `// README_SNIPPET_START: ${name}`;
  const endMarker = `// README_SNIPPET_END: ${name}`;
  const region = extractBetween(source, startMarker, endMarker, sourcePath);
  return normalize(region.trim());
}

function firstDiffIndex(a, b) {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) {
      return index;
    }
  }
  return a.length === b.length ? -1 : length;
}

let hasFailure = false;

for (const snippet of snippets) {
  const sourceContent = readFileSync(snippet.sourcePath, 'utf8');
  const sourceSnippet = extractSourceSnippet(sourceContent, snippet.name, snippet.sourcePath);
  const readmeSnippet = extractReadmeSnippet(readmeContent, snippet.name);

  if (sourceSnippet !== readmeSnippet) {
    hasFailure = true;
    const diffIndex = firstDiffIndex(sourceSnippet, readmeSnippet);
    console.error(`Snippet mismatch: ${snippet.name}`);
    console.error(`  Source: ${snippet.sourcePath}`);
    console.error(`  README: ${readmePath}`);
    if (diffIndex !== -1) {
      const sourcePreview = sourceSnippet.slice(Math.max(0, diffIndex - 40), diffIndex + 40);
      const readmePreview = readmeSnippet.slice(Math.max(0, diffIndex - 40), diffIndex + 40);
      console.error(`  First difference at char ${diffIndex}`);
      console.error(`  Source preview: ${JSON.stringify(sourcePreview)}`);
      console.error(`  README preview: ${JSON.stringify(readmePreview)}`);
    }
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log('README example snippets are in sync.');
