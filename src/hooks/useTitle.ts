"use client";

import { useEffect } from "react";

const APP_NAME = "Magick Accounting";

export function useTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${page} | ${APP_NAME}` : APP_NAME;
  }, [page]);
}
