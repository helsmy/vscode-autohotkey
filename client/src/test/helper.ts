/* --------------------------------------------------------------------------------------------
 * Modifed from Microsoft lsp-simple, MIT Lisence
 * Test utility functions
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as path from 'path';

export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;
export let documentEol: string;
export let platformEol: string;

/**
 * Activates the autohotkey simple support extension
 */
export async function activate(docUri: vscode.Uri) {
	// The extensionId is `publisher.name` from package.json
	const ext = vscode.extensions.getExtension('Helsmy.ahk-simple-ls')!;
	await ext.activate();
	try {
		doc = await vscode.workspace.openTextDocument(docUri);
		editor = await vscode.window.showTextDocument(doc);
		await sleep(2000); // Wait for server activation
	} catch (e) {
		console.error(e);
	}
}

async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export const getDocPath = (p: string) => {
	return path.resolve(__dirname, '../../testFixture', p);
};
export const getDocUri = (p: string) => {
	return vscode.Uri.file(getDocPath(p));
};

export async function setTestContent(content: string): Promise<boolean> {
	const all = new vscode.Range(
		doc.positionAt(0),
		doc.positionAt(doc.getText().length)
	);
	return editor.edit(eb => eb.replace(all, content));
}

export const CompletionItemKind2String = (kind: vscode.CompletionItemKind | undefined) => {
	return kind !== undefined ? vscode.CompletionItemKind[kind] : undefined;
}

export const symbolKind2String = (kind: vscode.SymbolKind | undefined) => {
	return kind !== undefined ? vscode.SymbolKind[kind] : undefined;
}

/**
 * Gen a 0 based position from 1 based line and character
 * @param line 1 based line
 * @param character 1 based character
 * @returns 0 based Position
 */
export const To0BasedPostion = (line: number, character: number): vscode.Position => 
	new vscode.Position(line-1, character-1);

export const AHKMarkdownString = (value: string) => new vscode.MarkdownString(
	'```autohotkey\n'+value+'\n```'
);
