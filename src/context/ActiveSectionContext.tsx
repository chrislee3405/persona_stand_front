import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface ActiveSectionValue {
  activeSection: string | null;
  setActiveSection: (section: string | null) => void;
}

const ActiveSectionContext = createContext<ActiveSectionValue>({
  activeSection: null,
  setActiveSection: () => {},
});

/**
 * Tracks which section of the single-page Home is currently in view so the
 * navbar can highlight it as the user scrolls (scroll-spy). Home is the only
 * writer (via an IntersectionObserver); the navbar is the only reader. Value
 * is null whenever Home isn't mounted.
 */
export function ActiveSectionProvider({ children }: { children: ReactNode }) {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  return (
    <ActiveSectionContext.Provider value={{ activeSection, setActiveSection }}>
      {children}
    </ActiveSectionContext.Provider>
  );
}

export function useActiveSection() {
  return useContext(ActiveSectionContext);
}
