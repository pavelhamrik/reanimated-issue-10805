import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// software-mansion/react-native-reanimated#10805
//
// With FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS on (the default since 4.3.0),
// a settled useAnimatedStyle value is handed to React only if the 500 ms GC tick
// runs while the value's age is in (1 s, 2 s]. Stall the JS thread across that
// window and the next tick evicts the entry before collecting it; the next React
// render then re-sends the component's INITIAL animated style (opacity 0 here)
// and nothing overrides it.

const STALL_MS = 3000;
const STALL_AFTER_MS = 400; // the fade lasts 150 ms, so the value has settled by then

function stallJs(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy-wait: no JS timer (the GC tick included) runs until this returns
  }
}

export default function App() {
  const opacity = useSharedValue(0);
  const [renders, setRenders] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const append = useCallback((line: string) => setLog((l) => [...l, line]), []);

  // Proves the animation ran to completion on the UI thread.
  useAnimatedReaction(
    () => opacity.value,
    (value, previous) => {
      if (value === 1 && previous !== 1) runOnJS(append)('UI thread: shared value settled at 1');
    }
  );

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const fadeIn = useCallback(
    (stall: boolean) => {
      opacity.value = 0;
      opacity.value = withTiming(1, { duration: 150 });
      if (stall) {
        setTimeout(() => {
          stallJs(STALL_MS);
          append(`JS thread: stalled ${STALL_MS} ms starting at +${STALL_AFTER_MS} ms`);
        }, STALL_AFTER_MS);
      }
    },
    [append, opacity]
  );

  // Fade the box in at mount, as an app does with its chrome.
  useEffect(() => {
    fadeIn(false);
  }, [fadeIn]);

  const rerender = () => {
    setRenders((r) => r + 1);
    append(`JS thread: re-render; shared value reads ${opacity.value}`);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>reanimated#10805</Text>
      <Text style={styles.hint}>
        1. Tap "Fade in, then stall JS". Wait ~4 s for the stall to finish.{'\n'}
        2. Tap "Re-render". The green box disappears although the shared value reads 1.{'\n'}
        Control: "Fade in (no stall)" then "Re-render" keeps the box.
      </Text>

      <Button label="Fade in (no stall)" onPress={() => fadeIn(false)} />
      <Button label="Fade in, then stall JS" onPress={() => fadeIn(true)} />
      <Button label={`Re-render (${renders})`} onPress={rerender} />

      <View style={styles.log}>
        {log.map((line, i) => (
          <Text key={i} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </View>

      <Animated.View style={[styles.box, animatedStyle]} testID="box">
        <Text style={styles.boxText}>animated opacity → I should stay visible</Text>
      </Animated.View>
    </View>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.button} accessibilityRole="button">
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 72, paddingHorizontal: 20, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  hint: { fontSize: 13, color: '#444', marginBottom: 16, lineHeight: 18 },
  button: {
    backgroundColor: '#222',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '500', textAlign: 'center' },
  log: { marginTop: 8, flex: 1 },
  logLine: { fontSize: 12, color: '#333', fontVariant: ['tabular-nums'], marginBottom: 2 },
  box: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 98,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
