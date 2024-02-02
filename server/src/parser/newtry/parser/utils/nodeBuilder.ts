/**
 * Used to build some AST node
 */

import { IToken } from '../../tokenizor/types';
import { Factor } from '../models/expr';
import { Identifier, SuffixTerm } from '../models/suffixterm';

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