import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import PipePage from "./pages/PipePage";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Receipt from "./pages/Receipt";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsers from "./pages/AdminUsers";
import NyttPassord from "./pages/NyttPassord";
import Konto from "./pages/Konto";
import Projects from "./pages/Projects";
import ProjectPage from "./pages/ProjectPage";
import ProjectRequest from "./pages/ProjectRequest";
import ProjectReceipt from "./pages/ProjectReceipt";
import Personvern from "./pages/Personvern";
import Vilkar from "./pages/Vilkar";
import PickupShop from "./pages/PickupShop";
import PickupCheckout from "./pages/PickupCheckout";
import PickupOrder from "./pages/PickupOrder";
import NotFound from "./pages/NotFound";
import { InstallPrompt } from "@/components/InstallPrompt";
import { SetupBanner } from "@/components/SetupBanner";
import { SideTittel } from "@/components/SideTittel";
import { FeilGrense } from "@/components/FeilGrense";
import { BreiddVakt } from "@/components/BreiddVakt";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Lageret endrar seg medan folk står i hylla; ei kort ferskvare-tid gir
      // rett beholdning utan å hamre databasen ved kvar navigering.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    {/* attribute="class" fordi tailwind.config.ts har darkMode: ["class"] */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SideTittel />
          <FeilGrense>
          <Routes>
            <Route path="/" element={<Index />} />
            {/* Måladressa for QR-kodane på hyllene */}
            <Route path="/r/:slug" element={<PipePage />} />
            <Route path="/vare/:slug" element={<PipePage />} />
            <Route path="/kurv" element={<Cart />} />
            <Route path="/kasse" element={<Checkout />} />
            <Route path="/kvittering" element={<Receipt />} />
            <Route path="/personvern" element={<Personvern />} />
            <Route path="/vilkar" element={<Vilkar />} />
            {/* Bestilling til henting: butikken, kassen og kvitteringa */}
            <Route path="/bestill" element={<PickupShop />} />
            <Route path="/bestill/kasse" element={<PickupCheckout />} />
            <Route path="/bestilling/:id" element={<PickupOrder />} />
            <Route path="/login" element={<AdminLogin />} />
            <Route path="/nytt-passord" element={<NyttPassord />} />
            <Route path="/konto" element={<Konto />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/brukere" element={<AdminUsers />} />
            {/* Byggjeplassen: melde behov og kvittere for mottak */}
            <Route path="/prosjekt" element={<Projects />} />
            <Route path="/prosjekt/:id" element={<ProjectPage />} />
            <Route path="/prosjekt/:id/behov" element={<ProjectRequest />} />
            <Route path="/prosjekt/:id/mottak/:ordreId" element={<ProjectReceipt />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </FeilGrense>
          {/* Ligg utanfor Routes, så dei overlever navigering mellom sidene */}
          <InstallPrompt />
          <SetupBanner />
          <BreiddVakt />
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
