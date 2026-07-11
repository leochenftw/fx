import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CognitoUserAttribute } from 'amazon-cognito-identity-js';
import { userPool } from '../App';

export const ProfilePage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [email, setEmail] = useState('guest@domain.com');
  const [firstName, setFirstName] = useState(localStorage.getItem('user_firstname') || '');
  const [lastName, setLastName] = useState(localStorage.getItem('user_lastname') || '');
  const [contactNumber, setContactNumber] = useState(localStorage.getItem('user_contactnumber') || '');
  const [language, setLanguage] = useState(localStorage.getItem('i18n_lang') || i18n.language || 'en');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch Cognito User details on mount
  useEffect(() => {
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.getSession((err: any, session: any) => {
        if (!err && session.isValid()) {
          const payload = session.getIdToken().decodePayload();
          setEmail(payload.email || 'guest@domain.com');
          setFirstName(payload.given_name || localStorage.getItem('user_firstname') || '');
          setLastName(payload.family_name || localStorage.getItem('user_lastname') || '');
          setContactNumber(payload.phone_number || localStorage.getItem('user_contactnumber') || '');
          
          // Read cloud-synced locale preferences if exists
          if (payload.locale) {
            setLanguage(payload.locale);
            localStorage.setItem('i18n_lang', payload.locale);
            i18n.changeLanguage(payload.locale);
          }
        }
      });
    }
  }, [i18n]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      setError('No active user session found.');
      return;
    }

    // ── Self-Healing E.164 Phone Number Formatting ──
    let formattedPhone = contactNumber.replace(/[^\d+]/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+64' + formattedPhone.substring(1);
    }

    // Validate E.164 format if phone is provided
    if (formattedPhone) {
      const e164Regex = /^\+[1-9]\d{1,14}$/;
      if (!e164Regex.test(formattedPhone)) {
        setError(t('profile_page.contact_number_invalid'));
        return;
      }
    }

    setLoading(true);

    // Sync standard given_name, family_name, phone_number, and locale to AWS Cognito
    const attributeList = [
      new CognitoUserAttribute({ Name: 'given_name', Value: firstName }),
      new CognitoUserAttribute({ Name: 'family_name', Value: lastName }),
      new CognitoUserAttribute({ Name: 'phone_number', Value: formattedPhone }),
      new CognitoUserAttribute({ Name: 'locale', Value: language }),
    ];

    cognitoUser.getSession((sessionErr: any, session: any) => {
      if (sessionErr || !session.isValid()) {
        setLoading(false);
        setError('Your session has expired. Please log in again.');
        return;
      }

      cognitoUser.updateAttributes(attributeList, (syncErr: any) => {
        setLoading(false);
        if (syncErr) {
          setError(syncErr.message || 'Failed to update user profile on AWS.');
          return;
        }

        // Successfully updated attributes in Cognito user pool!
        localStorage.setItem('user_firstname', firstName);
        localStorage.setItem('user_lastname', lastName);
        localStorage.setItem('user_contactnumber', formattedPhone);
        localStorage.setItem('i18n_lang', language);
        setContactNumber(formattedPhone);

        // Switch dynamic i18n language
        i18n.changeLanguage(language);

        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      });
    });
  };

  return (
    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6 relative overflow-hidden text-xs">
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-600 to-emerald-400"></div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center space-x-1 text-slate-400 hover:text-slate-600 font-bold text-xs transition cursor-pointer"
        >
          <span className="material-icons text-sm">arrow_back</span>
          <span>Back</span>
        </button>
        <span className="text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">
          Settings
        </span>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">{t('profile_page.title')}</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          {t('profile_page.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl p-3 animate-fadeIn">
            {t('profile_page.success_message')}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl p-3 animate-fadeIn">
            {error}
          </div>
        )}

        <div>
          <label className="block font-bold text-slate-600 mb-1.5">{t('profile_page.email_label')}</label>
          <input
            type="text"
            disabled
            value={email}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-400 font-medium cursor-not-allowed"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {i18n.language.startsWith('zh') ? (
            <>
              {/* Last Name first in Chinese */}
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">{t('profile_page.lastname_label')}</label>
                <input
                  type="text"
                  placeholder={t('profile_page.lastname_placeholder') || ''}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">{t('profile_page.firstname_label')}</label>
                <input
                  type="text"
                  placeholder={t('profile_page.firstname_placeholder') || ''}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
                />
              </div>
            </>
          ) : (
            <>
              {/* First Name first in English */}
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">{t('profile_page.firstname_label')}</label>
                <input
                  type="text"
                  placeholder={t('profile_page.firstname_placeholder') || ''}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">{t('profile_page.lastname_label')}</label>
                <input
                  type="text"
                  placeholder={t('profile_page.lastname_placeholder') || ''}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
                />
              </div>
            </>
          )}
        </div>

        <div>
          <label className="block font-bold text-slate-600 mb-1.5">{t('profile_page.contact_number_label')}</label>
          <input
            type="text"
            placeholder={t('profile_page.contact_number_placeholder') || ''}
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition"
          />
        </div>

        <div>
          <label className="block font-bold text-slate-600 mb-1.5">{t('profile_page.language_label')}</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition cursor-pointer"
          >
            <option value="en">English (US/NZ)</option>
            <option value="zh">简体中文 (CN)</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-sm py-3.5 rounded-xl shadow-md transition flex items-center justify-center space-x-2 cursor-pointer mt-6"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
            <>
              <span className="material-icons text-white text-sm mr-1 leading-none">save</span>
              <span>{t('profile_page.button_save')}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
export default ProfilePage;
