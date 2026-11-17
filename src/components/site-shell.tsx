import Link from "next/link";
import { NavLinks, type NavItem } from "./nav-links";

const mainNav: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/categories", label: "Explore services" },
];

const footerNav: readonly NavItem[] = mainNav.slice(1);

function Brand() {
  return (
    <>
      SureCure <em>Visit</em>
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="frame header-inner">
        <Link className="brand" href="/" aria-label="SureCure Visit home">
          <Brand />
        </Link>
        <NavLinks items={mainNav} label="Main" />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="frame footer-inner">
        <div>
          <p className="brand">
            <Brand />
          </p>
          <p className="footer-note">
            Doctor visits, lab services, scheduled ambulance transport and non-clinical caretaker support. Online
            booking is not open yet.
          </p>
        </div>
        <NavLinks items={footerNav} label="Footer" />
        <p className="emergency-note">
          For emergencies in India, call <a href="tel:112">112</a>. SureCure Visit is not an emergency response
          service. Scheduled ambulance transport is for planned journeys.
        </p>
      </div>
    </footer>
  );
}
