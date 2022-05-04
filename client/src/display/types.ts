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
	isBeta: boolean;
}