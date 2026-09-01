import { Fragment, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import NavDropdown from 'react-bootstrap/NavDropdown';
import { useActiveSection } from '../context/ActiveSectionContext';
import { useSiteContent } from '../hooks/useSiteContent';

// Navbar items, left-to-right. 'section' items scroll to a Home anchor and
// take part in the scroll-spy highlight; the single 'projects' item is a
// dropdown to the individual project pages. Order MUST match SECTION_IDS and
// the section order in pages/Home.tsx.
type NavItem =
  | { kind: 'section'; id: string; label: string }
  | { kind: 'projects'; id: 'projects'; label: string };

const NAV_ITEMS: readonly NavItem[] = [
  { kind: 'section', id: 'about', label: 'About Me' },
  { kind: 'section', id: 'qualifications', label: 'Qualifications & Awards' },
  { kind: 'section', id: 'certifications', label: 'Certifications' },
  { kind: 'projects', id: 'projects', label: 'Projects' },
  { kind: 'section', id: 'journey', label: 'My journey' },
  { kind: 'section', id: 'contact', label: 'Contact Me' },
];

// Shown in the Projects dropdown until site_content 'projects' has loaded (or
// if it is not configured). Every id here must have a page route in App.tsx
// (src/pages/projects/<Page>.tsx).
const FALLBACK_PROJECTS = [
  { id: 'persona-stand', label: 'Persona Stand' },
  { id: 'ransom-simulator', label: 'Ransom Negotiation Simulator' },
] as const;

interface ProjectEntry { id: string; label: string }

function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { activeSection, setActiveSection } = useActiveSection();
  const { content } = useSiteContent();

  // Projects dropdown links -- data-driven from site_content 'projects'
  // (same list the Home banner uses); each links to /projects/<id>.
  const dbProjects = (Array.isArray(content.projects) ? content.projects : []) as ProjectEntry[];
  const projects: readonly ProjectEntry[] = dbProjects.length > 0 ? dbProjects : FALLBACK_PROJECTS;

  // Which home section is lit. Driven by scroll position (scroll-spy) while
  // on the home page; null on any other route.
  const homeSection = pathname === '/' ? (activeSection ?? 'about') : null;

  // Below `lg` (992px) the pills wrap to two rows, so we collapse them into
  // a single "Menu" dropdown. Controlled so a real navigation closes it,
  // while the nested "Projects" group can expand in place (autoClose="outside").
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const closeMenu = () => { setMenuOpen(false); setProjectsOpen(false); };

  // Full-navbar "Projects" is a controlled dropdown so opening it can ALSO
  // scroll the page to the #projects section (see onToggle below).
  const [projMenuOpen, setProjMenuOpen] = useState(false);

  // Jump to a Home section: light it now, update the URL hash (drives Home's
  // own scroll effect when arriving from another route), and smooth-scroll if
  // we're already on Home.
  const scrollToSection = (id: string) => {
    setActiveSection(id);
    navigate(`/#${id}`);
    if (pathname === '/') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const goToSection = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    scrollToSection(id);
  };

  return (
    <div className="bg-dark shadow-sm sticky-top" data-bs-theme="dark">
      <Container>
        <header className="d-flex justify-content-end py-3">

          {/* ===== Full navbar -- lg and up ===== */}
          <Nav variant="pills" className="d-none d-lg-flex">
            {NAV_ITEMS.map(item =>
              item.kind === 'section' ? (
                <Nav.Link
                  key={item.id}
                  href={`/#${item.id}`}
                  active={homeSection === item.id}
                  onClick={goToSection(item.id)}
                >
                  {item.label}
                </Nav.Link>
              ) : (
                <NavDropdown
                  key={item.id}
                  title={item.label}
                  id="projects-dropdown"
                  className={homeSection === 'projects' ? 'nav-projects-active' : undefined}
                  show={projMenuOpen}
                  onToggle={next => {
                    setProjMenuOpen(next);
                    // opening the menu also takes you to the section
                    if (next) scrollToSection('projects');
                  }}
                >
                  {projects.map(p => (
                    <NavDropdown.Item key={p.id} as={NavLink} to={`/projects/${p.id}`}>
                      {p.label}
                    </NavDropdown.Item>
                  ))}
                </NavDropdown>
              ),
            )}
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
              {NAV_ITEMS.map(item =>
                item.kind === 'section' ? (
                  <NavDropdown.Item
                    key={item.id}
                    href={`/#${item.id}`}
                    active={homeSection === item.id}
                    onClick={e => { goToSection(item.id)(e); closeMenu(); }}
                  >
                    {item.label}
                  </NavDropdown.Item>
                ) : (
                  <Fragment key={item.id}>
                    {/* Projects -> expands the individual project links in place */}
                    <NavDropdown.Item
                      as="button"
                      type="button"
                      className="d-flex justify-content-between align-items-center"
                      active={homeSection === 'projects'}
                      aria-expanded={projectsOpen}
                      onClick={() => {
                        const willOpen = !projectsOpen;
                        setProjectsOpen(willOpen);
                        if (willOpen) scrollToSection('projects');
                      }}
                    >
                      {item.label} <span aria-hidden="true">{projectsOpen ? '▾' : '▸'}</span>
                    </NavDropdown.Item>
                    {projectsOpen && projects.map(p => (
                      <NavDropdown.Item
                        key={p.id}
                        as={NavLink}
                        to={`/projects/${p.id}`}
                        className="ps-4"
                        onClick={closeMenu}
                      >
                        {p.label}
                      </NavDropdown.Item>
                    ))}
                  </Fragment>
                ),
              )}
            </NavDropdown>
          </Nav>

        </header>
      </Container>
    </div>
  );
}

export default Navbar;
