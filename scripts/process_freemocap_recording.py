import argparse
from pathlib import Path

from freemocap.core_processes.process_motion_capture_videos.process_recording_headless import (
    process_recording_headless,
)
from freemocap.data_layer.recording_models.post_processing_parameter_models import (
    ProcessingParameterModel,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Process a FreeMoCap recording folder for DMCA.")
    parser.add_argument("--recording", required=True, help="Path to a FreeMoCap recording folder.")
    parser.add_argument("--calibration", default=None, help="Optional calibration TOML for multicamera recordings.")
    parser.add_argument(
        "--preserve-single-camera-depth",
        action="store_true",
        help="Keep MediaPipe's estimated single-camera depth instead of flattening it to a 2D plane.",
    )
    args = parser.parse_args()

    recording_path = Path(args.recording).expanduser().resolve()
    if not recording_path.exists():
        raise FileNotFoundError(f"Recording folder does not exist: {recording_path}")

    parameters = ProcessingParameterModel()
    parameters.anipose_triangulate_3d_parameters_model.flatten_single_camera_data = not args.preserve_single_camera_depth

    process_recording_headless(
        recording_path=recording_path,
        path_to_camera_calibration_toml=args.calibration,
        path_to_blender_executable=None,
        recording_processing_parameter_model=parameters,
        run_blender=False,
        make_jupyter_notebook=False,
        use_tqdm=True,
    )


if __name__ == "__main__":
    main()
