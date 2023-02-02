export type InterpreterInformation = {
	path: string;
	version: string | undefined;
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
 * Method provides path of vaild interpreter.
 * If interpreter is invaild then undefined is returned
 */
export type InterpreterPathProvider = () => string | undefined;