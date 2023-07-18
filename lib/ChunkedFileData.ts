const NOT_FOUND = -1;

import type {
    ChunkType,
    DataType,
    TypedArray,
    TypedArrayConstructor,
} from "./types";

export default class ChunkedFileData {
    static get NOT_FOUND() {
        return NOT_FOUND;
    }
    _fileData: Array<ChunkType>;

    constructor() {
        this._fileData = [];
    }

    /**
     * Adds data to the file storage at a specific offset.
     */
    addData(offset: number, data: DataType): void {
        var offsetEnd = offset + data.length - 1;
        var chunkRange = this._getChunkRange(offset, offsetEnd);

        if (chunkRange.startIx === NOT_FOUND) {
            this._fileData.splice(chunkRange.insertIx || 0, 0, {
                offset: offset,
                data: data,
            });
        } else {
            // If the data to add collides with existing chunks we prepend and
            // append data from the half colliding chunks to make the collision at
            // 100%. The new data can then replace all the colliding chunkes.
            var firstChunk = this._fileData[chunkRange.startIx];
            var lastChunk = this._fileData[chunkRange.endIx];
            var needsPrepend = offset > firstChunk.offset;
            var needsAppend =
                offsetEnd < lastChunk.offset + lastChunk.data.length - 1;

            var chunk = {
                offset: Math.min(offset, firstChunk.offset),
                data: data,
            };

            if (needsPrepend) {
                var slicedData = this._sliceData(
                    firstChunk.data,
                    0,
                    offset - firstChunk.offset
                );
                chunk.data = this._concatData(
                    slicedData as TypedArray,
                    data as TypedArray
                );
            }

            if (needsAppend) {
                // Use the lastChunk because the slice logic is easier to handle.
                var slicedData = this._sliceData(
                    chunk.data,
                    0,
                    lastChunk.offset - chunk.offset
                );
                chunk.data = this._concatData(
                    slicedData as TypedArray,
                    lastChunk.data as TypedArray
                );
            }

            this._fileData.splice(
                chunkRange.startIx,
                chunkRange.endIx - chunkRange.startIx + 1,
                chunk
            );
        }
    }

    _concatData<T extends TypedArray>(dataA: T, dataB: T): T {
        // TypedArrays don't support concat.
        if (
            typeof ArrayBuffer !== "undefined" &&
            ArrayBuffer.isView &&
            ArrayBuffer.isView(dataA)
        ) {
            var dataAandB = new (dataA.constructor as TypedArrayConstructor<T>)(
                dataA.length + dataB.length
            );
            dataAandB.set(dataA, 0);
            dataAandB.set(dataB, dataA.length);
            return dataAandB;
        } else {
            //@ts-ignore I dont know
            return dataA.concat(dataB);
        }
    }

    _sliceData(data: DataType, begin: number, end: number): DataType {
        // Some TypeArray implementations do not support slice yet.
        if (data.slice) {
            return data.slice(begin, end);
        } else {
            //@ts-ignore I dont know
            return data.subarray(begin, end);
        }
    }

    /**
     * Finds the chunk range that overlaps the [offsetStart-1,offsetEnd+1] range.
     * When a chunk is adjacent to the offset we still consider it part of the
     * range (this is the situation of offsetStart-1 or offsetEnd+1).
     * When no chunks are found `insertIx` denotes the index where the data
     * should be inserted in the data list (startIx == NOT_FOUND and endIX ==
     * NOT_FOUND).
     */
    _getChunkRange(
        offsetStart: number,
        offsetEnd: number
    ): { startIx: number; endIx: number; insertIx?: number } {
        var startChunkIx = NOT_FOUND;
        var endChunkIx = NOT_FOUND;
        var insertIx = 0;

        // Could use binary search but not expecting that many blocks to exist.
        for (var i = 0; i < this._fileData.length; i++, insertIx = i) {
            var chunkOffsetStart = this._fileData[i].offset;
            var chunkOffsetEnd =
                chunkOffsetStart + this._fileData[i].data.length;

            if (offsetEnd < chunkOffsetStart - 1) {
                // This offset range doesn't overlap with any chunks.
                break;
            }
            // If it is adjacent we still consider it part of the range because
            // we're going end up with a single block with all contiguous data.
            if (
                offsetStart <= chunkOffsetEnd + 1 &&
                offsetEnd >= chunkOffsetStart - 1
            ) {
                startChunkIx = i;
                break;
            }
        }

        // No starting chunk was found, meaning that the offset is either before
        // or after the current stored chunks.
        if (startChunkIx === NOT_FOUND) {
            return {
                startIx: NOT_FOUND,
                endIx: NOT_FOUND,
                insertIx: insertIx,
            };
        }

        // Find the ending chunk.
        for (var i = startChunkIx; i < this._fileData.length; i++) {
            var chunkOffsetStart = this._fileData[i].offset;
            var chunkOffsetEnd =
                chunkOffsetStart + this._fileData[i].data.length;

            if (offsetEnd >= chunkOffsetStart - 1) {
                // Candidate for the end chunk, it doesn't mean it is yet.
                endChunkIx = i;
            }
            if (offsetEnd <= chunkOffsetEnd + 1) {
                break;
            }
        }

        if (endChunkIx === NOT_FOUND) {
            endChunkIx = startChunkIx;
        }

        return {
            startIx: startChunkIx,
            endIx: endChunkIx,
        };
    }

    hasDataRange(offsetStart: number, offsetEnd: number): boolean {
        for (var i = 0; i < this._fileData.length; i++) {
            var chunk = this._fileData[i];
            if (offsetEnd < chunk.offset) {
                return false;
            }

            if (
                offsetStart >= chunk.offset &&
                offsetEnd < chunk.offset + chunk.data.length
            ) {
                return true;
            }
        }

        return false;
    }

    getByteAt(offset: number): any {
        var dataChunk;

        for (var i = 0; i < this._fileData.length; i++) {
            var dataChunkStart = this._fileData[i].offset;
            var dataChunkEnd =
                dataChunkStart + this._fileData[i].data.length - 1;

            if (offset >= dataChunkStart && offset <= dataChunkEnd) {
                dataChunk = this._fileData[i];
                break;
            }
        }

        if (dataChunk) {
            return dataChunk.data[offset - dataChunk.offset];
        }

        throw new Error("Offset " + offset + " hasn't been loaded yet.");
    }
}
