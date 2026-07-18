import { describe, expect, it } from "vitest";
import { compareBasic3D } from "../motioncap/compare/compareBasic3D";
import { parseFreeMoCapCsv } from "../motioncap/parsers/parseFreeMoCapCsv";

describe("FreeMoCap CSV parser", () => {
  it("parses wide body_3d_xyz style columns", () => {
    const csv = [
      "frame,left_hip_x,left_hip_y,left_hip_z,right_hip_x,right_hip_y,right_hip_z,left_shoulder_x,left_shoulder_y,left_shoulder_z,right_shoulder_x,right_shoulder_y,right_shoulder_z,left_knee_x,left_knee_y,left_knee_z",
      "0,0,0,0,1,0,0,0,1,0,1,1,0,0,-1,0",
      "1,0,0,0,1,0,0,0,1,0,1,1,0,0,-1,0",
    ].join("\n");

    const dataset = parseFreeMoCapCsv("mediapipe_body_3d_xyz.csv", csv);

    expect(dataset.format).toBe("wide CSV");
    expect(dataset.frameCount).toBe(2);
    expect(dataset.pointCount).toBe(5);
    expect(dataset.has3d).toBe(true);
  });

  it("parses FreeMoCap mediapipe_body_3d_xyz columns without an explicit frame column", () => {
    const csv = [
      "body_left_shoulder_x,body_left_shoulder_y,body_left_shoulder_z,body_right_shoulder_x,body_right_shoulder_y,body_right_shoulder_z,body_left_hip_x,body_left_hip_y,body_left_hip_z,body_right_hip_x,body_right_hip_y,body_right_hip_z,body_left_knee_x,body_left_knee_y,body_left_knee_z",
      "689,0,-295,608,0,-296,668,0,-513,633,0,-508,661,0,-583",
      "690,0,-294,609,0,-295,669,0,-512,634,0,-507,662,0,-582",
    ].join("\n");

    const dataset = parseFreeMoCapCsv("mediapipe_body_3d_xyz.csv", csv);

    expect(dataset.format).toBe("wide CSV");
    expect(dataset.frameCount).toBe(2);
    expect(dataset.keypoints).toContain("body_left_shoulder");
    expect(dataset.has3d).toBe(true);
  });

  it("parses tidy by_frame style columns", () => {
    const csv = [
      "frame,keypoint,x,y,z",
      "0,left_hip,0,0,0",
      "0,right_hip,1,0,0",
      "1,left_hip,0,0,0",
      "1,right_hip,1,0,0",
    ].join("\n");

    const dataset = parseFreeMoCapCsv("teacher_by_frame.csv", csv);

    expect(dataset.format).toBe("tidy CSV");
    expect(dataset.frameCount).toBe(2);
    expect(dataset.keypoints).toContain("left_hip");
  });
});

describe("basic 3D comparison", () => {
  it("returns a technical score for shared keypoints", () => {
    const csv = [
      "frame,left_hip_x,left_hip_y,left_hip_z,right_hip_x,right_hip_y,right_hip_z,left_shoulder_x,left_shoulder_y,left_shoulder_z,right_shoulder_x,right_shoulder_y,right_shoulder_z,left_knee_x,left_knee_y,left_knee_z",
      "0,0,0,0,1,0,0,0,1,0,1,1,0,0,-1,0",
      "1,0,0,0,1,0,0,0,1,0,1,1,0,0,-1,0",
    ].join("\n");
    const left = parseFreeMoCapCsv("left.csv", csv);
    const right = parseFreeMoCapCsv("right.csv", csv);
    const result = compareBasic3D(left, right);

    expect(result.ready).toBe(true);
    expect(result.score).toBe(100);
    expect(result.sharedKeypoints.length).toBe(5);
  });
});
