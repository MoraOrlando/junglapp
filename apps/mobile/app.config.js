// Dynamic Expo config. It takes everything from app.json and only overrides
// the Android google-services.json path so that EAS Build can inject the file
// via a "file" environment variable (GOOGLE_SERVICES_JSON) at build time.
// Locally, when the env var is not set, it falls back to the committed path.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
});
