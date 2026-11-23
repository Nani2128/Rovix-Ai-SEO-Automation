import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '../../components/auth/LoginForm';
import { LoginVisualPanel } from '../../components/auth/LoginVisualPanel';
import { useAuthStore } from '../../stores/useAuthStore';

export function LoginPage({
  mode = 'login',
}: {
  mode?: 'login' | 'forgot-password';
}) {
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === 'authenticated' && mode === 'login') {
      navigate('/dashboard', { replace: true });
    }
  }, [status, mode, navigate]);

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row bg-[var(--bg-surface)] text-[var(--text-primary)]">
      <LoginForm mode={mode} />
      <LoginVisualPanel />
    </div>
  );
}
