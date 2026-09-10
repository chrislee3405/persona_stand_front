import { useSiteContent } from '../hooks/useSiteContent';
import { safeHref } from '../lib/safeHref';

/** site_content section "footer". Every field optional -- with no row at
 *  all the footer still renders a correct copyright line from the site
 *  owner's name, which is the one thing it must never get wrong. */
interface FooterContent {
  /** Name in the copyright line. Falls back to personal_statement.owner. */
  owner?: string;
  /** One short line beside it, e.g. what the site is built with. */
  note?: string;
  /** Links shown on the right. Falls back to contact.links, so the two
   *  don't have to be maintained twice. */
  links?: { label: string; href: string }[];
}

/**
 * Site footer.
 *
 * This used to be the hardcoded string "2025 Company, Inc" -- the
 * unedited Bootstrap example, on every page, and a year out of date. The
 * text now comes from the database like the rest of the site's copy, and
 * the year is computed, so it can never go stale again.
 */
function Footer() {
  const { content } = useSiteContent();
  const footer = (content.footer ?? {}) as FooterContent;
  const owner = (content.personal_statement as { owner?: string } | undefined)?.owner;
  const contactLinks = (content.contact as { links?: { label: string; href: string }[] } | undefined)?.links;

  const name = footer.owner ?? owner;
  const links = footer.links ?? contactLinks ?? [];

  return (
    <div className="container">
      <footer className="site-footer d-flex flex-wrap justify-content-between align-items-center gap-2 py-3 my-4 border-top">
        <div className="site-footer__left">
          {/* Computed, never written down -- the old footer said 2025 in 2026. */}
          <span className="site-footer__copy">
            © {new Date().getFullYear()}{name ? ` ${name}` : ''}
          </span>
          {footer.note && <span className="site-footer__note">{footer.note}</span>}
        </div>

        {links.length > 0 && (
          <ul className="site-footer__links">
            {/* Same treatment as the Contact links these fall back to: the
                scheme is checked before the href reaches the DOM, and the
                key is the index rather than the href, which comes from
                content and is neither guaranteed present nor unique. */}
            {links.map((link, i) => {
              const href = safeHref(link.href);
              return (
                <li key={i}>
                  {href
                    ? <a href={href} target="_blank" rel="noreferrer">{link.label}</a>
                    : <span className="text-muted">{link.label}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </footer>
    </div>
  );
}

export default Footer;
