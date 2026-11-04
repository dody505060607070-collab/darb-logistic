import { createContext, type Context } from 'react';
import type { AuthState } from './auth';

// Preserve the context identity when Vite replaces the provider/hook module.
// This stores only the React context object, never a session or credentials.
const hotContext = import.meta.hot?.data['darbAuthContext'] as Context<AuthState | null> | undefined;
export const AuthContext = hotContext ?? createContext<AuthState | null>(null);
if (import.meta.hot) import.meta.hot.data['darbAuthContext'] = AuthContext;