import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [devResetLink, setDevResetLink] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, loading: authLoading, branding } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    setDevResetLink('');
    try {
      const { data } = await api.post('/auth/forgot-password', {
        email: email.trim(),
        publicAppOrigin: typeof window !== 'undefined' ? window.location.origin : ''
      });
      setInfo(data?.message || 'Check your email for the next steps.');
      if (data?.dev_reset_link) {
        setDevResetLink(String(data.dev_reset_link));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-page relative overflow-hidden font-sans text-app-main">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[30%] h-[30%] bg-app-accent-soft rounded-full blur-3xl opacity-70" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[30%] bg-white/40 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md px-6 relative z-10">
        {branding?.logoUrl ? (
          <div className="flex justify-center mb-7">
            <img
              src={branding.logoUrl}
              alt="Application logo"
              className="h-28 md:h-32 w-auto object-contain drop-shadow-sm"
            />
          </div>
        ) : null}

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-2 text-center">Forgot password</h2>
          <p className="text-sm text-slate-600 text-center mb-6">
            Enter the email address on your account. We will send you a link to choose a new password.
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
              {error}
            </div>
          )}

          {info && (
            <div className="mb-6 p-4 bg-emerald-50 text-emerald-800 text-sm rounded-lg border border-emerald-100 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              {info}
            </div>
          )}

          {devResetLink ? (
            <div className="mb-6 p-4 bg-amber-50 text-amber-950 text-sm rounded-lg border border-amber-200 space-y-2">
              <p className="font-semibold">Development: open reset link</p>
              <p className="text-amber-900">
                No SMTP is configured. Use this one-time link (also printed in the server console):
              </p>
              <a
                href={devResetLink}
                className="block break-all text-amber-800 underline font-mono text-xs hover:text-amber-950"
              >
                {devResetLink}
              </a>
              <button
                type="button"
                className="mt-1 text-xs font-medium text-amber-900 hover:text-amber-950 underline"
                onClick={() => {
                  navigator.clipboard.writeText(devResetLink).catch(() => {});
                }}
              >
                Copy link
              </button>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-slate-700 text-sm font-semibold mb-2 ml-1" htmlFor="forgot-email">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-slate-800 placeholder-slate-400"
                placeholder="name@example.com"
                autoComplete="email"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Sending…</span>
                </>
              ) : (
                <span>Send reset link</span>
              )}
            </button>

            <div className="text-center pt-2">
              <Link
                to="/login"
                className="text-amber-600 hover:text-amber-700 text-sm font-medium transition-colors"
              >
                Back to sign in
              </Link>
            </div>
          </form>
        </div>

        <p className="text-center text-slate-400 text-xs mt-8">
          © {new Date().getFullYear()} Expo City Dubai. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;
