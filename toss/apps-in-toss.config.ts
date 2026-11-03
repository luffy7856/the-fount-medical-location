import { defineConfig } from "@apps-in-toss/web-framework/config";

/* 병원 입지분석 on 앱인토스. appName must be exactly the name registered in the 앱인토스 console. */
export default defineConfig({
  appName: "thefount-location",
  brand: { primaryColor: "#0F937D" },
  permissions: [],
  navigationBar: { withBackButton: true, withHomeButton: true, theme: "light" },
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: "never",
    allowsBackForwardNavigationGestures: false,
  },
  webBundleDir: "dist",
});
