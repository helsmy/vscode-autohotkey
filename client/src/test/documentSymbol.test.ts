import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate, symbolKind2String } from './helper';

class PartialSymbol {
	constructor(
		public name: string,
		public kind: vscode.SymbolKind,
		public children: PartialSymbol[] = []
	) {}
}

suite('Should do document symbol', () => {

	test('Symbols on completion.ahk', async () => {
		const docUri = getDocUri('completion.ahk');
		
		await testOutline(docUri, [
			new PartialSymbol('TestFunc', vscode.SymbolKind.Method),
			new PartialSymbol('TestClass', vscode.SymbolKind.Class, [
				new PartialSymbol('__New', vscode.SymbolKind.Method, [
					new PartialSymbol('p', vscode.SymbolKind.Property),
				]),
				new PartialSymbol('NestedFunc', vscode.SymbolKind.Method),
			]),
			new PartialSymbol('ScopedFunc', vscode.SymbolKind.Method),
			new PartialSymbol('localVar', vscode.SymbolKind.Variable),
			new PartialSymbol('aTest', vscode.SymbolKind.Variable),
		]);
	});
});

async function testOutline(
	docUri: vscode.Uri,
	expectedSymbolList: Array<PartialSymbol>
) {
	await activate(docUri);

	// Executing the command `vscode.executeCompletionItemProvider` to simulate triggering completion
	const actualSymbolList = (await vscode.commands.executeCommand(
		'vscode.executeDocumentSymbolProvider',
		docUri
	)) as vscode.DocumentSymbol[];

	compareSymbol(actualSymbolList, expectedSymbolList);
}

function compareSymbol(actualSymbolList: vscode.DocumentSymbol[], expectedSymbolList: PartialSymbol[]) {
	assert.strictEqual(actualSymbolList.length, expectedSymbolList.length);
	expectedSymbolList.forEach((expectedSymbol, i) => {
		const actualItem = actualSymbolList.find(i => expectedSymbol.name === i.name);
		assert.notStrictEqual(actualItem, undefined, `Cannot find expect completion '${expectedSymbol.name}.'`);
		if (actualItem) {
			assert.strictEqual(
				actualItem.kind,
				expectedSymbol.kind,
				[
					'Unexpect Symbol Kind.',
					`Expect: ${symbolKind2String(expectedSymbol.kind)}`,
					`Actual: ${symbolKind2String(actualItem.kind)}`
				].join('\n')
			);
		if (expectedSymbol.children.length > 0)
			compareSymbol(actualItem.children, expectedSymbol.children);
		}
	});
}

