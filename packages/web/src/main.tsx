import './i18n/config';
import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthWithUserpool from './components/AuthWithUserpool';
import AuthWithSAML from './components/AuthWithSAML';
import './index.css';
import {
  RouterProvider,
  createBrowserRouter,
  RouteObject,
} from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Setting from './pages/Setting';
import StatPage from './pages/StatPage.tsx';
import ChatPage from './pages/ChatPage';
import SharedChatPage from './pages/SharedChatPage';
import SummarizePage from './pages/SummarizePage';
import GenerateTextPage from './pages/GenerateTextPage';
import TranslatePage from './pages/TranslatePage';
import NotFound from './pages/NotFound';
import { MODELS } from './hooks/useModel';
import { Authenticator } from '@aws-amplify/ui-react';
import App from './App.tsx';
import WriterPage from './pages/WriterPage.tsx';
import useUseCases from './hooks/useUseCases';
import { Toaster } from 'sonner';

const samlAuthEnabled: boolean =
  import.meta.env.VITE_APP_SAMLAUTH_ENABLED === 'true';
const {
  visionEnabled,
} = MODELS;
// eslint-disable-next-line  react-hooks/rules-of-hooks
const { enabled } = useUseCases();

const routes: RouteObject[] = [
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/setting',
    element: <Setting />,
  },
  {
    path: '/stats',
    element: <StatPage />,
  },
  {
    path: '/chat',
    element: <ChatPage />,
  },
  {
    path: '/chat/:chatId',
    element: <ChatPage />,
  },
  {
    path: '/share/:shareId',
    element: <SharedChatPage />,
  },
  enabled('generate')
    ? {
        path: '/generate',
        element: <GenerateTextPage />,
      }
    : null,
  enabled('summarize')
    ? {
        path: '/summarize',
        element: <SummarizePage />,
      }
    : null,
  enabled('writer')
    ? {
        path: '/writer',
        element: <WriterPage />,
      }
    : null,
  enabled('translate')
    ? {
        path: '/translate',
        element: <TranslatePage />,
      }
    : null,
  {
    path: '*',
    element: <NotFound />,
  },
].flatMap((r) => (r !== null ? [r] : []));


const router = createBrowserRouter([
  {
    path: '/',
    element: samlAuthEnabled ? (
      <AuthWithSAML>
        <App />
      </AuthWithSAML>
    ) : (
      <AuthWithUserpool>
        <App />
      </AuthWithUserpool>
    ),
    children: routes,
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* eslint-disable-next-line @shopify/jsx-no-hardcoded-content */}
    <React.Suspense fallback={<div>Loading...</div>}>
      <Authenticator.Provider>
        <RouterProvider router={router} />
        <Toaster />
      </Authenticator.Provider>
    </React.Suspense>
  </React.StrictMode>
);
