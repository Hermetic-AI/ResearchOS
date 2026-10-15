import { describe, expect, test } from "bun:test"
import { parseDrawioMessage } from "./diagram-mode"

describe("draw.io message protocol", () => {
  test("accepts JSON protocol messages and rejects malformed payloads", () => {
    expect(parseDrawioMessage('{"event":"save","xml":"<mxfile/>"}')).toEqual({ event: "save", xml: "<mxfile/>" })
    expect(parseDrawioMessage({ event: "init" })).toEqual({ event: "init" })
    expect(parseDrawioMessage("not-json")).toBeUndefined()
    expect(parseDrawioMessage(42)).toBeUndefined()
  })
})
