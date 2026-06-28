const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// fmt 9.x uses consteval in FMT_STRING which Clang 17+ (Xcode 26+) rejects.
function withFmtXcode26Fix(config) {
  return withDangerousMod(config, ['ios', (config) => {
    const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

    console.log('[FMT-FIX] platformProjectRoot:', config.modRequest.platformProjectRoot);
    console.log('[FMT-FIX] podfilePath:', podfilePath);
    console.log('[FMT-FIX] exists:', fs.existsSync(podfilePath));

    if (!fs.existsSync(podfilePath)) return config;

    let podfile = fs.readFileSync(podfilePath, 'utf8');
    const alreadyPatched = podfile.includes('FMT_USE_CONSTEVAL');
    console.log('[FMT-FIX] already patched:', alreadyPatched);

    if (alreadyPatched) return config;

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

    const before = podfile.includes('post_install do |installer|');
    console.log('[FMT-FIX] has post_install pattern:', before);

    podfile = podfile.replace(
      'post_install do |installer|',
      'post_install do |installer|' + fix
    );

    const after = podfile.includes('FMT_USE_CONSTEVAL');
    console.log('[FMT-FIX] fix injected:', after);

    fs.writeFileSync(podfilePath, podfile);
    return config;
  }]);
}

module.exports = ({ config }) => withFmtXcode26Fix(config);
