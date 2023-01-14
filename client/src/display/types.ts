export type InterpreterInformation = {
	path: string;
	version: string;
	architecture?: string;
}

export type AUTOHOTKEY_VERSION = {
	major: number;
	minor: number;
	patch: number;
	build: number;
	testVersion?: 'alpha' | 'beta';
}

/**
 * 当前解释器是否是可用的解释器
 */
export enum InterpreterStatus {
	/**
	 * Interpreter is a correct ahk interpreter
	 */
	available,
	/**
	 * Any other program
	 */
	unknown
}

export type StatusChangeHandler = (InterpreterStatus: InterpreterStatus) => void;