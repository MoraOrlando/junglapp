const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// npm's hoisting decision for react/react-native can change between installs
// (whether a local copy ends up in apps/mobile/node_modules or only at the
// workspace root). Resolve to wherever each package actually exists on disk
// instead of hardcoding the local path, so we don't break when npm re-hoists.
function resolvePackageDir(name) {
  const local = path.resolve(projectRoot, 'node_modules', name);
  if (fs.existsSync(path.join(local, 'package.json'))) return local;
  return path.resolve(workspaceRoot, 'node_modules', name);
}

const config = getDefaultConfig(projectRoot);

// Monorepo support: watch all workspace packages
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Firebase JS SDK 10 doesn't fully support Metro's package exports resolution
// (causes "Component auth has not been registered yet"). Disable it.
config.resolver.unstable_enablePackageExports = false;

// Deduplicate react and react-native: root node_modules may now have copies of both
// (react was hoisted there for the web workspace). Force Metro to always use a single,
// consistent copy so only ONE instance is bundled (prevents "useMemo of null" crashes).
const reactPkgDir = resolvePackageDir('react');
const rnPkgDir = resolvePackageDir('react-native');
config.resolver.extraNodeModules = {
  'react': reactPkgDir,
  'react/jsx-runtime': path.resolve(reactPkgDir, 'jsx-runtime'),
  'react/jsx-dev-runtime': path.resolve(reactPkgDir, 'jsx-dev-runtime'),
  'react-native': rnPkgDir,
};

// Fix for monorepo: metro runs from root node_modules but expo-asset is in apps/mobile.
// Asset plugins are required() from metro's location, so we resolve to absolute paths.
config.transformer.assetPlugins = (config.transformer.assetPlugins || []).map(plugin => {
  try {
    return require.resolve(plugin, { paths: [path.join(projectRoot, 'node_modules')] });
  } catch {
    return plugin;
  }
});

const originalResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Pin react to a single resolved copy — prevents "useMemo of null" when root also has react.
  if (moduleName === 'react') {
    return { type: 'sourceFile', filePath: path.resolve(reactPkgDir, 'index.js') };
  }
  if (moduleName === 'react/jsx-runtime') {
    return { type: 'sourceFile', filePath: path.resolve(reactPkgDir, 'jsx-runtime.js') };
  }
  if (moduleName === 'react/jsx-dev-runtime') {
    return { type: 'sourceFile', filePath: path.resolve(reactPkgDir, 'jsx-dev-runtime.js') };
  }
  // Pin react-native to a single resolved copy.
  if (moduleName === 'react-native' || moduleName.startsWith('react-native/')) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, '_sentinel.js') },
      moduleName,
      platform
    );
  }
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { type: 'sourceFile', filePath: path.resolve(projectRoot, 'stubs/maps-stub.js') };
  }
  if (moduleName === '../../App' && context.originModulePath?.includes(`${path.sep}expo${path.sep}AppEntry`)) {
    return { type: 'sourceFile', filePath: path.resolve(projectRoot, 'App.js') };
  }
  if (originalResolver) return originalResolver(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
