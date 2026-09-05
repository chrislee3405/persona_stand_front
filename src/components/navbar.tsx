import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import NavDropdown from 'react-bootstrap/NavDropdown';
import { useActiveSection } from '../context/ActiveSectionContext';
import { SECTIONS } from '../lib/knobs';

// The section list lives in lib/knobs.ts -- Home's scroll-spy and App's
// legacy redirect routes read the same array, so adding a section here is
// impossible to get out of sync. "Projects" is just an anchor: individual
// projects open as a bottom sheet from their thumbnails, not as pages.

function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { activeSection, setActiveSection } = useActiveSection();

  // Which home section is lit. Driven by scroll position (scroll-spy) while
  // on the home page; null on any other route.
  const homeSection = pathname === '/' ? (activeSection ?? 'about') : null;

  // Below `lg` (992px) the pills wrap to two rows, so we collapse them into
  // a single "Menu" dropdown. Controlled so a real navigation closes it.
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  const goToSection = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveSection(id);            // instant highlight; the observer confirms once the scroll lands
    navigate(`/#${id}`);            // updates the URL + drives Home's scroll effect when coming from another route
    if (pathname === '/') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="bg-dark shadow-sm sticky-top" data-bs-theme="dark">
      <Container>
        <header className="d-flex justify-content-end py-3">

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
                  onClick={e => { goToSection(s.id)(e); closeMenu(); }}
                >
                  {s.label}
                </NavDropdown.Item>
              ))}
            </NavDropdown>
          </Nav>

        </header>
      </Container>
    </div>
  );
}

export default Navbar;
