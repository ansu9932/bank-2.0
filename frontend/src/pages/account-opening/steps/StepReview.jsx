import React from 'react';
import { RiCheckLine } from 'react-icons/ri';
import { getCountry, getCountryDocuments } from '../../../data/countries';

export default function StepReview({ form }) {
  const country = getCountry(form.country);
  const docFields = getCountryDocuments(form.country);

  const Row = ({ label, value }) => value ? (
    <div className="flex justify-between py-2.5 border-b border-white/[0.04] last:border-0">
      <span className="text-dark-300 text-sm">{label}</span>
      <span className="text-white text-sm font-medium text-right max-w-[200px] truncate">{value}</span>
    </div>
  ) : null;

  const Section = ({ title, icon, children }) => (
    <div className="glass-card p-5 mb-4">
      <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
        <span>{icon}</span>{title}
      </h4>
      {children}
    </div>
  );

  // Display value for a document ID field (Aadhaar gets the spaced format).
  const idDisplay = (doc) => {
    if (!doc.idKey) return null;
    const raw = form[doc.idKey] || '';
    if (!raw) return null;
    return doc.format === 'aadhaar' ? raw.replace(/(.{4})/g, '$1 ').trim() : raw;
  };

  return (
    <div>
      <h3 className="font-display text-xl font-700 text-white mb-1">Review Your Application</h3>
      <p className="text-dark-300 text-sm mb-6">Please review all details before submitting.</p>

      <Section title="Personal Information" icon="👤">
        <Row label="Country" value={`${country.flag} ${country.name}`} />
        <Row label="Full Name" value={`${form.firstName} ${form.lastName}`} />
        <Row label="Email" value={form.email} />
        <Row label="Phone" value={form.phone ? `${country.dialCode} ${form.phone}` : ''} />
        <Row label="Date of Birth" value={form.dateOfBirth} />
        <Row label="Gender" value={form.gender} />
        <Row label="Occupation" value={form.occupation} />
        <Row label="Account Type" value={form.accountType?.toUpperCase()} />
      </Section>

      <Section title="Address" icon="📍">
        <Row label="Address" value={`${form.addressLine1} ${form.addressLine2 || ''}`} />
        <Row label="City / State" value={`${form.city}, ${form.state}`} />
        <Row label={country.postalLabel} value={form.pincode} />
        <Row label="Country" value={country.name} />
      </Section>

      <Section title="KYC Documents" icon="📄">
        {docFields.filter(d => d.idKey).map(doc => (
          <Row key={doc.idKey} label={doc.label} value={idDisplay(doc)} />
        ))}
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.keys(form.files || {}).map(k => (
            <span key={k} className="badge badge-success">
              <RiCheckLine /> {k.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </Section>

      <div className="p-4 rounded-xl bg-dark-700/50 border border-white/[0.05]">
        <p className="text-dark-200 text-xs leading-relaxed">
          By submitting, I confirm that all information provided is accurate. I agree to Alister Bank's{' '}
          <a href="#" className="text-brand-400">Terms & Conditions</a> and{' '}
          <a href="#" className="text-brand-400">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
