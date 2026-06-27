// iOS 26.5.1 workaround: expo-modules-jsi's JavaScriptRuntime.createClass() calls
// eval() with raw JS source, which triggers BCProviderFromSrc::create in Hermes and
// crashes on iOS 26.5.1 due to BacktrackingBumpPtrAllocator memory access fault.
//
// This polyfill installs __expoClassFactory__ on the global object BEFORE any
// native module is first accessed. The patched Swift createClass() calls this
// factory (pre-compiled bytecode) instead of eval(), avoiding the crash.
(function () {
  // This closure is compiled to bytecode at bundle time.
  // Calling it returns a NEW function object each time, with a fresh .prototype,
  // without compiling any additional JS source at runtime.
  global.__expoClassFactory__ = function () {
    return function ExpoNativeClass() {
      var nc = this.__native_constructor__;
      if (nc) {
        var result = nc.apply(this, arguments);
        if (result !== undefined && result !== null) return result;
      }
    };
  };
})();
