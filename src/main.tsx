import React from "react"

import ReactDOM from "react-dom/client"

import "@fontsource-variable/inter"

import App from "./App"
import { AuthProvider } from "./features/auth/AuthContext"
import { MessagingProvider } from "./features/messaging/MessagingContext"

import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <MessagingProvider>
        <App />
      </MessagingProvider>
    </AuthProvider>
  </React.StrictMode>,
)
