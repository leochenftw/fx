import React, { useState } from 'react';
import { CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';
import { LoginForm } from '../components/LoginForm';
import { useTranslation } from 'react-i18next';
import type { LoginPageProps } from '../types';

type LoginStep = 'login' | 'forgot_send' | 'forgot_confirm';

export const LoginPage: React.FC<LoginPageProps> = ({
  userPool,
  onLoginSuccess,
  onNewPasswordRequired,
}) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<LoginStep>('login');

  // Input fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Notifications
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Standard Login Action
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    const userData = {
      Username: email,
      Pool: userPool,
    };

    const cognitoUser = new CognitoUser(userData);

    cognitoUser.authenticateUser(authDetails, {
      onSuccess: () => {
        setLoading(false);
        onLoginSuccess();
      },
      onFailure: (err: any) => {
        setError(err.message || JSON.stringify(err));
        setLoading(false);
      },
      newPasswordRequired: () => {
        setLoading(false);
        onNewPasswordRequired(cognitoUser);
      },
    });
  };

  // Forgot Password: Step 1 (Trigger Code Dispatch)
  const handleForgotPasswordInit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);

    const userData = {
      Username: email,
      Pool: userPool,
    };

    const cognitoUser = new CognitoUser(userData);

    cognitoUser.forgotPassword({
      onSuccess: () => {
        // Rarely hits here directly unless auto-completed
        setLoading(false);
      },
      onFailure: (err: any) => {
        setError(err.message || JSON.stringify(err));
        setLoading(false);
      },
      inputVerificationCode: () => {
        setLoading(false);
        setSuccessMessage(t('login.success_code_sent'));
        setStep('forgot_confirm');
      },
    });
  };

  // Forgot Password: Step 2 (Submit Code & Reset Password)
  const handleForgotPasswordConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !verificationCode || !newPassword) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const userData = {
      Username: email,
      Pool: userPool,
    };

    const cognitoUser = new CognitoUser(userData);

    cognitoUser.confirmPassword(verificationCode, newPassword, {
      onSuccess: () => {
        setLoading(false);
        setSuccessMessage(t('login.success_password_reset'));
        setStep('login');
        setPassword('');
        setVerificationCode('');
        setNewPassword('');
      },
      onFailure: (err: any) => {
        setError(err.message || JSON.stringify(err));
        setLoading(false);
      },
    });
  };

  const handleBackToLogin = () => {
    setStep('login');
    setError(null);
    setSuccessMessage(null);
  };

  // ── RENDER CONTROLLER ──

  if (step === 'forgot_send') {
    return (
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6 relative overflow-hidden self-center">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-600 to-emerald-400"></div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{t('login.reset_title')}</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t('login.reset_subtitle')}
          </p>
        </div>

        <form onSubmit={handleForgotPasswordInit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-600 mb-1.5">{t('login.email_label')}</label>
            <input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl p-3 animate-fadeIn">
              {error}
            </div>
          )}

          <div className="space-y-2.5 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-extrabold text-sm py-3.5 rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer shadow-sm"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <span>{t('login.button_send_code')}</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleBackToLogin}
              className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-xs py-3 rounded-xl transition cursor-pointer"
            >
              {t('login.back_to_login')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (step === 'forgot_confirm') {
    return (
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6 relative overflow-hidden self-center">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-600 to-emerald-400"></div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{t('login.set_new_password')}</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            {t('login.new_password_subtitle')}
          </p>
        </div>

        <form onSubmit={handleForgotPasswordConfirm} className="space-y-4 text-xs">
          {successMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl p-3 animate-fadeIn">
              {successMessage}
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-600 mb-1.5">{t('login.code_label')}</label>
            <input
              type="text"
              required
              placeholder="e.g. 123456"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition text-center tracking-widest text-sm"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1.5">{t('login.new_password_label')}</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl p-3">
              {error}
            </div>
          )}

          <div className="space-y-2.5 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-sm py-3.5 rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer shadow-md"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <span>{t('login.button_confirm_reset')}</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleBackToLogin}
              className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-xs py-3 rounded-xl transition cursor-pointer"
            >
              {t('login.back_to_login')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Step === 'login'
  return (
    <LoginForm
      onSubmit={handleLogin}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      error={error}
      successMessage={successMessage}
      loading={loading}
      onForgotPasswordClick={() => {
        setStep('forgot_send');
        setError(null);
        setSuccessMessage(null);
      }}
    />
  );
};
export default LoginPage;
