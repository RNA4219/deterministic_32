import { Transform, type TransformCallback } from "node:stream";
type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
    [key: string]: JsonValue;
};
export type TestEvent = {
    readonly type: string;
    readonly data?: unknown;
};
export type SerializableTestEvent = {
    readonly type: string;
    readonly data?: JsonValue;
};
declare function toSerializableEvent(event: TestEvent): SerializableTestEvent;
export default class JsonReporter extends Transform {
    constructor();
    _transform(event: TestEvent, _encoding: string, callback: TransformCallback): void;
}
export { toSerializableEvent };
