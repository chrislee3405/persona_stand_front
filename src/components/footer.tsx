import githubIcon from '../assets/icons/github.png';
import linkedinIcon from '../assets/icons/linkin.png';
import { useSiteContent } from '../hooks/useSiteContent';

interface ContactLink { label: string; href: string; }
interface ContactInfo { links?: ContactLink[]; }

// Pull a link out of the contact section's `links` array by matching its label.
function findLink(links: ContactLink[], keyword: string): string | undefined {
    return links.find(l => l.label?.toLowerCase().includes(keyword))?.href;
}

function Footer() {
    const { content } = useSiteContent();
    const links = ((content.contact as ContactInfo)?.links) ?? [];
    const linkedinUrl = findLink(links, 'linkedin') ?? findLink(links, 'linkin');
    const githubUrl = findLink(links, 'github');

    return (
        <>
            <div className="container">
                <footer className="d-flex flex-wrap justify-content-between align-items-center py-3 my-4 border-top">
                    <div className="col-md-4 d-flex align-items-center">
                        <span className="mb-3 mb-md-0 text-body-secondary"> 2025 Company, Inc</span> </div>

                    <ul className="nav col-md-4 justify-content-end list-unstyled d-flex">
                        {linkedinUrl && (
                            <li className="ms-3">
                                <a className="text-body-secondary" href={linkedinUrl}
                                   target="_blank" rel="noreferrer" aria-label="LinkedIn">
                                    <img src={linkedinIcon} alt="LinkedIn" width={24} height={24} />
                                </a>
                            </li>
                        )}
                        {githubUrl && (
                            <li className="ms-3">
                                <a className="text-body-secondary" href={githubUrl}
                                   target="_blank" rel="noreferrer" aria-label="GitHub">
                                    <img src={githubIcon} alt="GitHub" width={24} height={24} />
                                </a>
                            </li>
                        )}
                    </ul>
                </footer>
            </div>
        </>
    )
}

export default Footer
