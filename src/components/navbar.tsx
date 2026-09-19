import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import NavDropdown from 'react-bootstrap/NavDropdown';
import { useActiveSection } from '../hooks/useActiveSection';
import { pickMedia, useSiteContent } from '../hooks/useSiteContent';
import { assetUrl } from '../lib/assetUrl';
import { SECTIONS } from '../lib/knobs';

/** site_content section "navbar". */
interface NavbarContent {
  /** Name shown beside the mark. Falls back to personal_statement.owner. */
  name?: string;
}

// The section list lives in lib/knobs.ts -- Home's scroll-spy and App's
// legacy redirect routes read the same array, so adding a section here is
// impossible to get out of sync. "Projects" is just an anchor: individual
// projects open as a bottom sheet from their thumbnails, not as pages.

/** A click the page should handle itself. Cmd/Ctrl/Shift/Alt-clicks and
 *  non-primary buttons are the browser's -- open in a new tab or window,
 *  download -- so the handlers below must leave those alone rather than
 *  preventDefault them into an in-page navigation. */
function isPlainLeftClick(e: React.MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { activeSection, setActiveSection } = useActiveSection();

  // Brand name: the "navbar" section, else the site owner's name. Both the
  // text and database-backed mark stay empty while the content fetch is in
  // flight rather than flashing stale fallback content.
  const { content, media } = useSiteContent();
  const navbarContent = (content.navbar ?? {}) as NavbarContent;
  const owner = (content.personal_statement as { owner?: string } | undefined)?.owner;
  const brandName = navbarContent.name ?? owner ?? '';
  const brandMark = assetUrl(pickMedia(media, 'navbar', 'tab_logo'));

  // Clicking the brand goes home and clears the scroll-spy highlight.
  const goHome = (e: React.MouseEvent) => {
    if (!isPlainLeftClick(e)) return;
    e.preventDefault();
    setActiveSection(null);
    navigate('/');
  };

  // Which home section is lit. Driven by scroll position (scroll-spy) while
  // on the home page; null on any other route.
  const homeSection = pathname === '/' ? (activeSection ?? 'about') : null;

  // Below `lg` (992px) the pills wrap to two rows, so we collapse them into
  // a single "Menu" dropdown. Controlled so a real navigation closes it.
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  const goToSection = (id: string) => (e: React.MouseEvent) => {
    if (!isPlainLeftClick(e)) return;
    e.preventDefault();
    setActiveSection(id);            // instant highlight; the observer confirms once the scroll lands
    navigate(`/#${id}`);            // updates the URL + drives Home's scroll effect when coming from another route
    if (pathname === '/') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // No `bg-dark` and no data-bs-theme="dark" any more: the bar is light so
  // the brand mark's charcoal outline has something to read against (see
  // .site-bar in styles.css). Dropping the dark theme also lets the
  // collapsed menu render as a light dropdown to match.
  return (
    <div className="site-bar shadow-sm sticky-top">
      <Container>
        {/* <nav> so the bar is a navigation landmark; it was a bare <header>
            inside a <div> and the document exposed neither. `justify-content-
            between` puts the brand left and the links right -- the left half
            of the bar used to be empty on every screen. */}
        <nav className="site-nav d-flex justify-content-between align-items-center py-3" aria-label="Main">

          {/* Brand: logo + name, home link. The mark comes from the
              site_media ("navbar", "tab_logo") slot, so it can be swapped
              without a frontend redeploy. The name comes from site_content "navbar";
              with no row it falls back to personal_statement.owner, so a
              deployment only has to set the name in one place. */}
          <a className="site-brand" href="/" onClick={goHome} aria-label={`${brandName || 'Home'} — home`}>
            {brandMark && (
              <img className="site-brand__mark" src={brandMark} alt="" aria-hidden="true" width={32} height={32} />
            )}
            {brandName && <span className="site-brand__name">{brandName}</span>}
          </a>


          {/* ===== Full navbar -- lg and up ===== */}
          <Nav variant="pills" className="d-none d-lg-flex">
            {SECTIONS.map(s => (
              <Nav.Link
                key={s.id}
                href={`/#${s.id}`}
                active={homeSection === s.id}
                onClick={goToSection(s.id)}
              >
                {s.label}
              </Nav.Link>
            ))}
          </Nav>

          {/* ===== Collapsed navbar -- below lg: one "Menu" dropdown ===== */}
          <Nav className="d-lg-none">
            <NavDropdown
              title="Menu"
              id="mobile-menu"
              align="end"
              show={menuOpen}
              onToggle={setMenuOpen}
              autoClose="outside"
            >
              {SECTIONS.map(s => (
                <NavDropdown.Item
                  key={s.id}
                  href={`/#${s.id}`}
                  active={homeSection === s.id}
                  onClick={e => {
                    if (!isPlainLeftClick(e)) return;
                    goToSection(s.id)(e);
                    closeMenu();
                  }}
                >
                  {s.label}
                </NavDropdown.Item>
              ))}
            </NavDropdown>
          </Nav>

        </nav>
      </Container>
    </div>
  );
}

export default Navbar;
