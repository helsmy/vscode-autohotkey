import { ExtensionContext } from 'vscode';

export interface ICommand {
	/**
	 * Method for command to register itself to vscode
	 * @param name Name of command
	 * @param context Code extension context
	 */
	subscript(name: string, context: ExtensionContext): void;

	/**
	 * Method for command executing
	 */
	execute(...args: any[]): void | Thenable<void>;
}