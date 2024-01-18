import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate, To0BasedPostion, AHKMarkdownString } from './helper';

suite('Should do hover', () => {
	const docUri = getDocUri('hover.ahk');

	test('Find global function hover', async () => {
		await testHover(docUri, To0BasedPostion(7, 3), 
			new vscode.Hover(
				AHKMarkdownString('(function) FuncHover(a, b, c)')
			)
		);
	});

	test('Find global class hover', async () => {
		await testHover(docUri, To0BasedPostion(9, 3), 
			new vscode.Hover(
				AHKMarkdownString('(class) TestClass')
			)
		);
	});

	test('Find global class __New hover', async () => {
		await testHover(docUri, To0BasedPostion(11, 18), 
			new vscode.Hover(
				AHKMarkdownString('(method) TestClass.__New()')
			)
		);
	});

	test('Find global class method hover', async () => {
		await testHover(docUri, To0BasedPostion(12, 14), 
			new vscode.Hover(
				AHKMarkdownString('(method) TestClass.NestedFunc()')
			)
		);
	});

	test('Find array express hover', async () => {
		await testHover(docUri, To0BasedPostion(14, 12), 
			new vscode.Hover(
				AHKMarkdownString('(varible) hover')
			)
		);
	});

	test('Find dict express hover', async () => {
		await testHover(docUri, To0BasedPostion(15, 18), 
			new vscode.Hover(
				AHKMarkdownString('(varible) arr')
			)
		);
	});

	test('Find deep express hover', async () => {
		await testHover(docUri, To0BasedPostion(16, 30), 
			new vscode.Hover(
				AHKMarkdownString('(varible) hover')
			)
		);
	});
	
	test('Find express list hover', async () => {
		await testHover(docUri, To0BasedPostion(17, 16), 
			new vscode.Hover(
				AHKMarkdownString('(varible) hover')
			)
		);
	});
});

async function testHover(
	docUri: vscode.Uri,
	position: vscode.Position,
	expectedHover: vscode.Hover
) {
	await activate(docUri);

	// Executing the command `vscode.executeCompletionItemProvider` to simulate triggering completion
	const actualHover = (await vscode.commands.executeCommand(
		'vscode.executeHoverProvider',
		docUri,
		position
	)) as vscode.Hover[];

	assert.ok(actualHover.length >= 1, 'Hover less than 1');
	assert.deepStrictEqual(actualHover[0].contents, expectedHover.contents);
}