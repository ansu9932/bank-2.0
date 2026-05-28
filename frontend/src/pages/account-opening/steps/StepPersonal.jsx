import React from 'react';

const Field = ({ label, children }) => (
  <div>
    <label className="form-label">{label}</label>
    {children}
  </div>
);

export default function StepPersonal({ form, update }) {
  const set = (k) => (e) => update({ [k]: e.target.value });

  return (
    <div>
      <h3 className="font-display text-xl font-700 text-white mb-1">Personal Information</h3>
      <p className="text-dark-300 text-sm mb-6">Fill in your basic personal details as per government ID</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="First Name *">
          <input className="input-field" value={form.firstName} onChange={set('firstName')} placeholder="Arjun" />
        </Field>
        <Field label="Last Name *">
          <input className="input-field" value={form.lastName} onChange={set('lastName')} placeholder="Sharma" />
        </Field>
        <Field label="Email Address *">
          <input className="input-field" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
        </Field>
        <Field label="Mobile Number *">
          <input className="input-field" type="tel" value={form.phone} onChange={set('phone')} placeholder="9876543210" maxLength={10} />
        </Field>
        <Field label="Date of Birth *">
          <input className="input-field" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} max={new Date(Date.now() - 18*365*24*60*60*1000).toISOString().split('T')[0]} />
        </Field>
        <Field label="Gender *">
          <select className="input-field" value={form.gender} onChange={set('gender')}>
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
        <Field label="Annual Income (₹)">
          <input className="input-field" type="number" value={form.annualIncome} onChange={set('annualIncome')} placeholder="1500000" />
        </Field>
        <Field label="Account Type *">
          <select className="input-field" value={form.accountType} onChange={set('accountType')}>
            <option value="savings">Savings Account</option>
            <option value="current">Current Account</option>
          </select>
        </Field>
      </div>
    </div>
  );
}
