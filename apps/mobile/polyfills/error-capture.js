// Intercept fatal JS errors and show them in an Alert before crashing.
// This is a debugging aid for iOS 26.5.1 crash investigation. Remove once resolved.
(function () {
  if (!global.ErrorUtils) return;

  var prevHandler = global.ErrorUtils.getGlobalHandler();

  global.ErrorUtils.setGlobalHandler(function (error, isFatal) {
    if (isFatal) {
      var msg = 'unknown';
      try {
        msg = (error && error.message) ? error.message : String(error);
        var stack = (error && error.stack) ? error.stack : '';
        // Keep total under 1000 chars for Alert display
        msg = msg + '\n\n' + stack.slice(0, 600);
      } catch (e) { /* ignore */ }

      // Log to console (visible in Console.app when device is connected via USB)
      console.error('[FATAL JS ERROR]\n' + msg);

      try {
        var Alert = require('react-native').Alert;
        Alert.alert(
          'JunglApp - Fatal Error',
          msg.slice(0, 900),
          [{ text: 'OK' }]
        );
      } catch (alertErr) {
        // Alert unavailable; already logged to console above
      }
    }

    // Always call the original handler (fatal or not)
    if (prevHandler) prevHandler(error, isFatal);
  });
})();
