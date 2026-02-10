"use client";

import { useEffect, useState } from "react";

export type ThemePreference = "dark" | "light";

const getInitialTheme = (): ThemePreference => {
  if (typeof window === "undefined") return "dark";
  const storedTheme = window.localStorage.getItem("gc.theme");
  const prefersLight =
    window.matchMedia?.("(prefers-color-scheme: light)").matches ?? false;

  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return prefersLight ? "light" : "dark";
};

export const useThemePreference = () => {
  const [theme, setTheme] = useState<ThemePreference>(() => getInitialTheme());

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("gc.theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  return { theme, setTheme, toggleTheme };
};

