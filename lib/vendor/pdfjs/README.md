# Vendored PDF.js

Mozilla PDF.js **4.10.38** (`legacy/build`), Apache-2.0.

Copied from `pdfjs-dist` so CloudTAK’s image build does not need a host `pdfjs-dist` dependency. See `LICENSE` in this directory.

Both `.mjs` files start with `/* eslint-disable */` because CloudTAK’s API image runs `eslint ./plugins/` and would otherwise treat this third-party bundle as first-party source.
