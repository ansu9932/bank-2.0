import React from 'react';
import CountrySelect from '../../../components/common/CountrySelect';
import { getCountry, ALL_ID_KEYS } from '../../../data/countries';

const Field = ({ label, error, children, hint }) => (
  <div>
    <label className="form-label">{label}</label>
    {children}
    {hint && !error && <p className="text-dark-400 text-[11px] mt-1">{hint}</p>}
    {error && <p className="text-brand-400 text-[11px] mt-1">{error}</p>}
  </div>
);

export default function StepPersonal({ form, update, errors = {}, nameLocked = false }) {
  const set = (k) => (e) => update({ [k]: e.target.value });

  const country = getCountry(form.country);

  // Digit-only handler for the mobile number, capped at the country's length.
  const setPhone = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, country.phoneDigits);
    update({ phone: digits });
  };

  // Selecting a country also sets nationality and clears any previously-entered
  // identity numbers that don't apply to the newly chosen country's documents.
  const onCountry = (name) => {
    const next = getCountry(name);
    const cleared = ALL_ID_KEYS.reduce((acc, k) => ({ ...acc, [k]: '' }), {});
    update({
      ...cleared,
      country: name,
      nationality: next.nationality,
      // Trim the phone to the new country's max length.
      phone: (form.phone || '').replace(/\D/g, '').slice(0, next.phoneDigits),
      // Clear uploaded files since the required document set changes per country.
      files: {},
    });
  };

  // Red ring helper for invalid fields.
  const ring = (k) => (errors[k] ? ' !border-brand-500 focus:!border-brand-500' : '');

  return (
    <div>
      <h3 className="font-display text-xl font-700 text-white mb-1">Personal Information</h3>
      <p className="text-dark-300 text-sm mb-6">Fill in your basic personal details as per government ID</p>

      {nameLocked && (
        <div className="mb-5 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-xs text-green-300 flex items-center gap-2">
          <span>🔒</span>
          <span>Your name has been verified against the PAN registry and locked to match your tax records.</span>
        </div>
      )}

      {/* Country of account — drives which KYC documents are required later. */}
      <div className="mb-6">
        <Field
          label="Choose Your Country *"
          error={errors.country}
          hint={`We'll request the documents banks in ${country.name} require to open your account.`}
        >
          <CountrySelect value={form.country} onSelect={onCountry} error={Boolean(errors.country)} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="First Name *" error={errors.firstName} hint={nameLocked ? 'Auto-filled from PAN verification' : undefined}>
          <input
            className={`input-field${ring('firstName')}${nameLocked ? ' opacity-70 cursor-not-allowed' : ''}`}
            value={form.firstName} onChange={set('firstName')} placeholder="Arjun"
            readOnly={nameLocked}
          />
        </Field>
        <Field label="Last Name *" error={errors.lastName} hint={nameLocked ? 'Auto-filled from PAN verification' : undefined}>
          <input
            className={`input-field${ring('lastName')}${nameLocked ? ' opacity-70 cursor-not-allowed' : ''}`}
            value={form.lastName} onChange={set('lastName')} placeholder="Sharma"
            readOnly={nameLocked}
          />
        </Field>
        <Field label="Email Address *" error={errors.email}>
          <input className={`input-field${ring('email')}`} type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
        </Field>
        <Field label="Mobile Number *" error={errors.phone} hint={`Enter your ${country.phoneHint}`}>
          <div className="flex">
            <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-white/[0.08] bg-white/[0.04] text-dark-200 text-sm">
              {country.dialCode}
            </span>
            <input
              className={`input-field rounded-l-none${ring('phone')}`}
              type="tel" inputMode="numeric" value={form.phone} onChange={setPhone}
              placeholder="9876543210" maxLength={country.phoneDigits}
            />
          </div>
        </Field>
        <Field label="Date of Birth *" error={errors.dateOfBirth}>
          <input className={`input-field${ring('dateOfBirth')}`} type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} max={new Date(Date.now() - 18*365*24*60*60*1000).toISOString().split('T')[0]} />
        </Field>
        <Field label="Gender *" error={errors.gender}>
          <select className={`input-field${ring('gender')}`} value={form.gender} onChange={set('gender')}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Father's Name">
          <input className="input-field" value={form.fatherName} onChange={set('fatherName')} placeholder="Rajesh Sharma" />
        </Field>
        <Field label="Mother's Name">
          <input className="input-field" value={form.motherName} onChange={set('motherName')} placeholder="Sunita Sharma" />
        </Field>
        <Field label="Marital Status">
          <select className="input-field" value={form.maritalStatus} onChange={set('maritalStatus')}>
            <option value="">Select status</option>
            <option value="single">Single</option>
            <option value="married">Married</option>
            <option value="divorced">Divorced</option>
            <option value="widowed">Widowed</option>
          </select>
        </Field>
        <Field label="Occupation">
          <input className="input-field" value={form.occupation} onChange={set('occupation')} placeholder="Software Engineer" />
        </Field>
        <Field label="Annual Income ($)">
          <input className="input-field" type="number" value={form.annualIncome} onChange={set('annualIncome')} placeholder="50000" />
        </Field>
        <Field label="Account Type *" error={errors.accountType}>
          <select className={`input-field${ring('accountType')}`} value={form.accountType} onChange={set('accountType')}>
            <option value="savings">Savings Account</option>
            <option value="current">Current Account</option>
          </select>
        </Field>
      </div>
    </div>
  );
}
