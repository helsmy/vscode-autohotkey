import { TokenType } from '../../tokenizor/tokenTypes';

/**
 * Precedences for all operators
 * total 18 level. 
 * Same order as TokenType
 * Contains V2 operators
 */
export const Precedences: number[] = [
    // ++, --
    18, 18,
    // **
    17,
    // !, ~
    16, 16,
    // *, /, //
    15, 15, 15,
    // +, -
    14, 14,
    // >>, <<, >>>
    13, 13, 13,
    // &, ^, |
    12, 12, 12,
    // Space '.' Space 
    11,
    // ~=
    10,
    // >, >=, <, <=
    9, 9, 9, 9,
    // =, ==. <>, !=, !==
    8, 8, 8, 8, 8,
    // is, in, contains
    7, 7, 7,
    // not
    6,
    // &&, and
    5, 5,
    // or, ||
    4, 4,
    // ??
    3,
    // ? as Ternary operator
    2,
    // :=, +=, -=, *=, /=, //=, .=, |=, &=, ^=, >>=, <<=, >>>=
       1,  1,   1,  1,  1,  1,   1,  1,  1,  1,  1,   1,   1
];

export const UnaryPrecedence = Precedences[TokenType.not];
