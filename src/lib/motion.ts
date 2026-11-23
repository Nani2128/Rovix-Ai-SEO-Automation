import type { Transition, Variants } from 'motion/react';

export const ROVIX_EASE = [0.16, 1, 0.3, 1] as const;

export const physicsSpring: Transition = {
  type: 'spring',
  stiffness: 290,
  damping: 26,
  mass: 0.9,
};

export const snappySpring: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 32,
  mass: 0.78,
};

export const dropdownSpring: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 30,
  mass: 0.72,
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.36,
      ease: ROVIX_EASE,
    },
  },
};

export const springScale: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: physicsSpring,
  },
};

export const scaleIn: Variants = springScale;

export const drawerSlide: Variants = {
  hidden: { x: '100%' },
  visible: {
    x: 0,
    transition: { duration: 0.24, ease: ROVIX_EASE },
  },
  exit: {
    x: '100%',
    transition: { duration: 0.2, ease: ROVIX_EASE },
  },
};

export const accordionExpand: Variants = {
  collapsed: { opacity: 0, height: 0 },
  expanded: {
    opacity: 1,
    height: 'auto',
    transition: { duration: 0.22, ease: ROVIX_EASE },
  },
};
