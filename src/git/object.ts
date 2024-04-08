export function numToObjType(type: number) {
    switch (type) {
        case 1:
            return 'commit';
        case 2:
            return 'tree';
        case 3:
            return 'blob';
        case 4:
            return 'tag';
        case 5:
            throw new Error('This is reserved for future use');
        case 6:
            return 'ofs-delta';
        case 7:
            return 'ref-delta';
        default:
            throw new Error(`Unknown object type ${type}`);
    }
}
