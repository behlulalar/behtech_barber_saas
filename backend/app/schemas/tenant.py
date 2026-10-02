from datetime import datetime
from pydantic import BaseModel, ConfigDict

class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    created_at: datetime
    is_active: bool