import React from 'react';
import { getCountry } from '../../../data/countries';

const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu & Kashmir','Ladakh','Puducherry'];

export default function StepAddress({ form, update, errors = {} }) {
  const set = (k) => (e) => update({ [k]: e.target.value });

  const country = getCountry(form.country);

  // Digit-only postal code handler, capped at the country's expected length.
  const setPincode = (e) => update({ pincode: e.target.value.replace(/\D/g, '').slice(0, country.postalDigits) });

  const ring = (k) => (errors[k] ? ' !border-brand-500 focus:!border-brand-500' : '');
  const Err = ({ k }) => (errors[k] ? <p className="text-brand-400 text-[11px] mt-1">{errors[k]}</p> : null);

  return (
    <div>
      <h3 className="font-display text-xl font-700 text-white mb-1">Address Details</h3>
      <p className="text-dark-300 text-sm mb-6">Enter your current residential address</p>

      {/* Selected country (chosen on the Personal step) */}
      <div className="mb-5 flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.07]">
        <span className="text-dark-300 text-sm">Country</span>
        <span className="flex items-center gap-2 text-white text-sm font-medium">
          <span className="text-lg leading-none">{country.flag}</span>{country.name}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="form-label">Address Line 1 *</label>
          <input className={`input-field${ring('addressLine1')}`} value={form.addressLine1} onChange={set('addressLine1')} placeholder="House No., Street, Area" />
          <Err k="addressLine1" />
        </div>
        <div className="sm:col-span-2">
          <label className="form-label">Address Line 2</label>
          <input className="input-field" value={form.addressLine2} onChange={set('addressLine2')} placeholder="Landmark (optional)" />
        </div>
        <div>
          <label className="form-label">City *</label>
          <input className={`input-field${ring('city')}`} value={form.city} onChange={set('city')} placeholder="City" />
          <Err k="city" />
        </div>
        <div>
          <label className="form-label">{country.hasStateList ? 'State *' : 'State / Province *'}</label>
          {country.hasStateList ? (
            <select className={`input-field${ring('state')}`} value={form.state} onChange={set('state')}>
              <option value="">Select state</option>
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <input className={`input-field${ring('state')}`} value={form.state} onChange={set('state')} placeholder="State / Province" />
          )}
          <Err k="state" />
        </div>
        <div>
          <label className="form-label">{country.postalLabel} *</label>
          <input className={`input-field${ring('pincode')}`} value={form.pincode} onChange={setPincode} placeholder={'0'.repeat(country.postalDigits)} inputMode="numeric" maxLength={country.postalDigits} />
          <Err k="pincode" />
        </div>
      </div>
    </div>
  );
}
