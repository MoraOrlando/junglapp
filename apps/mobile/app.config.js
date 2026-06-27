const { withPodfileProperties, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Force JSC (JavaScriptCore) engine via Podfile.properties.json
const withJSCProperties = (config) => {
  return withPodfileProperties(config, (config) => {
    config.modResults['expo.jsEngine'] = 'jsc';
    return config;
  });
};

// Also patch the Podfile directly to guarantee hermes_enabled => false.
// Belt-and-suspenders: withPodfileProperties alone isn't surviving EAS Build cache.
const withJSCPodfile = (config) => {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (fs.existsSync(podfilePath)) {
        let podfile = fs.readFileSync(podfilePath, 'utf8');
        // Replace the dynamic hermes_enabled check with a hard false
        podfile = podfile.replace(
          /:hermes_enabled => podfile_properties\['expo\.jsEngine'\] == nil \|\| podfile_properties\['expo\.jsEngine'\] == 'hermes'/,
          ':hermes_enabled => false'
        );
        fs.writeFileSync(podfilePath, podfile);
      }
      return config;
    },
  ]);
};

module.exports = ({ config }) => {
  config = withJSCProperties(config);
  config = withJSCPodfile(config);
  return { ...config };
};
