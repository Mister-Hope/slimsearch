import { codecovRollupPlugin } from "@codecov/rollup-plugin";
import { defineConfig } from "tsdown";

export default process.env.BENCHMARK
  ? defineConfig({
      entry: "./benchmarks/index.ts",
      outDir: "./benchmarks/dist",
      target: "node20",
      format: "cjs",
      external: ["benchmark", "divinaCommedia"],
      plugins: [
        codecovRollupPlugin({
          enableBundleAnalysis: Boolean(process.env.CODECOV_TOKEN),
          bundleName: "slimsearch",
          uploadToken: process.env.CODECOV_TOKEN,
        }),
      ],
      platform: "neutral",
      fixedExtension: false,
      minify: true,
    })
  : defineConfig({
      entry: {
        index: "./src/index.ts",
        SearchableMap: "./src/SearchableMap/index.ts",
      },
      outDir: "./dist",
      target: "node20",
      dts: true,
      plugins: [
        codecovRollupPlugin({
          enableBundleAnalysis: Boolean(process.env.CODECOV_TOKEN),
          bundleName: "slimsearch",
          uploadToken: process.env.CODECOV_TOKEN,
        }),
      ],
      platform: "neutral",
      fixedExtension: false,
      minify: true,
      sourcemap: true,
    });
