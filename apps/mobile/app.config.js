const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// fmt 9.x: FMT_USE_CONSTEVAL is auto-enabled via __cpp_consteval on Xcode 26+/Clang 17+.
// This makes FMT_STRING's consteval constructor fail. Fix: patch fmt/core.h to prepend
// #define FMT_USE_CONSTEVAL 0 before the auto-detection block.
function withFmtXcode26Fix(config) {
  return withDangerousMod(config, ['ios', (config) => {
    const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
    if (!fs.existsSync(podfilePath)) return config;

    let podfile = fs.readFileSync(podfilePath, 'utf8');
    if (podfile.includes('FMT_USE_CONSTEVAL')) return config;

    // Belt: set compiler flag for all targets via build settings.
    // Suspenders: patch fmt/core.h source directly (most reliable).
    // Note: \\n in JS template → \n in file → Ruby double-quoted string newline.
    const fix = `
    # Fix: FMT_STRING consteval incompatibility with Clang 17+ (Xcode 26+)
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |cfg|
        existing = cfg.build_settings['OTHER_CPLUSPLUSFLAGS'] || '$(inherited)'
        unless existing.include?('FMT_USE_CONSTEVAL')
          cfg.build_settings['OTHER_CPLUSPLUSFLAGS'] = existing + ' -DFMT_USE_CONSTEVAL=0'
        end
      end
    end
    fmt_core_h = File.join(installer.sandbox.root.to_s, 'fmt', 'include', 'fmt', 'core.h')
    if File.exist?(fmt_core_h) && !File.read(fmt_core_h).start_with?('// XC26FIX')
      original = File.read(fmt_core_h)
      prefix = "// XC26FIX: FMT_USE_CONSTEVAL disabled for Xcode 26+ (Clang 17+)\\n#ifndef FMT_USE_CONSTEVAL\\n#define FMT_USE_CONSTEVAL 0\\n#endif\\n"
      File.write(fmt_core_h, prefix + original)
      puts "[FMT-FIX] Patched " + fmt_core_h
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
