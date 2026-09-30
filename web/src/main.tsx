import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { CurrencyProvider } from "./lib/currency";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => count < 2 && !(err as { status?: number })?.status?.toString().startsWith("4"),
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <CurrencyProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </CurrencyProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
