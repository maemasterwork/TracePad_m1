import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { PyRunner, type EngineStatus } from './client';

const Ctx = createContext<PyRunner | null>(null);

/** One Python worker per signed-in user (their files live on that user's virtual disk). Created lazily on first Run. */
export function RunnerProvider({ children }: { children: ReactNode }) {
  const { userKey } = useAuth();
  const runner = useMemo(() => new PyRunner({ userKey }), [userKey]);
  useEffect(() => () => runner.dispose(), [runner]);
  return <Ctx.Provider value={runner}>{children}</Ctx.Provider>;
}

export function useRunner(): PyRunner {
  const r = useContext(Ctx);
  if (!r) throw new Error('useRunner must be used inside <RunnerProvider>');
  return r;
}

export function useEngineStatus(runner: PyRunner): EngineStatus {
  const [s, setS] = useState(runner.getStatus());
  useEffect(() => { setS(runner.getStatus()); return runner.subscribe(setS); }, [runner]);
  return s;
}
