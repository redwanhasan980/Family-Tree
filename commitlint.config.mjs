/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Bodies and footers may hold long URLs and Bangla text.
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};

export default config;
