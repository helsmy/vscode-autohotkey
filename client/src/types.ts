import { ExtensionContext } from 'vscode';

export interface ICommnad {
	subscript(name: string, context: ExtensionContext): void;
	execute(): void;
}