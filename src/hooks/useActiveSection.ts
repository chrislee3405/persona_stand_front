import { createContext, useContext } from 'react';

interface ActiveSectionValue {
  activeSection: string | null;
  setActiveSection: (section: string | null) => void;
}

/**
 * Which section of the single-page Home is currently in view, so the navbar
 * can highlight it as the user scrolls (scroll-spy). The provider is in
 * context/ActiveSectionContext.tsx. The context and hook live here, in a file
 * that exports no component, because Fast Refresh can only hot-reload a file
 * that exports components alone (react-refresh/only-export-components) --
 * the same split as useSiteContent.ts / SiteContentProvider.tsx.
 */
export const ActiveSectionContext = createContext<ActiveSectionValue>({
  activeSection: null,
  setActiveSection: () => {},
});

export function useActiveSection() {
  return useContext(ActiveSectionContext);
}
