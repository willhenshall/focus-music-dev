import { useState } from 'react';
import { Music } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type AuthFormProps = {
  mode: 'signin' | 'signup';
  onModeChange: (mode: 'signin' | 'signup') => void;
  onSuccess: () => void;
  onLogoClick?: () => void;
};

export function AuthForm({ mode, onModeChange, onSuccess, onLogoClick }: AuthFormProps) {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: authError } = mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password);

      if (authError) {
        setError(authError.message);
      } else {
        onSuccess();
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 h-20 bg-white/80 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex justify-between items-center">
          <div onClick={onLogoClick} className="hover:opacity-80 transition-opacity cursor-pointer">
            <span className="text-2xl text-slate-900"><span className="font-bold">focus</span>.music</span>
          </div>
          <div className="flex gap-3">
            <button className="px-6 py-2 text-slate-700 opacity-0 pointer-events-none">
              Sign In
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4 pt-24">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-slate-900">
              {mode === 'signin' ? 'Welcome Back' : 'Create Your Account'}
            </h2>
            <p className="text-slate-600 mt-2">
              {mode === 'signin'
                ? 'Sign in to access your personalized focus music'
                : 'Start your journey to better focus and productivity'}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Processing...
                </span>
              ) : mode === 'signin' ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => onModeChange(mode === 'signin' ? 'signup' : 'signin')}
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              {mode === 'signin' ? (
                <>
                  Don't have an account? <span className="font-semibold">Sign up</span>
                </>
              ) : (
                <>
                  Already have an account? <span className="font-semibold">Sign in</span>
                </>
              )}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
