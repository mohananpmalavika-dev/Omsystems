import {describe,expect,it} from "vitest";
import {analyticsSourceUri} from "../src/streaming/analytics-source.js";

describe("analytics recorder source",()=>{
  it("keeps a configured CP Plus main stream when correcting its channel",()=>{
    expect(analyticsSourceUri("rtsp://camera/cam/realmonitor?channel=1&subtype=0",9))
      .toBe("rtsp://camera/cam/realmonitor?channel=9&subtype=0");
  });
  it("selects main detail for helmet analytics on supported recorder paths",()=>{
    expect(analyticsSourceUri("rtsp://camera/cam/realmonitor?channel=1&subtype=1",9,true))
      .toBe("rtsp://camera/cam/realmonitor?channel=9&subtype=0");
    expect(analyticsSourceUri("rtsp://camera/Streaming/Channels/102",9,true))
      .toBe("rtsp://camera/Streaming/Channels/901");
    expect(analyticsSourceUri("rtsp://camera/ch1/sub/av_stream",9,true))
      .toBe("rtsp://camera/ch9/main/av_stream");
  });
  it("preserves configured substreams for rules without HD detail",()=>{
    expect(analyticsSourceUri("rtsp://camera/Streaming/Channels/102",12))
      .toBe("rtsp://camera/Streaming/Channels/1202");
  });
  it("does not guess main-stream paths for unknown vendors",()=>{
    expect(analyticsSourceUri("rtsp://camera/custom/feed",9,true)).toBe("rtsp://camera/custom/feed");
  });
});
