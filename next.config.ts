import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  devIndicators: false,
  // firebase-admin pulls in jwks-rsa → jose@6 (ESM-only). Turbopack's default
  // externalization require()s it with a shim that throws ERR_REQUIRE_ESM on
  // Vercel's serverless runtime, 500-ing every route that touches adminAuth
  // (i.e. all of them, via requireUser). Listing it here routes loading through
  // Node's native require, which handles the ESM dep correctly on Node 22+.
  serverExternalPackages: ["pdfkit", "firebase-admin"],
  // SAP UI5 Web Components ship modern ESM + constructable stylesheets that
  // Next must transpile through its own pipeline (App Router + Turbopack).
  // Without this the @ui5/* packages fail to load in RSC/build.
  transpilePackages: [
    "@ui5/webcomponents",
    "@ui5/webcomponents-base",
    "@ui5/webcomponents-react",
    "@ui5/webcomponents-react-base",
    "@ui5/webcomponents-fiori",
    "@ui5/webcomponents-icons",
    "@ui5/webcomponents-theming",
    "@ui5/webcomponents-localization",
  ],
};

export default nextConfig;
