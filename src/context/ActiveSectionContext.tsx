import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ActiveSectionContext } from '../hooks/useActiveSection';

/**
 * Tracks which section of the single-page Home is currently in view so the
 * navbar can highlight it as the user scrolls (scroll-spy). Home is the only
 * writer (via an IntersectionObserver); the navbar is the only reader. Value
 * is null whenever Home isn't mounted. Read it with useActiveSection
 * (hooks/useActiveSection.ts).
 */
export function ActiveSectionProvider({ children }: { children: ReactNode }) {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  // Memoised for the same reason as ChatProvider's and SiteContentProvider's
  // values: a fresh object each render is a new identity for every consumer.
  // Here it matters more than it looks -- Home WRITES this context on scroll,
  // so an unstable value would re-render the navbar and Home itself on
  // renders where the active section did not actually change.
  const value = useMemo(() => ({ activeSection, setActiveSection }), [activeSection]);
  return (
    <ActiveSectionContext.Provider value={value}>
      {children}
    </ActiveSectionContext.Provider>
  );
}
