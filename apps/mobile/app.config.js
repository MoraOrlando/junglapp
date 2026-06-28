const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// fmt 9.x/10.x uses consteval in FMT_STRING, which Clang 17+ (Xcode 26+) rejects
// when called with non-constant arguments. Appending a second post_install block
// (CocoaPods 1.6+ supports multiple) to override C++ flags for affected targets.
function withFmtXcode26Fix(config) {
  return withDangerousMod(config, ['ios', (config) => {
    const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
    if (!fs.existsSync(podfilePath)) return config;

    let podfile = fs.readFileSync(podfilePath, 'utf8');
    if (podfile.includes('FMT_USE_CONSTEVAL')) return config;

    // Append a new post_install block — safer than injecting into the existing one.
    const fix = `
# Fix: FMT_STRING consteval incompatibility with Clang 17+ (Xcode 26+)
post_install do |installer|
  installer.pods_project.targets.each do |target|
    if ['fmt', 'glog', 'RCT-Folly', 'folly'].include?(target.name)
      target.build_configurations.each do |cfg|
        existing = cfg.build_settings['OTHER_CPLUSPLUSFLAGS'] || '$(inherited)'
        cfg.build_settings['OTHER_CPLUSPLUSFLAGS'] = existing + ' -DFMT_USE_CONSTEVAL=0'
      end
    end
  end
end
`;

    fs.writeFileSync(podfilePath, podfile + '\n' + fix);
    return config;
  }]);
}

module.exports = ({ config }) => withFmtXcode26Fix(config);
