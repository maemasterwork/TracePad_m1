// Auth pages are plain imports for now; this indirection lets them become route-level chunks without touching App.
import { Reset, SignIn, SignUp, UpdatePassword } from './AuthPages';
export const AuthPagesLazy = { SignIn, SignUp, Reset, UpdatePassword };
