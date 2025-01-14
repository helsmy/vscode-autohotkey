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

export function positionEqual(p1: Position, p2: Position): boolean {
    return p1.line === p2.line && p1.character === p2.character;
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
 * Is this range before this position
 * @param range the target range
 * @param pos the query position
 */
export const rangeBefore = (range: Range, pos: Position): boolean => {
    if (pos.line > range.end.line) return true;
    if (pos.line === range.end.line) {
        if (pos.character > range.end.character) return true;
    }

    return false;
};

export function binarySearchRange<T extends Range>(nodes: T[], pos: Position): Maybe<T> {
    const index = binarySearchIndex(nodes, pos);
    if (index !== undefined) return nodes[index];
    return undefined;
}

export function binarySearchIndex<T extends Range>(nodes: T[], pos: Position): Maybe<number> {
    let start = 0;
    let end = nodes.length - 1;
    while (start <= end) {
        const mid = Math.floor((start + end) / 2);
        const node = nodes[mid];
        // start <= pos
        const isAfterStart = node.start.line < pos.line ? true : 
                                node.start.line === pos.line ? 
                                    node.start.character <= pos.character ? true : 
                                false : 
                            false;
        // end >= pos
        const isBeforeEnd = node.end.line > pos.line ? true : 
                                node.end.line === pos.line ? 
                                    node.end.character >= pos.character ? true : 
                                false : 
                            false;
        if (isAfterStart && isBeforeEnd)
            return mid;
        else if (!isBeforeEnd)
            start = mid + 1;
        else
            end = mid - 1;
    }
    return undefined;
}