import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import WireframePrototype from "./prototype/WireframePrototype";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Uygulama kök alanı bulunamadı.");
}

const initialView = import.meta.env.VITE_UI_PROTOTYPE === "true"
  ? <WireframePrototype />
  : <App />;

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>{initialView}</React.StrictMode>,
);
