'use strict';

// No-op stub for react-native-reanimated.
// Removed to prevent WorkletRuntime::legacyModeInit crash on iOS 26.5.1.
// Satisfies optional imports from gesture-handler and screens.
// __esModule:true ensures ESM default imports receive the correct Animated value.

Object.defineProperty(exports, '__esModule', { value: true });

function getAnimated() {
  // Defer require so this stub is safe to evaluate before RN is ready.
  return require('react-native').Animated;
}

// ESM default import: `import Animated from 'react-native-reanimated'` → Animated API
Object.defineProperty(exports, 'default', {
  enumerable: true,
  configurable: true,
  get: function () { return getAnimated(); },
});

// CommonJS destructure: `const { Animated } = require('react-native-reanimated')`
Object.defineProperty(exports, 'Animated', {
  enumerable: true,
  configurable: true,
  get: function () { return getAnimated(); },
});

var noop = function () { return undefined; };
var noopPassthrough = function (fn) { return fn; };

exports.useSharedValue = function (init) { return { value: init }; };
exports.useDerivedValue = function () { return { value: 0 }; };
exports.useAnimatedStyle = function () { return {}; };
exports.useAnimatedRef = function () { return { current: null }; };
exports.useAnimatedProps = function () { return {}; };
exports.useEvent = function () { return noop; };

exports.withTiming = function (toValue) { return toValue; };
exports.withSpring = function (toValue) { return toValue; };
exports.withDecay = function () { return 0; };
exports.withDelay = function (_delay, anim) { return anim; };
exports.withSequence = function () { return 0; };
exports.withRepeat = function (anim) { return anim; };
exports.cancelAnimation = noop;

// runOnUI: in real reanimated this schedules fn on the UI thread asynchronously.
// Returning a safe no-op avoids calling worklet-annotated functions on the JS thread.
exports.runOnUI = function () { return noop; };
exports.runOnJS = noopPassthrough;
exports.makeMutable = function (init) { return { value: init }; };
exports.measure = function () { return undefined; };

exports.interpolate = function (_v, _in, out) { return out ? out[0] : 0; };
exports.interpolateColor = function (_v, _in, out) { return out ? out[0] : 'transparent'; };

exports.startScreenTransition = noop;
exports.finishScreenTransition = noop;

exports.Extrapolation = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' };
exports.ReduceMotion = { System: 'system', Always: 'always', Never: 'never' };
exports.ScreenTransition = {};

exports.setGestureState = noop;
exports.useAnimatedGestureHandler = function () { return {}; };
exports.useAnimatedScrollHandler = function () { return {}; };
exports.scrollTo = noop;

exports.FadeIn = {};
exports.FadeOut = {};
exports.SlideInRight = {};
exports.SlideOutRight = {};
exports.ZoomIn = {};
exports.ZoomOut = {};
exports.Layout = {};
