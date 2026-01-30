import { codecovRollupPlugin } from "@codecov/rollup-plugin";
import type { RollupOptions } from "rollup";
import { defineConfig } from "rollup";
import { dts } from "rollup-plugin-dts";
import esbuild from "rollup-plugin-esbuild";

interface BundleOptions {
  input: string;
  output?: string;
  target?: string;
}

const bundle = ({ input, output = input, target = "node18" }: BundleOptions): RollupOptions[] =>
  defineConfig([
    {
      input: `./src/${input}.ts`,
      output: [
        {
          file: `./dist/${output}.js`,
          format: "esm",
          sourcemap: true,
          exports: "named",
        },
      ],

      plugins: [
        esbuild({
          charset: "utf8",
          minify: true,
          target,
        }),
        codecovRollupPlugin({
          enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
          bundleName: "slimsearch",
          uploadToken: process.env.CODECOV_TOKEN,
        }),
      ],

      treeshake: "smallest",
    },
    defineConfig({
      input: `./src/${input}.ts`,
      output: [
        {
          file: `./dist/${output}.d.ts`,
          format: "esm",
        },
      ],
      plugins: [
        dts({
          compilerOptions: {
            preserveSymlinks: false,
          },
        }),
      ],
    }),
  ]);

export default process.env.BENCHMARK
  ? bundle({
      input: "../benchmarks/index",
      output: "../benchmarks/dist/index",
    })
  : [
      ...bundle({ input: "index" }),
      ...bundle({
        input: "SearchableMap/index",
        output: "SearchableMap",
      }),
    ];
