import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { RiUploadCloud2Line, RiCheckLine, RiLoader4Line, RiShieldCheckLine } from 'react-icons/ri';
import api from '../../../services/api';
import toast from 'react-hot-toast';

const docFields = [
  { key: 'aadhaar',       idKey: 'aadhaarNumber',   label: 'Aadhaar Card',     placeholder: '1234 5678 9012', required: true },
  { key: 'pan',           idKey: 'panNumber',        label: 'PAN Card',         placeholder: 'ABCDE1234F',     required: true },
  { key: 'passport',      idKey: 'passportNumber',   label: 'Passport',         placeholder: 'A1234567',       required: false },
  { key: 'selfie',        idKey: null,               label: 'Live Selfie',      placeholder: null,             required: true },
  { key: 'signature',     idKey: null,               label: 'Signature',        placeholder: null,             required: true },
  { key: 'address_proof', idKey: null,               label: 'Address Proof',    placeholder: null,             required: true },
];

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// Format a raw (un-spaced) Aadhaar string into "XXXX XXXX XXXX" for display.
const formatAadhaar = (raw) => raw.replace(/(.{4})/g, '$1 ').trim();

function FileUpload({ docKey, onDrop, file, error }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => onDrop(docKey, files[0]),
    accept: { 'image/*': [], 'application/pdf': [] },
    maxFiles: 1,
  });

  return (
    <>
      <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all text-center
        ${isDragActive ? 'border-brand-500 bg-brand-500/10' : file ? 'border-green-500/50 bg-green-500/5' : error ? 'border-brand-500/60' : 'border-white/[0.08] hover:border-white/20'}`}>
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
      {error && <p className="text-brand-400 text-[11px] mt-1">{error}</p>}
    </>
  );
}

export default function StepDocuments({ form, update, errors = {}, nameLocked = false, setNameLocked }) {
  const setFile = useCallback((key, file) => {
    update({ files: { ...form.files, [key]: file } });
  }, [form.files, update]);

  const [panVerifying, setPanVerifying] = useState(false);
  const [panVerifyMsg, setPanVerifyMsg] = useState('');   // status line under the PAN field
  const [panVerifyOk, setPanVerifyOk] = useState(false);
  // Track the last PAN we actually fired a request for, so we don't re-verify
  // the same value repeatedly (and don't re-fire on unrelated re-renders).
  const lastVerifiedPan = useRef('');
  const debounceRef = useRef(null);

  // ── Aadhaar: digit-only, hard cap 12, store the RAW un-spaced value ─────────
  const onAadhaarChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 12);
    update({ aadhaarNumber: raw });
  };

  // ── PAN: force uppercase alphanumeric, hard cap 10 ──────────────────────────
  const onPanChange = (e) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    update({ panNumber: val });
  };

  const onPlainChange = (k) => (e) => update({ [k]: e.target.value });

  // ── PAN name auto-fetch: when a structurally valid 10-char PAN is reached,
  //    debounce then POST /api/kyc/verify-pan and auto-populate + lock the name.
  useEffect(() => {
    const pan = (form.panNumber || '').toUpperCase();

    // Reset transient status if the PAN is no longer a complete valid pattern.
    if (!PAN_RE.test(pan)) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (panVerifyMsg) { setPanVerifyMsg(''); setPanVerifyOk(false); }
      return;
    }
    // Already verified this exact PAN — nothing to do.
    if (pan === lastVerifiedPan.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPanVerifying(true);
      setPanVerifyOk(false);
      setPanVerifyMsg('Verifying your identity with income tax registry…');
      try {
        const { data } = await api.post('/kyc/verify-pan', { pan });
        const result = data?.data || {};
        if (result.verified && result.name) {
          lastVerifiedPan.current = pan;
          // Cashfree returns the full registered_name; split into first / last.
          const parts = String(result.name).trim().split(/\s+/);
          const firstName = parts.shift() || '';
          const lastName = parts.join(' ');
          update({ firstName, lastName });
          if (setNameLocked) setNameLocked(true);
          setPanVerifyOk(true);
          setPanVerifyMsg(`Verified: ${result.name}`);
          toast.success('PAN verified — name auto-filled from income tax registry.');
        } else {
          // PAN not found / not valid — let the user re-check the number.
          if (setNameLocked) setNameLocked(false);
          setPanVerifyOk(false);
          setPanVerifyMsg(result.message || 'This PAN could not be verified. Please re-check the number.');
        }
      } catch (err) {
        if (setNameLocked) setNameLocked(false);
        setPanVerifyOk(false);
        setPanVerifyMsg(
          err?.response?.data?.message
          || 'Identity verification is temporarily unavailable. Please try again shortly.'
        );
      } finally {
        setPanVerifying(false);
      }
    }, 600);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.panNumber]);

  return (
    <div className="relative">
      {/* Sleek verification overlay — covers the form while Cashfree responds. */}
      {panVerifying && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-dark-900/80 backdrop-blur-sm">
          <div className="relative flex items-center justify-center mb-4">
            <span className="absolute inline-flex h-14 w-14 rounded-full bg-brand-500/30 animate-ping" />
            <RiLoader4Line className="text-brand-400 text-4xl animate-spin" />
          </div>
          <p className="text-white text-sm font-medium">Verifying your identity with income tax registry…</p>
          <p className="text-dark-300 text-[11px] mt-1">Securely matching your PAN with Cashfree Secure ID</p>
        </div>
      )}

      <h3 className="font-display text-xl font-700 text-white mb-1">KYC Documents</h3>
      <p className="text-dark-300 text-sm mb-6">Upload clear, legible copies of your documents. Files are encrypted and stored securely.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {docFields.map(({ key, idKey, label, placeholder, required }) => {
          const isAadhaar = key === 'aadhaar';
          const isPan = key === 'pan';
          // Aadhaar shows the spaced display value; raw is what's stored in form.
          const displayValue = isAadhaar
            ? formatAadhaar(form.aadhaarNumber || '')
            : (form[idKey] || '');

          return (
            <div key={key}>
              <label className="form-label">{label} {required && <span className="text-brand-400">*</span>}</label>
              {idKey && (
                <>
                  <input
                    className={`input-field mb-1 ${errors[idKey] ? '!border-brand-500 focus:!border-brand-500' : ''} ${isPan && (panVerifying || panVerifyOk) ? 'opacity-70 cursor-not-allowed' : ''}`}
                    value={displayValue}
                    onChange={isAadhaar ? onAadhaarChange : isPan ? onPanChange : onPlainChange(idKey)}
                    placeholder={placeholder}
                    inputMode={isAadhaar ? 'numeric' : 'text'}
                    maxLength={isAadhaar ? 14 : isPan ? 10 : undefined}
                    autoCapitalize={isPan ? 'characters' : undefined}
                    style={isPan ? { textTransform: 'uppercase' } : undefined}
                    disabled={isPan && panVerifying}
                    readOnly={isPan && panVerifyOk}
                  />
                  {errors[idKey] && <p className="text-brand-400 text-[11px] mb-1">{errors[idKey]}</p>}

                  {/* PAN verification status line */}
                  {isPan && panVerifyMsg && (
                    <p className={`text-[11px] mb-1 flex items-center gap-1.5 ${panVerifyOk ? 'text-green-400' : panVerifying ? 'text-brand-300' : 'text-amber-300'}`}>
                      {panVerifying
                        ? <RiLoader4Line className="animate-spin" />
                        : panVerifyOk ? <RiShieldCheckLine /> : <span>ℹ</span>}
                      <span>{panVerifyMsg}</span>
                    </p>
                  )}
                </>
              )}
              <FileUpload
                docKey={key}
                onDrop={setFile}
                file={form.files?.[key]}
                error={errors[`file_${key}`]}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-4 p-3 rounded-xl bg-dark-700/50 border border-white/[0.05] text-xs text-dark-300">
        🔒 Your documents are encrypted using AES-256. They will only be accessed by verified Alister Bank KYC officers.
      </div>
    </div>
  );
}
