import { useEffect, useRef, useState } from 'react';
import { Animated, View, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';

const { width, height } = Dimensions.get('window');

// Replace this with your actual GIF path once you add it to assets/
// e.g. require('../../assets/splash.gif')
const SPLASH_GIF = require('../../assets/splash.gif');

interface Props {
  onFinish: () => void;
  duration?: number; // ms to show the gif before fading out, default 2800
}

export default function SplashAnimation({ onFinish, duration = 2800 }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const fadeOutDelay = duration - 500; // start fade 500ms before end
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFinish();
      });
    }, fadeOutDelay);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <Image
        source={SPLASH_GIF}
        style={styles.gif}
        contentFit="cover"
        autoplay
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  gif: {
    width,
    height,
  },
});
