// Intercept fatal JS errors: log to console and show Alert before crashing.
// The prevHandler calls abort() — we delay it so the Alert has time to render.
(function () {
  if (!global.ErrorUtils) return;

  var prevHandler = global.ErrorUtils.getGlobalHandler();

  global.ErrorUtils.setGlobalHandler(function (error, isFatal) {
    if (isFatal) {
      var msg = 'unknown';
      try {
        msg = (error && error.message) ? error.message : String(error);
        var stack = (error && error.stack) ? error.stack : '';
        msg = msg + '\n\n' + stack.slice(0, 600);
      } catch (e) { /* ignore */ }

      console.error('[FATAL JS ERROR]\n' + msg);

      try {
        var Alert = require('react-native').Alert;
        // Use button callback to delay crash — prevHandler calls abort() immediately,
        // which kills the process before the Alert renders.
        Alert.alert(
          'JunglApp Fatal Error',
          msg.slice(0, 900),
          [{
            text: 'Cerrar',
            onPress: function () {
              if (prevHandler) prevHandler(error, isFatal);
            }
          }],
          { cancelable: false }
        );
        // Don't call prevHandler here — wait for button tap
        return;
      } catch (alertErr) { /* Alert unavailable */ }
    }

    if (prevHandler) prevHandler(error, isFatal);
  });
})();
