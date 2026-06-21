import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import toast from 'react-hot-toast';

const getStoredUser = () => {
  try { return JSON.parse(localStorage.getItem('user')); }
  catch { return null; }
};

export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login', credentials);
    // Adaptive CAPTCHA: a suspicious attempt returns HTTP 200 with
    // { captchaRequired:true } instead of a session — surface it to the page.
    if (data && data.captchaRequired) {
      return rejectWithValue({ captchaRequired: true, message: data.message });
    }
    localStorage.setItem('token', data.data.token);
    localStorage.setItem('user', JSON.stringify(data.data.user));
    // Absolute-session marker: the precise ms the current session began. The
    // customer-side session engine enforces a hard 1-hour lifespan from here.
    localStorage.setItem('loginTime', String(Date.now()));
    return data.data;
  } catch (err) {
    const resp = err.response?.data;
    if (resp?.captchaRequired) {
      return rejectWithValue({ captchaRequired: true, message: resp.message || 'Please complete the security check to continue.' });
    }
    return rejectWithValue(resp?.message || 'Login failed');
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  try { await api.post('/auth/logout'); } catch {}
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('loginTime');
});

export const getMe = createAsyncThunk('auth/getMe', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/auth/me');
    localStorage.setItem('user', JSON.stringify(data.data.user));
    return data.data.user;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const sendOTP = createAsyncThunk('auth/sendOTP', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/send-otp', payload);
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Failed to send OTP');
  }
});

export const verifyOTP = createAsyncThunk('auth/verifyOTP', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/verify-otp', payload);
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'OTP verification failed');
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: getStoredUser(),
    token: localStorage.getItem('token'),
    isAuthenticated: !!localStorage.getItem('token'),
    loading: false,
    error: null,
    otpSent: false,
    otpVerified: false,
    // Adaptive login CAPTCHA: set when the backend flags a suspicious attempt.
    captchaRequired: false,
    captchaMessage: '',
  },
  reducers: {
    clearError: (state) => { state.error = null; },
    resetOTP: (state) => { state.otpSent = false; state.otpVerified = false; },
    resetCaptcha: (state) => { state.captchaRequired = false; state.captchaMessage = ''; },
    updateUser: (state, action) => {
      state.user = { ...state.user, ...action.payload };
      localStorage.setItem('user', JSON.stringify(state.user));
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (s) => { s.loading = true; s.error = null; })
      .addCase(login.fulfilled, (s, a) => {
        s.loading = false;
        s.isAuthenticated = true;
        s.user = a.payload.user;
        s.token = a.payload.token;
        s.captchaRequired = false;
        s.captchaMessage = '';
      })
      .addCase(login.rejected, (s, a) => {
        s.loading = false;
        if (a.payload && typeof a.payload === 'object' && a.payload.captchaRequired) {
          // Not a hard error — prompt the user for the adaptive CAPTCHA instead.
          s.captchaRequired = true;
          s.captchaMessage = a.payload.message || 'Please complete the security check to continue.';
          s.error = null;
        } else {
          s.error = a.payload;
        }
      })
      .addCase(logout.fulfilled, (s) => { s.user = null; s.token = null; s.isAuthenticated = false; })
      .addCase(getMe.fulfilled, (s, a) => { s.user = a.payload; })
      .addCase(sendOTP.fulfilled, (s) => { s.otpSent = true; })
      .addCase(sendOTP.rejected, (s, a) => { s.error = a.payload; })
      .addCase(verifyOTP.fulfilled, (s) => { s.otpVerified = true; })
      .addCase(verifyOTP.rejected, (s, a) => { s.error = a.payload; });
  },
});

export const { clearError, resetOTP, updateUser, resetCaptcha } = authSlice.actions;
export default authSlice.reducer;
