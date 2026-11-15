import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import MihenkStudio from "./prototype/MihenkStudio";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Uygulama kök alanı bulunamadı.");
}

const initialView = import.meta.env.VITE_UI_PROTOTYPE === "true"
  ? <MihenkStudio />
  : <App />;

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>{initialView}</React.StrictMode>,
);
