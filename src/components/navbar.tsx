import { NavLink } from 'react-router-dom';
import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import NavDropdown from 'react-bootstrap/NavDropdown';

function Navbar() {
  return (
    <div className="bg-dark shadow-sm" data-bs-theme="dark">
      <Container>
        <header className="d-flex justify-content-end py-3">
          <Nav variant="pills">
            <Nav.Link as={NavLink} to="/aboutme">About Me</Nav.Link>
            <Nav.Link as={NavLink} to="/qualifications">Qualifications</Nav.Link>
            <Nav.Link as={NavLink} to="/journey">My journey</Nav.Link>

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