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

	assert.ok(actualCompletionList.items.length >= 2);
	expectedCompletionList.items.forEach((expectedItem, i) => {
		let actualItem = actualCompletionList.items.find(i => expectedItem.label === i.label);
		assert.notStrictEqual(actualItem, undefined, `Cannot find expect completion '${expectedItem.label}.'`);
		if (actualItem) 
			assert.strictEqual(
				CompletionItemKind2String(actualItem.kind),
				CompletionItemKind2String(expectedItem.kind),
				'Unexpect Completion Kind.'
			);
	});
}
