import { NavLink } from 'react-router-dom';
import Nav from 'react-bootstrap/Nav';

export default function AboutMe() {
  return (
    <div className="container my-5">
      {/* 'align-items-center' keeps both halves aligned vertically */}
      <div className="row align-items-center g-5">
        
        {/* Left Side: Image Reservation Panel */}
        <div className="col-12 col-md-6">
          <div 
            className="d-flex align-items-center justify-content-center border rounded bg-light shadow-sm" 
            style={{ minHeight: '400px' }}
          >
            <div className="text-center text-muted">
              <i className="bi bi-image fs-1 d-block mb-2"></i>
              <p className="fw-medium mb-0">[ Hero Image Area ]</p>
              <small className="text-secondary">Recommended: Portrait or Square layout</small>
            </div>
          </div>
        </div>

        {/* Right Side: Stacked Content Panel */}
        <div className="col-12 col-md-6">
          {/* Upper Half: Action Button */}
          <div className="mb-4">
            
            <button className="btn btn-primary btn-lg px-4 shadow-sm">
             <Nav.Link as={NavLink} to="/chatroom">Chat with my virtual persona</Nav.Link>
            </button>
          </div>

          {/* Bottom Half: Biography Paragraph */}
          <div>
            <p className="lead text-secondary lh-base">
              Hi there! I'm an IT postgraduate specializing in Artificial Intelligence 
              with a background in education. This portfolio tracks my journey building 
              intelligent applications, advanced simulation tools, and full-stack software 
              architectures. Dive into my recent projects below to see what I'm working on!
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}