import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@fontsource-variable/dm-sans/opsz.css";
import "@fontsource-variable/dm-sans/opsz-italic.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
