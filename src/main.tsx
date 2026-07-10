import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./auth/passwordlessConfig"; // side effect: Passwordless.configure(...) — must run first
import { PasswordlessContextProvider } from "amazon-cognito-passwordless-auth/react";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PasswordlessContextProvider>
      <App />
    </PasswordlessContextProvider>
  </StrictMode>,
);
