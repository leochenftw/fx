import type { FormEvent } from 'react';
import type { CognitoUser, CognitoUserPool } from 'amazon-cognito-identity-js';

export interface SidebarProps {
  onLogout: () => void;
}

export interface HeaderProps {
  statusText?: string;
  statusIcon?: string;
  showLogout?: boolean;
  onLogout?: () => void;
  isLoggedIn?: boolean;
}

export interface LoginFormProps {
  onSubmit: (e: FormEvent) => void;
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  error: string | null;
  successMessage?: string | null;
  loading: boolean;
  onForgotPasswordClick: () => void;
}

export interface NewPasswordFormProps {
  onSubmit: (e: FormEvent) => void;
  newPassword: string;
  setNewPassword: (val: string) => void;
  error: string | null;
  loading: boolean;
}

export interface LoginPageProps {
  userPool: CognitoUserPool;
  onLoginSuccess: () => void;
  onNewPasswordRequired: (user: CognitoUser) => void;
}

export interface ResetPasswordPageProps {
  cognitoUserInstance: CognitoUser | null;
  onResetSuccess: () => void;
}
