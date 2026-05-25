// Learn more https://docs.expo.dev/guides/monorepos
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo so Metro picks up changes in packages/upload-core
config.watchFolders = [monorepoRoot];

// Resolve modules from the app's own node_modules first, then the hoisted root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// pnpm uses symlinks aggressively — enable Metro's symlink support.
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// upload-core uses Node-ESM-style `.js` imports of sibling `.ts` files
// (`import './foo.js'` where the file on disk is `./foo.ts`). Vite handles
// this transparently; Metro does not. Patch the resolver to retry as `.ts`
// (and `.tsx`) when a `.js` import would otherwise fail.
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('.js')) {
    const stem = moduleName.slice(0, -3);
    for (const ext of ['.ts', '.tsx']) {
      try {
        return context.resolveRequest(context, stem + ext, platform);
      } catch {
        // try next extension
      }
    }
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
