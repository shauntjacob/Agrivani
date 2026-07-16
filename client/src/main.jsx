import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Homepage from './routes/Homepage/Homepage.jsx'
import DashboardPage from './routes/DashboardPage/DashboardPage.jsx'
import ChatPage from './routes/ChatPage/ChatPage.jsx'
import RootLayout from './layout/rootLayout/RootLayout.jsx'
import DashboardLayout from './layout/dashboardLayout/DashboardLayout.jsx'
import SignInPage from './routes/SignInPage/SignInPage.jsx'
import SignUpPage from './routes/SignUpPage/SignUpPage.jsx'
import ExplorePage from './routes/ExplorePage/ExplorePage.jsx'; // Adjust path if needed
import PricesPage from './routes/pricesPage/PricesPage.jsx';
import ContactPage from './routes/ContactPage/ContactPage.jsx';
import ProfileSetupChatPage from './routes/ProfileSetupChatPage/ProfileSetupChatPage.jsx';
import ProfilePage from './routes/ProfilePage/ProfilePage.jsx';
import SettingsPage from './routes/SettingsPage/SettingsPage.jsx';


const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: "/", element: <Homepage />
      },
      {
        path: "/sign-in/*", element: <SignInPage />
      },
      {
        path: "/sign-up/*", element: <SignUpPage />
      },
      {
        element: <DashboardLayout />,
        children: [
          {
            path: "/dashboard",
            element: <DashboardPage />
          },
          {
            path: "/dashboard/profile-setup-chat",
            element: <ProfileSetupChatPage />,
          },
          { path: "/dashboard/profile", element: <ProfilePage /> },
          { path: "/dashboard/settings", element: <SettingsPage /> },
          {
            path: "/dashboard/chats/:id",
            element: <ChatPage />
          },
          {
            path: "/dashboard/prices",
            element: <PricesPage />,
          },
          {
            path: "/dashboard/contact",
            element: <ContactPage />,
          },
        ]
      }
    ],
  },
]);

createRoot(document.getElementById('root')).render(
  // <StrictMode>
  <RouterProvider router={router} />
  //</StrictMode>,
)