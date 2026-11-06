import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    # Serve contracts/fixtures instead of real Parquet outputs.
    mock: bool = os.environ.get("TS_API_MOCK", "1") == "1"
    data_dir: Path = Path(os.environ.get("TS_DATA_DIR", Path.home() / "Data" / "tauchstone"))
    cors_origins: list[str] = field(
        default_factory=lambda: os.environ.get("TS_CORS_ORIGINS", "http://localhost:5173").split(",")
    )


settings = Settings()
