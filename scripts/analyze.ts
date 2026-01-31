import { join } from "node:path";
import { createAndUploadReport } from "@codecov/bundle-analyzer";

const analyzerOptions = {
  ignorePatterns: ["*.map", "*.d.ts", "*.d.mts", "*.d.cts"],
  normalizeAssetsPattern: "[name]-[hash].js",
};

try {
  const report = await createAndUploadReport(
    [join(import.meta.dirname, "../dist")],
    {
      enableBundleAnalysis: true,
      bundleName: "slimsearch",
      telemetry: false,
      oidc: {
        useGitHubOIDC: true,
      },
    },
    analyzerOptions,
  );

  console.log(`Report successfully generated and uploaded:\n${report}`);
} catch (err) {
  throw new Error("Failed to generate or upload report", { cause: err });
}
