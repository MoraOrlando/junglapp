// Runs before React Native setup to make globals writable for compatibility
(function () {
  var globals = ['performance', 'PerformanceObserver', 'PerformanceEntry', 'PerformanceMark', 'PerformanceMeasure'];
  for (var i = 0; i < globals.length; i++) {
    var name = globals[i];
    try {
      var desc = Object.getOwnPropertyDescriptor(global, name);
      if (desc && !desc.writable) {
        Object.defineProperty(global, name, {
          value: desc.value || desc.get && desc.get(),
          writable: true,
          enumerable: desc.enumerable,
          configurable: true,
        });
      }
    } catch (_) {}
  }
})();
