export const MOTION_EASE = [0.16, 1, 0.3, 1] as const;

export const MOTION_SPRING = {
  type: 'spring' as const,
  stiffness: 340,
  damping: 30,
  mass: 0.85,
};

export const SPRING_PILL = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 34,
  mass: 0.75,
};

export const SPRING_PHYSICS = {
  type: 'spring' as const,
  stiffness: 280,
  damping: 26,
  mass: 0.9,
};

export const CARD_TILT_SPRING = {
  stiffness: 160,
  damping: 22,
  mass: 0.7,
};

export const MOBILE_SHEET_SPRING = {
  type: 'spring' as const,
  stiffness: 360,
  damping: 36,
  mass: 0.85,
};

export const PAGE_TRANSITION = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.22, ease: MOTION_EASE },
};

export const CARD_STAGGER_CONTAINER = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.03,
    },
  },
};

export const CARD_STAGGER_ITEM = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: MOTION_EASE },
  },
};

export const POPOVER_TRANSITION = {
  initial: { opacity: 0, y: 6, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 4, scale: 0.97 },
  transition: { duration: 0.16, ease: MOTION_EASE },
};

export const MODAL_TRANSITION = {
  initial: { opacity: 0, y: -8, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.96 },
  transition: { duration: 0.18, ease: MOTION_EASE },
};

export const DRAWER_TRANSITION = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
  transition: { duration: 0.24, ease: MOTION_EASE },
};
