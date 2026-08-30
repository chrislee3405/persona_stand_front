import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import NavDropdown from 'react-bootstrap/NavDropdown';
import { useActiveSection } from '../context/ActiveSectionContext';

function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { activeSection, setActiveSection } = useActiveSection();

  // Which home section pill is lit. Driven by scroll position (scroll-spy)
  // while on the home page; null on any other route so the section pills
  // don't stay lit after navigating to Projects / Contact.
  const homeSection = pathname === '/' ? (activeSection ?? 'about') : null;

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
          <Nav variant="pills">
            <Nav.Link href="/#about" active={homeSection === 'about'} onClick={goToSection('about')}>
              About Me
            </Nav.Link>
            <Nav.Link href="/#qualifications" active={homeSection === 'qualifications'} onClick={goToSection('qualifications')}>
              Qualifications
            </Nav.Link>
            <Nav.Link href="/#journey" active={homeSection === 'journey'} onClick={goToSection('journey')}>
              My journey
            </Nav.Link>

            <NavDropdown title="Projects" id="projects-dropdown">
              <NavDropdown.Item as={NavLink} to="/projects/ransom-simulator">
                Ransom Simulator
              </NavDropdown.Item>
              <NavDropdown.Item as={NavLink} to="/projects/car-rental">
                Car Rental
              </NavDropdown.Item>
            </NavDropdown>

            <Nav.Link as={NavLink} to="/contact">Contact Me</Nav.Link>
          </Nav>
        </header>
      </Container>
    </div>
  );
}

export default Navbar;
