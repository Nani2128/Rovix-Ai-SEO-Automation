import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { MOTION_EASE, SPRING_PILL } from '../../config/motion';
import { authService } from '../../services/authService';
import { useAuthStore } from '../../stores/useAuthStore';
import {
  validateEmailFormat,
  validatePasswordInput,
} from '../../utils/dashboardLogic';
import { SuccessTransition } from '../animation/MotionPrimitives';
import { RovixLogo } from '../RovixLogo';
import { ThemeSelectorDropdown } from '../ui/ThemeSelectorDropdown';
import { ThemeToggle } from '../ui/ThemeToggle';

interface LoginFormProps {
  mode: 'login' | 'forgot-password';
}

export function LoginForm({ mode }: LoginFormProps) {
  const prefersReducedMotion = useReducedMotion();
  const navigate = useNavigate();

  const {
    login,
    register,
    isSubmitting,
    authError,
    clearAuthError,
    devMode,
    productionSafe,
    authModeLabel,
  } = useAuthStore();

  const [tab, setTab] = useState<'signin' | 'signup'>('signin');

  // Sign In + Sign Up fields
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [primaryDomain, setPrimaryDomain] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string | null;
    workspaceName?: string | null;
    primaryDomain?: string | null;
    email?: string | null;
    password?: string | null;
  }>({});
  const [loginSucceeded, setLoginSucceeded] = useState(false);
  const [shaking, setShaking] = useState(false);

  const triggerShake = () => {
    setShaking(true);
    window.setTimeout(() => setShaking(false), 320);
  };

  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [legalNotice, setLegalNotice] = useState<'terms' | 'privacy' | null>(null);

  const fillDevAccount = (accountEmail: string, accountSecret: string) => {
    clearAuthError();
    setTab('signin');
    setFieldErrors({});
    setEmail(accountEmail);
    setPassword(accountSecret);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();

    const emailErr = validateEmailFormat(email);
    const passErr = validatePasswordInput(password);
    if (emailErr || passErr) {
      setFieldErrors({ email: emailErr, password: passErr });
      triggerShake();
      return;
    }

    setFieldErrors({});
    const ok = await login(email.trim(), password, rememberMe);
    if (ok) {
      setLoginSucceeded(true);
      window.setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, prefersReducedMotion ? 50 : 380);
    } else {
      triggerShake();
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();

    const errors: typeof fieldErrors = {};
    if (name.trim().length < 2) errors.name = 'Enter your full name (2+ characters).';
    if (workspaceName.trim().length < 2)
      errors.workspaceName = 'Enter your company or agency workspace name.';
    if (primaryDomain.trim().length < 3)
      errors.primaryDomain = 'Enter a primary domain (e.g. yourcompany.com).';
    const emailErr = validateEmailFormat(email);
    if (emailErr) errors.email = emailErr;
    const passErr = validatePasswordInput(password);
    if (passErr) errors.password = passErr;

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      triggerShake();
      return;
    }

    setFieldErrors({});
    const ok = await register({
      name: name.trim(),
      email: email.trim(),
      password,
      workspaceName: workspaceName.trim(),
      primaryDomain: primaryDomain.trim(),
    });
    if (ok) {
      setLoginSucceeded(true);
      window.setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, prefersReducedMotion ? 50 : 380);
    } else {
      triggerShake();
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetMessage(null);

    const emailErr = validateEmailFormat(email);
    if (emailErr) {
      setFieldErrors({ email: emailErr });
      return;
    }

    setFieldErrors({});
    setResetLoading(true);
    try {
      const res = await authService.forgotPassword(email.trim());
      setResetMessage(res.message);
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : 'Unable to process reset request.',
      );
    } finally {
      setResetLoading(false);
    }
  };

  const showDevQuickFill = devMode && !productionSafe && mode === 'login';

  return (
    <div className="flex w-full lg:w-1/2 flex-col justify-between bg-[var(--bg-surface)] px-6 py-8 sm:px-12 lg:px-14 xl:px-20">
      {/* Top Row: Back to Home, Logo & Theme Toggle */}
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[#7047EB]/40 hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to Home</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeSelectorDropdown compact />
          <ThemeToggle compact />
          <Link to="/" aria-label="Rovix AI Home">
            <RovixLogo />
          </Link>
        </div>
      </div>

      {/* Main Form Container */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: MOTION_EASE }}
        className="mx-auto my-auto w-full max-w-[450px] py-6 sm:rounded-[26px] sm:border sm:border-[var(--border-hairline)] sm:bg-[var(--bg-surface)] sm:p-8 sm:shadow-[var(--shadow-soft)]"
      >
        <div className="mb-6">
          <p className="font-display text-xs font-semibold tracking-[0.14em] text-[#7047EB] dark:text-[#8B6BFF] uppercase">
            SEO Intelligence &amp; Automation
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
            {mode === 'forgot-password'
              ? 'Reset Password'
              : tab === 'signin'
                ? 'Welcome Back'
                : 'Create Workspace'}
          </h1>
          <p className="mt-2 text-[14.5px] text-[var(--text-muted)]">
            {mode === 'forgot-password'
              ? 'Enter your work email to request password recovery.'
              : tab === 'signin'
                ? 'Your search intelligence workspace is waiting.'
                : 'Provision a clean, tenant-isolated workspace with real SQLite storage.'}
          </p>
        </div>

        {mode === 'login' && (
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'signin'}
              onClick={() => {
                setTab('signin');
                clearAuthError();
                setFieldErrors({});
              }}
              className={`relative rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'signin'
                  ? 'text-[#7047EB] dark:text-[#C4B5FD]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab === 'signin' && (
                <motion.span
                  layoutId="auth-mode-tab-pill"
                  transition={prefersReducedMotion ? { duration: 0 } : SPRING_PILL}
                  className="absolute inset-0 rounded-lg bg-[var(--bg-surface)] shadow-2xs"
                />
              )}
              <span className="relative z-10">Sign In</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'signup'}
              onClick={() => {
                setTab('signup');
                clearAuthError();
                setFieldErrors({});
              }}
              className={`relative rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'signup'
                  ? 'text-[#7047EB] dark:text-[#C4B5FD]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab === 'signup' && (
                <motion.span
                  layoutId="auth-mode-tab-pill"
                  transition={prefersReducedMotion ? { duration: 0 } : SPRING_PILL}
                  className="absolute inset-0 rounded-lg bg-[var(--bg-surface)] shadow-2xs"
                />
              )}
              <span className="relative z-10">Create Workspace</span>
            </button>
          </div>
        )}

        {/* Strict Local Dev Quick-Fill Notice (Hidden in Production) */}
        {showDevQuickFill && (
          <div className="mb-5 rounded-2xl border border-[#7047EB]/25 bg-[#7047EB]/6 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#7047EB] dark:text-[#A78BFA]">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{authModeLabel}</span>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
              Local Developer Sandbox Accounts (disabled in production). You can
              also register a brand-new tenant workspace on the Create Workspace tab.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fillDevAccount('simon@rovixai.com', 'RovixDemo2026!')}
                className="rounded-lg border border-[#7047EB]/35 bg-[var(--bg-surface)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--text-primary)] hover:border-[#7047EB] hover:text-[#7047EB] dark:hover:text-[#A78BFA] cursor-pointer transition-colors"
              >
                Fill Owner Sandbox (Simon)
              </button>
              <button
                type="button"
                onClick={() => fillDevAccount('maya.qa@rovixai.com', 'RovixQa2026!')}
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--text-secondary)] hover:border-[#7047EB] hover:text-[#7047EB] dark:hover:text-[#A78BFA] cursor-pointer transition-colors"
              >
                Fill QA Sandbox (Maya)
              </button>
            </div>
          </div>
        )}

        {mode === 'login' ? (
          <motion.form
            initial={false}
            animate={
              shaking && !prefersReducedMotion
                ? { x: [0, -5, 5, -3, 3, 0] }
                : { x: 0 }
            }
            transition={{ duration: 0.28 }}
            onSubmit={tab === 'signin' ? handleLoginSubmit : handleSignupSubmit}
            noValidate
            className="space-y-4"
          >
            {tab === 'signup' && (
              <>
                <div>
                  <label
                    htmlFor="signup-name"
                    className="block text-sm font-medium text-[var(--text-primary)]"
                  >
                    Your full name
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="mt-1.5 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:bg-[var(--bg-surface)] focus:outline-none focus:ring-3 focus:ring-[#7047EB]/15"
                  />
                  {fieldErrors.name && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                      {fieldErrors.name}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="signup-workspace"
                      className="block text-sm font-medium text-[var(--text-primary)]"
                    >
                      Workspace name
                    </label>
                    <input
                      id="signup-workspace"
                      type="text"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder="Search Engineering Team"
                      className="mt-1.5 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:bg-[var(--bg-surface)] focus:outline-none focus:ring-3 focus:ring-[#7047EB]/15"
                    />
                    {fieldErrors.workspaceName && (
                      <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                        {fieldErrors.workspaceName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="signup-domain"
                      className="block text-sm font-medium text-[var(--text-primary)]"
                    >
                      Primary domain
                    </label>
                    <input
                      id="signup-domain"
                      type="text"
                      value={primaryDomain}
                      onChange={(e) => setPrimaryDomain(e.target.value)}
                      placeholder="example.com"
                      className="mt-1.5 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:bg-[var(--bg-surface)] focus:outline-none focus:ring-3 focus:ring-[#7047EB]/15"
                    />
                    {fieldErrors.primaryDomain && (
                      <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                        {fieldErrors.primaryDomain}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Email */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-[var(--text-primary)]"
              >
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: null }));
                }}
                placeholder="you@company.com"
                className={`mt-1.5 w-full rounded-xl border px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all duration-150 focus:outline-none focus:ring-3 ${
                  fieldErrors.email
                    ? 'border-rose-400 bg-rose-50/40 dark:bg-rose-950/20 focus:border-rose-500 focus:ring-rose-500/15'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] focus:border-[#7047EB] focus:bg-[var(--bg-surface)] focus:ring-[#7047EB]/15'
                }`}
              />
              {fieldErrors.email && (
                <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-[var(--text-primary)]"
              >
                Password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password)
                      setFieldErrors((p) => ({ ...p, password: null }));
                  }}
                  placeholder={tab === 'signin' ? 'Enter your password' : 'Minimum 8 characters'}
                  className={`w-full rounded-xl border py-2.5 pl-4 pr-11 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all duration-150 focus:outline-none focus:ring-3 ${
                    fieldErrors.password
                      ? 'border-rose-400 bg-rose-50/40 dark:bg-rose-950/20 focus:border-rose-500 focus:ring-rose-500/15'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] focus:border-[#7047EB] focus:bg-[var(--bg-surface)] focus:ring-[#7047EB]/15'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {tab === 'signin' && (
              <div className="flex items-center justify-between pt-1">
                <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border-hairline)] accent-[#7047EB] cursor-pointer"
                  />
                  <span>Remember me (7d session)</span>
                </label>

                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-[#7047EB] dark:text-[#8B6BFF] hover:underline whitespace-nowrap"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            <AnimatePresence>
              {authError && (
                <motion.div
                  role="alert"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-2.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{authError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {loginSucceeded && (
                <motion.div
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-300"
                >
                  <SuccessTransition size={20} />
                  <span>Session verified. Opening Rovix Workspace...</span>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              disabled={isSubmitting || loginSucceeded}
              whileHover={prefersReducedMotion ? undefined : { y: -1 }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
              className="mt-2 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7047EB] to-[#2563EB] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_26px_-8px_rgba(112,71,235,0.48)] hover:shadow-[0_16px_30px_-8px_rgba(112,71,235,0.58)] disabled:opacity-65 cursor-pointer transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>{tab === 'signin' ? 'Verifying session...' : 'Creating workspace...'}</span>
                </>
              ) : (
                <>
                  {tab === 'signup' && <Building2 className="h-4 w-4" aria-hidden="true" />}
                  <span>{tab === 'signin' ? 'Sign In' : 'Create Tenant Workspace'}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </motion.button>
          </motion.form>
        ) : (
          <form onSubmit={handleForgotSubmit} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="reset-email"
                className="block text-sm font-medium text-[var(--text-primary)]"
              >
                Work email address
              </label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="mt-1.5 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#7047EB] focus:bg-[var(--bg-surface)] focus:outline-none focus:ring-3 focus:ring-[#7047EB]/15"
              />
              {fieldErrors.email && (
                <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {resetError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
              >
                {resetError}
              </div>
            )}

            {resetMessage && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                {resetMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={resetLoading}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7047EB] to-[#2563EB] px-5 py-3 text-sm font-semibold text-white cursor-pointer"
            >
              {resetLoading ? 'Processing...' : 'Send Reset Instructions'}
            </button>

            <div className="text-center">
              <Link
                to="/login"
                className="text-sm font-medium text-[#7047EB] dark:text-[#8B6BFF] hover:underline"
              >
                Return to Sign In
              </Link>
            </div>
          </form>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
          <Lock className="h-3.5 w-3.5 text-[#0D9488] dark:text-[#2DD4BF]" aria-hidden="true" />
          <span>HttpOnly HMAC session cookies · Scrypt password hashing</span>
        </div>
      </motion.div>

      {/* Footer Legal Links */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-4 text-xs text-[var(--text-muted)]">
        <span>© {new Date().getFullYear()} Rovix AI</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setLegalNotice(legalNotice === 'terms' ? null : 'terms')}
            className="hover:text-[var(--text-primary)] cursor-pointer"
          >
            Terms of Service
          </button>
          <button
            type="button"
            onClick={() => setLegalNotice(legalNotice === 'privacy' ? null : 'privacy')}
            className="hover:text-[var(--text-primary)] cursor-pointer"
          >
            Privacy Policy
          </button>
        </div>
      </div>

      <AnimatePresence>
        {legalNotice && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2.5 text-xs text-[var(--text-secondary)]"
          >
            {legalNotice === 'terms'
              ? 'Terms of Service: Workspace data is isolated per tenant and governed by RBAC policies and domain ownership verification.'
              : 'Privacy Policy: Passwords are hashed with scrypt. Google OAuth tokens are encrypted at rest with AES-256-GCM and never stored in browser storage.'}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
