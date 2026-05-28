import React from 'react';

const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu & Kashmir','Ladakh','Puducherry'];

export default function StepAddress({ form, update }) {
  const set = (k) => (e) => update({ [k]: e.target.value });
  return (
    <div>
      <h3 className="font-display text-xl font-700 text-white mb-1">Address Details</h3>
      <p className="text-dark-300 text-sm mb-6">Enter your current residential address</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="form-label">Address Line 1 *</label>
          <input className="input-field" value={form.addressLine1} onChange={set('addressLine1')} placeholder="House No., Street, Area" />
        </div>
        <div className="sm:col-span-2">
          <label className="form-label">Address Line 2</label>
          <input className="input-field" value={form.addressLine2} onChange={set('addressLine2')} placeholder="Landmark (optional)" />
        </div>
        <div>
          <label className="form-label">City *</label>
          <input className="input-field" value={form.city} onChange={set('city')} placeholder="Bangalore" />
        </div>
        <div>
          <label className="form-label">State *</label>
          <select className="input-field" value={form.state} onChange={set('state')}>
            <option value="">Select state</option>
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">PIN Code *</label>
          <input className="input-field" value={form.pincode} onChange={set('pincode')} placeholder="560001" maxLength={6} />
        </div>
        <div>
          <label className="form-label">Country</label>
          <input className="input-field" value={form.country} onChange={set('country')} placeholder="India" />
        </div>
      </div>
    </div>
  );
}
