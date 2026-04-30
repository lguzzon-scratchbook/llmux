#!/usr/bin/env bun
/**
 * Build script for creating native executables using Bun's --compile feature
 * Supports local builds for current platform and CI builds for specified targets
 */

import { platform, arch } from "node:os";
import { parseArgs } from "node:util";

interface BuildOptions {
  target?: string;
  output?: string;
  verbose?: boolean;
}

const VALID_TARGETS = [
  "bun-darwin-x64",
  "bun-darwin-arm64",
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-windows-x64",
];

function getTargetPlatform(): string {
  const plat = platform();
  const architecture = arch();

  // Map Node.js platform names to Bun target names
  const platformMap: Record<string, string> = {
    darwin: "darwin",
    linux: "linux",
    win32: "windows",
  };

  const archMap: Record<string, string> = {
    x64: "x64",
    arm64: "arm64",
  };

  const mappedPlatform = platformMap[plat];
  const mappedArch = archMap[architecture];

  if (!mappedPlatform || !mappedArch) {
    throw new Error(`Unsupported platform/architecture: ${plat}-${architecture}`);
  }

  return `bun-${mappedPlatform}-${mappedArch}`;
}

async function getVersion(): Promise<string> {
  try {
    const pkgContent = await Bun.file("package.json").text();
    const pkg = JSON.parse(pkgContent);
    return pkg.version || "0.0.0";
  } catch (error) {
    console.warn("Failed to read package.json version, using '0.0.0'");
    return "0.0.0";
  }
}

function validateTarget(target: string): void {
  if (!VALID_TARGETS.includes(target)) {
    throw new Error(
      `Invalid target: ${target}\nValid targets: ${VALID_TARGETS.join(", ")}`
    );
  }
}

async function buildBinary(options: BuildOptions): Promise<void> {
  const target = options.target || getTargetPlatform();
  const version = await getVersion();

  validateTarget(target);

  // Extract platform from target (e.g., "bun-darwin-arm64" -> "darwin-arm64")
  const platformSuffix = target.replace("bun-", "");

  // Determine output filename
  const isWindows = platformSuffix.startsWith("windows");
  const extension = isWindows ? ".exe" : "";
  const defaultOutput = `dist/llmux-v${version}-${platformSuffix}${extension}`;
  const outputFile = options.output || defaultOutput;

  console.log(`Building llmux v${version} for ${target}...`);
  console.log(`Output: ${outputFile}`);

  // Ensure dist directory exists
  await Bun.$`mkdir -p dist`;

  // Run bun build --compile
  const buildArgs = [
    "build",
    "--compile",
    `--target=${target}`,
    "src/index.ts",
    `--outfile=${outputFile}`,
  ];

  if (options.verbose) {
    console.log(`Running: bun ${buildArgs.join(" ")}`);
  }

  const result = await Bun.spawn({
    cmd: ["bun", ...buildArgs],
    stdout: options.verbose ? "inherit" : "pipe",
    stderr: options.verbose ? "inherit" : "pipe",
  });

  const exitCode = await result.exited;

  if (exitCode !== 0) {
    throw new Error(`Build failed with exit code ${exitCode}`);
  }

  // Verify the binary was created
  const outputInfo = await Bun.file(outputFile).stat();
  const sizeInMB = (outputInfo.size / 1024 / 1024).toFixed(2);

  console.log(`✓ Build successful: ${outputFile} (${sizeInMB} MB)`);
}

function printUsage(): void {
  console.log(`
Usage: bun run scripts/build.ts [options]

Options:
  --target <target>    Target platform (default: current platform)
  --output <path>      Output file path (default: dist/llmux-v<version>-<platform>)
  --verbose            Show verbose output
  --help               Show this help message

Valid targets:
${VALID_TARGETS.map((t) => `  ${t}`).join("\n")}

Examples:
  # Build for current platform
  bun run scripts/build.ts

  # Build for specific target
  bun run scripts/build.ts --target bun-linux-x64

  # Custom output path
  bun run scripts/build.ts --output ./my-binary
`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      target: { type: "string" },
      output: { type: "string" },
      verbose: { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  try {
    await buildBinary({
      target: values.target,
      output: values.output,
      verbose: values.verbose,
    });
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
