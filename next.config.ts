import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  devIndicators: false,
  serverExternalPackages: ["pdfkit"],
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
