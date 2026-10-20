import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { I18nProvider } from './i18n';
import { Home } from './pages/Home';
import { AuthPagesLazy } from './pages/lazy';
import { Layout } from './pages/Layout';
import { LessonPage } from './pages/LessonPage';
import { NotFound } from './pages/NotFound';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { RunnerProvider } from './runner/RunnerProvider';

export function App() {
  const { SignIn, SignUp, Reset, UpdatePassword } = AuthPagesLazy;
  return (
    <I18nProvider>
      <AuthProvider>
        <RunnerProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="lesson/:lessonId" element={<LessonPage />} />
                <Route path="lesson/:lessonId/:chapterId" element={<LessonPage />} />
                <Route path="signin" element={<SignIn />} />
                <Route path="signup" element={<SignUp />} />
                <Route path="reset" element={<Reset />} />
                <Route path="auth/update-password" element={<UpdatePassword />} />
                <Route path="account" element={<Profile />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </RunnerProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
