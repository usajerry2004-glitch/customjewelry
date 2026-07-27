import { Html, Head, Main, NextScript } from 'next/document';
import { THEME_INIT_SCRIPT } from '../utils/theme';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
