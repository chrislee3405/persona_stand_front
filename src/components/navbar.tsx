import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import NavDropdown from 'react-bootstrap/NavDropdown';
import { useActiveSection } from '../context/ActiveSectionContext';

// Home-page scroll sections (array order = display order).
const SECTIONS = [
  { id: 'about', label: 'About Me' },
  { id: 'qualifications', label: 'Qualifications & Awards' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'journey', label: 'My journey' },
] as const;

const PROJECTS = [
  { to: '/projects/ransom-simulator', label: 'Ransom Simulator' },
  { to: '/projects/car-rental', label: 'Car Rental' },
] as const;

function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { activeSection, setActiveSection } = useActiveSection();

  // Which home section is lit. Driven by scroll position (scroll-spy) while
  // on the home page; null on any other route.
  const homeSection = pathname === '/' ? (activeSection ?? 'about') : null;

  // Below `lg` (992px) the pills wrap to two rows, so we collapse them into
  // a single "Menu" dropdown. Controlled so a real navigation closes it,
  // while the nested "Projects" group can expand without closing it
  // (autoClose="outside").
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const closeMenu = () => { setMenuOpen(false); setProjectsOpen(false); };

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

            <NavDropdown title="Projects" id="projects-dropdown">
              {PROJECTS.map(p => (
                <NavDropdown.Item key={p.to} as={NavLink} to={p.to}>
                  {p.label}
                </NavDropdown.Item>
              ))}
            </NavDropdown>

            <Nav.Link as={NavLink} to="/contact">Contact Me</Nav.Link>
          </Nav>

          {/* ===== Collapsed navbar -- below lg: one "Menu" dropdown ===== */}
          <Nav className="d-lg-none">
            <NavDropdown
              title="Menu"
              id="mobile-menu"
              align="end"
              show={menuOpen}
              onToggle={next => { setMenuOpen(next); if (!next) setProjectsOpen(false); }}
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

              {/* Projects -> expands the individual projects in place */}
              <NavDropdown.Item
                as="button"
                type="button"
                className="d-flex justify-content-between align-items-center"
                aria-expanded={projectsOpen}
                onClick={() => setProjectsOpen(o => !o)}
              >
                Projects <span aria-hidden="true">{projectsOpen ? '▾' : '▸'}</span>
              </NavDropdown.Item>
              {projectsOpen && PROJECTS.map(p => (
                <NavDropdown.Item
                  key={p.to}
                  as={NavLink}
                  to={p.to}
                  className="ps-4"
                  onClick={closeMenu}
                >
                  {p.label}
                </NavDropdown.Item>
              ))}

              <NavDropdown.Item as={NavLink} to="/contact" onClick={closeMenu}>
                Contact Me
              </NavDropdown.Item>
            </NavDropdown>
          </Nav>

        </header>
      </Container>
    </div>
  );
}

export default Navbar;
