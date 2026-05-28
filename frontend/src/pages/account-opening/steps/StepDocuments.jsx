import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { RiUploadCloud2Line, RiCheckLine, RiFileLine } from 'react-icons/ri';

const docFields = [
  { key: 'aadhaar',       idKey: 'aadhaarNumber',   label: 'Aadhaar Card',     placeholder: '1234 5678 9012', required: true },
  { key: 'pan',           idKey: 'panNumber',        label: 'PAN Card',         placeholder: 'ABCDE1234F',     required: true },
  { key: 'passport',      idKey: 'passportNumber',   label: 'Passport',         placeholder: 'A1234567',       required: false },
  { key: 'selfie',        idKey: null,               label: 'Live Selfie',      placeholder: null,             required: true },
  { key: 'signature',     idKey: null,               label: 'Signature',        placeholder: null,             required: true },
  { key: 'address_proof', idKey: null,               label: 'Address Proof',    placeholder: null,             required: true },
];

function FileUpload({ docKey, label, required, onDrop, file }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => onDrop(docKey, files[0]),
    accept: { 'image/*': [], 'application/pdf': [] },
    maxFiles: 1,
  });

  return (
    <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all text-center
      ${isDragActive ? 'border-brand-500 bg-brand-500/10' : file ? 'border-green-500/50 bg-green-500/5' : 'border-white/[0.08] hover:border-white/20'}`}>
      <input {...getInputProps()} />
      {file ? (
        <div className="flex items-center gap-2 justify-center">
          <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center">
            <RiCheckLine className="text-green-400" />
          </div>
          <div className="text-left">
            <p className="text-white text-xs font-medium truncate max-w-[160px]">{file.name}</p>
            <p className="text-dark-300 text-[10px]">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
        </div>
      ) : (
        <>
          <RiUploadCloud2Line className="text-dark-300 text-2xl mx-auto mb-1" />
          <p className="text-dark-300 text-xs">{isDragActive ? 'Drop here' : 'Click or drag to upload'}</p>
          <p className="text-dark-500 text-[10px] mt-0.5">PNG, JPG, PDF • Max 10MB</p>
        </>
      )}
    </div>
  );
}

export default function StepDocuments({ form, update }) {
  const setFile = useCallback((key, file) => {
    update({ files: { ...form.files, [key]: file } });
  }, [form.files, update]);

  const set = (k) => (e) => update({ [k]: e.target.value });

  return (
    <div>
      <h3 className="font-display text-xl font-700 text-white mb-1">KYC Documents</h3>
      <p className="text-dark-300 text-sm mb-6">Upload clear, legible copies of your documents. Files are encrypted and stored securely.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {docFields.map(({ key, idKey, label, placeholder, required }) => (
          <div key={key}>
            <label className="form-label">{label} {required && <span className="text-brand-400">*</span>}</label>
            {idKey && (
              <input
                className="input-field mb-2"
                value={form[idKey] || ''} onChange={set(idKey)}
                placeholder={placeholder}
              />
            )}
            <FileUpload
              docKey={key} label={label} required={required}
              onDrop={setFile} file={form.files?.[key]}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 p-3 rounded-xl bg-dark-700/50 border border-white/[0.05] text-xs text-dark-300">
        🔒 Your documents are encrypted using AES-256. They will only be accessed by verified Alister Bank KYC officers.
      </div>
    </div>
  );
}
