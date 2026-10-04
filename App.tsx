import { useCallback, useEffect, useRef, useState } from 'react';
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
//
// Only the FIRST settle of a fresh component is exposed: once any settle has been
// handed back, `settledProps` (component state) keeps re-sending it. That is why
// the box is remounted per scenario — and why real apps hit this on cold start.

const STALL_MS = 3000;
const STALL_AFTER_MS = 400; // the fade lasts 150 ms, so the value has settled by then

function stallJs(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy-wait: no JS timer (the GC tick included) runs until this returns
  }
}

type Log = (line: string) => void;

function Box({ stall, renders, log }: { stall: boolean; renders: number; log: Log }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    log(`box mounted (${stall ? 'stall' : 'no stall'}); fading in`);
    opacity.value = withTiming(1, { duration: 150 });
    if (!stall) return;
    const id = setTimeout(() => {
      stallJs(STALL_MS);
      log(`JS thread: stalled ${STALL_MS} ms from +${STALL_AFTER_MS} ms`);
    }, STALL_AFTER_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Proves the animation ran to completion on the UI thread.
  useAnimatedReaction(
    () => opacity.value,
    (value, previous) => {
      if (value === 1 && previous !== 1) runOnJS(log)('UI thread: shared value settled at 1');
    }
  );

  // Logs each Re-render tap with the shared value as JS reads it.
  const mountRenders = useRef(renders);
  useEffect(() => {
    if (renders === mountRenders.current) return;
    log(`re-render #${renders}: shared value reads ${opacity.value}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renders]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.box, animatedStyle]} testID="box">
      <Text style={styles.boxText}>animated opacity → I should stay visible</Text>
    </Animated.View>
  );
}

export default function App() {
  const [boxKey, setBoxKey] = useState(0);
  const [stall, setStall] = useState(false);
  const [renders, setRenders] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const append = useCallback<Log>((line) => setLog((l) => [...l, line]), []);

  const mount = (withStall: boolean) => {
    setLog([]);
    setStall(withStall);
    setBoxKey((k) => k + 1);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>reanimated#10805</Text>
      <Text style={styles.hint}>
        1. Tap "Remount: fade in, then stall JS". Wait for the "stalled" log line (~4 s).{'\n'}
        2. Tap "Re-render". The green box disappears although the shared value reads 1.{'\n'}
        Control: "Remount: fade in (no stall)", wait 2 s, "Re-render" — the box stays.
      </Text>

      <Button label="Remount: fade in (no stall)" onPress={() => mount(false)} />
      <Button label="Remount: fade in, then stall JS" onPress={() => mount(true)} />
      <Button label={`Re-render (${renders})`} onPress={() => setRenders((r) => r + 1)} />

      <View style={styles.log}>
        {log.map((line, i) => (
          <Text key={i} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </View>

      <Box key={boxKey} stall={stall} renders={renders} log={append} />
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
