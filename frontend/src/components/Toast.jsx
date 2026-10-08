import { useEffect } from 'react';
import { motion } from 'framer-motion';

/** Aviso discreto que some sozinho. */
export default function Toast({ id, message, onDone }) {
  useEffect(() => {
    const timer = setTimeout(() => onDone(id), 2400);
    return () => clearTimeout(timer);
  }, [id, onDone]);

  return (
    <motion.div
      className="toast-forest"
      initial={{ opacity: 0, y: -10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.2 }}
    >
      <span className="toast-leaf">🌿</span>
      <span>{message}</span>
    </motion.div>
  );
}
