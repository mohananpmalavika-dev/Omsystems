import type { AppProps } from "next/app";
import "@/app/globals.css";
import { AppLayout } from "@/components/app-layout";

export default function PagesApp({ Component, pageProps }: AppProps) {
  return <AppLayout><Component {...pageProps} /></AppLayout>;
}
