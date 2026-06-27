const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

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

// Deduplicate react-native: the root node_modules may have a different version than
// apps/mobile/node_modules. Force all react-native imports to resolve from apps/mobile
// so Metro never bundles two copies (which causes "property is not writable" crashes).
const rnDir = path.resolve(projectRoot, 'node_modules', 'react-native');
config.resolver.extraNodeModules = {
  'react-native': rnDir,
};

// react-native-maps has no web implementation — stub it out for the web bundle
// so the bundler doesn't fail when processing screens that import it conditionally.
const originalResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force react-native and all its subpaths to apps/mobile version.
  // We redirect by faking the origin to apps/mobile so Metro's own resolver
  // walks up from there and finds apps/mobile/node_modules/react-native first.
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
  // react-native-reanimated is removed from package.json to prevent the iOS 26.5.1
  // WorkletRuntime::legacyModeInit crash. Gesture-handler and screens reference it
  // optionally — redirect to a no-op stub so Metro can bundle without the native module.
  if (moduleName === 'react-native-reanimated') {
    return { type: 'sourceFile', filePath: path.resolve(projectRoot, 'stubs/reanimated-stub.js') };
  }
  // expo/AppEntry.js tries to import "../../App" — in a monorepo expo may be hoisted
  // to the workspace root, making that path unresolvable. Redirect to our local App.js stub.
  if (moduleName === '../../App' && context.originModulePath?.includes(`${path.sep}expo${path.sep}AppEntry`)) {
    return { type: 'sourceFile', filePath: path.resolve(projectRoot, 'App.js') };
  }
  if (originalResolver) return originalResolver(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

const finalConfig = withNativeWind(config, { input: './global.css' });

// Inject polyfill before all modules to fix non-writable globals (Hermes + RN 0.81 compat)
const originalGetPolyfills = finalConfig.serializer?.getPolyfills;
finalConfig.serializer = finalConfig.serializer || {};
finalConfig.serializer.getPolyfills = (ctx) => {
  const base = originalGetPolyfills ? originalGetPolyfills(ctx) : [];
  return [path.resolve(projectRoot, 'polyfills/fix-non-writable-globals.js'), ...base];
};

module.exports = finalConfig;
