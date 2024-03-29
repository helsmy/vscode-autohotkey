import * as path from 'path';
import Mocha = require('mocha');
import * as glob from 'glob';

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
	});
	// mocha.useColors(true);
	mocha.timeout(100000);

	const testsRoot = __dirname;

	return new Promise(async (resolve, reject) => {
		try {
			const files =  await glob.glob('**.test.js', { cwd: testsRoot });
			// Add files to the test suite
			files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

			try {
				// Run the mocha test
				mocha.run(failures => {
					if (failures > 0) {
						reject(new Error(`${failures} tests failed.`));
					} else {
						resolve();
					}
				});
			} catch (err) {
				console.error(err);
				reject(err);
			}
		} catch (error) {
			return reject(error);
		}
	});
}