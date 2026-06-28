const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// react_native_post_install() sets CLANG_CXX_LANGUAGE_STANDARD=c++20 for ALL pods.
// This overrides our gnu++17 fix for the fmt target — we MUST inject AFTER it.
// Strategy: inject our fix code right after react_native_post_install() closes,
// before the end of the post_install block.
function withFmtXcode26Fix(config) {
  return withDangerousMod(config, ['ios', (config) => {
    const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
    if (!fs.existsSync(podfilePath)) return config;

    let podfile = fs.readFileSync(podfilePath, 'utf8');
    if (podfile.includes('FMT_XC26_FIX')) return config;

    // Ruby code to run AFTER react_native_post_install has set c++20 for all pods.
    // We then override fmt back to gnu++17 so __cpp_consteval is undefined.
    // Also patch base.h source directly as belt-and-suspenders.
    // Note: \\n in JS string literal → \n in file → Ruby double-quoted string newline
    const fix = `
    # FMT_XC26_FIX: override react_native_post_install c++20 for fmt target
    # (react_native_post_install sets c++20 on all pods, triggering consteval errors)
    # 1. Patch base.h actual source using File.realpath to follow symlinks
    fmt_base_candidates = [
      File.join(installer.sandbox.root.to_s, 'fmt', 'include', 'fmt', 'base.h'),
    ]
    Dir.glob(File.join(installer.sandbox.root.to_s, '*', 'include', 'fmt', 'base.h')).each { |p| fmt_base_candidates << p }
    fmt_base_candidates.uniq.each do |base_h|
      next unless File.exist?(base_h)
      real = File.realpath(base_h) rescue base_h
      next if File.read(real).start_with?('// XC26FIX')
      original = File.read(real)
      File.write(real, "// XC26FIX\\n#ifndef FMT_USE_CONSTEVAL\\n#define FMT_USE_CONSTEVAL 0\\n#endif\\n" + original)
      puts "[FMT-FIX] Patched: " + real
    end
    # 2. Override fmt target back to gnu++17 (AFTER react_native_post_install set c++20)
    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'
      target.build_configurations.each do |cfg|
        cfg.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'gnu++17'
        cfg.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = ['$(inherited)', 'FMT_USE_CONSTEVAL=0']
        puts "[FMT-FIX] fmt/" + cfg.name + " → gnu++17 + FMT_USE_CONSTEVAL=0"
      end
    end
    # 3. Also patch xcconfig files for fmt (lower priority backup)
    Dir.glob(File.join(installer.sandbox.root.to_s, 'Target Support Files', 'fmt', '*.xcconfig')).each do |xc|
      content = File.read(xc)
      next if content.include?('FMT_USE_CONSTEVAL')
      File.write(xc, content + "\\nOTHER_CPLUSPLUSFLAGS = $(inherited) -DFMT_USE_CONSTEVAL=0\\n")
      puts "[FMT-FIX] xcconfig: " + xc
    end
`;

    // Inject AFTER react_native_post_install() closes, before post_install end.
    // The generated Podfile has this pattern at the end:
    //     )       ← closes react_native_post_install(...)
    //   end       ← closes post_install do |installer|
    // end         ← closes target 'JunglApp' do
    const afterRni = '    )\n  end\nend';
    if (podfile.includes(afterRni)) {
      podfile = podfile.replace(afterRni, '    )\n' + fix + '  end\nend');
    } else {
      // Fallback: inject at block start (less ideal but better than nothing)
      podfile = podfile.replace(
        'post_install do |installer|',
        'post_install do |installer|' + fix
      );
    }

    fs.writeFileSync(podfilePath, podfile);
    return config;
  }]);
}

module.exports = ({ config }) => withFmtXcode26Fix(config);
