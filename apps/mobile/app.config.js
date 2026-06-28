const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// The generated Podfile structure (Expo SDK 52 template):
//
//   post_install do |installer|
//     react_native_post_install(...)   ← sets c++20 on ALL pod targets including fmt
//     # CODE_SIGNING_ALLOWED block
//     installer.target_installation_results...
//       .each do |pod_name, ...|
//       ...
//     end
//   end    ← closes post_install
// end      ← closes target 'JunglApp'
//
// We inject AFTER the CODE_SIGNING block and AFTER react_native_post_install,
// by finding the LAST "  end\nend" (which closes post_install then target).
// This ensures our gnu++17 override runs AFTER react_native_post_install's c++20.
function withFmtXcode26Fix(config) {
  return withDangerousMod(config, ['ios', (config) => {
    const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
    if (!fs.existsSync(podfilePath)) return config;

    let podfile = fs.readFileSync(podfilePath, 'utf8');
    if (podfile.includes('FMT_XC26_FIX')) return config;

    // Ruby code injected inside post_install AFTER react_native_post_install.
    // Note: \\n in JS string → \n in file → Ruby interprets as newline in "..." string
    const fix = `
    # FMT_XC26_FIX: runs AFTER react_native_post_install which sets c++20 globally
    # Source patch: prepend define to actual base.h (File.realpath follows symlinks)
    [
      File.join(installer.sandbox.root.to_s, 'fmt', 'include', 'fmt', 'base.h'),
    ].each do |base_h|
      next unless File.exist?(base_h)
      real = File.realpath(base_h) rescue base_h
      next if File.read(real).start_with?('// XC26FIX')
      File.write(real, "// XC26FIX\\n#ifndef FMT_USE_CONSTEVAL\\n#define FMT_USE_CONSTEVAL 0\\n#endif\\n" + File.read(real))
      puts "[FMT-FIX] Patched base.h: " + real
    end
    # Build settings: override c++20 back to gnu++17 for the fmt target ONLY
    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'
      target.build_configurations.each do |cfg|
        cfg.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'gnu++17'
        cfg.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = ['$(inherited)', 'FMT_USE_CONSTEVAL=0']
        puts "[FMT-FIX] fmt/" + cfg.name + " → gnu++17 + FMT_USE_CONSTEVAL=0"
      end
    end
    # xcconfig patch (lower-priority backup)
    Dir.glob(File.join(installer.sandbox.root.to_s, 'Target Support Files', 'fmt', '*.xcconfig')).each do |xc|
      content = File.read(xc)
      next if content.include?('FMT_USE_CONSTEVAL')
      File.write(xc, content + "\\nOTHER_CPLUSPLUSFLAGS = $(inherited) -DFMT_USE_CONSTEVAL=0\\n")
      puts "[FMT-FIX] xcconfig: " + xc
    end
`;

    // Find the LAST "  end\nend" in the file — this closes the post_install block
    // and the target block respectively, right at the end of the Podfile.
    // Inject our fix code just before this closing sequence.
    const closingPattern = '  end\nend';
    const lastPos = podfile.lastIndexOf(closingPattern);
    if (lastPos !== -1) {
      podfile = podfile.substring(0, lastPos) + fix + podfile.substring(lastPos);
      console.log('[withFmtXcode26Fix] Injected after react_native_post_install (lastIndexOf)');
    } else {
      // Fallback: inject at beginning of post_install (less ideal)
      podfile = podfile.replace('post_install do |installer|', 'post_install do |installer|' + fix);
      console.log('[withFmtXcode26Fix] FALLBACK: injected at post_install start');
    }

    fs.writeFileSync(podfilePath, podfile);
    return config;
  }]);
}

module.exports = ({ config }) => withFmtXcode26Fix(config);
