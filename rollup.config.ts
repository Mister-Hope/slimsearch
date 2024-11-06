import type { RollupOptions } from "rollup";
import { dts } from "rollup-plugin-dts";
import esbuild from "rollup-plugin-esbuild";

interface BundleOptions {
  input: string;
  output?: string;
  target?: string;
}

const bundle = ({
  input,
  output = input,
  target = "node18",
}: BundleOptions): RollupOptions[] => [
  {
    input: `./src/${input}.ts`,
    output: [
      {
        file: `./dist/${output}.mjs`,
        format: "esm",
        sourcemap: true,
        exports: "named",
      },
      {
        file: `./dist/${output}.cjs`,
        format: "cjs",
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
    ],

    treeshake: "smallest",
  },
  {
    input: `./src/${input}.ts`,
    output: [
      {
        file: `./dist/${output}.d.ts`,
        format: "esm",
      },
      {
        file: `./dist/${output}.d.cts`,
        format: "esm",
      },
      {
        file: `./dist/${output}.d.mts`,
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
  } as RollupOptions,
];

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
