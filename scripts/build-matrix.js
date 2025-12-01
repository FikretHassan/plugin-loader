/**
 * Matrix Build Script
 * Generates optimized bundles per targeting combination
 *
 * Output:
 *   dist/matrix/
 *     manifest.json     - Maps targeting criteria to bundles
 *     global.js         - Plugins that load everywhere (section: ['all'])
 *     sport.js          - Plugins for sport section
 *     news.js           - Plugins for news section
 *     ...etc
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);

// Load matrix config
const matrixConfigModule = await import(`file://${join(ROOT, 'config/matrix.js')}`);
const matrixConfig = matrixConfigModule.default;

// Normalize bundleBy to always be an array
const bundleByRaw = matrixConfig.bundleBy || ['section'];
const bundleBy = Array.isArray(bundleByRaw) ? bundleByRaw : [bundleByRaw];
const selfContained = matrixConfig.selfContained !== false;

// Load dimensions config to know all available dimensions
const dimensionsConfig = JSON.parse(readFileSync(join(ROOT, 'config/dimensions.json'), 'utf8'));
const allDimensions = Object.keys(dimensionsConfig);

console.log(`Matrix config: bundleBy=${JSON.stringify(bundleBy)}, selfContained=${selfContained}`);

// First, run the dimension generator
console.log('Generating dimensions...');
execSync('node scripts/build.js dev', { cwd: ROOT, stdio: 'inherit' });

// Dynamic import of plugins config
const pluginsModule = await import(`file://${join(ROOT, 'config/plugins.js')}`);
const plugins = pluginsModule.default;

// Get all unique values for a dimension from plugins
function getDimensionValues(plugins, dimension) {
  const values = new Set();
  for (const plugin of Object.values(plugins)) {
    const dimValues = plugin.include?.[dimension] || ['all'];
    if (!dimValues.includes('all')) {
      for (const v of dimValues) {
        const rootValue = v.split('/')[0].split('.')[0];
        values.add(rootValue);
      }
    }
  }
  return Array.from(values);
}

// Check if a plugin is "global" for all given dimensions
function isGlobalPlugin(plugin, dimensions) {
  for (const dim of dimensions) {
    const values = plugin.include?.[dim] || ['all'];
    if (!values.includes('all') && values.length > 0) {
      return false;
    }
  }
  return true;
}

// Check if a plugin matches a specific combination
function pluginMatchesCombination(plugin, combination, dimensions) {
  for (let i = 0; i < dimensions.length; i++) {
    const dim = dimensions[i];
    const targetValue = combination[i];
    const pluginValues = plugin.include?.[dim] || ['all'];

    if (pluginValues.includes('all')) {
      continue; // Matches all
    }

    // Check if any plugin value matches (using root value for startsWith)
    const matches = pluginValues.some(v => {
      const rootValue = v.split('/')[0].split('.')[0];
      return rootValue === targetValue;
    });

    if (!matches) {
      return false;
    }
  }
  return true;
}

// Generate all combinations from arrays of values
function generateCombinations(arrays) {
  if (arrays.length === 0) return [[]];
  if (arrays.length === 1) return arrays[0].map(v => [v]);

  const result = [];
  const rest = generateCombinations(arrays.slice(1));

  for (const value of arrays[0]) {
    for (const combo of rest) {
      result.push([value, ...combo]);
    }
  }

  return result;
}

// Analyze plugins and group by the configured dimensions (supports array)
function analyzePlugins(plugins, dimensions) {
  const global = [];      // Plugins that match 'all' for every dimension
  const bundleMap = {};   // Map of bundle key -> plugins
  const allCombinations = [];

  // Get all unique values for each dimension
  const dimensionValues = dimensions.map(dim => getDimensionValues(plugins, dim));

  // Generate all combinations
  const combinations = generateCombinations(dimensionValues);

  for (const [key, plugin] of Object.entries(plugins)) {
    if (isGlobalPlugin(plugin, dimensions)) {
      global.push(key);
    }
  }

  // For each combination, find matching plugins
  for (const combo of combinations) {
    const bundleKey = combo.join('-');
    bundleMap[bundleKey] = [];
    allCombinations.push({ key: bundleKey, values: combo });

    for (const [key, plugin] of Object.entries(plugins)) {
      // Skip global plugins (they'll be added via selfContained)
      if (isGlobalPlugin(plugin, dimensions)) {
        continue;
      }

      if (pluginMatchesCombination(plugin, combo, dimensions)) {
        if (!bundleMap[bundleKey].includes(key)) {
          bundleMap[bundleKey].push(key);
        }
      }
    }
  }

  return { global, bundleMap, allCombinations, dimensions };
}

// Normalize a plugin with all default properties
function normalizePlugin(plugin, dimensions) {
  // Build default include object with all dimensions set to ['all']
  const defaultInclude = {};
  for (const dim of dimensions) {
    defaultInclude[dim] = ['all'];
  }

  return {
    name: plugin.name,
    active: plugin.active !== false,
    url: plugin.url,
    domains: plugin.domains || ['all'],
    consentState: plugin.consentState || ['all'],
    include: { ...defaultInclude, ...plugin.include },
    exclude: plugin.exclude || {},
    preloadFn: plugin.preloadFn || plugin.preload || function() {},
    onloadFn: plugin.onloadFn || plugin.onload || function() {},
    onerrorFn: plugin.onerrorFn || plugin.onerror || function() {},
    timeoutFn: plugin.timeoutFn || plugin.ontimeout || function() {},
    ignoreFn: plugin.ignoreFn || plugin.onignore || function() {}
  };
}

// Generate a bundle file for a subset of plugins
function generateBundleSource(pluginKeys, plugins, dimensions) {
  const subset = {};
  for (const key of pluginKeys) {
    subset[key] = normalizePlugin(plugins[key], dimensions);
  }

  // Convert to source code
  let source = '// Auto-generated plugin bundle\n';
  source += 'export default ' + serializePlugins(subset) + ';\n';

  return source;
}

// Serialize plugins object to string (handling functions)
function serializePlugins(plugins) {
  let result = '{\n';

  for (const [key, plugin] of Object.entries(plugins)) {
    result += `  ${JSON.stringify(key)}: {\n`;

    for (const [prop, value] of Object.entries(plugin)) {
      if (typeof value === 'function') {
        result += `    ${prop}: ${value.toString()},\n`;
      } else if (typeof value === 'object' && value !== null) {
        result += `    ${prop}: ${serializeObject(value)},\n`;
      } else {
        result += `    ${prop}: ${JSON.stringify(value)},\n`;
      }
    }

    result += '  },\n';
  }

  result += '}';
  return result;
}

function serializeObject(obj) {
  if (Array.isArray(obj)) {
    return JSON.stringify(obj);
  }

  let result = '{\n';
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'function') {
      result += `      ${key}: ${value.toString()},\n`;
    } else if (typeof value === 'object' && value !== null) {
      result += `      ${key}: ${serializeObject(value)},\n`;
    } else {
      result += `      ${key}: ${JSON.stringify(value)},\n`;
    }
  }
  result += '    }';
  return result;
}

// Main build
console.log('\nAnalyzing plugins for matrix build...');
const { global, bundleMap, allCombinations, dimensions } = analyzePlugins(plugins, bundleBy);

console.log(`Found ${global.length} global plugins`);
console.log(`Found ${allCombinations.length} ${bundleBy.join('-')}-specific bundles`);
if (selfContained) {
  console.log('Self-contained mode: global plugins will be included in all bundles');
}

// Create matrix output directory
const matrixDir = join(ROOT, 'dist/matrix');
const matrixSrcDir = join(ROOT, 'src/generated/matrix');
mkdirSync(matrixDir, { recursive: true });
mkdirSync(matrixSrcDir, { recursive: true });

// Generate manifest
const manifest = {
  generated: new Date().toISOString(),
  basePath: 'matrix/',
  bundleBy: bundleBy,
  selfContained: selfContained,
  bundles: {
    global: {
      path: 'global.min.js',
      plugins: global,
      alwaysLoad: !selfContained
    }
  }
};

// Generate global bundle source
if (global.length > 0) {
  const globalSource = generateBundleSource(global, plugins, allDimensions);
  writeFileSync(join(matrixSrcDir, 'global.js'), globalSource);
  console.log(`Generated: src/generated/matrix/global.js (${global.length} plugins)`);
}

// Generate combination-specific bundles
for (const combo of allCombinations) {
  let bundlePlugins = bundleMap[combo.key] || [];

  // If self-contained, include global plugins in each bundle
  if (selfContained) {
    bundlePlugins = [...new Set([...global, ...bundlePlugins])];
  }

  if (bundlePlugins.length > 0) {
    const bundleSource = generateBundleSource(bundlePlugins, plugins, allDimensions);
    writeFileSync(join(matrixSrcDir, `${combo.key}.js`), bundleSource);
    console.log(`Generated: src/generated/matrix/${combo.key}.js (${bundlePlugins.length} plugins)`);

    // Build match object from combo values
    const match = {};
    for (let i = 0; i < dimensions.length; i++) {
      match[dimensions[i]] = [combo.values[i]];
    }

    manifest.bundles[combo.key] = {
      path: `${combo.key}.min.js`,
      plugins: bundlePlugins,
      match: match
    };
  }
}

// Write manifest
writeFileSync(join(matrixDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Generated: dist/matrix/manifest.json`);

// Build each bundle with esbuild
console.log('\nBuilding matrix bundles...');

// Build global bundle
if (global.length > 0) {
  execSync(
    `npx esbuild src/generated/matrix/global.js --bundle --minify --format=iife --global-name=MatrixBundle --outfile=dist/matrix/global.min.js`,
    { cwd: ROOT, stdio: 'inherit' }
  );
}

// Build combination-specific bundles
for (const combo of allCombinations) {
  const bundlePlugins = selfContained
    ? [...new Set([...global, ...(bundleMap[combo.key] || [])])]
    : bundleMap[combo.key];

  if (bundlePlugins?.length > 0) {
    execSync(
      `npx esbuild src/generated/matrix/${combo.key}.js --bundle --minify --format=iife --global-name=MatrixBundle --outfile=dist/matrix/${combo.key}.min.js`,
      { cwd: ROOT, stdio: 'inherit' }
    );
  }
}

// Build the matrix loader (sets window.pluginLoader internally)
console.log('\nBuilding matrix loader...');
execSync(
  `npx esbuild src/entry-matrix.js --bundle --minify --format=iife --outfile=dist/plugin-loader-matrix.min.js`,
  { cwd: ROOT, stdio: 'inherit' }
);

console.log('\nMatrix build complete!');
console.log(`\nOutput:`);
console.log(`  dist/plugin-loader-matrix.min.js  (lightweight loader)`);
console.log(`  dist/matrix/manifest.json`);
console.log(`  dist/matrix/global.min.js`);
for (const combo of allCombinations) {
  if (bundleMap[combo.key]?.length > 0 || selfContained) {
    console.log(`  dist/matrix/${combo.key}.min.js`);
  }
}
