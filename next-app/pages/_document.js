import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#041f18" />
        <link rel="icon" type="image/png" href="/sports_logo.png" />
        <link rel="apple-touch-icon" href="/sports_logo.png" />
        <link rel="icon" href="/sports_logo.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}