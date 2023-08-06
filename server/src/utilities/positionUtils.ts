import { Position, Range } from 'vscode-languageserver';
import { DelimitedList } from '../parser/newtry/parser/models/delimtiedList';

/**
 * Is position pos in range r
 * @param r Target range
 * @param pos Qurey position
 */
export function posInRange(r: Range, pos: Position): boolean {
    if (r instanceof DelimitedList && r.length === 0) return false;
    // start <= pos
    const isAfterStart = r.start.line < pos.line ? true :
        r.start.line === pos.line ?
            r.start.character <= pos.character ? true :
                false :
            false;
    // end >= pos
    const isBeforeEnd = r.end.line > pos.line ? true :
        r.end.line === pos.line ?
            r.end.character >= pos.character ? true :
                false :
            false;
    return isAfterStart && isBeforeEnd;
}

/**
 * Is range2 in range1
 * @param range1 the target range
 * @param range2 the query range
 */
export function rangeInRange(range1: Range, range2: Range): boolean {
    if (range1 instanceof DelimitedList && range1.length === 0) return false;

    if (range2.start.line < range1.start.line) return false;
    if (
        range2.start.line === range1.start.line &&
        range2.start.character < range1.start.character
    ) {
        return false;
    }
    if (range2.end.line > range1.end.line) return false;
    if (
        range2.end.line === range1.end.line &&
        range2.end.character > range1.end.character
    ) {
        return false;
    }

    return true;
};

/**
 * Is this range after this position
 * @param range the target range
 * @param pos the query position
 */
export const rangeAfter = (range: Range, pos: Position): boolean => {
    if (pos.line < range.start.line) return true;
    if (pos.line === range.start.line) {
        if (pos.character < range.start.character) return true;
    }

    return false;
};