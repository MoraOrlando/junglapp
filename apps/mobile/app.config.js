const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// fmt 10.x: sets FMT_USE_CONSTEVAL=1 via __cpp_consteval on Xcode 26+/Clang 17+.
// consteval makes basic_format_string's constructor require a constant context
// that Clang 17+ enforces strictly — triggering errors in format-inl.h.
// Fix: force CLANG_CXX_LANGUAGE_STANDARD=gnu++17 on fmt target so __cpp_consteval
// is never defined, plus xcconfig patching as backup.
function withFmtXcode26Fix(config) {
  return withDangerousMod(config, ['ios', (config) => {
    const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
    if (!fs.existsSync(podfilePath)) return config;

    let podfile = fs.readFileSync(podfilePath, 'utf8');
    if (podfile.includes('FMT_XC26_FIX')) return config;

    // Ruby injected into Podfile post_install hook.
    // \\n → \n in written file → Ruby string newlines
    const fix = `
    # FMT_XC26_FIX: Disable FMT_USE_CONSTEVAL for Xcode 26+/Clang 17+
    # Strategy 1: patch base.h source directly
    fmt_base_h_candidates = [
      File.join(installer.sandbox.root.to_s, 'fmt', 'include', 'fmt', 'base.h'),
      File.join(installer.sandbox.root.to_s, 'fmt', 'fmt', 'base.h'),
    ]
    Dir.glob(File.join(installer.sandbox.root.to_s, '*', 'include', 'fmt', 'base.h')).each do |p|
      fmt_base_h_candidates << p
    end
    fmt_base_h_candidates.uniq.each do |base_h|
      next unless File.exist?(base_h)
      real_path = File.realpath(base_h) rescue base_h
      next if File.read(real_path).start_with?('// XC26FIX')
      original = File.read(real_path)
      prefix = "// XC26FIX\\n#ifndef FMT_USE_CONSTEVAL\\n#define FMT_USE_CONSTEVAL 0\\n#endif\\n"
      File.write(real_path, prefix + original)
      puts "[FMT-FIX] Patched source: " + real_path
    end
    # Strategy 2: per-target CLANG_CXX_LANGUAGE_STANDARD + GCC_PREPROCESSOR_DEFINITIONS
    puts "[FMT-FIX] Scanning " + installer.pods_project.targets.length.to_s + " targets..."
    installer.pods_project.targets.each do |target|
      if target.name == 'fmt'
        target.build_configurations.each do |cfg|
          cfg.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'gnu++17'
          cfg.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = ['$(inherited)', 'FMT_USE_CONSTEVAL=0']
          puts "[FMT-FIX] Target fmt/" + cfg.name + " set to gnu++17 + FMT_USE_CONSTEVAL=0"
        end
      end
    end
    # Strategy 3: patch xcconfig files for fmt target directly
    Dir.glob(File.join(installer.sandbox.root.to_s, 'Target Support Files', 'fmt', '*.xcconfig')).each do |xcconfig_path|
      content = File.read(xcconfig_path)
      next if content.include?('FMT_USE_CONSTEVAL')
      content += "\\nOTHER_CPLUSPLUSFLAGS = $(inherited) -DFMT_USE_CONSTEVAL=0\\n"
      content += "CLANG_CXX_LANGUAGE_STANDARD = gnu++17\\n"
      File.write(xcconfig_path, content)
      puts "[FMT-FIX] Patched xcconfig: " + xcconfig_path
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
