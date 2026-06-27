'use strict';

/**
 * Stub for react-native-reanimated.
 * react-native-reanimated is not installed (removed to prevent iOS 26.5.1 crash in
 * WorkletRuntime::legacyModeInit). This stub satisfies Metro resolution for packages
 * like react-native-gesture-handler and react-native-screens that optionally import it.
 * The app uses React Native's built-in Animated API only.
 */

const { Animated } = require('react-native');

const noop = () => undefined;
const noopPassthrough = (fn) => fn;

const useSharedValue = (init) => ({ value: init });
const useDerivedValue = (fn) => ({ value: 0 });
const useAnimatedStyle = () => ({});
const useAnimatedRef = () => ({ current: null });
const useAnimatedProps = () => ({});
const useEvent = () => noop;

const withTiming = (toValue) => toValue;
const withSpring = (toValue) => toValue;
const withDecay = () => 0;
const withDelay = (_delay, anim) => anim;
const withSequence = (..._anims) => 0;
const withRepeat = (anim) => anim;
const cancelAnimation = noop;

const runOnUI = (fn) => (...args) => { fn(...args); };
const runOnJS = noopPassthrough;
const makeMutable = (init) => ({ value: init });
const measure = () => undefined;

const interpolate = (_value, _inputRange, outputRange) =>
  outputRange ? outputRange[0] : 0;

const interpolateColor = (_value, _inputRange, outputRange) =>
  outputRange ? outputRange[0] : 'transparent';

const startScreenTransition = noop;
const finishScreenTransition = noop;

const Extrapolation = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' };
const ReduceMotion = { System: 'system', Always: 'always', Never: 'never' };
const ScreenTransition = {};

const setGestureState = noop;

module.exports = {
  default: Animated,
  Animated,
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  useAnimatedRef,
  useAnimatedProps,
  useEvent,
  withTiming,
  withSpring,
  withDecay,
  withDelay,
  withSequence,
  withRepeat,
  cancelAnimation,
  runOnUI,
  runOnJS,
  makeMutable,
  measure,
  interpolate,
  interpolateColor,
  startScreenTransition,
  finishScreenTransition,
  Extrapolation,
  ReduceMotion,
  ScreenTransition,
  setGestureState,
  // Fallback for any other named import
  useAnimatedGestureHandler: () => ({}),
  useAnimatedScrollHandler: () => ({}),
  scrollTo: noop,
  FadeIn: {},
  FadeOut: {},
  SlideInRight: {},
  SlideOutRight: {},
  ZoomIn: {},
  ZoomOut: {},
  Layout: {},
};
