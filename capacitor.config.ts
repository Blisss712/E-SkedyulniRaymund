import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.eskedyul.app",

  appName: "E-Skedyul",

  webDir: "dist",

  backgroundColor: "#F4F6FB",

  plugins: {
    SystemBars: {
      insetsHandling: "css",

      initialViewportFitValueHint: "cover",
    },
  },
}

export default config
