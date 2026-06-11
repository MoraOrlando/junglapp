// Web stub for react-native-maps — the map is only rendered on native platforms.
const React = require('react');
const { View } = require('react-native');

const MapView = (props) => React.createElement(View, props);
MapView.Animated = MapView;

const Marker = (props) => React.createElement(View, props);
const Callout = (props) => React.createElement(View, props);
const Polyline = (props) => React.createElement(View, props);
const Polygon = (props) => React.createElement(View, props);
const Circle = (props) => React.createElement(View, props);

module.exports = MapView;
module.exports.default = MapView;
module.exports.Marker = Marker;
module.exports.Callout = Callout;
module.exports.Polyline = Polyline;
module.exports.Polygon = Polygon;
module.exports.Circle = Circle;
