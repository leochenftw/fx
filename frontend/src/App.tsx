import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CognitoUserPool, CognitoUser } from 'amazon-cognito-identity-js';
import { cognitoConfig } from './cognitoConfig';
import { orgApi } from './api/orgs';

// Import Pages
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SetupPage } from './pages/SetupPage';
import { OrgListPage } from './pages/OrgListPage';
import { ProfilePage } from './pages/ProfilePage';
import { HomePage } from './pages/HomePage';
import { OrgDetailPage } from './pages/OrgDetailPage';
import { OrgEditPage } from './pages/OrgEditPage';
import { StaffListPage } from './pages/StaffListPage';
import { StaffDetailPage } from './pages/StaffDetailPage';
import { StaffFormPage } from './pages/StaffFormPage';

// Import Components
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Sidebar } from './components/Sidebar';

// Initialize AWS Cognito User Pool
export const userPool = new CognitoUserPool({
  UserPoolId: cognitoConfig.UserPoolId,
  ClientId: cognitoConfig.ClientId,
});

// Helper: Safely get standard JWT token from Cognito session
export const getValidToken = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      reject(new Error('No active user session.'));
      return;
    }
    cognitoUser.getSession((err: any, session: any) => {
      if (err || !session.isValid()) {
        reject(new Error('Session invalid or expired.'));
      } else {
        const idToken = session.getIdToken();
        const expiration = idToken.getExpiration();
        const now = Math.floor(Date.now() / 1000);

        // 120 seconds buffer to preempt HMR race conditions or late client-side requests
        if (expiration - now < 120) {
          cognitoUser.getSession((refreshErr: any, refreshedSession: any) => {
            if (refreshErr) {
              reject(new Error('Token renewal failed.'));
            } else {
              resolve(refreshedSession.getIdToken().getJwtToken());
            }
          });
        } else {
          resolve(idToken.getJwtToken());
        }
      }
    });
  });
};

// ── App Sidebar Layout Component (方案 B UI Design) ──
const AppLayout: React.FC<{ children: React.ReactNode; onLogout: () => void }> = ({ children, onLogout }) => {
  return (
    <div className="w-full mx-auto px-6 md:px-0 md:pl-6 flex-grow flex flex-col md:flex-row gap-6 lg:gap-8 items-stretch justify-stretch text-xs md:h-full md:overflow-hidden">
      {/* LEFT SECTION: Sidebar Component */}
      <Sidebar onLogout={onLogout} />

      {/* RIGHT SECTION: Content Canvas */}
      <div className="flex-grow w-full md:w-auto md:h-full md:overflow-y-auto md:pr-6 py-8">
        {children}
      </div>
    </div>
  );
};

