import { defineConfig } from "tsdown";

export default process.env.BENCHMARK
  ? defineConfig({
      entry: "./benchmarks/index.ts",
      outDir: "./benchmarks/dist",
      target: "node22",
      format: "cjs",
      external: ["benchmark", "divinaCommedia"],
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
      target: "node22",
      dts: true,
      platform: "neutral",
      fixedExtension: false,
      minify: true,
      sourcemap: true,
    });
