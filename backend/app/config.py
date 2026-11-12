from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    firms_map_key: str = ""
    firms_area: str = "74,8,81,14"
    firms_region_label: str = "Tamil Nadu, India"
    firms_day_range: int = 5
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    allowed_origins: str = "http://localhost:5173"
    database_url: str = ""
    auto_init_database: bool = True
    sample_path: Path = Path(__file__).parents[2] / "data" / "sample_fires.csv"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
