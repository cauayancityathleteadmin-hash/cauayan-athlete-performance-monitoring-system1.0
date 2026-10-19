import "@/styles/globals.css";
import "@/styles/report-print.css";
import { SessionProvider } from "next-auth/react";
import RouteProgress from "@/components/RouteProgress";

export default function App({ Component, pageProps }) {
  return (
    <SessionProvider session={pageProps.session}>
      <RouteProgress />
      <Component {...pageProps} />
    </SessionProvider>
  );
}
