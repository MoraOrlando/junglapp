const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// fmt library uses FMT_STRING (consteval) which is rejected by Clang in Xcode 26+.
// This post_install hook disables consteval evaluation for the fmt pod.
function withFmtXcode26Fix(config) {
  return withDangerousMod(config, ['ios', (config) => {
    const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
    if (!fs.existsSync(podfilePath)) return config;

    let podfile = fs.readFileSync(podfilePath, 'utf8');
    if (podfile.includes('FMT_USE_CONSTEVAL')) return config;

    const fix = `
  # Xcode 26+: fmt library FMT_STRING uses consteval in a way Clang 17+ rejects.
  installer.pods_project.targets.each do |target|
    if ['fmt', 'glog', 'folly', 'RCT-Folly'].include?(target.name)
      target.build_configurations.each do |cfg|
        cfg.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
        cfg.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_USE_CONSTEVAL=0'
        cfg.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++20'
      end
    end
  end`;

    podfile = podfile.replace(
      'post_install do |installer|',
      `post_install do |installer|${fix}`
    );
    fs.writeFileSync(podfilePath, podfile);
    return config;
  }]);
}

module.exports = ({ config }) => withFmtXcode26Fix(config);
