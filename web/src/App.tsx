import { Suspense, lazy, useEffect } from "react";
import { Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import Header, { MobileTabBar } from "./components/Header";
import Footer from "./components/Footer";
import AuthModal, { CompleteProfileModal } from "./components/AuthModal";
import { PageLoader } from "./components/ui";
import Home from "./pages/Home";
import { RequireAuth } from "./pages/Trips";

const ListingPage = lazy(() => import("./pages/ListingPage"));
const Experiences = lazy(() => import("./pages/Experiences"));
const ExperiencePage = lazy(() => import("./pages/ExperiencePage"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Trips = lazy(() => import("./pages/Trips"));
const Wishlists = lazy(() => import("./pages/Wishlists"));
const Messages = lazy(() => import("./pages/Messages"));
const Account = lazy(() => import("./pages/Account"));
const Profile = lazy(() => import("./pages/Account").then((m) => ({ default: m.Profile })));
const Dashboard = lazy(() => import("./pages/hosting/Dashboard"));
const HostListings = lazy(() => import("./pages/hosting/HostListings"));
const ListingEditor = lazy(() => import("./pages/hosting/ListingEditor"));
const Reservations = lazy(() => import("./pages/hosting/Reservations"));
const Earnings = lazy(() => import("./pages/hosting/Earnings"));
const Admin = lazy(() => import("./pages/Admin"));
const Misc = {
  VerifyEmail: lazy(() => import("./pages/Misc").then((m) => ({ default: m.VerifyEmail }))),
  ResetPassword: lazy(() => import("./pages/Misc").then((m) => ({ default: m.ResetPassword }))),
  Login: lazy(() => import("./pages/Misc").then((m) => ({ default: m.LoginPage }))),
  Help: lazy(() => import("./pages/Misc").then((m) => ({ default: m.Help }))),
  NotFound: lazy(() => import("./pages/Misc").then((m) => ({ default: m.NotFound }))),
};
const Legal = {
  About: lazy(() => import("./pages/Legal").then((m) => ({ default: m.About }))),
  Trust: lazy(() => import("./pages/Legal").then((m) => ({ default: m.Trust }))),
  Terms: lazy(() => import("./pages/Legal").then((m) => ({ default: m.Terms }))),
  Privacy: lazy(() => import("./pages/Legal").then((m) => ({ default: m.Privacy }))),
  Cookies: lazy(() => import("./pages/Legal").then((m) => ({ default: m.Cookies }))),
  Security: lazy(() => import("./pages/Legal").then((m) => ({ default: m.Security }))),
  Contact: lazy(() => import("./pages/Legal").then((m) => ({ default: m.Contact }))),
};

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Layout({ footer = true }: { footer?: boolean }) {
  return (
    <>
      <Header />
      <main className="min-h-[70vh] pb-16 md:pb-0">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      {footer && <Footer />}
      <MobileTabBar />
    </>
  );
}

function Hosting() {
  return (
    <RequireAuth>
      <Outlet />
    </RequireAuth>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/rooms/:id" element={<ListingPage />} />
          <Route path="/experiences" element={<Experiences />} />
          <Route path="/experiences/:id" element={<ExperiencePage />} />
          <Route path="/book/:id" element={<Checkout />} />
          <Route path="/trips" element={<Trips />} />
          <Route path="/trips/:id" element={<Trips />} />
          <Route path="/wishlists" element={<Wishlists />} />
          <Route path="/account" element={<Account />} />
          <Route path="/users/:id" element={<Profile />} />
          <Route path="/verify-email" element={<Misc.VerifyEmail />} />
          <Route path="/reset-password" element={<Misc.ResetPassword />} />
          <Route path="/login" element={<Misc.Login />} />
          <Route path="/help" element={<Misc.Help />} />
          <Route path="/about" element={<Legal.About />} />
          <Route path="/trust" element={<Legal.Trust />} />
          <Route path="/terms" element={<Legal.Terms />} />
          <Route path="/privacy" element={<Legal.Privacy />} />
          <Route path="/cookies" element={<Legal.Cookies />} />
          <Route path="/security" element={<Legal.Security />} />
          <Route path="/contact" element={<Legal.Contact />} />
          <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
          <Route path="/hosting" element={<Hosting />}>
            <Route index element={<Dashboard />} />
            <Route path="listings" element={<HostListings />} />
            <Route path="listings/new" element={<ListingEditor />} />
            <Route path="experiences/new" element={<ListingEditor kind="experience" />} />
            <Route path="listings/:id/edit" element={<ListingEditor />} />
            <Route path="reservations" element={<Reservations />} />
            <Route path="reservations/:id" element={<Reservations />} />
            <Route path="earnings" element={<Earnings />} />
          </Route>
          <Route path="*" element={<Misc.NotFound />} />
        </Route>
        <Route element={<Layout footer={false} />}>
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:id" element={<Messages />} />
        </Route>
      </Routes>
      <AuthModal />
      <CompleteProfileModal />
      <Toaster position="bottom-left" theme="dark" toastOptions={{ className: "!rounded-xl !border-white/10 !bg-surface-2 !font-sans !text-ink" }} />
    </>
  );
}
