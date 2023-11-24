import { SharedAxis } from 'material-design-transform';
import React, { Suspense } from 'react';
import { CircularProgress, Theme } from 'rmcw'
import DataManager from './common/DataManager';
import { lazyWithPreload } from "react-lazy-with-preload";
import useWs from './hooks/Ws';
import useVisibility from './hooks/Visibility';
import useDataManager from './hooks/DataManager';

const Content = lazyWithPreload(() => import("./Content"));

function App() {
  const [children, setChildren] = React.useState(undefined as React.ReactNode);
  React.useEffect(() => {
    Content.preload()
      .then(() => {
        setChildren(<Suspense><Content /></Suspense>);
      });
  }, []);
  return (
    <Theme className='full-size' >
      <ConnectionWaiting>
        {children}
      </ConnectionWaiting>
    </Theme>
  )
}

export default App

function ConnectionWaiting({ children }: { children: React.ReactNode }) {
  const ws = useWs();
  const visibility = useVisibility();
  const [connection, data] = useDataManager(ws);

  React.useEffect(() => {
    if (connection !== null && visibility) {
      let sleepUntil = Date.now() + 1000;
      let timer: number;
      const callback = async () => {
        try {
          await connection.get();
        } catch (error) {
          console.error(error);
        }
        if (timer === undefined) return;
        const now = Date.now();
        sleepUntil = Math.max(now, sleepUntil + 1000);
        const timeout = sleepUntil - now;
        timer = window.setTimeout(callback, timeout);
      };
      timer = window.setTimeout(callback, 0);
      return () => {
        window.clearTimeout(timer);
        timer = undefined as unknown as number;
      }
    }
  }, [connection, visibility]);
  const show = connection === null || data === null || children === undefined;

  return (
    <SharedAxis keyId={show ? 0 : 1}
      className='full-size row flex-stretch'>
      {show ?
        <div className='full-size column flex-center'>
          <CircularProgress />
        </div> :
        <DataManager.Context.Provider value={connection}>
          <DataManager.DataContext.Provider value={data}>
            {children}
          </DataManager.DataContext.Provider>
        </DataManager.Context.Provider>}
    </SharedAxis>
  );
}
