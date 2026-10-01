"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";

/** Counts one view of `slug` per page load; renders nothing. */
export function ViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    void api.view(slug);
  }, [slug]);
  return null;
}