export default function App() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  // Auth and loader state
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(!!localStorage.getItem('idToken'));
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Cognito temporary context parameters
  const [cognitoUserInstance, setCognitoUserInstance] = useState<CognitoUser | null>(null);
  const [isNewPasswordRequired, setIsNewPasswordRequired] = useState<boolean>(false);

  // Member Organisations database
  const [orgs, setOrgs] = useState<any[]>([]);
  const [orgsLastKey, setOrgsLastKey] = useState<string | null>(null);
  const [fetchingMoreOrgs, setFetchingMoreOrgs] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const orgsFetchedRef = useRef(false);

  // ── Mount Check: Silent Session Renewal using RefreshToken ──
  useEffect(() => {
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
      setLoading(true);
      cognitoUser.getSession((err: any, session: any) => {
        if (err || !session.isValid()) {
          console.log('[Auth] Session invalid or expired. Cleaning up.');
          handleLogout();
          setLoading(false);
          return;
        }

        const idToken = session.getIdToken().getJwtToken();
        localStorage.setItem('idToken', idToken);

        const payload = session.getIdToken().decodePayload();
        if (payload.sub) {
          localStorage.setItem('user_sub', payload.sub);
        }
        if (payload.email) {
          localStorage.setItem('user_email', payload.email);
        }
        if (payload.given_name) {
          localStorage.setItem('user_firstname', payload.given_name);
        }
        if (payload.family_name) {
          localStorage.setItem('user_lastname', payload.family_name);
        }
        if (payload.locale) {
          localStorage.setItem('i18n_lang', payload.locale);
          i18n.changeLanguage(payload.locale);
        }
        const groups = payload['cognito:groups'];
        if (Array.isArray(groups)) {
          localStorage.setItem('user_groups', JSON.stringify(groups));
        } else {
          localStorage.setItem('user_groups', '[]');
        }

        setIsLoggedIn(true);
        setLoading(false);
      });
    }
  }, [i18n]);

  const bootstrapApp = async () => {
    const isGenesisDone = localStorage.getItem('genesis_done') === 'true';
    if (isGenesisDone) {
      setShowSetup(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await orgApi.bootstrap();
      localStorage.setItem('genesis_done', String(data.genesis_done));
      if (data.config && data.config.gst_rate !== undefined) {
        localStorage.setItem('default_gst_rate', String(data.config.gst_rate));
      }
      setShowSetup(!data.genesis_done);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Server configuration error';
      console.error('[Bootstrap] Failed to fetch server configurations:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Bootstrap app state and sync locale settings on successful auth
  useEffect(() => {
    if (isLoggedIn && !loading) {
      bootstrapApp();

      const cognitoUser = userPool.getCurrentUser();
      if (cognitoUser) {
        cognitoUser.getSession((err: any, session: any) => {
          if (!err && session.isValid()) {
            const payload = session.getIdToken().decodePayload();
            if (payload.sub) {
              localStorage.setItem('user_sub', payload.sub);
            }
            if (payload.email) {
              localStorage.setItem('user_email', payload.email);
            }
            if (payload.given_name) {
              localStorage.setItem('user_firstname', payload.given_name);
            }
            if (payload.family_name) {
              localStorage.setItem('user_lastname', payload.family_name);
            }
            if (payload.locale) {
              localStorage.setItem('i18n_lang', payload.locale);
              i18n.changeLanguage(payload.locale);
            }
          }
        });
      }
    }
  }, [isLoggedIn]);

  // ── ROUTE SENTINEL & SECURITY GUARDS ──
  useEffect(() => {
    if (loading) return;

    if (isNewPasswordRequired) {
      if (window.location.pathname !== '/reset-password') {
        navigate('/reset-password');
      }
      return;
    }

    if (!isLoggedIn) {
      if (window.location.pathname !== '/login') {
        navigate('/login');
      }
    } else {
      if (showSetup) {
        if (window.location.pathname !== '/orgs/setup') {
          navigate('/orgs/setup');
        }
      } else {
        if (window.location.pathname === '/login' || window.location.pathname === '/reset-password') {
          navigate('/');
        }
      }
    }
  }, [isLoggedIn, isNewPasswordRequired, showSetup, loading, navigate]);

  const fetchOrgs = async (force = false) => {
    if (orgsFetchedRef.current && !force) return;
    orgsFetchedRef.current = true;
    setLoading(true);
    setError(null);
    setOrgsLastKey(null);
    try {
      const data = await orgApi.list();
      setOrgs(data.orgs || []);
      setOrgsLastKey(data.lastKey || null);
      const isGenesisDone = localStorage.getItem('genesis_done') === 'true';
      if (!isGenesisDone && (!data.orgs || data.orgs.length === 0)) {
        setShowSetup(true);
      } else {
        setShowSetup(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to retrieve cloud data.';
      setError(message);
      orgsFetchedRef.current = false; // Reset lock on error to allow retry
    } finally {
      setLoading(false);
    }
  };

  const fetchMoreOrgs = async () => {
    if (!orgsLastKey || fetchingMoreOrgs) return;
    setFetchingMoreOrgs(true);
    try {
      const data = await orgApi.list(orgsLastKey);
      setOrgs(prev => [...prev, ...(data.orgs || [])]);
      setOrgsLastKey(data.lastKey || null);
    } catch (err) {
      console.error('Error fetching more organisations:', err);
    } finally {
      setFetchingMoreOrgs(false);
    }
  };

  const handleLogout = () => {
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.signOut(); // Wipes out cached tokens and RefreshTokens locally
    }
    localStorage.removeItem('idToken');
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_firstname');
    localStorage.removeItem('user_lastname');
    localStorage.removeItem('user_contactnumber');
    localStorage.removeItem('genesis_done');
    localStorage.removeItem('user_sub');
    localStorage.removeItem('user_groups');
    setIsLoggedIn(false);
    setOrgs([]);
    setShowSetup(false);
    setError(null);
    orgsFetchedRef.current = false; // Reset lock on sign-out
  };

  // ── RENDER STATE: APP FRAME WITH PAGES ──
  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden bg-slate-50 text-slate-800 antialiased flex flex-col justify-between font-sans">
      <Header
        isLoggedIn={isLoggedIn}
        statusText={
          isNewPasswordRequired
            ? t('header.setup_mode')
            : !isLoggedIn
              ? t('header.access_locked')
              : orgs.length === 0
                ? t('header.setup_required')
                : t('header.node_synced')
        }
        statusIcon={
          isNewPasswordRequired
            ? 'lock'
            : !isLoggedIn
              ? 'vpn_key'
              : orgs.length === 0
                ? 'construction'
                : 'check_circle'
        }
      />

      {error && (
        <div className="max-w-7xl w-full mx-auto px-6 mt-4">
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl p-3">
            {error}
          </div>
        </div>
      )}

      {/* Pages Container */}
      <main className="w-full flex-grow flex items-stretch justify-center min-h-0 overflow-hidden">
        <Routes>
          <Route
            path="/login"
            element={
              <LoginPage
                userPool={userPool}
                onLoginSuccess={() => setIsLoggedIn(true)}
                onNewPasswordRequired={(user) => {
                  setCognitoUserInstance(user);
                  setIsNewPasswordRequired(true);
                }}
              />
            }
          />
          <Route
            path="/reset-password"
            element={
              <ResetPasswordPage
                cognitoUserInstance={cognitoUserInstance}
                onResetSuccess={() => {
                  setIsNewPasswordRequired(false);
                  setIsLoggedIn(true);
                }}
              />
            }
          />
          <Route
            path="/orgs/setup"
            element={
              <AppLayout onLogout={handleLogout}>
                <SetupPage onSetupSuccess={() => {
                  const isLocalGenesisDone = localStorage.getItem('genesis_done') === 'true';
                  if (!isLocalGenesisDone) {
                    localStorage.setItem('genesis_done', 'true');
                    setShowSetup(false);

                    // Asynchronously notify backend to persist genesis completed state
                    getValidToken().then(async () => {
                      try {
                        await orgApi.bootstrapComplete();
                      } catch (err) {
                        console.error('[Bootstrap] Failed to notify backend of completion:', err);
                      }
                    });
                  }

                  fetchOrgs(true);
                  navigate('/orgs');
                }} />
              </AppLayout>
            }
          />
          <Route
            path="/profile"
            element={
              <AppLayout onLogout={handleLogout}>
                <ProfilePage />
              </AppLayout>
            }
          />
          <Route
            path="/orgs"
            element={
              <AppLayout onLogout={handleLogout}>
                <OrgListPage
                  orgs={orgs}
                  loading={loading}
                  onMount={() => fetchOrgs()}
                  hasMore={!!orgsLastKey}
                  onLoadMore={fetchMoreOrgs}
                  loadingMore={fetchingMoreOrgs}
                />
              </AppLayout>
            }
          />
          <Route
            path="/orgs/:orgId/edit"
            element={
              <AppLayout onLogout={handleLogout}>
                <OrgEditPage onEditSuccess={() => fetchOrgs(true)} />
              </AppLayout>
            }
          />
          <Route
            path="/orgs/:orgId/*"
            element={
              <AppLayout onLogout={handleLogout}>
                <OrgDetailPage />
              </AppLayout>
            }
          />
          <Route
            path="/staff"
            element={
              <AppLayout onLogout={handleLogout}>
                <StaffListPage />
              </AppLayout>
            }
          />
          <Route
            path="/staff/new"
            element={
              <AppLayout onLogout={handleLogout}>
                <StaffFormPage />
              </AppLayout>
            }
          />
          <Route
            path="/staff/:staffId"
            element={
              <AppLayout onLogout={handleLogout}>
                <StaffDetailPage />
              </AppLayout>
            }
          />
          <Route
            path="/staff/:staffId/edit"
            element={
              <AppLayout onLogout={handleLogout}>
                <StaffFormPage />
              </AppLayout>
            }
          />
          <Route
            path="/"
            element={
              <AppLayout onLogout={handleLogout}>
                <HomePage orgs={orgs} />
              </AppLayout>
            }
          />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
