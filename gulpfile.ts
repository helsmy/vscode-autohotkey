import * as esbuild from 'esbuild';
import * as gulp from 'gulp';
import * as glob from 'glob';
import { syntaxGen } from './syntaxes/syntaxGen';
import { esbuildDecorators } from 'esbuild-decorators';

const defaultOption: esbuild.BuildOptions = {
	platform: 'node',
	format: 'cjs',
};


const serverDevOption: esbuild.BuildOptions = {
	...defaultOption,
	entryPoints: glob.sync('./server/src/**/*.ts'),
	outdir: './server/out',
	sourcemap: true
};

const clientDevOption: esbuild.BuildOptions = {
	...defaultOption,
	entryPoints: glob.sync('./client/src/**/*.ts'),
	outdir: './client/out',
	sourcemap: true
};

const serverOption: esbuild.BuildOptions = {
	...defaultOption,
	entryPoints: ['./server/src/server.ts'],
	outdir: './server/out',
	sourcesContent: false,
	bundle: true,
	external: ['vscode'],
	minifyWhitespace: true,
	treeShaking: true
};

const clientOption: esbuild.BuildOptions = {
	...defaultOption,
	entryPoints: ['./client/src/extension.ts'],
	outfile: './client/out/extension.js',
	bundle: true,
	external: ['vscode'],
	minify: true,
	treeShaking: true
};

function OptionsWithDecorator(options: esbuild.BuildOptions): esbuild.BuildOptions {
	return {
		...options,
		plugins: [
			esbuildDecorators({force: true})
		]
	}
}

async function watchServer() {
	const ctx = await esbuild.context(OptionsWithDecorator(serverDevOption));
	await ctx.watch();
}

async function watchClient() {
	const ctx = await esbuild.context(clientDevOption);
	await ctx.watch();
}

const buildServer = async () => await esbuild.build(OptionsWithDecorator(serverOption));
const buildClient = async () => await esbuild.build(clientOption)

export const watch = gulp.parallel(watchServer, watchClient);
export const build = gulp.series(
	buildServer,
	buildClient,
);

gulp.task('buildAllWithMap', async (done) => {
	try {
		await esbuild.build(OptionsWithDecorator(serverDevOption));
		await esbuild.build(clientDevOption);
	} catch (error) {
		done(error);
		return;
	}
	done();
});

gulp.task('syntax_gen', done => {
	syntaxGen();
	done();
})