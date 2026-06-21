// Patch non-writable globals before any module loads
(function () {
  var globals = ['performance', 'PerformanceObserver', 'fetch', 'Headers', 'Request', 'Response'];
  globals.forEach(function (name) {
    try {
      var desc = Object.getOwnPropertyDescriptor(global, name);
      if (desc && !desc.writable && desc.configurable) {
        Object.defineProperty(global, name, {
          writable: true,
          configurable: true,
          value: desc.value,
        });
      }
    } catch (e) {}
  });
})();

import 'expo-router/entry';
