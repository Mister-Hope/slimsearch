import esbuild from "rollup-plugin-esbuild";
import dts from "rollup-plugin-dts";
import { type RollupOptions } from "rollup";

const isProduction = process.env["NODE_ENV"] === "production";

interface BundleOptions {
  input: string;
  output?: string;
  target?: string;
}

const bundle = ({
  input,
  output = input,
  target = "node16",
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
      // FIXME: This is an issue of ts NodeNext
      (esbuild as unknown as typeof esbuild.default)({
        charset: "utf8",
        minify: isProduction,
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

export default [
  ...bundle({ input: "index" }),
  ...bundle({ input: "SearchableMap/SearchableMap", output: "SearchableMap" }),
];
