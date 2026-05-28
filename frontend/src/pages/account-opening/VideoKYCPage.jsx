import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Webcam from 'react-webcam';
import { RiBankLine, RiCameraLine, RiStopLine, RiUploadCloud2Line } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function VideoKYCPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const webcamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const [validLink, setValidLink] = useState(null);
  const [user, setUser] = useState(null);
  const [stage, setStage] = useState('intro'); // intro | recording | review | uploading | done
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [recordTime, setRecordTime] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setValidLink(false); setLoading(false); return; }
    api.get(`/account/verify-video-kyc/${token}`)
      .then(({ data }) => { setValidLink(true); setUser(data.data.user); })
      .catch(() => setValidLink(false))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    let interval;
    if (stage === 'recording') {
      interval = setInterval(() => setRecordTime(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [stage]);

  const startRecording = () => {
    chunksRef.current = [];
    const stream = webcamRef.current?.video?.srcObject;
    if (!stream) { toast.error('Camera not accessible'); return; }
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedBlob(blob);
      setRecordedUrl(URL.createObjectURL(blob));
      setStage('review');
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setStage('recording');
    setRecordTime(0);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const submitKYC = async () => {
    if (!recordedBlob) return;
    setStage('uploading');
    try {
      const fd = new FormData();
      fd.append('token', token);
      fd.append('video', recordedBlob, 'video-kyc.webm');
      await api.post('/account/submit-video-kyc', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setStage('done');
      toast.success('Video KYC submitted successfully!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed');
      setStage('review');
    }
  };

  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`;

  if (loading) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="spinner w-8 h-8" />
    </div>
  );

  if (!validLink) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-6">
      <div className="glass-card p-8 text-center max-w-md">
        <span className="text-5xl">⚠️</span>
        <h2 className="text-white font-bold text-xl mt-4 mb-2">Invalid or Expired Link</h2>
        <p className="text-dark-200 text-sm">This Video KYC link has expired or is invalid. Please contact Alister Bank support.</p>
      </div>
    </div>
  );

  if (stage === 'done') return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-6">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="glass-card p-10 text-center max-w-md">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="font-display text-2xl font-700 text-white mb-3">Video KYC Complete!</h2>
        <p className="text-dark-200 text-sm mb-4">Your video has been submitted. Our team will review and approve your account within 10 minutes. You'll receive an email when done.</p>
        <button onClick={() => navigate('/login')} className="btn-primary mx-auto">Go to Login</button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-dark-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center">
            <RiBankLine className="text-white text-lg" />
          </div>
          <div>
            <p className="font-display font-700 text-white">ALISTER BANK</p>
            <p className="text-dark-300 text-xs">Video KYC Verification</p>
          </div>
        </div>

        <div className="glass-card p-6">
          {stage === 'intro' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h2 className="font-display text-xl font-700 text-white mb-2">Hello, {user?.first_name}! 👋</h2>
              <p className="text-dark-200 text-sm mb-6">Complete a quick 30-second Video KYC to verify your identity.</p>
              <div className="space-y-3 mb-6">
                {[
                  '📷 Allow camera access when prompted',
                  '💡 Ensure good lighting and a clear background',
                  '🪪 Keep your original ID document ready',
                  '🗣️ Clearly state your name and date of birth',
                  '⏱️ Recording should be 20-30 seconds',
                ].map((tip, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm text-dark-200">
                    <span>{tip.slice(0, 2)}</span><span>{tip.slice(3)}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setStage('recording_prep')} className="btn-primary w-full py-3.5">
                <RiCameraLine /> Start Video KYC
              </button>
            </motion.div>
          )}

          {(stage === 'recording_prep' || stage === 'recording') && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">Camera Preview</h3>
                {stage === 'recording' && (
                  <div className="flex items-center gap-2 bg-red-500/20 px-3 py-1.5 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-red-400 text-sm font-mono font-bold">{formatTime(recordTime)}</span>
                  </div>
                )}
              </div>
              <div className="rounded-2xl overflow-hidden bg-dark-800 mb-4 aspect-video">
                <Webcam
                  ref={webcamRef}
                  audio={true}
                  videoConstraints={{ facingMode: 'user', width: 640, height: 360 }}
                  className="w-full h-full object-cover"
                />
              </div>
              {stage === 'recording_prep' ? (
                <button onClick={startRecording} className="btn-primary w-full py-3.5">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" /> Start Recording
                </button>
              ) : (
                <button onClick={stopRecording} className="btn-secondary w-full py-3.5 border-red-500/30 text-red-400">
                  <RiStopLine /> Stop Recording
                </button>
              )}
            </div>
          )}

          {stage === 'review' && (
            <div>
              <h3 className="text-white font-semibold mb-4">Review Your Recording</h3>
              <video src={recordedUrl} controls className="w-full rounded-2xl bg-black mb-4 aspect-video" />
              <div className="flex gap-3">
                <button onClick={() => { setRecordedBlob(null); setRecordedUrl(null); setStage('recording_prep'); }}
                  className="btn-secondary flex-1">
                  Re-record
                </button>
                <button onClick={submitKYC} className="btn-primary flex-1">
                  <RiUploadCloud2Line /> Submit Video
                </button>
              </div>
            </div>
          )}

          {stage === 'uploading' && (
            <div className="text-center py-12">
              <div className="spinner w-12 h-12 mx-auto mb-4" style={{ width: 48, height: 48, borderWidth: 3 }} />
              <p className="text-white font-medium">Uploading your video...</p>
              <p className="text-dark-300 text-sm mt-1">Please wait, this may take a moment.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
