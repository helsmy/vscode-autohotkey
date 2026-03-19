import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, getDocPath, activate } from './helper';

suite('Should do definition', () => {
	const docUri = getDocUri('completion.ahk');
	const includeTestUri = getDocUri('include_test.ahk');

	test('Find global symbol', async () => {
		await testDefinition(docUri, new vscode.Position(32-1, 2), [{
			range: new vscode.Range(
				new vscode.Position(18, 0),
				new vscode.Position(28, 1)
			),
			uri: docUri
		}]);
	});

	test('Find scoped symbol', async () => {
		await testDefinition(docUri, new vscode.Position(36-1, 18), [{
			range: new vscode.Range(
				new vscode.Position(33, 11),
				new vscode.Position(33, 16)
			),
			uri: docUri
		}]);
	});

	test('Find suffix symbol', async () => {
		await testDefinition(docUri, new vscode.Position(40-1, 15), [{
			range: new vscode.Range(
				new vscode.Position(20, 1),
				new vscode.Position(22, 2),
			),
			uri: docUri
		}]);
	});

	test('Find resolved variable suffix symbol', async () => {
		await testDefinition(docUri, new vscode.Position(42-1, 10), [{
			range: new vscode.Range(
				new vscode.Position(20, 1),
				new vscode.Position(22, 2),
			),
			uri: docUri
		}]);
	});

	test('Navigate to #Include file', async () => {
		// Arrange
		const expectedTargetUri = getDocUri('included_lib.ahk');
		// Line 2 has: #Include included_lib.ahk
		// Position on the include path (column 10 is within "included_lib.ahk")
		const position = new vscode.Position(2, 10);

		// Act
		await activate(includeTestUri);
		const actualDefinition = (await vscode.commands.executeCommand(
			'vscode.executeDefinitionProvider',
			includeTestUri,
			position
		)) as vscode.Location[];

		// Assert
		assert.strictEqual(actualDefinition.length, 1, 'Should return exactly one definition');
		assert.strictEqual(
			actualDefinition[0].uri.fsPath,
			expectedTargetUri.fsPath,
			'Should navigate to the included file'
		);
	});

	test('Navigate to #Include file with trailing comment', async () => {
		// Arrange
		const expectedTargetUri = getDocUri('included_lib.ahk');
		// Line 3 has: #Include included_lib.ahk ; with trailing comment
		const position = new vscode.Position(3, 10);

		// Act
		await activate(includeTestUri);
		const actualDefinition = (await vscode.commands.executeCommand(
			'vscode.executeDefinitionProvider',
			includeTestUri,
			position
		)) as vscode.Location[];

		// Assert
		assert.strictEqual(actualDefinition.length, 1, 'Should return exactly one definition');
		assert.strictEqual(
			actualDefinition[0].uri.fsPath,
			expectedTargetUri.fsPath,
			'Should navigate to the included file despite trailing comment'
		);
	});
});

async function testDefinition(
	docUri: vscode.Uri,
	position: vscode.Position,
	expectedDefinition: vscode.Location[]
) {
	await activate(docUri);

	// Executing the command `vscode.executeCompletionItemProvider` to simulate triggering completion
	const actualDefinition = (await vscode.commands.executeCommand(
		'vscode.executeDefinitionProvider',
		docUri,
		position
	)) as vscode.Location[];

	assert.strictEqual(actualDefinition.length, expectedDefinition.length);
	expectedDefinition.forEach((expectedItem, i, self) => {
		if (self.length === 1) {
			assert.ok(expectedItem.range.isEqual(actualDefinition[0].range), 
			[
				'Unexpect Range.',
				`Expect: ${range2String(expectedItem.range)}`,
				`Actual: ${range2String(actualDefinition[0].range)}`
			].join('\n'));
		}
		let actualItem = actualDefinition.find(i => expectedItem.range.isEqual(i.range));
		assert.ok(actualItem);
	});
}

function range2String(r: vscode.Range) {
	return `s: ${r.start.line}|${r.start.character}, e: ${r.end.line}|${r.end.character}`;
}