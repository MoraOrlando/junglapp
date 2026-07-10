// Stub for react-native imports used in shared packages — not needed on web
module.exports = {
  Alert: { alert: () => {} },
  Platform: { OS: 'web', select: (obj) => obj.web ?? obj.default ?? null },
  AsyncStorage: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve(), removeItem: () => Promise.resolve() },
};
