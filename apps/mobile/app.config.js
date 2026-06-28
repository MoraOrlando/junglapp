const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// fmt 10.x (bundled with RN 0.76): base.h sets FMT_USE_CONSTEVAL=1 when __cpp_consteval
// is defined. Xcode 26.5 / Clang 17+ defines __cpp_consteval, hitting this branch.
// The Apple clang guard only covers < 14 (version 14000029L) — Xcode 26.5 is far newer.
// Fix: prepend #define FMT_USE_CONSTEVAL 0 to base.h so #ifdef FMT_USE_CONSTEVAL
// sees an external value and skips auto-detection.
function withFmtXcode26Fix(config) {
  return withDangerousMod(config, ['ios', (config) => {
    const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
    if (!fs.existsSync(podfilePath)) return config;

    let podfile = fs.readFileSync(podfilePath, 'utf8');
    if (podfile.includes('FMT_USE_CONSTEVAL')) return config;

    // Use Dir.glob to find base.h regardless of pod structure
    // (Pods/fmt/include/fmt/base.h OR Pods/ReactNativeDependencies/Headers/fmt/base.h)
    const fix = `
    # Fix: base.h sets FMT_USE_CONSTEVAL=1 via __cpp_consteval on Xcode 26+ (Clang 17+)
    Dir.glob(File.join(installer.sandbox.root.to_s, '**', 'fmt', 'base.h')).each do |base_h|
      next if File.read(base_h).start_with?('// XC26FIX')
      original = File.read(base_h)
      prefix = "// XC26FIX: FMT_USE_CONSTEVAL disabled for Xcode 26+ (Clang 17+)\\n#ifndef FMT_USE_CONSTEVAL\\n#define FMT_USE_CONSTEVAL 0\\n#endif\\n"
      File.write(base_h, prefix + original)
      puts "[FMT-FIX] Patched " + base_h
    end
`;

    podfile = podfile.replace(
      'post_install do |installer|',
      'post_install do |installer|' + fix
    );
    fs.writeFileSync(podfilePath, podfile);
    return config;
  }]);
}

module.exports = ({ config }) => withFmtXcode26Fix(config);
