/**
 * Used to build some AST node
 */

import { TokenType } from '../../tokenizor/tokenTypes';
import { IToken } from '../../types';
import { Factor } from '../models/expr';
import { Identifier, SuffixTerm } from '../models/suffixterm';

type IDToken = Omit<IToken, "type"> & {type: TokenType.id};

/**
 * Build node for identifor only Factor
 * @param id identifor token
 * @returns Factor node of the identifor
 */
export function idFactor(id: IToken): Factor {
	const atom = new Identifier(id);
	const term = new SuffixTerm(atom, []);
	return new Factor(term);
}