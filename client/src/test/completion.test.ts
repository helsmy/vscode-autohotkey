import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate, CompletionItemKind2String } from './helper';

suite('Should do completion', () => {
	const docUri = getDocUri('completion.ahk');

	test('Completes global symbol', async () => {
		await testCompletion(docUri, new vscode.Position(31-1, 0), {
			items: [
				{ label: 'TestFunc', kind: vscode.CompletionItemKind.Method },
				{ label: 'TestClass', kind: vscode.CompletionItemKind.Class }
			]
		});
	});

	test('Completes scoped symbol',async () => {
		await testCompletion(docUri, new vscode.Position(37-1, 0), {
			items: [
				{ label: 'localVar', kind: vscode.CompletionItemKind.Variable },
				{ label: 'param', kind: vscode.CompletionItemKind.Variable }
			]
		});
	});

	test('Completes suffix symbol',async () => {
		await testCompletion(docUri, new vscode.Position(32-1, 10), {
			items: [
				{ label: 'NestedFunc', kind: vscode.CompletionItemKind.Method }
			]
		});
	});
});

async function testCompletion(
	docUri: vscode.Uri,
	position: vscode.Position,
	expectedCompletionList: vscode.CompletionList
) {
	await activate(docUri);

	// Executing the command `vscode.executeCompletionItemProvider` to simulate triggering completion
	const actualCompletionList = (await vscode.commands.executeCommand(
		'vscode.executeCompletionItemProvider',
		docUri,
		position
	)) as vscode.CompletionList;

	const actualItems = actualCompletionList.items.filter(i => i.kind !== vscode.CompletionItemKind.Snippet);
	assert.ok(actualItems.length >= expectedCompletionList.items.length);
	expectedCompletionList.items.forEach((expectedItem, i) => {
		let actualItem = actualItems.find(i => expectedItem.label === i.label);
		assert.notStrictEqual(actualItem, undefined, `Cannot find expect completion '${expectedItem.label}.'`);
		if (actualItem) 
			assert.strictEqual(
				actualItem.kind,
				expectedItem.kind,
				[
					'Unexpect Completion Kind.',
					`Expect: ${CompletionItemKind2String(expectedItem.kind)}`,
					`Actual: ${CompletionItemKind2String(actualItem.kind)}`
				].join('\n')
			);
	});
}
