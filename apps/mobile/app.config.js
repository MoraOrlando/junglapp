const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// fmt 9.x uses consteval in FMT_STRING which Clang 17+ (Xcode 26+) rejects.
// Inject into the existing post_install block (CocoaPods rejects multiple blocks).
// Apply to ALL targets so any pod that includes fmt headers gets the flag.
function withFmtXcode26Fix(config) {
  return withDangerousMod(config, ['ios', (config) => {
    const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
    if (!fs.existsSync(podfilePath)) return config;

    let podfile = fs.readFileSync(podfilePath, 'utf8');
    if (podfile.includes('FMT_USE_CONSTEVAL')) return config;

    // Inject at top of existing post_install block (substring match works even with leading spaces).
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
