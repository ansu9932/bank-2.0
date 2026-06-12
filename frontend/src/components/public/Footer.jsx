import React from 'react';
import { Link } from 'react-router-dom';
import { Twitter, Linkedin, Instagram, Youtube, ShieldCheck, Phone, Mail, MapPin, MessageCircle } from 'lucide-react';

const PRODUCTS = [
  ['Savings Account', '/accounts'],
  ['Salary Account', '/accounts'],
  ['Current Account', '/accounts'],
  ['Fixed Deposit', '/investments'],
  ['Recurring Deposit', '/investments'],
  ['Personal Loan', '/loans'],
  ['Home Loan', '/loans'],
  ['Car Loan', '/loans'],
  ['Debit Card', '/cards'],
];

const QUICK = [
  ['About Us', '/about'],
  ['Careers', '/about'],
  ['Press', '/about'],
  ['Interest Rates', '/loans'],
  ['Fees & Charges', '/accounts'],
  ['Privacy Policy', '/about'],
  ['Terms of Service', '/about'],
  ['Grievance Redressal', '/contact'],
];

const SOCIALS = [
  { Icon: Twitter, label: 'Twitter' },
  { Icon: Linkedin, label: 'LinkedIn' },
  { Icon: Instagram, label: 'Instagram' },
  { Icon: Youtube, label: 'YouTube' },
];

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-white/[0.08]" style={{ background: '#080808' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-14 lg:py-20">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div>
            <div className="flex items-center gap-2.5 mb-5">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center font-serif-display font-extrabold text-white text-2xl"
                style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)', boxShadow: '0 0 22px rgba(204,0,0,0.45)' }}
              >
                A
              </div>
              <span className="font-bold tracking-tight text-white text-xl">
                Alister<span style={{ color: '#FF3333' }}> Bank</span>
              </span>
            </div>
            <p className="text-sm italic mb-5" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Banking Beyond Boundaries
            </p>
            <div className="flex items-center gap-3 mb-6">
              {SOCIALS.map(({ Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/[0.05] text-white hover:bg-[#CC0000] transition-colors"
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
            <div className="space-y-2 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
              <p>Regulated by the Reserve Bank of India</p>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10">
                <ShieldCheck size={13} style={{ color: '#FF3333' }} /> DICGC Insured
              </span>
            </div>
          </div>

          {/* Products */}
          <div>
            <p className="text-white font-semibold text-sm mb-4">Products</p>
            <ul className="space-y-2.5">
              {PRODUCTS.map(([label, to]) => (
                <li key={label}>
                  <Link to={to} className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick links */}
          <div>
            <p className="text-white font-semibold text-sm mb-4">Quick Links</p>
            <ul className="space-y-2.5">
              {QUICK.map(([label, to]) => (
                <li key={label}>
                  <Link to={to} className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="text-white font-semibold text-sm mb-4">Contact</p>
            <ul className="space-y-3.5 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
              <li className="flex items-start gap-2.5">
                <Phone size={16} style={{ color: '#FF3333' }} className="mt-0.5 shrink-0" />
                <span>1800-200-0001<br /><span className="text-xs text-white/40">24/7 Toll Free</span></span>
              </li>
              <li className="flex items-start gap-2.5">
                <Mail size={16} style={{ color: '#FF3333' }} className="mt-0.5 shrink-0" />
                support@alisterbank.com
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin size={16} style={{ color: '#FF3333' }} className="mt-0.5 shrink-0" />
                Alister Bank Tower, BKC,<br />Mumbai 400051, India
              </li>
              <li>
                <Link to="/contact" className="inline-flex items-center gap-1.5 font-semibold" style={{ color: '#FF3333' }}>
                  <MessageCircle size={15} /> Chat with us →
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-white/[0.08] flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            © {year} Alister Bank. All rights reserved.
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            IFSC: ALST0000001 | SWIFT: ALSTINBB | Regulated by RBI | Member of DICGC
          </p>
        </div>
      </div>
    </footer>
  );
}
