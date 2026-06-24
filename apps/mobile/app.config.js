const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const src = path.resolve(__dirname, 'google-services.json');
      const dest = path.join(cfg.modRequest.platformProjectRoot, 'app', 'google-services.json');
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
      return cfg;
    },
  ]);
};
