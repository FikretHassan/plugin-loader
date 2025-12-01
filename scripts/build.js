/**
 * Build script
 * Generates dimension functions from config/dimensions.json
 * Then bundles with esbuild
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);

// Read dimensions config
const dimensionsPath = `${ROOT}/config/dimensions.json`;
const dimensions = JSON.parse(readFileSync(dimensionsPath, 'utf8'));

/**
 * Generate getter function code for a dimension based on its source type
 */
function generateGetter(name, config) {
  // Support both 'key' and 'path' for flexibility
  const key = config.key || config.path;

  switch (config.source) {
    case 'meta':
      return `  ${name}: () => document.querySelector('meta[name="${key}"]')?.content || ''`;

    case 'window':
      // Handle nested paths like "dataLayer.pageType" or "myApp.user.country"
      let pathStr = key;
      // Strip leading "window." if present
      if (pathStr.startsWith('window.')) {
        pathStr = pathStr.slice(7);
      }
      const pathParts = pathStr.split('.');
      const safeAccess = pathParts.reduce((acc, part, i) => {
        if (i === 0) return `window.${part}`;
        return `${acc}?.${part}`;
      }, '');
      return `  ${name}: () => ${safeAccess} || ''`;

    case 'cookie':
      return `  ${name}: () => document.cookie.split('; ').find(c => c.startsWith('${key}='))?.split('=')[1] || ''`;

    case 'localStorage':
      return `  ${name}: () => localStorage.getItem('${key}') || ''`;

    case 'sessionStorage':
      return `  ${name}: () => sessionStorage.getItem('${key}') || ''`;

    case 'queryParam':
      return `  ${name}: () => new URLSearchParams(window.location.search).get('${key}') || ''`;

    case 'dataAttribute':
      return `  ${name}: () => document.querySelector('${config.selector}')?.dataset['${key}'] || ''`;

    default:
      console.warn(`Unknown source type: ${config.source} for dimension: ${name}`);
      return `  ${name}: () => ''`;
  }
}

/**
 * Generate dimensionConfig for matchTypes
 */
function generateDimensionConfig(dimensions) {
  const entries = Object.entries(dimensions)
    .filter(([_, config]) => config.matchType && config.matchType !== 'exact')
    .map(([name, config]) => `  ${name}: { matchType: '${config.matchType}' }`);

  if (entries.length === 0) return '{}';
  return `{\n${entries.join(',\n')}\n}`;
}

// Generate the dimensions module
const getters = Object.entries(dimensions)
  .map(([name, config]) => generateGetter(name, config))
  .join(',\n');

const dimensionConfig = generateDimensionConfig(dimensions);

const generatedCode = `/**
 * AUTO-GENERATED - Do not edit directly
 * Generated from config/dimensions.json
 */

export const dimensions = {
${getters}
};

export const dimensionConfig = ${dimensionConfig};

export default { dimensions, dimensionConfig };
`;

// Ensure generated directory exists
mkdirSync(`${ROOT}/src/generated`, { recursive: true });

// Write generated file
const outputPath = `${ROOT}/src/generated/dimensions.js`;
writeFileSync(outputPath, generatedCode);
console.log(`Generated: ${outputPath}`);

// Run esbuild
const mode = process.argv[2] || 'prod';

const commands = {
  // entry.js = auto-initializing bundle (sets window.pluginLoader internally)
  prod: 'npx esbuild src/entry.js --bundle --minify --format=iife --outfile=dist/plugin-loader.min.js',
  dev: 'npx esbuild src/entry.js --bundle --format=iife --sourcemap --outfile=dist/plugin-loader.js',
  // Library-only build (for manual instantiation)
  lib: 'npx esbuild src/index.js --bundle --minify --format=iife --global-name=PluginLoader --outfile=dist/plugin-loader.lib.min.js',
  esm: 'npx esbuild src/index.js --bundle --minify --format=esm --outfile=dist/plugin-loader.esm.min.js',
  // Standalone PubSub (sets window.PubSub internally)
  pubsub: 'npx esbuild src/pubsub.js --bundle --minify --format=iife --outfile=dist/pubsub.min.js'
};

if (mode === 'all') {
  Object.entries(commands).forEach(([name, cmd]) => {
    console.log(`Building: ${name}`);
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  });
} else {
  const cmd = commands[mode] || commands.prod;
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

console.log('Build complete!');
