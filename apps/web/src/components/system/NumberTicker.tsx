import { animate, useMotionValue, useReducedMotion, useTransform, motion } from "motion/react";
import { useEffect } from "react";

/** Animated number for live readouts (screen counter, P(claim)). Static under reduced motion. */
export function NumberTicker({
  value,
  format = (v: number) => Math.round(v).toLocaleString("en-US"),
  duration = 0.5,
}: {
  value: number;
  format?: (v: number) => string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [value, reduce, duration, mv]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}
