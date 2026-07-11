import React, { useState } from 'react';
import { NewPasswordForm } from '../components/NewPasswordForm';
import type { ResetPasswordPageProps } from '../types';

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({
  cognitoUserInstance,
  onResetSuccess,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCompleteNewPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !cognitoUserInstance) return;
    setLoading(true);
    setError(null);

    cognitoUserInstance.completeNewPasswordChallenge(newPassword, {}, {
      onSuccess: () => {
        setLoading(false);
        onResetSuccess();
      },
      onFailure: (err: any) => {
        setError(err.message || JSON.stringify(err));
        setLoading(false);
      },
    });
  };

  return (
    <NewPasswordForm
      onSubmit={handleCompleteNewPassword}
      newPassword={newPassword}
      setNewPassword={setNewPassword}
      error={error}
      loading={loading}
    />
  );
};
export default ResetPasswordPage;
