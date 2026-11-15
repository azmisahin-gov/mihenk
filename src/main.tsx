import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Uygulama kök alanı bulunamadı.");
}

const MihenkStudio = React.lazy(() => import("./prototype/MihenkStudio"));

const initialView = import.meta.env.VITE_UI_PROTOTYPE === "true"
  ? (
    <React.Suspense fallback={<div role="status" style={{ padding: 24, color: "#52665b" }}>Tasarım önizlemesi açılıyor…</div>}>
      <MihenkStudio />
    </React.Suspense>
  )
  : <App />;

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>{initialView}</React.StrictMode>,
);
