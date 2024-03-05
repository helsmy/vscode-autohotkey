export interface IClientCapabilities {
	hasConfiguration: boolean;
	hasWorkspaceFolder: boolean;
}

/**
 * Semantic Token Types that autohotkey has
 */
export enum AHKSemanticTokenTypes {
	class,
	parameter,
	variable,
	property,
	function,
	method,
	keyword,
	modifier,
	comment,
	string,
	number,
	operator,
}
