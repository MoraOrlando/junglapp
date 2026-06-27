const { withPodfileProperties } = require('expo/config-plugins');

// Force JSC (JavaScriptCore) engine. Hermes 0.16.0 crashes on iOS 26.5.1
// due to memory allocator incompatibility. JSC is Apple's own engine and works correctly.
const withJSC = (config) => {
  return withPodfileProperties(config, (config) => {
    config.modResults['expo.jsEngine'] = 'jsc';
    return config;
  });
};

module.exports = ({ config }) => {
  config = withJSC(config);
  return { ...config };
};
