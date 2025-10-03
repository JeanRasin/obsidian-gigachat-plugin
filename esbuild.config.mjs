import esbuild from "esbuild";
import process from "process";

const build = async () => {
	const context = await esbuild.context({
		entryPoints: ["main.ts"],
		bundle: true,
		external: ["obsidian"],
		format: "cjs",
		target: "es2018",
		logLevel: "info",
		sourcemap: false,
		outfile: "main.js",
	});

	if (process.argv.includes("--watch")) {
		await context.watch();
	} else {
		await context.rebuild();
		await context.dispose();
	}
};

build();
