import argparse
from pathlib import Path

from freemocap.core_processes.process_motion_capture_videos.process_recording_headless import (
    process_recording_headless,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Process a FreeMoCap recording folder for DMCA.")
    parser.add_argument("--recording", required=True, help="Path to a FreeMoCap recording folder.")
    parser.add_argument("--calibration", default=None, help="Optional calibration TOML for multicamera recordings.")
    args = parser.parse_args()

    recording_path = Path(args.recording).expanduser().resolve()
    if not recording_path.exists():
        raise FileNotFoundError(f"Recording folder does not exist: {recording_path}")

    process_recording_headless(
        recording_path=recording_path,
        path_to_camera_calibration_toml=args.calibration,
        path_to_blender_executable=None,
        run_blender=False,
        make_jupyter_notebook=False,
        use_tqdm=True,
    )


if __name__ == "__main__":
    main()
